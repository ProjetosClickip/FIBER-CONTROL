/* ClickIP FiberControl — camada de dados
 * Estado único + persistência por adaptador:
 *   - LocalAdapter    : localStorage (registros) + IndexedDB (arquivos e traços)
 *   - SupabaseAdapter : Postgres (tabelas com coluna jsonb) + Storage + Auth
 * Toda alteração passa por upsert/remove => auditoria + fila offline + sincronização.
 */
(function (FC) {
  'use strict';
  const U = FC.util;
  const KEY = 'clickip-fc-v1';
  const COLLECTIONS = ['users', 'links', 'trechos', 'measurements', 'attachments', 'audit', 'maintenance', 'versions', 'driveFiles'];
  const TABLES = { users: 'perfis', links: 'enlaces', trechos: 'trechos', measurements: 'medicoes', attachments: 'anexos', audit: 'auditoria', maintenance: 'manutencoes', versions: 'versoes_tracado', driveFiles: 'drive_arquivos' };

  const listeners = new Set();
  const store = FC.store = {
    state: null,
    mode: 'local',
    online: navigator.onLine,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit(what) { listeners.forEach(fn => { try { fn(what); } catch (e) { console.error(e); } }); },
    tables: TABLES
  };

  function blank() {
    const s = { meta: { created: U.now(), demo: false }, settings: U.clone(FC.defaults), session: null, checklists: {}, notifRead: [], offlineQueue: [] };
    COLLECTIONS.forEach(c => s[c] = []);
    return s;
  }
  function mergeDefaults(target, def) {
    Object.keys(def).forEach(k => {
      if (target[k] === undefined) target[k] = U.clone(def[k]);
      else if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k]) && typeof target[k] === 'object') mergeDefaults(target[k], def[k]);
    });
  }

  store.load = () => {
    const s = U.storage.get(KEY, null) || blank();
    COLLECTIONS.forEach(c => { if (!Array.isArray(s[c])) s[c] = []; });
    mergeDefaults(s.settings, FC.defaults);
    s.checklists = s.checklists || {}; s.notifRead = s.notifRead || []; s.offlineQueue = s.offlineQueue || [];
    store.state = s;
    return s;
  };
  const persist = U.debounce(() => {
    const ok = U.storage.set(KEY, store.state);
    if (!ok) FC.ui && FC.ui.toast('Não foi possível salvar no navegador (armazenamento cheio ou bloqueado).', 'err');
  }, 300);
  store.save = () => { persist(); store.emit('change'); };

  store.get = (col, id) => store.state[col].find(x => x.id === id) || null;
  store.list = (col) => store.state[col];

  /* ---------------- Sessão e permissões ---------------- */
  store.user = () => store.state.session ? store.get('users', store.state.session.userId) : null;
  store.can = (perm) => { const u = store.user(); return !!u && (FC.permissions[perm] || []).includes(u.role); };
  store.require = (perm) => { if (store.can(perm)) return true; FC.ui.toast('Seu perfil (' + (FC.roles[(store.user() || {}).role] || {}).label + ') não permite: ' + (FC.permissionLabels[perm] || perm), 'err'); return false; };

  /* ---------------- Auditoria ---------------- */
  store.audit = (acao, entidade, refId, detalhe) => {
    const u = store.user();
    const rec = { id: U.uid('aud_'), at: U.now(), userId: u ? u.id : null, user: u ? u.nome : 'sistema', role: u ? u.role : '', acao, entidade, refId, detalhe };
    store.state.audit.unshift(rec);
    if (store.state.audit.length > 3000) store.state.audit.length = 3000;
    remote('upsert', 'audit', rec);
  };

  /* ---------------- CRUD ---------------- */
  store.upsert = (col, obj, auditMsg) => {
    const arr = store.state[col];
    const i = arr.findIndex(x => x.id === obj.id);
    const u = store.user();
    obj.updatedAt = U.now(); obj.updatedBy = u ? u.nome : null;
    if (i >= 0) arr[i] = obj; else { obj.createdAt = obj.createdAt || U.now(); obj.createdBy = obj.createdBy || (u ? u.nome : null); arr.push(obj); }
    if (auditMsg) store.audit(i >= 0 ? 'editou' : 'criou', col, obj.id, auditMsg);
    remote('upsert', col, obj);
    store.save();
    return obj;
  };
  store.remove = (col, id, auditMsg) => {
    store.state[col] = store.state[col].filter(x => x.id !== id);
    if (auditMsg) store.audit('excluiu', col, id, auditMsg);
    remote('delete', col, { id });
    store.save();
  };
  store.setSettings = (path, value, label) => {
    const parts = path.split('.'); let o = store.state.settings;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
    const old = o[parts[parts.length - 1]];
    o[parts[parts.length - 1]] = value;
    if (label && JSON.stringify(old) !== JSON.stringify(value)) store.audit('configurou', 'settings', path, `${label}: ${JSON.stringify(old)} → ${JSON.stringify(value)}`);
    remoteSettings();
    store.save();
  };

  /* ---------------- Arquivos ---------------- */
  store.putFile = async (file, meta) => {
    const buf = file instanceof ArrayBuffer ? file : await U.readAsArrayBuffer(file);
    const hash = meta.hash || await U.sha256(buf);
    const att = Object.assign({ id: U.uid('att_'), nome: file.name || meta.nome, tamanho: buf.byteLength, tipo: file.type || meta.tipo || '', hash }, meta);
    await U.idb.put('files', att.id, new Blob([buf], { type: att.tipo || 'application/octet-stream' }));
    if (store.mode === 'supabase') {
      try { att.storagePath = await FC.supa.upload(att, new Blob([buf], { type: att.tipo })); } catch (e) { queue({ op: 'upload', attId: att.id }); }
    }
    store.upsert('attachments', att, 'Anexo ' + att.nome);
    return att;
  };
  store.getFile = async (att) => {
    let b = await U.idb.get('files', att.id);
    if (!b && store.mode === 'supabase' && att.storagePath) { b = await FC.supa.download(att.storagePath); if (b) await U.idb.put('files', att.id, b); }
    return b;
  };

  /* ---------------- Sincronização remota / offline ---------------- */
  function queue(item) { store.state.offlineQueue.push(Object.assign({ at: U.now() }, item)); persist(); store.emit('queue'); }
  function remote(op, col, obj) {
    if (store.mode !== 'supabase') return;
    if (!store.online) return queue({ op, col, id: obj.id });
    FC.supa.write(op, col, obj).catch(() => queue({ op, col, id: obj.id }));
  }
  const remoteSettings = U.debounce(() => { if (store.mode === 'supabase') FC.supa.saveSettings(store.state.settings).catch(() => queue({ op: 'settings' })); }, 800);
  store.flushQueue = async () => {
    if (store.mode !== 'supabase' || !store.online) return 0;
    const q = store.state.offlineQueue.splice(0);
    let fails = 0;
    for (const it of q) {
      try {
        if (it.op === 'settings') await FC.supa.saveSettings(store.state.settings);
        else if (it.op === 'upload') { const a = store.get('attachments', it.attId); const b = a && await U.idb.get('files', a.id); if (a && b) { a.storagePath = await FC.supa.upload(a, b); await FC.supa.write('upsert', 'attachments', a); } }
        else { const obj = it.op === 'delete' ? { id: it.id } : store.get(it.col, it.id); if (obj) await FC.supa.write(it.op, it.col, obj); }
      } catch (e) { fails++; store.state.offlineQueue.push(it); }
    }
    persist(); store.emit('queue');
    return q.length - fails;
  };
  window.addEventListener('online', () => { store.online = true; store.emit('net'); store.flushQueue().then(n => n && FC.ui.toast(n + ' alteração(ões) sincronizada(s).', 'ok')); });
  window.addEventListener('offline', () => { store.online = false; store.emit('net'); FC.ui && FC.ui.toast('Sem internet: o registro continua no aparelho e será sincronizado depois.', 'warn'); });

  /* ---------------- Supabase (conexão real quando configurado) ---------------- */
  FC.supa = {
    client: null,
    async connect(url, key) {
      await U.loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js');
      this.client = window.supabase.createClient(url, key, { auth: { persistSession: true } });
      const { error } = await this.client.from('configuracoes').select('id').limit(1);
      if (error) throw new Error(error.message);
      store.mode = 'supabase';
      return true;
    },
    async signIn(email, password) { const { data, error } = await this.client.auth.signInWithPassword({ email, password }); if (error) throw error; return data.user; },
    async signUp(email, password, nome) { const { data, error } = await this.client.auth.signUp({ email, password, options: { data: { nome } } }); if (error) throw error; return data.user; },
    async updateAuth(fields) { const { error } = await this.client.auth.updateUser(fields); if (error) throw error; },
    async signOut() { await this.client.auth.signOut(); },
    async write(op, col, obj) {
      const t = this.client.from(TABLES[col]);
      const data = col === 'users' ? Object.assign({}, obj, { senha: undefined }) : obj; // senha local nunca vai ao banco
      const { error } = op === 'delete' ? await t.delete().eq('id', obj.id) : await t.upsert({ id: obj.id, data: JSON.parse(JSON.stringify(data)), updated_at: U.now() });
      if (error) throw new Error(TABLES[col] + ': ' + error.message);
    },
    /** Baixa tudo do banco. Proteção: se o banco ainda está vazio e este navegador tem dados, NÃO apaga os dados locais. */
    async pull() {
      const got = {};
      for (const col of COLLECTIONS) {
        const all = []; let from = 0;
        for (;;) { const { data, error } = await this.client.from(TABLES[col]).select('data').range(from, from + 999); if (error) throw new Error(TABLES[col] + ': ' + error.message); all.push(...data.map(r => r.data)); if (data.length < 1000) break; from += 1000; }
        got[col] = all;
      }
      const remoteEmpty = !got.links.length && !got.trechos.length && !got.measurements.length;
      if (remoteEmpty && store.state.links.some(l => !l.demo)) { this.remoteEmpty = true; return { kept: true }; }
      this.remoteEmpty = remoteEmpty;
      COLLECTIONS.forEach(c => { store.state[c] = c === 'users' ? got.users.map(u => Object.assign(u, { senha: (store.state.users.find(x => x.id === u.id) || {}).senha })) : got[c]; });
      const { data } = await this.client.from('configuracoes').select('data').eq('id', 'global').maybeSingle();
      if (data && data.data) { Object.assign(store.state.settings, data.data); mergeDefaults(store.state.settings, FC.defaults); }
      store.save();
    },
    async saveSettings(s) { const c = U.clone(s); delete c.supabase; const { error } = await this.client.from('configuracoes').upsert({ id: 'global', data: c, updated_at: U.now() }); if (error) throw error; },
    async upload(att, blob) {
      const link = att.linkId ? store.get('links', att.linkId) : null;
      const safe = (x) => U.norm(x || 'geral').replace(/[^a-z0-9._-]+/g, '-');
      const path = [safe(link ? link.projeto : 'geral'), safe(link ? link.nome : 'sem-enlace'), (att.createdAt || U.now()).slice(0, 10), att.id + '_' + safe(att.nome)].join('/');
      const { error } = await this.client.storage.from('anexos').upload(path, blob, { upsert: true, contentType: att.tipo || 'application/octet-stream' });
      if (error) throw error;
      return path;
    },
    /** Migração: envia perfis, registros, configurações e ARQUIVOS (Storage) deste navegador para o Supabase */
    async migrate({ me, skipDemo = true, onProgress = () => {} }) {
      const st = store.state, keep = (o) => !(skipDemo && o.demo);
      const plan = [['users', st.users.filter(keep)], ['links', st.links.filter(keep)], ['trechos', st.trechos.filter(keep)], ['measurements', st.measurements.filter(keep)], ['attachments', st.attachments.filter(keep)], ['maintenance', st.maintenance.filter(keep)], ['versions', st.versions], ['driveFiles', st.driveFiles], ['audit', st.audit.filter(keep)]];
      const total = plan.reduce((n, [, a]) => n + a.length, 0) + st.attachments.filter(keep).length + 1;
      let done = 0, errors = [];
      const step = (msg) => onProgress(++done, total, msg);
      // 1º o perfil de quem está migrando (vira Administrador por ser o primeiro), depois o resto
      plan[0][1].sort((a, b) => (b.id === me.id) - (a.id === me.id));
      for (const [col, arr] of plan) {
        for (const o of arr) {
          try { if (col === 'attachments') { const b = await U.idb.get('files', o.id); if (b && !o.storagePath) { o.storagePath = await this.upload(o, b); } step('Arquivo ' + o.nome); } await this.write('upsert', col, o); } catch (e) { errors.push(e.message); }
          step(col);
        }
      }
      try { await this.saveSettings(st.settings); } catch (e) { errors.push(e.message); } step('configurações');
      return { total, errors };
    },
    async download(path) { const { data, error } = await this.client.storage.from('anexos').download(path); return error ? null : data; }
  };

  store.reset = async () => { store.state = blank(); await U.idb.clear('files'); await U.idb.clear('traces'); U.storage.del(KEY); store.save(); };
})(window.FC = window.FC || {});
