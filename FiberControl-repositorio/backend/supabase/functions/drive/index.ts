// ClickIP FiberControl — Edge Function "drive" (Deno / Supabase)
// OAuth 2.0 do Google no SERVIDOR. O navegador só envia o JWT do Supabase; tokens do Google
// ficam na tabela drive_tokens (acessível apenas pela service_role).
//
// Segredos (supabase secrets set ...):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, STATE_SECRET (texto aleatório longo)
//   SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem no ambiente das funções.
// No Google Cloud Console, cadastre o redirect: https://<projeto>.supabase.co/functions/v1/drive/callback
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const CSEC = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const STATE_SECRET = Deno.env.get('STATE_SECRET')!;
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const SELF = `${SB_URL}/functions/v1/drive`;
const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly openid email';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

async function hmac(text: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(STATE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, '');
}
async function userFrom(req: Request) {
  const jwt = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const { data } = await admin.auth.getUser(jwt);
  if (!data.user) throw new Response('Não autenticado', { status: 401, headers: cors });
  const { data: p } = await admin.from('perfis').select('data').eq('auth_id', data.user.id).maybeSingle();
  const role = p?.data?.role;
  if (!['admin', 'engenheiro', 'supervisor'].includes(role)) throw new Response('Perfil sem permissão para o Drive', { status: 403, headers: cors });
  return data.user;
}
async function accessToken(uid: string) {
  const { data: t } = await admin.from('drive_tokens').select('*').eq('user_id', uid).maybeSingle();
  if (!t) throw new Response('Google Drive não conectado', { status: 409, headers: cors });
  if (t.access_token && new Date(t.expires_at).getTime() > Date.now() + 60_000) return t;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: CID, client_secret: CSEC, refresh_token: t.refresh_token, grant_type: 'refresh_token' }) });
  const j = await r.json(); if (!r.ok) throw new Response('Falha ao renovar token: ' + j.error, { status: 502, headers: cors });
  const upd = { access_token: j.access_token, expires_at: new Date(Date.now() + j.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() };
  await admin.from('drive_tokens').update(upd).eq('user_id', uid);
  return { ...t, ...upd };
}
const g = async (tok: string, url: string, init: RequestInit = {}) => {
  const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + tok } });
  if (!r.ok) throw new Response('Google API: ' + (await r.text()), { status: r.status, headers: cors });
  return r;
};
async function ensureFolder(tok: string, parent: string, name: string) {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await (await g(tok, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`)).json();
  if (r.files?.length) return r.files[0].id;
  const c = await (await g(tok, 'https://www.googleapis.com/drive/v3/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parents: [parent], mimeType: 'application/vnd.google-apps.folder' }) })).json();
  return c.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url); const route = url.pathname.split('/drive')[1] || '/';
  try {
    if (route === '/callback') {
      const [uid, ret, sig] = (url.searchParams.get('state') || '').split('|');
      if (!uid || sig !== await hmac(uid + '|' + ret)) return new Response('Estado inválido', { status: 400 });
      const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ code: url.searchParams.get('code')!, client_id: CID, client_secret: CSEC, redirect_uri: SELF + '/callback', grant_type: 'authorization_code' }) });
      const j = await r.json(); if (!r.ok) return new Response('Falha OAuth: ' + j.error, { status: 400 });
      const info = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + j.access_token } })).json();
      const row: Record<string, unknown> = { user_id: uid, access_token: j.access_token, expires_at: new Date(Date.now() + j.expires_in * 1000).toISOString(), email: info.email, updated_at: new Date().toISOString() };
      if (j.refresh_token) row.refresh_token = j.refresh_token;
      await admin.from('drive_tokens').upsert(row);
      return Response.redirect(decodeURIComponent(ret), 302);
    }
    const user = await userFrom(req);
    if (route === '/auth-url') {
      const ret = encodeURIComponent(url.searchParams.get('redirect') || '/');
      const state = `${user.id}|${ret}|${await hmac(user.id + '|' + ret)}`;
      const p = new URLSearchParams({ client_id: CID, redirect_uri: SELF + '/callback', response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', state });
      return json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + p });
    }
    if (route === '/status') {
      const { data: t } = await admin.from('drive_tokens').select('email, folder_id, folder_name, updated_at').eq('user_id', user.id).maybeSingle();
      return json({ connected: !!t, email: t?.email, folderId: t?.folder_id, folderName: t?.folder_name });
    }
    const t = await accessToken(user.id);
    if (route === '/folders') {
      const parent = url.searchParams.get('parent') || 'root';
      const q = encodeURIComponent(`'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const r = await (await g(t.access_token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&orderBy=name&pageSize=200`)).json();
      return json({ folders: r.files });
    }
    if (route === '/folder' && req.method === 'POST') {
      const b = await req.json(); await admin.from('drive_tokens').update({ folder_id: b.id, folder_name: b.name }).eq('user_id', user.id); return json({ ok: true });
    }
    if (route === '/files') {
      // percorre a pasta e subpastas (projeto/enlace/data) e devolve arquivos com caminho e md5
      const out: unknown[] = []; const stack = [{ id: url.searchParams.get('folderId') || t.folder_id || 'root', path: '' }];
      while (stack.length && out.length < 2000) {
        const cur = stack.pop()!; let pageToken = '';
        do {
          const q = encodeURIComponent(`'${cur.id}' in parents and trashed=false`);
          const r = await (await g(t.access_token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,size)&pageSize=500${pageToken ? '&pageToken=' + pageToken : ''}`)).json();
          for (const f of r.files) f.mimeType === 'application/vnd.google-apps.folder' ? stack.push({ id: f.id, path: cur.path + f.name + '/' }) : out.push({ ...f, path: cur.path + f.name });
          pageToken = r.nextPageToken || '';
        } while (pageToken);
      }
      return json({ files: out });
    }
    if (route === '/download') {
      const r = await g(t.access_token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(url.searchParams.get('id')!)}?alt=media`);
      return new Response(r.body, { headers: { ...cors, 'Content-Type': r.headers.get('content-type') || 'application/octet-stream' } });
    }
    if (route === '/upload' && req.method === 'POST') {
      const fd = await req.formData(); const file = fd.get('file') as File;
      let parent = String(fd.get('folderId') || t.folder_id || 'root');
      for (const part of String(fd.get('path') || '').split('/').filter(Boolean)) parent = await ensureFolder(t.access_token, parent, part);
      const meta = new Blob([JSON.stringify({ name: file.name, parents: [parent] })], { type: 'application/json' });
      const body = new FormData(); body.append('metadata', meta); body.append('file', file);
      const r = await (await g(t.access_token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', { method: 'POST', body })).json();
      return json(r);
    }
    return json({ error: 'rota desconhecida' }, 404);
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
