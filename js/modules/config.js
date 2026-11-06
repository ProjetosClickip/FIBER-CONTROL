/* Módulo 13 — Configurações e perfil */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, store = FC.store;
  let tab = 'perfil';
  const TABS = [['perfil', 'Perfil'], ['aparencia', 'Tema e notificações'], ['tecnico', 'Parâmetros técnicos'], ['permissoes', 'Permissões'], ['integracoes', 'Integrações'], ['dados', 'Dados'], ['status', 'Status das funções']];

  function render(el, params) {
    if (params.tab) tab = params.tab;
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Sistema</span><h1>Configurações</h1></div></div>
      <div class="tabs">${TABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div id="cfg"></div>`;
    U.$$('[data-tab]', el).forEach(b => b.onclick = () => { tab = b.dataset.tab; FC.go('configuracoes', { tab }); });
    const box = U.$('#cfg', el);
    ({ perfil, aparencia, tecnico, permissoes, integracoes, dados, status })[tab](box);
  }

  function perfil(box) {
    const u = store.user();
    box.innerHTML = `<section class="grid g2"><div class="panel"><header><h3>Meu perfil</h3><span class="tag">${U.esc(FC.roles[u.role].label)}</span></header>
      <div style="display:flex;gap:14px;align-items:center">${FC.avatar(u, 'big').replace('class="avatar big"', 'class="avatar" style="width:72px;height:72px;font-size:1.4rem"')}<div class="btn-row"><button class="btn sm" id="ph">${ui.icon('camera')}Alterar foto</button>${u.foto ? '<button class="btn sm ghost" id="phr">Remover</button>' : ''}</div></div>
      <form class="form-grid" id="pf">${ui.field('Nome', ui.input('nome', u.nome, 'required'))}${ui.field('Telefone', ui.input('fone', u.fone))}</form><div class="btn-row"><button class="btn primary" id="psv">Salvar perfil</button><button class="btn ghost" id="out">${ui.icon('logout')}Sair</button></div></div>
      <div class="panel"><header><h3>Acesso</h3></header>
      <form class="form-grid" id="ef">${ui.field('E-mail', ui.input('email', u.email, 'type="email"'), store.mode === 'supabase' ? 'O Supabase envia um link de confirmação para o novo e-mail.' : 'Confirme com a senha atual.')}${store.mode === 'local' ? ui.field('Senha atual', ui.input('cur', '', 'type="password" autocomplete="current-password"')) : ''}</form><button class="btn" id="esv">Alterar e-mail</button>
      <form class="form-grid" id="sf">${store.mode === 'local' ? ui.field('Senha atual', ui.input('cur2', '', 'type="password" autocomplete="current-password"')) : ''}${ui.field('Nova senha', ui.input('n1', '', 'type="password" minlength="6" autocomplete="new-password"'))}${ui.field('Confirmar nova senha', ui.input('n2', '', 'type="password" autocomplete="new-password"'))}</form><button class="btn" id="ssv">Alterar senha</button></div></section>`;
    const verify = async (pass) => store.mode === 'supabase' || (u.senha && u.senha === await U.sha256('fc|' + U.norm(u.email) + '|' + pass));
    U.$('#ph').onclick = async () => {
      const [f] = await ui.pickFiles({ accept: 'image/*' }); if (!f) return;
      const img = new Image(); img.src = await U.readAsDataURL(f); await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = 160; const x = c.getContext('2d'); const s = Math.min(img.width, img.height);
      x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 160, 160);
      u.foto = c.toDataURL('image/jpeg', .85); store.upsert('users', u, 'Foto de perfil alterada'); location.reload();
    };
    const phr = U.$('#phr'); phr && (phr.onclick = () => { delete u.foto; store.upsert('users', u, 'Foto removida'); location.reload(); });
    U.$('#psv').onclick = () => { const f = ui.formData(U.$('#pf')); if (!f.nome.trim()) return ui.toast('Informe o nome.', 'err'); const old = u.nome; u.nome = f.nome.trim(); u.fone = f.fone; store.upsert('users', u, `Nome do usuário: ${old} → ${u.nome}`); ui.toast('Perfil salvo.', 'ok'); };
    U.$('#out').onclick = () => FC.logout();
    U.$('#esv').onclick = async () => {
      const f = ui.formData(U.$('#ef')); if (!/^\S+@\S+\.\S+$/.test(f.email)) return ui.toast('E-mail inválido.', 'err');
      if (store.state.users.some(x => x.id !== u.id && U.norm(x.email) === U.norm(f.email))) return ui.toast('E-mail já usado por outro membro.', 'err');
      if (store.mode === 'supabase') { try { await FC.supa.updateAuth({ email: f.email }); ui.toast('Confirme a alteração pelo link enviado ao novo e-mail.', 'ok', 7000); } catch (e) { return ui.toast(e.message, 'err'); } }
      else { if (!(await verify(f.cur))) return ui.toast('Senha atual incorreta.', 'err'); const pass = f.cur; u.senha = await U.sha256('fc|' + U.norm(f.email) + '|' + pass); }
      const old = u.email; u.email = f.email; store.upsert('users', u, `E-mail: ${old} → ${u.email}`); ui.toast('E-mail atualizado.', 'ok');
    };
    U.$('#ssv').onclick = async () => {
      const f = ui.formData(U.$('#sf'));
      if (f.n1.length < 6) return ui.toast('A nova senha precisa de 6+ caracteres.', 'err'); if (f.n1 !== f.n2) return ui.toast('As senhas não conferem.', 'err');
      if (store.mode === 'supabase') { try { await FC.supa.updateAuth({ password: f.n1 }); } catch (e) { return ui.toast(e.message, 'err'); } }
      else { if (!(await verify(f.cur2))) return ui.toast('Senha atual incorreta.', 'err'); u.senha = await U.sha256('fc|' + U.norm(u.email) + '|' + f.n1); }
      store.upsert('users', u, 'Senha alterada'); U.$('#sf').reset(); ui.toast('Senha alterada.', 'ok');
    };
  }

  function aparencia(box) {
    const S = store.state.settings;
    box.innerHTML = `<section class="grid g2"><div class="panel"><header><h3>Tema</h3></header><div class="seg">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, l]) => `<button class="${S.theme === k ? 'on' : ''}" data-th="${k}">${l}</button>`).join('')}</div>
      <label class="check"><input type="checkbox" id="fm" ${S.fieldMode ? 'checked' : ''}> Modo de utilização em campo (botões grandes e menu simplificado)</label></div>
      <div class="panel"><header><h3>Notificações</h3></header>${[['divergencia', 'Divergências OTDR × OZmap (vermelho)'], ['certificacao', 'Certificações pendentes'], ['capacidade', 'Problemas de capacidade de fibras'], ['piora', 'Piora significativa da perda']].map(([k, l]) => `<label class="check"><input type="checkbox" data-nt="${k}" ${S.notifications[k] ? 'checked' : ''}> ${l}</label>`).join('')}
      <label class="check"><input type="checkbox" data-nt="browser" ${S.notifications.browser ? 'checked' : ''}> Notificações do navegador para alertas críticos</label></div></section>`;
    U.$$('[data-th]', box).forEach(b => b.onclick = () => { store.setSettings('theme', b.dataset.th, 'Tema'); FC.applyTheme(); FC.rerender(); });
    U.$('#fm').onchange = (e) => { store.setSettings('fieldMode', e.target.checked, 'Modo campo'); FC.applyTheme(); };
    U.$$('[data-nt]', box).forEach(c => c.onchange = async () => {
      if (c.dataset.nt === 'browser' && c.checked && 'Notification' in window) { try { const p = await Notification.requestPermission(); if (p !== 'granted') { c.checked = false; return ui.toast('O navegador não autorizou notificações.', 'warn'); } } catch (e) { c.checked = false; return ui.toast('Notificações do navegador indisponíveis aqui.', 'warn'); } }
      store.setSettings('notifications.' + c.dataset.nt, c.checked, 'Notificação ' + c.dataset.nt);
    });
  }

  function tecnico(box) {
    const S = store.state.settings, can = store.can('config.tecnica'), dis = can ? '' : 'disabled';
    const n = (id, v, step = '0.01') => `<input type="number" step="${step}" id="${id}" name="${id}" value="${v}" ${dis}>`;
    box.innerHTML = `${can ? '' : `<div class="note warn">${ui.icon('alert')}<div>Somente Administrador e Engenheiro alteram parâmetros técnicos. Os valores são exibidos para consulta.</div></div>`}
      <section class="grid g2">
      <div class="panel"><header><h3>Tolerâncias OTDR × OZmap</h3><button class="btn sm ghost" id="gotol">Por tipo de trecho</button></header><div class="form-grid">${ui.field('Tolerância máxima (%)', n('t_max', S.tolerance.max, '0.1'))}${ui.field('Faixa de atenção (%)', n('t_att', S.tolerance.attention, '0.1'))}</div></div>
      <div class="panel"><header><h3>Capacidade de fibras</h3></header><div class="form-grid">${ui.field('Mínimo de fibras livres', n('f_min', S.fibers.min, '1'))}${ui.field('Cabo de referência (FO)', n('f_ref', S.fibers.reference, '1'))}${ui.field('Nome da coluna OZmap', `<input id="f_col" value="${U.esc(S.fibers.column)}" ${dis}>`)}${ui.field('Capacidades cadastradas', `<input id="f_caps" value="${S.fibers.capacities.join(', ')}" ${dis}>`, 'Separadas por vírgula')}</div></div>
      <div class="panel span2"><header><h3>Parâmetros de perda (link budget)</h3><span class="sub">Por comprimento de onda e por tipo de componente</span></header>
        <div class="table-scroll"><table class="tbl"><thead><tr><th>λ (nm)</th><th>Atenuação (dB/km)</th><th></th></tr></thead><tbody id="wlb">${Object.entries(S.budget.wavelengths).map(([w, v]) => `<tr><td>${w}</td><td><input type="number" step="0.001" data-wl="${w}" value="${v.att}" ${dis}></td><td>${can ? `<button class="btn sm ghost" data-delwl="${w}">${ui.icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
        ${can ? `<div class="btn-row"><input id="nwl" type="number" placeholder="Novo λ (nm)" style="width:140px"><input id="natt" type="number" step="0.001" placeholder="dB/km" style="width:120px"><button class="btn sm" id="addwl">Adicionar λ</button></div>` : ''}
        <div class="form-grid">${ui.field('Perda média por emenda (dB)', n('b_spl', S.budget.splice))}${ui.field('Perda média por conector (dB)', n('b_con', S.budget.connector))}${ui.field('Tolerância acima do previsto (dB)', n('b_tol', S.budget.toleranceDb))}${ui.field('Orçamento do sistema (dB)', n('b_sys', S.budget.systemBudget, '0.1'), 'Potência Tx − sensibilidade Rx')}${ui.field('Margem de segurança (dB)', n('b_saf', S.budget.safetyMargin, '0.1'))}</div>
        <h4>Componentes ópticos</h4><div class="table-scroll"><table class="tbl"><thead><tr><th>Componente</th><th>Perda (dB)</th><th></th></tr></thead><tbody>${S.budget.components.map(c => `<tr><td><input data-cn="${c.id}" value="${U.esc(c.nome)}" ${dis}></td><td><input type="number" step="0.01" data-cp="${c.id}" value="${c.perda}" ${dis}></td><td>${can ? `<button class="btn sm ghost" data-delc="${c.id}">${ui.icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>${can ? `<button class="btn sm" id="addc">${ui.icon('plus')}Adicionar componente</button>` : ''}</div>
      <div class="panel"><header><h3>Critérios de análise OTDR</h3></header><div class="form-grid">
        ${ui.field('Emenda excelente ≤ (dB)', n('o_se', S.otdr.splice.excelente))}${ui.field('Emenda OK ≤ (dB)', n('o_so', S.otdr.splice.ok))}${ui.field('Emenda atenção ≤ (dB)', n('o_sa', S.otdr.splice.atencao))}
        ${ui.field('Conector excelente ≤ (dB)', n('o_ce', S.otdr.connector.excelente))}${ui.field('Conector OK ≤ (dB)', n('o_co', S.otdr.connector.ok))}${ui.field('Conector atenção ≤ (dB)', n('o_ca', S.otdr.connector.atencao))}
        ${ui.field('Refletância OK ≤ (dB)', n('o_ro', S.otdr.reflectance.ok, '0.1'))}${ui.field('Refletância atenção ≤ (dB)', n('o_ra', S.otdr.reflectance.atencao, '0.1'))}
        ${ui.field('ORL OK ≥ (dB)', n('o_oo', S.otdr.orl.ok, '0.1'))}${ui.field('ORL atenção ≥ (dB)', n('o_oa', S.otdr.orl.atencao, '0.1'))}${ui.field('Fim antes do OZmap (%) = possível rompimento', n('o_end', S.otdr.endBeforeOzmapPct, '1'))}</div></div>
      <div class="panel"><header><h3>Requisitos para certificação</h3></header>${[['requireMeasurement', 'Medição OTDR registrada'], ['requireAttachment', 'Arquivo OTDR (SOR/PDF) anexado'], ['requireComparisonOk', 'Comparativo dentro da tolerância'], ['requireBudgetOk', 'Perda dentro do orçamento'], ['allowAttention', 'Aceitar faixa de atenção (amarelo)'], ['requireChecklist', 'Checklist de campo concluído'], ['requireSignature', 'Assinatura eletrônica do aprovador']].map(([k, l]) => `<label class="check"><input type="checkbox" data-cr="${k}" ${S.certification[k] ? 'checked' : ''} ${dis}> ${l}</label>`).join('')}
        <h4>Histórico</h4><div class="form-grid">${ui.field('Alerta de piora ≥ (dB)', n('h_w', S.history.lossWorsenDb))}${ui.field('Mesmo evento até (m)', n('h_m', S.history.eventMatchM, '1'))}</div></div>
      <div class="panel span2"><header><h3>Regras POP → Região e projeto padrão</h3><span class="sub">Usadas para preencher a região automaticamente a partir do teste (expressão regular sobre nomes de POP/cabo)</span></header>
        <div class="table-scroll"><table class="tbl"><thead><tr><th>Padrão (regex)</th><th>Região</th><th></th></tr></thead><tbody>${S.regionRules.map((r, i) => `<tr><td><input data-rp="${i}" value="${U.esc(r.pattern)}" ${dis}></td><td><input data-rr="${i}" value="${U.esc(r.regiao)}" ${dis}></td><td>${can ? `<button class="btn sm ghost" data-delr="${i}">${ui.icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
        ${can ? `<button class="btn sm" id="addr">${ui.icon('plus')}Adicionar regra</button>` : ''}<div class="form-grid">${ui.field('Projeto padrão (quando o teste não informa)', `<input id="dproj" value="${U.esc(S.defaultProject)}" ${dis}>`)}${ui.field('Tipos de trecho', `<input id="ttypes" value="${U.esc(S.trechoTypes.join(', '))}" ${dis}>`, 'Separados por vírgula')}</div></div>
      </section>${can ? `<div class="btn-row"><button class="btn primary" id="tsv">${ui.icon('check')}Salvar parâmetros</button><button class="btn ghost" id="tdef">Restaurar padrões técnicos</button></div>` : ''}`;
    U.$('#gotol').onclick = () => FC.go('comparativo', {});
    if (!can) return;
    const v = (id) => U.parseNum(U.$('#' + id).value);
    U.$('#addwl').onclick = () => { const w = +U.$('#nwl').value, a = U.parseNum(U.$('#natt').value); if (!w || a == null) return ui.toast('Informe λ e atenuação.', 'err'); store.setSettings('budget.wavelengths.' + w, { att: a }, 'Novo λ ' + w + ' nm'); FC.rerender(); };
    U.$$('[data-delwl]', box).forEach(b => b.onclick = () => { const wl = Object.assign({}, S.budget.wavelengths); delete wl[b.dataset.delwl]; store.setSettings('budget.wavelengths', wl, 'λ removido ' + b.dataset.delwl); FC.rerender(); });
    U.$('#addc').onclick = () => { store.setSettings('budget.components', [...S.budget.components, { id: U.uid('c'), nome: 'Novo componente', perda: 0 }], 'Componente adicionado'); FC.rerender(); };
    U.$$('[data-delc]', box).forEach(b => b.onclick = () => { store.setSettings('budget.components', S.budget.components.filter(c => c.id !== b.dataset.delc), 'Componente removido'); FC.rerender(); });
    U.$('#addr').onclick = () => { store.setSettings('regionRules', [...S.regionRules, { pattern: 'POP-XXX', regiao: 'Nova região' }], 'Regra de região adicionada'); FC.rerender(); };
    U.$$('[data-delr]', box).forEach(b => b.onclick = () => { store.setSettings('regionRules', S.regionRules.filter((_, i) => i !== +b.dataset.delr), 'Regra de região removida'); FC.rerender(); });
    U.$('#tdef').onclick = async () => { if (!(await ui.confirm('Restaurar padrões', 'Restaurar tolerâncias, perdas, critérios OTDR, fibras e certificação para os valores padrão? Fatores aprovados são mantidos.', 'Restaurar'))) return; ['tolerance', 'budget', 'otdr', 'fibers', 'certification', 'history'].forEach(k => store.setSettings(k, U.clone(FC.defaults[k]), 'Padrão restaurado: ' + k)); FC.rerender(); };
    U.$('#tsv').onclick = () => {
      if (v('t_att') > v('t_max')) return ui.toast('A faixa de atenção não pode ser maior que a tolerância máxima.', 'err');
      try { S.regionRules.forEach((_, i) => new RegExp(U.$(`[data-rp="${i}"]`).value)); } catch (e) { return ui.toast('Expressão regular inválida nas regras de região.', 'err'); }
      store.setSettings('tolerance.max', v('t_max'), 'Tolerância máxima'); store.setSettings('tolerance.attention', v('t_att'), 'Faixa de atenção');
      store.setSettings('fibers', Object.assign({}, S.fibers, { min: v('f_min'), reference: v('f_ref'), column: U.$('#f_col').value.trim() || '48FO (RESTANTE)', capacities: U.$('#f_caps').value.split(',').map(x => +x.trim()).filter(Boolean).sort((a, b) => a - b) }), 'Parâmetros de fibras');
      const wl = {}; U.$$('[data-wl]', box).forEach(i => wl[i.dataset.wl] = { att: U.parseNum(i.value) });
      store.setSettings('budget', Object.assign({}, S.budget, { wavelengths: wl, splice: v('b_spl'), connector: v('b_con'), toleranceDb: v('b_tol'), systemBudget: v('b_sys'), safetyMargin: v('b_saf'), components: S.budget.components.map(c => ({ id: c.id, nome: U.$(`[data-cn="${c.id}"]`).value, perda: U.parseNum(U.$(`[data-cp="${c.id}"]`).value) || 0, ativo: c.ativo })) }), 'Parâmetros de perda');
      store.setSettings('otdr', Object.assign({}, S.otdr, { splice: { excelente: v('o_se'), ok: v('o_so'), atencao: v('o_sa') }, connector: { excelente: v('o_ce'), ok: v('o_co'), atencao: v('o_ca') }, reflectance: { ok: v('o_ro'), atencao: v('o_ra') }, orl: { ok: v('o_oo'), atencao: v('o_oa') }, endBeforeOzmapPct: v('o_end') }), 'Critérios OTDR');
      const cr = {}; U.$$('[data-cr]', box).forEach(c => cr[c.dataset.cr] = c.checked); store.setSettings('certification', cr, 'Requisitos de certificação');
      store.setSettings('history', { lossWorsenDb: v('h_w'), eventMatchM: v('h_m') }, 'Parâmetros de histórico');
      store.setSettings('regionRules', S.regionRules.map((_, i) => ({ pattern: U.$(`[data-rp="${i}"]`).value, regiao: U.$(`[data-rr="${i}"]`).value })), 'Regras de região');
      store.setSettings('defaultProject', U.$('#dproj').value.trim() || 'Sem projeto', 'Projeto padrão');
      store.setSettings('trechoTypes', U.$('#ttypes').value.split(',').map(x => x.trim()).filter(Boolean), 'Tipos de trecho');
      ui.toast('Parâmetros salvos. Todos os resultados foram recalculados.', 'ok'); FC.rerender();
    };
  }

  function permissoes(box) {
    const can = store.can('equipe.gerenciar'), roles = Object.keys(FC.roles);
    box.innerHTML = `<section class="panel"><header><h3>Matriz de permissões</h3><button class="btn sm" id="team">${ui.icon('team')}Gerenciar equipe</button></header>${can ? '' : `<div class="note warn">${ui.icon('alert')}<div>Somente o Administrador altera permissões.</div></div>`}
      <div class="table-scroll"><table class="tbl"><thead><tr><th>Permissão</th>${roles.map(r => `<th>${FC.roles[r].label}</th>`).join('')}</tr></thead><tbody>${Object.keys(FC.permissions).map(p => `<tr><td>${U.esc(FC.permissionLabels[p])}</td>${roles.map(r => `<td><input type="checkbox" data-p="${p}" data-r="${r}" ${FC.permissions[p].includes(r) ? 'checked' : ''} ${can && !(r === 'admin' && p === 'equipe.gerenciar') ? '' : 'disabled'} aria-label="${FC.roles[r].label}: ${U.esc(FC.permissionLabels[p])}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="small muted">Com Supabase, as mesmas regras são aplicadas no banco pelas políticas RLS (supabase/schema.sql).</p></section>`;
    U.$('#team').onclick = () => FC.go('equipe');
    U.$$('[data-p]', box).forEach(c => c.onchange = () => {
      const p = c.dataset.p, r = c.dataset.r; const set = new Set(FC.permissions[p]); c.checked ? set.add(r) : set.delete(r);
      FC.permissions[p] = [...set]; store.setSettings('permissions', U.clone(FC.permissions), `Permissão "${FC.permissionLabels[p]}" para ${FC.roles[r].label}: ${c.checked ? 'concedida' : 'removida'}`);
    });
  }

  function integracoes(box) {
    const S = store.state.settings;
    box.innerHTML = `<section class="grid g2"><div class="panel"><header><h3>Supabase (banco, autenticação e arquivos)</h3>${store.mode === 'supabase' ? ui.badge('verde', 'Conectado') : ui.badge('sem-dados', 'Não conectado')}</header>
      ${S.supabase.fromConfig ? `<div class="note ok">${ui.icon('check')}<div>Conexão definida no arquivo <code>fc-config.js</code> do repositório (vale para toda a equipe).</div></div>` : ''}<p class="small">Crie o projeto no Supabase, execute <code>supabase/schema.sql</code> e informe a URL e a chave <b>anon</b> (pública por desenho; a segurança vem das políticas RLS). Nunca use a chave <i>service_role</i> aqui.</p>
      <form class="form-grid" id="sbf">${ui.field('URL do projeto', ui.input('url', S.supabase.url, 'placeholder="https://xxxx.supabase.co"'), '', 'full')}${ui.field('Chave anon (pública)', ui.input('key', S.supabase.anonKey, 'placeholder="eyJ..."'), '', 'full')}</form>
      <div class="btn-row">${store.mode === 'supabase' ? '<button class="btn" id="sbp">Reenviar dados deste navegador</button><button class="btn ghost" id="sbd">Desconectar</button>' : '<button class="btn primary" id="sbw">' + ui.icon('sync') + 'Migrar para o Supabase (assistente)</button>'}</div>
      ${location.protocol === 'file:' ? `<div class="note warn">${ui.icon('alert')}<div>Aberto como arquivo local: hospede a pasta (ex.: Netlify) ou rode <code>python3 -m http.server</code> para conectar ao Supabase.</div></div>` : ''}</div>
      <div class="panel"><header><h3>Google Drive</h3></header><p class="small">URL da Edge Function <code>drive</code> (ex.: <code>https://xxxx.supabase.co/functions/v1/drive</code>). Client ID e Client Secret do Google ficam <b>somente</b> nos segredos da função.</p>
      <form class="form-grid">${ui.field('URL do backend do Drive', ui.input('drv', S.drive.backendUrl, 'placeholder="https://xxxx.supabase.co/functions/v1/drive"'), '', 'full')}</form><button class="btn" id="drs">Salvar</button>
      <h4>Processamento OTDR no servidor</h4><p class="small">A Edge Function <code>otdr-parse</code> usa o mesmo leitor SR-4731 deste aplicativo (<code>js/core/sor-parser.js</code>) para processar arquivos enviados ao Storage ou ao Drive.</p></div></section>`;
    const sbw = U.$('#sbw'); sbw && (sbw.onclick = () => migrationWizard(ui.formData(U.$('#sbf'))));
    const sbp = U.$('#sbp'); sbp && (sbp.onclick = async () => { const r = await FC.supa.migrate({ me: store.user(), skipDemo: true, onProgress: () => {} }); ui.toast(`${r.total - r.errors.length} itens enviados${r.errors.length ? ', ' + r.errors.length + ' com erro' : ''}.`, r.errors.length ? 'warn' : 'ok'); });
    const sbd = U.$('#sbd'); sbd && (sbd.onclick = () => { store.setSettings('supabase', { url: '', anonKey: '' }, 'Supabase desconectado'); store.setSettings('supabaseOff', true); location.reload(); });
    U.$('#drs').onclick = () => { if (!store.require('config.tecnica')) return; const u = U.$('#drv').value.trim(); if (u && !/^https:\/\//.test(u)) return ui.toast('A URL deve começar com https://', 'err'); store.setSettings('drive.backendUrl', u, 'Backend do Drive'); ui.toast('Salvo.', 'ok'); };
  }

  /* ---------- Assistente: navegador → Supabase ---------- */
  function migrationWizard(pre) {
    if (!store.require('equipe.gerenciar')) return;
    const me = store.user(), st = store.state;
    const cnt = (c) => st[c].filter(o => !o.demo).length;
    let au = null;
    const md = ui.modal({ title: 'Migrar para o Supabase', wide: true, body: `
      <div class="note">${ui.icon('alert')}<div>Antes: crie o projeto no Supabase e rode <code>supabase/schema.sql</code> no SQL Editor (uma vez). Os dados deste navegador <b>não são apagados</b>; o banco recebe uma cópia.</div></div>
      <h4>1. Conexão</h4><div class="form-grid">${ui.field('URL do projeto', ui.input('wurl', pre.url || '', 'placeholder="https://xxxx.supabase.co"'), 'Supabase › Project Settings › API', 'full')}${ui.field('Chave anon (pública)', ui.input('wkey', pre.key || '', 'placeholder="eyJ..."'), 'Nunca a service_role', 'full')}</div>
      <div class="btn-row"><button class="btn" id="w1">Testar conexão</button><span id="w1s" class="small"></span></div>
      <h4>2. Sua conta de administrador</h4><p class="small muted">O primeiro perfil enviado ao banco vira Administrador. Use o seu e-mail; os outros membros entram depois com o e-mail cadastrado na Equipe e assumem o próprio perfil.</p>
      <div class="form-grid">${ui.field('E-mail', ui.input('wem', me.email || '', 'type="email" autocomplete="username"'))}${ui.field('Senha (6+)', ui.input('wpw', '', 'type="password" autocomplete="new-password"'))}</div>
      <div class="btn-row"><button class="btn" id="w2a" disabled>Criar conta</button><button class="btn" id="w2b" disabled>Entrar</button><span id="w2s" class="small"></span></div>
      <h4>3. Enviar dados</h4><div class="kv">${[['Enlaces', cnt('links')], ['Trechos', cnt('trechos')], ['Medições', cnt('measurements')], ['Anexos (arquivos)', cnt('attachments')], ['Membros', cnt('users')], ['Manutenções', cnt('maintenance')]].map(([k, v]) => `<div><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div>
      <label class="check"><input type="checkbox" id="wdemo" checked> Não enviar registros de demonstração (DEMO)</label>
      <div class="btn-row"><button class="btn primary" id="w3" disabled>${ui.icon('upload')}Enviar dados ao Supabase</button></div><div class="meter"><i id="wbar" style="width:0"></i></div><p id="w3s" class="small"></p>
      <h4>4. Concluir</h4><button class="btn orange" id="w4" disabled>Passar a usar o Supabase</button>` });
    const b = md.el, $ = (id) => U.$('#' + id, b);
    $('w1').onclick = async () => {
      const url = $('wurl').value.trim().replace(/\/$/, ''), key = $('wkey').value.trim();
      if (!/^https:\/\/[\w.-]+/.test(url) || key.length < 20) return ($('w1s').innerHTML = '<span class="bad-text">Informe a URL https e a chave anon.</span>');
      $('w1s').textContent = 'Conectando…';
      try { await FC.supa.connect(url, key); store.mode = 'local'; b._sb = { url, anonKey: key }; $('w1s').innerHTML = '<span class="ok-text">Conectado. Tabelas do schema encontradas.</span>'; $('w2a').disabled = $('w2b').disabled = false; }
      catch (e) { store.mode = 'local'; $('w1s').innerHTML = `<span class="bad-text">${U.esc(/relation|does not exist|schema cache/i.test(e.message) ? 'Conectou, mas as tabelas não existem: rode o supabase/schema.sql no SQL Editor.' : /fetch|network/i.test(e.message) ? 'Sem acesso ao endereço. Confira a URL (e se esta página está hospedada; o link de visualização do Claude bloqueia conexões externas).' : e.message)}</span>`; }
    };
    const signedIn = (u) => { au = u; me.authId = u.id; me.email = u.email; store.save(); $('w2s').innerHTML = `<span class="ok-text">Conectado como ${U.esc(u.email)}.</span>`; $('w3').disabled = false; };
    $('w2a').onclick = async () => { try { const u = await FC.supa.signUp($('wem').value.trim(), $('wpw').value, me.nome); const { data } = await FC.supa.client.auth.getSession(); if (data.session) signedIn(data.session.user); else $('w2s').innerHTML = `<span class="warn-text">Conta criada${u && u.identities && !u.identities.length ? ' (já existia)' : ''}. Confirme pelo e-mail enviado e clique em Entrar — ou desative “Confirm email” em Authentication › Providers › Email.</span>`; } catch (e) { $('w2s').innerHTML = `<span class="bad-text">${U.esc(e.message)}</span>`; } };
    $('w2b').onclick = async () => { try { signedIn(await FC.supa.signIn($('wem').value.trim(), $('wpw').value)); } catch (e) { $('w2s').innerHTML = `<span class="bad-text">${U.esc(/confirm/i.test(e.message) ? 'E-mail ainda não confirmado.' : /invalid/i.test(e.message) ? 'E-mail ou senha incorretos.' : e.message)}</span>`; } };
    $('w3').onclick = async () => {
      $('w3').disabled = true; $('w3s').textContent = 'Enviando…';
      const r = await FC.supa.migrate({ me, skipDemo: $('wdemo').checked, onProgress: (d, t, msg) => { $('wbar').style.width = Math.round(d / t * 100) + '%'; $('w3s').textContent = `${d} de ${t} · ${msg}`; } });
      const { data } = await FC.supa.client.from('perfis').select('data').eq('auth_id', au.id).maybeSingle();
      const role = data && data.data && data.data.role;
      $('w3s').innerHTML = r.errors.length ? `<span class="warn-text">${r.total - r.errors.length} de ${r.total} enviados. ${r.errors.length} erro(s): ${U.esc([...new Set(r.errors)].slice(0, 4).join(' | '))}</span>${role !== 'admin' ? '<br><span class="bad-text">Seu perfil no banco não é Administrador (o banco já tinha outro administrador). Peça a ele para promover você e reenvie.</span>' : ''}` : `<span class="ok-text">Tudo enviado: ${r.total} itens, incluindo os arquivos. Seu perfil no banco: ${U.esc((FC.roles[role] || {}).label || role)}.</span>`;
      store.audit('migrou', 'supabase', null, `${r.total - r.errors.length}/${r.total} itens enviados`);
      $('w3').disabled = false; $('w4').disabled = false;
    };
    $('w4').onclick = () => { store.setSettings('supabaseOff', false); store.setSettings('supabase', b._sb, 'Supabase conectado'); store.state.session = null; store.save(); ui.toast('Pronto. Entre com a conta do Supabase.', 'ok'); setTimeout(() => location.reload(), 600); };
  }

  /* ---------- Backup completo (registros + anexos + traços) ---------- */
  async function buildBackup(withFiles) {
    const st = store.state, c = U.clone(st); delete c.session; c.users = c.users.map(u => Object.assign({}, u, { senha: undefined }));
    c.files = {}; c.traces = {}; c.backupAt = U.now();
    if (withFiles) {
      for (const a of st.attachments) { const bl = await U.idb.get('files', a.id); if (bl) c.files[a.id] = await U.readAsDataURL(bl); }
      for (const m of st.measurements) if (m.hasTrace) { const t = await U.idb.get('traces', m.id); if (t) c.traces[m.id] = t; }
    }
    return c;
  }
  async function restoreBackup(d, label) {
    const st = store.state;
    if (!Array.isArray(d.links) || !Array.isArray(d.trechos)) throw new Error('não é um backup do FiberControl');
    const me = store.user();
    ['links', 'trechos', 'measurements', 'attachments', 'audit', 'maintenance', 'versions', 'driveFiles'].forEach(k => st[k] = d[k] || []);
    st.settings = Object.assign(st.settings, d.settings || {}, { supabase: st.settings.supabase }); st.checklists = d.checklists || {}; st.meta.demo = !!(d.meta && d.meta.demo);
    (d.users || []).forEach(u => { const i = st.users.findIndex(x => x.id === u.id || U.norm(x.email) === U.norm(u.email)); if (i < 0) st.users.push(u); });
    if (!st.users.some(x => x.id === me.id)) st.users.push(me);
    const toBlob = (url) => { const [h, b64] = url.split(','); const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Blob([u8], { type: (h.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream' }); };
    let nf = 0; for (const [id, url] of Object.entries(d.files || {})) { await U.idb.put('files', id, toBlob(url)); nf++; }
    for (const [id, t] of Object.entries(d.traces || {})) await U.idb.put('traces', id, t);
    store.audit('restaurou', 'backup', null, `${label}: ${st.links.length} enlaces, ${nf} arquivos`); store.save();
    return nf;
  }

  function dados(box) {
    const st = store.state;
    box.innerHTML = `<section class="grid g2"><div class="panel"><header><h3>Dados armazenados</h3><span class="tag">${store.mode === 'supabase' ? 'Supabase' : 'Este navegador'}</span></header>
      <div class="kv">${[['Enlaces', st.links.length], ['Trechos', st.trechos.length], ['Medições', st.measurements.length], ['Anexos', st.attachments.length], ['Manutenções', st.maintenance.length], ['Registros de auditoria', st.audit.length], ['Pendências offline', st.offlineQueue.length], ['Dados de demonstração', st.meta.demo ? 'Sim' : 'Não']].map(([k, v]) => `<div><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div>
      ${st.meta.demo ? `<div class="note warn">${ui.icon('alert')}<div>Há registros DEMO misturados. Remova-os antes de usar em produção.<br><button class="btn sm danger" id="rmdemo" style="margin-top:8px">Remover dados de demonstração</button></div></div>` : `<button class="btn" id="lddemo">Carregar dados de demonstração</button>`}</div>
      <div class="panel"><header><h3>Cópia de segurança</h3></header><p class="small">Registros, anexos (PDF/SOR) e traços em um único JSON. Para levar os dados do link de visualização para o sistema hospedado, use <b>Copiar backup</b> lá e <b>Colar backup</b> aqui.</p>
      <label class="check"><input type="checkbox" id="bkf" checked> Incluir arquivos anexos</label>
      <div class="btn-row"><button class="btn" id="bkc">${ui.icon('file')}Copiar backup</button><button class="btn" id="rsp">${ui.icon('upload')}Colar backup</button><button class="btn" id="bk">${ui.icon('download')}Baixar backup</button><button class="btn" id="rs">${ui.icon('upload')}Restaurar de arquivo</button></div>
      <h4>Apagar tudo</h4><p class="small muted">Remove todos os dados deste navegador, inclusive anexos.</p><button class="btn danger" id="wipe">Apagar dados locais</button></div></section>`;
    const rm = U.$('#rmdemo'); rm && (rm.onclick = async () => { if (await ui.confirm('Remover demonstração', 'Remover todos os registros marcados DEMO (enlaces, trechos, medições, membros)?', 'Remover', true)) { await FC.removeDemo(); ui.toast('Dados de demonstração removidos.', 'ok'); FC.go('dashboard'); } });
    const ld = U.$('#lddemo'); ld && (ld.onclick = () => { FC.seedDemo(); ui.toast('Dados de demonstração carregados.', 'ok'); FC.go('dashboard'); });
    const withF = () => U.$('#bkf').checked;
    U.$('#bk').onclick = async () => { const c = await buildBackup(withF()); U.download(new Blob([JSON.stringify(c)], { type: 'application/json' }), 'clickip-fibercontrol-backup-' + U.now().slice(0, 10) + '.json'); store.audit('exportou', 'backup', null, 'Backup JSON'); };
    U.$('#bkc').onclick = async () => {
      const txt = JSON.stringify(await buildBackup(withF()));
      const show = () => ui.modal({ title: 'Backup (' + U.bytes(txt.length) + ')', wide: true, body: `<p class="small">Selecione tudo e copie (Ctrl+A, Ctrl+C). No sistema hospedado: Configurações › Dados › Colar backup.</p><textarea id="bkt" readonly style="min-height:300px;font:12px var(--font-mono)">${U.esc(txt)}</textarea>`, actions: [{ label: 'Selecionar tudo', keep: true, onClick: (b) => { const t = U.$('#bkt', b); t.focus(); t.select(); } }] });
      try { await navigator.clipboard.writeText(txt); ui.toast(`Backup copiado (${U.bytes(txt.length)}). Cole no sistema hospedado.`, 'ok', 7000); } catch (e) { show(); }
      store.audit('exportou', 'backup', null, 'Backup copiado');
    };
    const doRestore = async (txt, label) => {
      if (!store.require('equipe.gerenciar')) return;
      let d; try { d = JSON.parse(txt); } catch (e) { return ui.toast('Texto inválido: não é um JSON de backup.', 'err'); }
      if (!(await ui.confirm('Restaurar backup', `Substituir os dados deste navegador por ${(d.links || []).length} enlaces, ${(d.measurements || []).length} medições e ${Object.keys(d.files || {}).length} arquivos? Seu acesso é mantido.`, 'Restaurar', true))) return;
      try {
        const nf = await restoreBackup(d, label);
        if (store.mode === 'supabase') {
          ui.toast('Backup restaurado. Enviando ao Supabase…', 'info', 4000);
          const r = await FC.supa.migrate({ me: store.user(), skipDemo: true, onProgress: () => {} });
          ui.toast(r.errors.length ? `${r.total - r.errors.length} de ${r.total} itens enviados ao Supabase; ${r.errors.length} com erro: ${[...new Set(r.errors)][0]}` : `Backup restaurado e enviado ao Supabase (${r.total} itens, ${nf} arquivos).`, r.errors.length ? 'warn' : 'ok', 9000);
        } else ui.toast(`Backup restaurado (${nf} arquivos).`, 'ok');
        FC.go('dashboard');
      } catch (e) { ui.toast('Backup inválido: ' + e.message, 'err'); }
    };
    U.$('#rs').onclick = async () => { const [f] = await ui.pickFiles({ accept: '.json' }); if (f) doRestore(await f.text(), f.name); };
    U.$('#rsp').onclick = () => ui.modal({ title: 'Colar backup', wide: true, body: '<p class="small">Cole aqui o texto copiado em “Copiar backup”.</p><textarea id="rst" style="min-height:280px;font:12px var(--font-mono)"></textarea>', actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Restaurar', cls: 'primary', onClick: (b) => { const t = U.$('#rst', b).value.trim(); if (!t) { ui.toast('Cole o backup.', 'err'); return false; } doRestore(t, 'Backup colado'); } }] });
    U.$('#wipe').onclick = async () => { if (!store.require('equipe.gerenciar')) return; if (await ui.confirm('Apagar dados locais', 'Todos os dados deste navegador serão apagados. Faça um backup antes. Continuar?', 'Apagar tudo', true)) { await store.reset(); location.reload(); } };
  }

  function status(box) {
    const lab = { local: ['st-local', 'Funciona no navegador'], supabase: ['st-supabase', 'Banco de dados (Supabase)'], backend: ['st-backend', 'Requer backend'], demo: ['st-demo', 'Demonstrativo'] };
    box.innerHTML = `<section class="panel"><header><h3>Funcionalidades: demonstrativas × conectadas</h3><span class="sub">Situação atual: ${store.mode === 'supabase' ? 'Supabase conectado' : 'dados somente neste navegador'}</span></header>
      <div class="table-scroll"><table class="tbl"><thead><tr><th>Funcionalidade</th><th>Tipo</th><th>Situação agora</th><th>Detalhes</th></tr></thead><tbody>${FC.featureStatus.map(([n, t, d]) => { const now = t === 'supabase' ? (store.mode === 'supabase' ? ui.badge('verde', 'Conectado') : ui.badge('amarelo', 'Local (navegador)')) : t === 'backend' ? (FC.drive.ready() ? ui.badge('verde', 'Configurado') : ui.badge('sem-dados', 'Não configurado')) : t === 'demo' ? (store.state.meta.demo ? ui.badge('amarelo', 'Presente') : ui.badge('verde', 'Removido')) : ui.badge('verde', 'Ativo'); return `<tr><td><b>${U.esc(n)}</b></td><td><span class="${lab[t][0]}">● ${lab[t][1]}</span></td><td>${now}</td><td class="small">${U.esc(d)}</td></tr>`; }).join('')}</tbody></table></div></section>`;
  }

  FC.registerModule({ id: 'configuracoes', order: 13, title: 'Configurações', icon: 'gear', group: 'main', field: true, render });
})(window.FC = window.FC || {});
