/* ClickIP FiberControl — inicialização, login, estrutura, roteador, busca e notificações */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, store = FC.store;
  const LOGO = { light: 'assets/logo-light.png', dark: 'assets/logo-dark.png', mark: 'assets/mark.png' };
  FC.LOGO = LOGO;
  FC.route = { id: 'dashboard', params: {} };

  /* ---------- Tema ---------- */
  FC.applyTheme = () => {
    const t = store.state.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    document.body.classList.toggle('field', !!store.state.settings.fieldMode);
  };
  FC.isDark = () => { const t = document.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };

  /* ---------- Senhas locais (somente modo navegador/demonstração) ---------- */
  const hashPass = (email, pass) => U.sha256('fc|' + U.norm(email) + '|' + pass);

  /* ---------- Login ---------- */
  function renderLogin() {
    const st = store.state;
    const sb = store.mode === 'supabase';
    const first = !sb && !st.users.some(u => u.senha);
    document.getElementById('root').innerHTML = `
    <div class="login">
      <section class="art">
        <img src="${LOGO.dark}" alt="i_mais ClickIP">
        <div><p class="eyebrow" style="color:#7fd8f0">Projetos ClickIP</p><h1>Fiber<span>Control</span></h1>
        <p style="max-width:44ch;margin-top:10px">Gestão, análise e certificação de enlaces de fibra óptica com OTDR e OZmap.</p></div>
        <svg class="trace" viewBox="0 0 600 200" preserveAspectRatio="none"><path d="M0 40 L60 42 L62 20 L66 60 L180 85 L182 92 L330 125 L332 108 L336 140 L470 165 L472 172 L560 190 L562 80 L566 200" fill="none" stroke="#01a09c" stroke-width="2"/></svg>
      </section>
      <section class="form">
        <div><h2>${first ? 'Criar o primeiro acesso' : 'Entrar'}</h2><p class="muted small">${sb ? 'Conectado ao Supabase: use sua conta. Ainda não tem? Preencha e clique em “Criar conta”.' : first ? 'O primeiro usuário recebe o perfil Administrador. Os dados ficam neste navegador até você conectar o Supabase em Configurações.' : 'Modo navegador: os acessos são locais a este aparelho.'}</p></div>
        <form id="lf" class="grid">
          ${first ? ui.field('Nome completo', ui.input('nome', '', 'required autocomplete="name"')) : sb ? ui.field('Nome completo (só para criar conta)', ui.input('nome', '', 'autocomplete="name"')) : ''}
          ${ui.field('E-mail', ui.input('email', '', 'type="email" required autocomplete="username"'))}
          ${ui.field('Senha', ui.input('senha', '', 'type="password" required minlength="6" autocomplete="' + (first ? 'new-password' : 'current-password') + '"'))}
          <p id="lerr" class="bad-text small" hidden></p>
          <button class="btn primary" type="submit">${first ? 'Criar acesso e entrar' : 'Entrar'}</button>
        </form>
        ${sb ? '<button class="btn" id="lsignup">Criar conta</button>' : ''}
        ${first ? `<div class="note">${ui.icon('play')}<div><b>Quer só conhecer o sistema?</b><br><span class="small">Entre com um perfil de demonstração. Ele carrega enlaces de exemplo marcados como DEMO.</span><br><button class="btn sm navy" id="ldemo" style="margin-top:8px">Explorar com dados de demonstração</button></div></div>` : ''}
      </section>
    </div>`;
    U.$('#lf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = ui.formData(e.target), err = U.$('#lerr'); err.hidden = true;
      try {
        if (sb) {
          const au = await FC.supa.signIn(f.email, f.senha).catch(e => { throw new Error(/confirm/i.test(e.message) ? 'Confirme o e-mail pelo link enviado pelo Supabase e tente de novo.' : /invalid/i.test(e.message) ? 'E-mail ou senha incorretos.' : e.message); });
          await FC.supa.pull();
          let u = st.users.find(x => x.authId === au.id) || st.users.find(x => !x.authId && U.norm(x.email) === U.norm(f.email));
          if (u && !u.authId) { u.authId = au.id; await FC.supa.write('upsert', 'users', u); }          // membro migrado assume o perfil
          if (!u) { u = { id: U.uid('usr_'), authId: au.id, nome: (au.user_metadata && au.user_metadata.nome) || f.nome || f.email, email: f.email, role: 'visualizador', ativo: true }; await FC.supa.write('upsert', 'users', u); }
          await FC.supa.pull();                                                                           // papel definido pelo banco
          u = st.users.find(x => x.authId === au.id) || u;
          if (!u.ativo) throw new Error('Acesso desativado. Fale com o administrador.');
          return enter(u);
        }
        if (first) {
          const u = { id: U.uid('usr_'), nome: f.nome.trim(), email: f.email.trim(), role: 'admin', ativo: true, senha: await hashPass(f.email, f.senha) };
          st.users.push(u); st.session = { userId: u.id }; store.audit('criou', 'users', u.id, 'Primeiro acesso (Administrador)'); store.save();
          return enter(u);
        }
        const u = st.users.find(x => U.norm(x.email) === U.norm(f.email));
        if (!u || !u.senha || u.senha !== await hashPass(f.email, f.senha)) throw new Error('E-mail ou senha incorretos.');
        if (!u.ativo) throw new Error('Acesso desativado. Fale com o administrador.');
        enter(u);
      } catch (ex) { err.textContent = ex.message || String(ex); err.hidden = false; }
    });
    const d = U.$('#ldemo');
    d && d.addEventListener('click', async () => {
      const u = { id: U.uid('usr_'), nome: 'Visitante Demo', email: 'demo@clickip.demo', role: 'admin', ativo: true, demo: true, senha: await hashPass('demo@clickip.demo', 'clickip') };
      st.users.push(u); st.session = { userId: u.id };
      FC.seedDemo(u.id);
      ui.toast('Dados de demonstração carregados. Acesso: demo@clickip.demo / clickip', 'ok', 7000);
      enter(u);
    });
    const su = U.$('#lsignup');
    su && su.addEventListener('click', async () => {
      const f = ui.formData(U.$('#lf'));
      if (!f.email || (f.senha || '').length < 6) return ui.toast('Informe e-mail e senha (6+ caracteres).', 'err');
      try { const nu = await FC.supa.signUp(f.email, f.senha, f.nome || f.email); ui.toast(nu && nu.identities && !nu.identities.length ? 'Este e-mail já tem conta. Clique em Entrar.' : 'Conta criada. Se o Supabase pedir, confirme pelo e-mail; depois clique em Entrar.', 'ok', 8000); } catch (ex) { ui.toast(ex.message, 'err'); }
    });
  }

  function enter(u) {
    store.state.session = { userId: u.id, at: U.now() };
    store.audit('entrou', 'session', u.id, 'Login');
    store.save();
    renderShell();
    const h = location.hash.slice(1);
    FC.go(h || 'dashboard');
  }
  FC.logout = () => { store.audit('saiu', 'session', null, 'Logout'); store.state.session = null; store.save(); if (store.mode === 'supabase') FC.supa.signOut(); renderLogin(); };

  /* ---------- Estrutura ---------- */
  function renderShell() {
    const u = store.user();
    const mainMods = FC.modules.filter(m => m.group === 'main'), toolMods = FC.modules.filter(m => m.group === 'tools');
    const navItem = (m) => `<a href="#${m.id}" data-mod="${m.id}" class="${m.field ? '' : 'office'}">${ui.icon(m.icon)}<span>${U.esc(m.title)}</span>${m.count ? `<span class="n" data-count="${m.id}" hidden></span>` : ''}</a>`;
    document.getElementById('root').innerHTML = `
    <div class="app">
      <aside class="side" id="side" aria-label="Menu principal">
        <div class="brand"><img src="${LOGO.dark}" alt="i_mais ClickIP"><div class="sys">Fiber<span>Control</span></div></div>
        <nav class="nav">${mainMods.map(navItem).join('')}<div class="grp">Ferramentas</div>${toolMods.map(navItem).join('')}</nav>
        <div class="side-foot">
          <span class="mode-pill ${store.mode === 'supabase' ? 'db' : ''}" id="modePill"><i></i>${store.mode === 'supabase' ? 'Conectado ao Supabase' : 'Dados neste navegador'}</span>
          <span>ClickIP FiberControl · v1.0</span>
        </div>
      </aside>
      <div class="main">
        <header class="top">
          <button class="icon-btn menu-btn" id="menuBtn" aria-label="Abrir menu">${ui.icon('menu')}</button>
          <div class="search rel">${ui.icon('search')}<input id="q" type="search" placeholder="Buscar POP, cabo, trecho, projeto, ID…" autocomplete="off" aria-label="Busca"><div class="search-results" id="qres" hidden></div></div>
          <div class="top-actions">
            <span class="net hide-sm" id="net"></span>
            <button class="icon-btn hide-sm" id="syncBtn" title="Sincronizar pendências" aria-label="Sincronizar">${ui.icon('sync')}<span class="dot" id="qdot" hidden></span></button>
            <div class="rel"><button class="icon-btn" id="bellBtn" aria-label="Notificações">${ui.icon('bell')}<span class="dot" id="bdot" hidden></span></button><div class="dropdown" id="bell" hidden></div></div>
            <button class="icon-btn ${store.state.settings.fieldMode ? 'on' : ''}" id="fieldBtn" title="Modo campo" aria-label="Alternar modo campo">${ui.icon('field')}</button>
            <button class="icon-btn hide-sm" id="themeBtn" title="Tema claro/escuro" aria-label="Alternar tema">${ui.icon('moon')}</button>
            <button class="user-chip" id="userBtn" aria-label="Perfil">${FC.avatar(u)}<span class="who"><b>${U.esc(u.nome.split(' ')[0])}</b><small>${U.esc(FC.roles[u.role].label)}</small></span></button>
          </div>
        </header>
        <main class="page" id="page" tabindex="-1"></main>
      </div>
    </div>
    <nav class="fieldbar" aria-label="Ações de campo">
      <button data-fb="otdr">${ui.icon('upload')}Importar teste</button>
      <button data-fb="checklist">${ui.icon('list')}Checklist</button>
      <button data-fb="enlaces" >${ui.icon('link')}Trechos</button>
      <button data-fb="manut" class="main-act">${ui.icon('wrench')}Registrar</button>
    </nav>`;
    U.$('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
    U.$('#side').addEventListener('click', (e) => { if (e.target.closest('a')) document.body.classList.remove('nav-open'); });
    document.addEventListener('click', (e) => { if (document.body.classList.contains('nav-open') && !e.target.closest('.side') && !e.target.closest('#menuBtn')) document.body.classList.remove('nav-open'); });
    U.$('#themeBtn').onclick = () => { const next = FC.isDark() ? 'light' : 'dark'; store.setSettings('theme', next); FC.applyTheme(); FC.rerender(); };
    U.$('#fieldBtn').onclick = (e) => { store.setSettings('fieldMode', !store.state.settings.fieldMode, 'Modo campo'); FC.applyTheme(); e.currentTarget.classList.toggle('on', store.state.settings.fieldMode); ui.toast(store.state.settings.fieldMode ? 'Modo campo ativado: botões grandes e menu simplificado.' : 'Modo escritório ativado.', 'ok'); };
    U.$('#userBtn').onclick = () => FC.go('configuracoes', { tab: 'perfil' });
    U.$('#syncBtn').onclick = async () => {
      if (store.mode !== 'supabase') return ui.toast('Modo navegador: tudo já está salvo neste aparelho. Conecte o Supabase para sincronizar entre aparelhos.', 'info', 6000);
      const n = await store.flushQueue(); await FC.supa.pull(); ui.toast(`Sincronizado. ${n} pendência(s) enviada(s).`, 'ok'); FC.rerender();
    };
    U.$$('.fieldbar button').forEach(b => b.onclick = () => { const k = b.dataset.fb; if (k === 'manut') FC.go('manutencao', { novo: true }); else FC.go(k); });
    setupSearch(); setupBell(); updateNet();
    store.on((w) => { if (w === 'net' || w === 'queue') updateNet(); if (w === 'change') { refreshCounts(); } });
    refreshCounts();
  }
  FC.avatar = (u, cls = '') => u && u.foto ? `<span class="avatar ${cls}"><img src="${u.foto}" alt=""></span>` : `<span class="avatar ${cls}">${U.esc(((u && u.nome) || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase())}</span>`;

  function updateNet() {
    const el = U.$('#net'); if (!el) return;
    el.className = 'net hide-sm ' + (store.online ? '' : 'off');
    el.innerHTML = ui.icon(store.online ? 'wifi' : 'wifiOff') + `<span>${store.online ? 'Online' : 'Offline'}</span>`;
    const q = store.state.offlineQueue.length, d = U.$('#qdot'); if (d) { d.hidden = !q; d.textContent = q; }
  }

  /* ---------- Roteador ---------- */
  FC.go = (id, params = {}) => {
    if (/^tr-/.test(id)) { params = { trechoId: 'tr_' + id.slice(3) }; id = 'enlaces'; }
    if (/^lnk-/.test(id)) { params = { linkId: 'lnk_' + id.slice(4) }; id = 'enlaces'; }
    const mod = FC.modules.find(m => m.id === id) || FC.modules[0];
    FC.route = { id: mod.id, params };
    if (location.hash.slice(1) !== mod.id) history.replaceState(null, '', '#' + mod.id);
    U.$$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.mod === mod.id));
    const page = U.$('#page'); if (!page) return;
    page.innerHTML = '';
    try { mod.render(page, params); } catch (e) { console.error(e); page.innerHTML = `<div class="note bad">${ui.icon('alert')}<div>Erro ao abrir o módulo ${U.esc(mod.title)}: ${U.esc(e.message)}</div></div>`; }
    page.focus({ preventScroll: true }); window.scrollTo(0, 0);
    document.title = mod.title + ' · ClickIP FiberControl';
  };
  FC.rerender = () => FC.go(FC.route.id, FC.route.params);
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (store.user() && h && h !== FC.route.id) FC.go(h); });

  /* ---------- Busca inteligente ---------- */
  function setupSearch() {
    const q = U.$('#q'), box = U.$('#qres');
    let hits = [], idx = 0;
    const run = () => {
      const s = U.norm(q.value); if (s.length < 2) { box.hidden = true; return; }
      const terms = s.split(/\s+/);
      const st = store.state; hits = [];
      const match = (txt) => { const n = U.norm(txt); return terms.every(t => n.includes(t)); };
      st.links.forEach(l => { const txt = [l.nome, l.popA, l.popB, l.caboId, l.projeto, l.regiao, l.tipoCabo, l.id].join(' '); if (match(txt)) hits.push({ t: 'Enlace', label: l.nome, sub: `${l.projeto} · ${l.caboId || ''} · ${l.regiao || ''}`, go: () => FC.go('enlaces', { linkId: l.id }) }); });
      st.trechos.forEach(t => { const l = store.get('links', t.linkId) || {}; const txt = [l.nome, t.nome, t.caixa, t.tipo, t.id, l.caboId].join(' '); if (match(txt)) hits.push({ t: 'Trecho', label: `${l.nome} / ${t.nome}`, sub: `${t.tipo || ''} · ${t.caixa || ''} · ${FC.calc.statusLabel[FC.calc.trechoStatus(t)]}`, go: () => FC.go('enlaces', { linkId: l.id, trechoId: t.id }) }); });
      st.measurements.forEach(m => { if (m.fileName && match(m.fileName + ' ' + m.id)) { const t = store.get('trechos', m.trechoId); hits.push({ t: 'Medição', label: m.fileName, sub: U.dt(m.data) + ' · ' + (m.responsavel || ''), go: () => FC.go('otdr', { measurementId: m.id }) }); } });
      U.uniq(st.links.flatMap(l => [l.projeto])).forEach(p => { if (match(p)) hits.push({ t: 'Projeto', label: p, sub: 'Filtrar painel por projeto', go: () => FC.go('dashboard', { projeto: p }) }); });
      hits = hits.slice(0, 14); idx = 0;
      box.innerHTML = hits.length ? hits.map((h, i) => `<a href="#" data-h="${i}" class="${i === 0 ? 'hl' : ''}"><span class="tag">${h.t}</span> <b>${U.esc(h.label)}</b><br><small class="muted">${U.esc(h.sub)}</small></a>`).join('') : '<a href="#" class="muted">Nada encontrado</a>';
      box.hidden = false;
    };
    q.addEventListener('input', U.debounce(run, 120));
    q.addEventListener('keydown', (e) => {
      if (box.hidden || !hits.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length; U.$$('a', box).forEach((a, i) => a.classList.toggle('hl', i === idx)); }
      if (e.key === 'Enter') { e.preventDefault(); hits[idx].go(); box.hidden = true; q.value = ''; }
      if (e.key === 'Escape') box.hidden = true;
    });
    box.addEventListener('click', (e) => { e.preventDefault(); const a = e.target.closest('[data-h]'); if (a) { hits[+a.dataset.h].go(); box.hidden = true; q.value = ''; } });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) box.hidden = true; });
    document.addEventListener('keydown', (e) => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); } });
  }

  /* ---------- Notificações ---------- */
  FC.notifications = () => {
    const st = store.state, cfg = st.settings.notifications, out = [], C = FC.calc;
    st.trechos.forEach(t => {
      const l = store.get('links', t.linkId); if (!l) return;
      const name = `${l.nome} / ${t.nome}`;
      const status = C.trechoStatus(t);
      if (cfg.divergencia) { const c = C.compare(t); if (c.status === 'vermelho') out.push({ id: 'div:' + t.id + ':' + (c.m && c.m.id), lv: 'bad', icon: 'compare', msg: `Divergência de ${U.pct(c.diffPct)} OTDR × OZmap em ${name}`, go: () => FC.go('comparativo', { trechoId: t.id }) }); }
      if (cfg.certificacao && status === 'medido') out.push({ id: 'cert:' + t.id, lv: 'info', icon: 'cert', msg: `Certificação pendente: ${name}`, go: () => FC.go('certificacoes', { trechoId: t.id }) });
      if (cfg.capacidade) { const cap = C.capacity(t); if (cap.status === 'vermelho' || cap.status === 'amarelo') out.push({ id: 'cap:' + t.id + ':' + cap.rest, lv: cap.status === 'vermelho' ? 'bad' : 'warn', icon: 'fiber', msg: cap.status === 'vermelho' ? `Sem fibras livres em ${name}` : `Somente ${cap.rest} fibra(s) livre(s) em ${name}`, go: () => FC.go('fibras') }); }
      if (cfg.piora) { const ms = C.measurementsOf(t.id); if (ms.length > 1) { const d = C.diffMeasurements(ms[ms.length - 2], ms[ms.length - 1]); if (d.piora) out.push({ id: 'pio:' + ms[ms.length - 1].id, lv: 'bad', icon: 'history', msg: `Perda piorou ${U.db(d.dLoss)} em ${name}`, go: () => FC.go('historico', { trechoId: t.id }) }); } }
    });
    return out;
  };
  function setupBell() {
    const btn = U.$('#bellBtn'), dd = U.$('#bell');
    btn.onclick = (e) => {
      e.stopPropagation();
      const list = FC.notifications(), read = new Set(store.state.notifRead);
      dd.innerHTML = `<div class="item" style="grid-template-columns:1fr auto;cursor:default"><b>Notificações (${list.length})</b><button class="btn sm ghost" id="nAll">Marcar todas como lidas</button></div>` + (list.length ? list.slice(0, 60).map((n, i) => `<div class="item ${read.has(n.id) ? 'read' : ''}" data-n="${i}">${ui.icon(n.icon, n.lv)}<span>${U.esc(n.msg)}</span></div>`).join('') : '<div class="item">Nenhum alerta no momento.</div>');
      dd.hidden = !dd.hidden;
      dd.onclick = (ev) => {
        ev.stopPropagation();
        if (ev.target.id === 'nAll') { store.state.notifRead = list.map(n => n.id); store.save(); dd.hidden = true; return; }
        const it = ev.target.closest('[data-n]'); if (it) { const n = list[+it.dataset.n]; store.state.notifRead.push(n.id); store.save(); dd.hidden = true; n.go(); }
      };
    };
    document.addEventListener('click', () => { dd.hidden = true; });
  }
  let lastBrowserNotif = new Set();
  function refreshCounts() {
    const list = FC.notifications(), read = new Set(store.state.notifRead);
    const unread = list.filter(n => !read.has(n.id));
    const d = U.$('#bdot'); if (d) { d.hidden = !unread.length; d.textContent = unread.length > 99 ? '99+' : unread.length; }
    const cert = store.state.trechos.filter(t => FC.calc.trechoStatus(t) === 'medido').length;
    const c = U.$('[data-count="certificacoes"]'); if (c) { c.hidden = !cert; c.textContent = cert; }
    if (store.state.settings.notifications.browser && 'Notification' in window && Notification.permission === 'granted') {
      unread.filter(n => n.lv === 'bad' && !lastBrowserNotif.has(n.id)).slice(0, 3).forEach(n => { try { new Notification('ClickIP FiberControl', { body: n.msg }); } catch (e) { /* */ } lastBrowserNotif.add(n.id); });
    }
  }

  /* ---------- Início ---------- */
  FC.boot = async () => {
    store.load();
    if (store.state.settings.permissions) Object.assign(FC.permissions, store.state.settings.permissions);
    FC.applyTheme();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => store.user() && FC.rerender());
    // Configuração do repositório (fc-config.js) vale para todos, salvo se este navegador foi desconectado de propósito
    const cfg = window.FC_CONFIG || {};
    if (cfg.supabaseUrl && cfg.supabaseAnonKey && !store.state.settings.supabase.url && !store.state.settings.supabaseOff) store.state.settings.supabase = { url: cfg.supabaseUrl.replace(/\/$/, ''), anonKey: cfg.supabaseAnonKey, fromConfig: true };
    if (cfg.driveBackendUrl && !store.state.settings.drive.backendUrl) store.state.settings.drive.backendUrl = cfg.driveBackendUrl;
    const sb = store.state.settings.supabase;
    if (sb.url && sb.anonKey && !store.state.settings.supabaseOff) {
      try { await FC.supa.connect(sb.url, sb.anonKey); const { data } = await FC.supa.client.auth.getSession(); if (data.session) await FC.supa.pull(); else store.state.session = null; }
      catch (e) { store.mode = 'local'; ui.toast('Supabase indisponível (' + e.message + '). Usando dados do navegador.', 'warn', 7000); }
    }
    const u = store.user();
    if (u) { renderShell(); FC.go(location.hash.slice(1) || 'dashboard'); } else renderLogin();
  };
})(window.FC = window.FC || {});
