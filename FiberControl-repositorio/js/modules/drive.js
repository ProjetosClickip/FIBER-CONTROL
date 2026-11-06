/* Módulo 10 — Google Drive
 * O navegador NUNCA recebe client_secret nem tokens do Google. Todo o OAuth 2.0 e as chamadas
 * à API do Drive acontecem na Edge Function `drive` (backend/supabase/functions/drive). O front-end
 * envia apenas o JWT da sessão Supabase do usuário.
 */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, store = FC.store;
  const D = FC.drive = { status: null, files: [], log: [] };

  const base = () => (store.state.settings.drive.backendUrl || '').replace(/\/$/, '');
  D.ready = () => !!base() && store.mode === 'supabase' && FC.supa.client;
  async function api(path, opts = {}) {
    if (!D.ready()) throw new Error('backend');
    const { data } = await FC.supa.client.auth.getSession();
    const r = await fetch(base() + path, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + (data.session ? data.session.access_token : '') }, opts.headers || {}) }));
    if (!r.ok) throw new Error((await r.text()) || r.statusText);
    return r;
  }
  const json = async (p, o) => (await api(p, o)).json();
  function logIt(msg, lv = 'info') { D.log.unshift({ at: U.now(), msg, lv }); D.log = D.log.slice(0, 50); }
  function needBackend() {
    ui.modal({ title: 'Integração com Google Drive', body: `<p>Esta integração usa <b>OAuth 2.0 no servidor</b>. Por segurança, as credenciais do Google não ficam no navegador, então ela só funciona com o backend configurado.</p>
      <ol class="list-plain small"><li>Conecte o Supabase em <b>Configurações › Integrações</b>.</li><li>Publique a Edge Function <code>drive</code> (pasta <code>backend/supabase/functions/drive</code>) com os segredos <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code>.</li><li>Informe a URL da função em <b>Configurações › Integrações › Google Drive</b>.</li></ol>
      <p class="small muted">Enquanto isso, você pode baixar a pasta do Drive no computador e usar “Importar pasta do computador”: a organização por projeto/enlace é mantida.</p>`, actions: [{ label: 'Abrir configurações', cls: 'primary', onClick: () => FC.go('configuracoes', { tab: 'integracoes' }) }] });
  }
  const guard = (fn) => async (...a) => { if (!store.require('drive.usar')) return; if (!D.ready()) return needBackend(); try { await fn(...a); } catch (e) { logIt('Erro: ' + e.message, 'err'); ui.toast('Google Drive: ' + e.message, 'err'); FC.rerender(); } };

  D.connect = guard(async () => { const r = await json('/auth-url?redirect=' + encodeURIComponent(location.href.split('#')[0] + '#drive')); window.open(r.url, '_blank', 'noopener'); ui.toast('Autorize o acesso na janela do Google e volte para esta tela.', 'info', 7000); });
  D.refresh = guard(async () => { D.status = await json('/status'); logIt('Status atualizado'); FC.rerender(); });
  D.pickFolder = guard(async () => {
    let parent = 'root', trail = [{ id: 'root', name: 'Meu Drive' }];
    const open = async () => {
      const r = await json('/folders?parent=' + encodeURIComponent(parent));
      const md = ui.modal({ title: 'Selecionar pasta de origem', body: `<p class="small">${trail.map(t => U.esc(t.name)).join(' › ')}</p><div class="table-scroll"><table class="tbl"><tbody>${trail.length > 1 ? '<tr class="clickable" data-up><td>⟵ Voltar</td></tr>' : ''}${r.folders.map(f => `<tr class="clickable" data-f="${U.esc(f.id)}" data-n="${U.esc(f.name)}"><td>${ui.icon('folder')} ${U.esc(f.name)}</td></tr>`).join('') || '<tr><td class="empty">Sem subpastas</td></tr>'}</tbody></table></div>`,
        actions: [{ label: 'Usar esta pasta', cls: 'primary', onClick: async () => { const cur = trail[trail.length - 1]; await json('/folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cur) }); store.setSettings('drive.folderId', cur.id); store.setSettings('drive.folderName', cur.name, 'Pasta do Drive'); logIt('Pasta selecionada: ' + cur.name); FC.rerender(); } }],
        onOpen: (b) => b.onclick = (e) => { const tr = e.target.closest('tr'); if (!tr) return; if (tr.hasAttribute('data-up')) { trail.pop(); parent = trail[trail.length - 1].id; } else if (tr.dataset.f) { parent = tr.dataset.f; trail.push({ id: parent, name: tr.dataset.n }); } else return; md.close(); open(); } });
    };
    await open();
  });
  D.list = guard(async () => {
    const r = await json('/files?folderId=' + encodeURIComponent(store.state.settings.drive.folderId || 'root'));
    const known = new Set(store.state.driveFiles.map(f => f.driveId + ':' + f.md5));
    const hashes = new Set(store.state.measurements.map(m => m.driveMd5).filter(Boolean));
    D.files = r.files.map(f => Object.assign(f, { imported: known.has(f.id + ':' + f.md5Checksum) || hashes.has(f.md5Checksum), sel: false }));
    D.files.forEach(f => { f.sel = !f.imported && !!FC.importers.kindOf(f.name); });
    logIt(`${D.files.length} arquivo(s) listados; ${D.files.filter(f => f.imported).length} já importados`);
    FC.rerender();
  });
  D.importSel = guard(async () => {
    const sel = D.files.filter(f => f.sel);
    if (!sel.length) return ui.toast('Selecione arquivos para importar.', 'warn');
    const files = [];
    for (const f of sel) {
      const r = await api('/download?id=' + encodeURIComponent(f.id));
      const blob = await r.blob();
      const file = new File([blob], f.name, { type: f.mimeType });
      try { Object.defineProperty(file, 'webkitRelativePath', { value: f.path || f.name }); } catch (e) { /* */ }
      files.push(file);
      store.upsert('driveFiles', { id: U.uid('drv_'), driveId: f.id, md5: f.md5Checksum, nome: f.name, path: f.path, importedAt: U.now() });
    }
    logIt(`${files.length} arquivo(s) baixados do Drive para importação`, 'ok');
    FC.go('otdr', { tab: 'lote' }); setTimeout(() => FC.batchAdd(files), 60);
  });
  D.sync = guard(async () => { await D.refresh(); await D.list(); const n = D.files.filter(f => !f.imported && f.sel).length; ui.toast(n ? `${n} arquivo(s) novo(s) ou alterado(s) no Drive. Clique em “Importar testes”.` : 'Drive sincronizado: nenhum arquivo novo.', 'ok'); });
  /** Envia blob ao Drive organizado em Projeto/Enlace/AAAA-MM-DD */
  D.upload = guard(async (blob, name, opts = {}) => {
    const l = opts.linkId ? store.get('links', opts.linkId) : null;
    const path = [opts.projeto || (l && l.projeto) || 'Geral', l ? l.nome : 'Relatórios', U.now().slice(0, 10)].join('/');
    const fd = new FormData(); fd.append('file', blob, name); fd.append('path', path); fd.append('folderId', store.state.settings.drive.folderId || 'root');
    await api('/upload', { method: 'POST', body: fd });
    logIt(`Enviado: ${path}/${name}`, 'ok'); store.audit('enviou', 'drive', null, `${path}/${name}`); ui.toast('Enviado ao Google Drive: ' + path + '/' + name, 'ok');
  });

  function render(el) {
    const cfg = store.state.settings.drive, ready = D.ready(), st = D.status;
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Integração</span><h1>Google Drive</h1><p class="muted small">Importação automática de testes OTDR e envio de relatórios, organizados por projeto, enlace e data.</p></div></div>
      <section class="panel"><header><h3>Status da conexão</h3>${ready ? ui.badge(st && st.connected ? 'verde' : 'amarelo', st && st.connected ? 'Conectado' : 'Backend pronto · conta não verificada') : ui.badge('sem-dados', 'Requer backend')}</header>
        <div class="kv"><div><span class="k">Backend</span><span class="v">${cfg.backendUrl ? U.esc(cfg.backendUrl) : 'não configurado'}</span></div><div><span class="k">Banco de dados</span><span class="v">${store.mode === 'supabase' ? 'Supabase conectado' : 'Somente navegador'}</span></div><div><span class="k">Conta Google</span><span class="v">${U.esc(st && st.email || '—')}</span></div><div><span class="k">Pasta de origem</span><span class="v">${U.esc(cfg.folderName || '—')}</span></div><div><span class="k">Arquivos já importados</span><span class="v">${store.state.driveFiles.length}</span></div><div><span class="k">Última sincronização</span><span class="v">${D.log[0] ? U.dt(D.log[0].at) : '—'}</span></div></div>
        <div class="btn-row"><button class="btn primary" data-a="connect">${ui.icon('drive')}Conectar Google Drive</button><button class="btn" data-a="pickFolder">${ui.icon('folder')}Selecionar pasta</button><button class="btn" data-a="list">${ui.icon('search')}Listar arquivos</button><button class="btn" data-a="importSel">${ui.icon('download')}Importar testes</button><button class="btn" data-a="sync">${ui.icon('sync')}Sincronizar</button><button class="btn" data-a="reports">${ui.icon('upload')}Enviar relatórios</button></div>
        ${ready ? '' : `<div class="note warn">${ui.icon('alert')}<div>Os botões acima exigem o backend (OAuth 2.0 seguro). Veja as instruções ao clicar em qualquer um deles.</div></div>`}</section>
      <section class="grid g2"><div class="panel"><header><h3>Arquivos na pasta</h3><span class="sub">${D.files.length} arquivo(s)</span></header><div id="dft"></div></div>
      <div class="panel"><header><h3>Sem backend? Importe a pasta baixada</h3></header><p class="small">Baixe a pasta do Drive (ou use o Google Drive para computador) e selecione-a aqui. A 1ª subpasta vira o projeto e arquivos repetidos são detectados pelo hash.</p><button class="btn" id="localDir">${ui.icon('folder')}Importar pasta do computador</button>
        <h4>Registro da sincronização</h4><ul class="activity">${D.log.map(l => `<li style="grid-template-columns:1fr"><span class="small ${l.lv === 'err' ? 'bad-text' : l.lv === 'ok' ? 'ok-text' : ''}">${U.esc(l.msg)}</span><span class="tiny muted">${U.dt(l.at)}</span></li>`).join('') || '<li class="muted small" style="grid-template-columns:1fr">Nenhuma sincronização nesta sessão.</li>'}</ul></div></section>`;
    U.$$('[data-a]', el).forEach(b => b.onclick = () => b.dataset.a === 'reports' ? (D.ready() ? FC.go('relatorios') : needBackend()) : D[b.dataset.a]());
    U.$('#localDir').onclick = async () => { const fs = await ui.pickFiles({ directory: true }); if (fs.length) { FC.go('otdr', { tab: 'lote' }); setTimeout(() => FC.batchAdd(fs), 60); } };
    ui.table(U.$('#dft'), { rows: D.files, empty: ready ? 'Clique em “Listar arquivos”.' : 'Disponível com o backend configurado.', columns: [
      { key: 'sel', label: '', sortable: false, render: f => `<input type="checkbox" data-fs="${U.esc(f.id)}" ${f.sel ? 'checked' : ''} aria-label="Selecionar">` },
      { key: 'name', label: 'Arquivo', render: f => `${U.esc(f.name)}<br><span class="tiny muted">${U.esc(f.path || '')}</span>` }, { key: 'modifiedTime', label: 'Alterado', render: f => U.dt(f.modifiedTime) },
      { key: 'imported', label: 'Situação', render: f => f.imported ? ui.badge('verde', 'Já importado') : FC.importers.kindOf(f.name) ? ui.badge('info', 'Novo') : ui.badge('sem-dados', 'Formato ignorado') }
    ] });
    U.$$('[data-fs]', el).forEach(c => c.onchange = () => { const f = D.files.find(x => x.id === c.dataset.fs); f.sel = c.checked; });
  }
  FC.registerModule({ id: 'drive', order: 10, title: 'Google Drive', icon: 'drive', group: 'main', field: false, render });
})(window.FC = window.FC || {});
