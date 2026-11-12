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
  store.can = (perm) => { const u = store.user(); if (!u) return false; if ((FC.adminOnly || []).includes(perm)) return u.role === 'admin'; return (FC.permissions[perm] || []).includes(u.role); };
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
  // Preferências deste aparelho/usuário: não vão para a configuração geral da equipe
  const LOCAL_SETTINGS = ['theme', 'fieldMode', 'notifications', 'supabase', 'supabaseOff'];
  store.setSettings = (path, value, label) => {
    const parts = path.split('.'); let o = store.state.settings;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
    const old = o[parts[parts.length - 1]];
    o[parts[parts.length - 1]] = value;
    const local = LOCAL_SETTINGS.includes(parts[0]);
    if (path === 'supabaseOff' && value) { store.wantRemote = false; store.state.offlineQueue.length = 0; }
    if (label && !local && JSON.stringify(old) !== JSON.stringify(value)) store.audit('configurou', 'settings', path, `${label}: ${JSON.stringify(old)} → ${JSON.stringify(value)}`);
    if (!local && store.can('config.tecnica')) remoteSettings(); // o banco só aceita de administrador/engenheiro
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

  /* ---------------- Sincronização remota / offline ----------------
   * - Toda gravação que não chega ao banco (sem internet, Supabase fora do ar, erro) entra na fila, com a
   *   versão do banco em que a edição se baseou (`base`).
   * - Antes de baixar o banco, a fila é enviada; o que continuar pendente é mantido por cima do que veio do banco.
   * - Edição simultânea: se o registro mudou no banco desde que foi carregado, as duas edições são juntadas
   *   campo a campo (listas com id, como materiais e caixas, item a item). Só quando os dois mudam o MESMO
   *   campo vale a última edição.
   */
  const MERGE = ['users', 'links', 'trechos', 'measurements', 'attachments', 'maintenance', 'versions', 'driveFiles'];
  const base = {};                 // "col:id" → JSON canônico da última versão conhecida do banco
  const bkey = (col, id) => col + ':' + id;
  const canon = (v) => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x);
  const strip = (col, o) => { const c = JSON.parse(JSON.stringify(o)); if (col === 'users') delete c.senha; return c; };
  const same = (a, b) => canon(a) === canon(b);
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const idList = (a) => Array.isArray(a) && a.every(x => isObj(x) && x.id != null);
  /** Junção de 3 vias: b = versão de origem, l = edição deste aparelho, r = versão atual do banco */
  function merge3(b, l, r, hasB = b !== undefined) { // hasB: existe versão de origem (campo ausente nela também conta)
    if (same(l, r)) return l;
    if (!hasB) { if (l === undefined) return r; if (r === undefined) return l; } // sem origem: soma o que cada lado tem
    if (hasB && same(l, b)) return r;
    if (hasB && same(r, b)) return l;
    if (isObj(l) && isObj(r)) {
      const bb = isObj(b) ? b : {}, o = {};
      new Set([...Object.keys(l), ...Object.keys(r)]).forEach(k => { const v = merge3(bb[k], l[k], r[k], hasB && isObj(b)); if (v !== undefined) o[k] = v; });
      return o;
    }
    if (idList(l) && idList(r) && (b == null || idList(b))) {
      const bm = new Map((b || []).map(x => [x.id, x])), lm = new Map(l.map(x => [x.id, x])), rm = new Map(r.map(x => [x.id, x])), out = [];
      const ids = [...l.map(x => x.id), ...r.map(x => x.id).filter(id => !lm.has(id))];
      ids.forEach(id => {
        const bi = bm.get(id), li = lm.get(id), ri = rm.get(id);
        if (li && ri) out.push(merge3(bi, li, ri, !!bi));
        else if (li) { if (!bi || !same(li, bi)) out.push(li); }   // novo aqui, ou apagado lá mas alterado aqui
        else if (ri) { if (!bi || !same(ri, bi)) out.push(ri); }   // novo lá, ou apagado aqui mas alterado lá
      });
      return out;
    }
    return l; // os dois alteraram o mesmo valor: vale a edição mais recente (esta)
  }
  store._merge3 = merge3;
  // versões de origem guardadas no IndexedDB (sobrevivem ao fechar o app sem internet)
  const saveBase = U.debounce(() => { Promise.resolve(U.idb.put('traces', 'sync-base', base)).catch(() => {}); }, 1500);
  store.loadBase = async () => { try { const b = await U.idb.get('traces', 'sync-base'); if (b) Object.assign(base, b); } catch (e) { /* sem IndexedDB: segue sem as versões de origem */ } };
  const pendingOf = (col, id) => store.state.offlineQueue.find(q => q.col === col && q.id === id && (q.op === 'upsert' || q.op === 'delete'));
  function queue(item) {
    const q = store.state.offlineQueue;
    if (item.col && item.id) {
      const p = pendingOf(item.col, item.id);
      if (p) { if (item.op === 'delete') p.op = 'delete'; persist(); return; } // já pendente: a versão mais recente é enviada na sincronização
    }
    if (item.op === 'settings' && q.some(x => x.op === 'settings')) return;
    q.push(Object.assign({ at: U.now() }, item)); persist(); store.emit('queue');
  }
  // gravações em sequência por registro (evita que duas gravações seguidas do mesmo registro se atropelem)
  const chain = new Map();
  function remote(op, col, obj) {
    const k = bkey(col, obj.id), item = { op, col, id: obj.id, base: base[k] };
    if (store.mode !== 'supabase') { if (store.wantRemote) queue(item); return; } // Supabase configurado mas fora do ar: guarda para enviar depois
    if (!store.online || pendingOf(col, obj.id)) return queue(item);
    const run = () => FC.supa.save(op, col, op === 'delete' ? { id: obj.id } : store.get(col, obj.id) || obj, base[k]).catch(() => queue(item));
    const p = (chain.get(k) || Promise.resolve()).then(run, run);
    chain.set(k, p); p.then(() => { if (chain.get(k) === p) chain.delete(k); });
  }
  const remoteSettings = U.debounce(() => { if (store.mode === 'supabase') FC.supa.saveSettings(store.state.settings).catch(() => queue({ op: 'settings' })); else if (store.wantRemote) queue({ op: 'settings' }); }, 800);
  let flushing = null;
  store.flushQueue = () => flushing || (flushing = (async () => {
    if (store.mode !== 'supabase' || !store.online) return 0;
    const q = store.state.offlineQueue.splice(0);
    let fails = 0;
    for (const it of q) {
      try {
        if (it.op === 'settings') { if (store.can('config.tecnica')) await FC.supa.saveSettings(store.state.settings); }
        else if (it.op === 'upload') { const a = store.get('attachments', it.attId); const b = a && await U.idb.get('files', a.id); if (a && b) { a.storagePath = await FC.supa.upload(a, b); await FC.supa.save('upsert', 'attachments', a, base[bkey('attachments', a.id)]); } }
        else if (it.op === 'delete') await FC.supa.save('delete', it.col, { id: it.id });
        else { const obj = store.get(it.col, it.id); if (obj) await FC.supa.save('upsert', it.col, obj, it.base); }
      } catch (e) {
        fails++; it.tries = (it.tries || 0) + 1; it.erro = e.message;
        if (/row-level security|permission|42501/i.test(e.message) && it.tries >= 3) { store.state.failedSync = (store.state.failedSync || []).concat(it).slice(-50); continue; } // recusado pelo banco: não fica tentando para sempre
        store.state.offlineQueue.push(it);
      }
    }
    persist(); store.emit('queue');
    return q.length - fails;
  })().finally(() => { flushing = null; }));
  /** Supabase configurado mas indisponível na abertura: tenta reconectar sozinho e envia o que ficou guardado */
  let retryT = null;
  store.retryRemote = async () => {
    const sb = store.state.settings.supabase || {};
    if (!store.wantRemote || store.mode === 'supabase' || !sb.url || !navigator.onLine) return false;
    try {
      await FC.supa.connect(sb.url, sb.anonKey);
      const { data } = await FC.supa.client.auth.getSession();
      if (!data.session) { store.mode = 'local'; return false; }
      await FC.supa.pull(); clearInterval(retryT); retryT = null;
      FC.ui && FC.ui.toast('Conectado ao Supabase de novo. Alterações guardadas foram enviadas.', 'ok'); store.emit('net'); FC.rerender && FC.rerender();
      return true;
    } catch (e) { store.mode = 'local'; return false; }
  };
  store.scheduleRetry = () => { if (!retryT) retryT = setInterval(store.retryRemote, 60000); };
  window.addEventListener('online', () => { store.online = true; store.emit('net'); if (store.mode !== 'supabase') return store.retryRemote(); store.flushQueue().then(n => n && FC.ui.toast(n + ' alteração(ões) sincronizada(s).', 'ok')); });
  window.addEventListener('offline', () => { store.online = false; store.emit('net'); FC.ui && FC.ui.toast('Sem internet: o registro continua no aparelho e será sincronizado depois.', 'warn'); });

  /* ---------------- Supabase (conexão real quando configurado) ---------------- */
  FC.supa = {
    client: null,
    async connect(url, key) {
      url = String(url || '').trim().replace(/\/(rest|auth|storage|functions)\/v1.*$/i, '').replace(/\/+$/, ''); key = String(key || '').trim();
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
    /** Grava com proteção contra edição simultânea (junta com a versão do banco quando ela mudou desde `baseJ`) */
    async save(op, col, obj, baseJ) {
      const k = bkey(col, obj.id);
      if (op === 'delete') { await this.write('delete', col, obj); delete base[k]; saveBase(); return; }
      if (!MERGE.includes(col)) { await this.write('upsert', col, obj); return; }
      const { data: row, error } = await this.client.from(TABLES[col]).select('data').eq('id', obj.id).maybeSingle();
      if (error) throw new Error(TABLES[col] + ': ' + error.message);
      let out = obj, juntou = false;
      if (!row && baseJ) { // o administrador excluiu este registro no banco: não recria
        store.state[col] = store.state[col].filter(x => x.id !== obj.id); delete base[k]; saveBase(); persist(); store.emit('change');
        FC.ui && FC.ui.toast(`Um registro que você editou (${obj.nome || obj.fileName || obj.id}) foi excluído no banco por outro usuário.`, 'warn', 7000);
        return;
      }
      if (row && row.data) {
        const remoteJ = canon(strip(col, row.data));
        if (remoteJ !== canon(strip(col, obj)) && remoteJ !== baseJ) {
          out = merge3(baseJ ? JSON.parse(baseJ) : undefined, strip(col, obj), JSON.parse(remoteJ));
          if (col === 'users' && obj.senha) out.senha = obj.senha;
          juntou = true;
        }
      }
      await this.write('upsert', col, out);
      base[k] = canon(strip(col, out)); saveBase();
      if (juntou) {
        const cur = store.get(col, obj.id);
        if (cur) { Object.keys(cur).forEach(x => { if (!(x in out)) delete cur[x]; }); Object.assign(cur, out); }
        persist(); store.emit('change');
        FC.ui && FC.ui.toast('Outra pessoa alterou este registro ao mesmo tempo: as duas edições foram juntadas.', 'info', 5000);
        if (FC.rerender && !document.querySelector('.modal-wrap')) FC.rerender();
      }
    },
    /** Baixa tudo do banco. Proteção: se o banco ainda está vazio e este navegador tem dados, NÃO apaga os dados locais. */
    async pull() {
      // 1º envia o que está pendente neste aparelho (registros feitos sem internet), depois baixa
      if (store.online) { try { await store.flushQueue(); } catch (e) { /* continua: o pendente é preservado abaixo */ } }
      const got = {};
      for (const col of COLLECTIONS) {
        const all = []; let from = 0;
        for (;;) { const { data, error } = await this.client.from(TABLES[col]).select('data').range(from, from + 999); if (error) throw new Error(TABLES[col] + ': ' + error.message); all.push(...data.map(r => r.data)); if (data.length < 1000) break; from += 1000; }
        got[col] = all;
      }
      const remoteEmpty = !got.links.length && !got.trechos.length && !got.measurements.length;
      if (remoteEmpty && store.state.links.some(l => !l.demo)) { this.remoteEmpty = true; return { kept: true }; }
      this.remoteEmpty = remoteEmpty;
      const pend = store.state.offlineQueue;
      COLLECTIONS.forEach(c => {
        let arr = got[c];
        if (MERGE.includes(c)) arr.forEach(o => { base[bkey(c, o.id)] = canon(strip(c, o)); });
        // o que ainda não chegou ao banco continua valendo neste aparelho (nada se perde)
        const local = store.state[c];
        pend.forEach(q => {
          if (q.col === c && q.op === 'delete') arr = arr.filter(o => o.id !== q.id);
          const id = q.col === c && q.op === 'upsert' ? q.id : c === 'attachments' && q.op === 'upload' ? q.attId : null;
          const lo = id && local.find(o => o.id === id);
          if (lo) { const i = arr.findIndex(o => o.id === id); if (i >= 0) arr[i] = lo; else arr.push(lo); }
        });
        store.state[c] = c === 'users' ? arr.map(u => Object.assign(u, { senha: (store.state.users.find(x => x.id === u.id) || {}).senha })) : arr;
      });
      saveBase();
      const { data } = await this.client.from('configuracoes').select('data').eq('id', 'global').maybeSingle();
      if (data && data.data) {
        const mine = {}; LOCAL_SETTINGS.forEach(k => { mine[k] = store.state.settings[k]; });
        Object.assign(store.state.settings, data.data, mine); mergeDefaults(store.state.settings, FC.defaults);
        LOCAL_SETTINGS.forEach(k => { if (mine[k] === undefined) delete store.state.settings[k]; });
        mergeDefaults(store.state.settings, FC.defaults);
      }
      store.save();
    },
    async saveSettings(s) { const c = U.clone(s); LOCAL_SETTINGS.forEach(k => delete c[k]); const { error } = await this.client.from('configuracoes').upsert({ id: 'global', data: c, updated_at: U.now() }); if (error) throw error; },
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
    async removeFile(path) { const { error } = await this.client.storage.from('anexos').remove([path]); if (error) throw error; },
    async download(path) { const { data, error } = await this.client.storage.from('anexos').download(path); return error ? null : data; }
  };

  /** Exclui um anexo do aparelho e do Storage */
  store.removeAttachment = async (att, motivo) => {
    await U.idb.del('files', att.id);
    if (store.mode === 'supabase' && att.storagePath) { try { await FC.supa.removeFile(att.storagePath); } catch (e) { /* segue: registro removido mesmo assim */ } }
    store.remove('attachments', att.id, motivo || 'Anexo ' + att.nome);
  };
  /** Exclui uma medição e o anexo/traço dela (somente Administrador) */
  store.deleteMeasurement = async (m) => {
    if (!store.require('medicao.excluir')) return false;
    const att = m.attachmentId && store.get('attachments', m.attachmentId);
    if (att) await store.removeAttachment(att, 'Anexo da medição ' + (m.fileName || ''));
    await U.idb.del('traces', m.id);
    store.remove('measurements', m.id, `Medição excluída: ${m.fileName || m.source} (${U.dt(m.data)}, enviada por ${m.responsavel || '—'})`);
    return true;
  };
  /** Exclui o enlace com trechos, medições, anexos, manutenções e versões (somente Administrador) */
  store.deleteLink = async (link) => {
    if (!store.require('enlace.excluir')) return false;
    const st = store.state, ts = st.trechos.filter(t => t.linkId === link.id).map(t => t.id);
    for (const m of st.measurements.filter(m => m.linkId === link.id || ts.includes(m.trechoId))) { await U.idb.del('traces', m.id); store.remove('measurements', m.id); }
    for (const a of st.attachments.filter(a => a.linkId === link.id || ts.includes(a.trechoId))) await store.removeAttachment(a);
    st.maintenance.filter(x => x.linkId === link.id).forEach(x => store.remove('maintenance', x.id));
    st.versions.filter(x => x.linkId === link.id).forEach(x => store.remove('versions', x.id));
    ts.forEach(id => store.remove('trechos', id));
    store.remove('links', link.id, `Enlace excluído pelo administrador: ${link.nome} (${ts.length} trechos; cadastrado por ${link.responsavel || '—'})`);
    return true;
  };

  store.reset = async () => { store.state = blank(); await U.idb.clear('files'); await U.idb.clear('traces'); U.storage.del(KEY); store.save(); };
})(window.FC = window.FC || {});
