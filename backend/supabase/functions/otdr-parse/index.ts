// ClickIP FiberControl — Edge Function "otdr-parse"
// Processa arquivos .SOR no servidor com o MESMO leitor SR-4731 do navegador (js/core/sor-parser.js).
// Antes do deploy, copie o leitor para esta pasta:  cp js/core/sor-parser.js backend/supabase/functions/otdr-parse/
//
// POST { "path": "projeto/enlace/2026-11-06/att_x_arquivo.sor" }  (arquivo no bucket "anexos")
// ou multipart com o campo "file". Retorna o JSON interpretado (sem inventar campos ausentes).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const code = await Deno.readTextFile(new URL('./sor-parser.js', import.meta.url));
const mod: { exports: any } = { exports: {} };
new Function('module', 'exports', code)(mod, mod.exports);
const { parseSOR, splitMulti, downsample } = mod.exports;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const SB_URL = Deno.env.get('SUPABASE_URL')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // cliente com o JWT do usuário: as políticas RLS do Storage valem aqui
  const sb = createClient(SB_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('authorization') || '' } } });
  try {
    let buf: ArrayBuffer;
    if ((req.headers.get('content-type') || '').includes('multipart')) buf = await ((await req.formData()).get('file') as File).arrayBuffer();
    else {
      const { path } = await req.json();
      const { data, error } = await sb.storage.from('anexos').download(path);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 403, headers: cors });
      buf = await data.arrayBuffer();
    }
    const traces = splitMulti(buf).map((b: ArrayBuffer) => {
      const r = parseSOR(b);
      const trace = r.trace ? downsample(r.trace, 2000) : null;
      delete r.trace;
      return { ...r, trace };
    });
    return new Response(JSON.stringify({ traces }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Arquivo não interpretado: ' + String(e) }), { status: 422, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
