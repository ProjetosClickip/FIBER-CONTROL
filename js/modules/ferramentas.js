/* Ferramentas — Mapa dos enlaces, Manutenção, Checklist de campo e Auditoria */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, C = FC.calc, store = FC.store;

  /* ================= MAPA ================= */
  let overlays = [];
  function renderMapa(el) {
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Geografia</span><h1>Mapa dos enlaces</h1><p class="muted small">Trechos coloridos pela classificação do comparativo. Importe um KMZ/KML para sobrepor o traçado de projeto.</p></div>
      <div class="acts"><button class="btn" id="kmz">${ui.icon('map')}Sobrepor KMZ/KML</button>${overlays.length ? '<button class="btn ghost" id="kclr">Limpar sobreposição</button>' : ''}</div></div>
      <section class="panel"><div class="btn-row small"><span class="badge ok">Dentro da tolerância</span><span class="badge warn">Atenção</span><span class="badge bad">Fora da tolerância</span><span class="badge mute">Sem medição</span><span class="badge info">Certificado (linha contínua grossa)</span></div><div class="map" id="map"></div><p class="tiny muted" id="mapnote"></p></section>`;
    U.$('#kmz').onclick = async () => { const [f] = await ui.pickFiles({ accept: '.kmz,.kml' }); if (!f) return; try { const g = await FC.geoio.readKMZ(f, f.name); overlays = g; ui.toast(`${g.length} geometria(s) lidas de ${f.name}.`, 'ok'); FC.rerender(); } catch (e) { ui.toast('KMZ inválido: ' + e.message, 'err'); } };
    const kc = U.$('#kclr'); kc && (kc.onclick = () => { overlays = []; FC.rerender(); });
    const ts = store.state.trechos.filter(t => t.coords && t.coords.length > 1);
    const col = (t) => { const s = C.compare(t).status, p = ui.palette(); return s === 'verde' ? p.ok : s === 'amarelo' ? p.warn : s === 'vermelho' ? p.bad : p.mute; };
    const box = U.$('#map');
    if (!ts.length && !overlays.length) { box.innerHTML = `<div style="display:grid;place-items:center;height:100%;padding:20px;text-align:center"><p class="muted">Nenhum trecho com geometria. Anexe um KMZ ao trecho (Enlaces › trecho › Anexar) para desenhá-lo aqui.</p></div>`; return; }
    if (window.L) {
      const map = L.map(box, { preferCanvas: true });
      const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      tiles.on('tileerror', () => { U.$('#mapnote').textContent = 'Fundo cartográfico indisponível (sem internet ou bloqueado). As linhas continuam corretas.'; });
      const all = [];
      ts.forEach(t => {
        const l = store.get('links', t.linkId), c = C.compare(t), cert = C.trechoStatus(t) === 'certificado';
        const pl = L.polyline(t.coords, { color: col(t), weight: cert ? 7 : 4, opacity: .9, dashArray: C.latest(t.id) ? null : '6 6' }).addTo(map);
        pl.bindPopup(`<b>${U.esc(l.nome)} / ${U.esc(t.nome)}</b><br>${U.esc(t.tipo || '')} · OZmap ${U.m(t.ozmapM, 0)}<br>OTDR ${U.m(c.otdr, 1)} · ${c.diffPct != null ? U.pct(c.diffPct) : 'sem medição'}<br>Status: ${C.statusLabel[C.trechoStatus(t)]}<br><a href="#tr-${t.id.slice(3)}">Abrir trecho</a>`);
        all.push(...t.coords);
      });
      const pops = {}; store.state.links.forEach(l => { const ts2 = store.state.trechos.filter(t => t.linkId === l.id && t.coords).sort((a, b) => a.ordem - b.ordem); if (ts2.length) { pops[l.popA] = ts2[0].coords[0]; pops[l.popB] = ts2[ts2.length - 1].coords.slice(-1)[0]; } });
      Object.entries(pops).forEach(([n, p]) => L.circleMarker(p, { radius: 7, color: '#002947', fillColor: '#fe6218', fillOpacity: 1, weight: 2 }).addTo(map).bindTooltip(n));
      overlays.forEach(g => { if (g.point) L.circleMarker(g.coords[0], { radius: 4, color: '#2a6fb5' }).addTo(map).bindTooltip(g.name); else L.polyline(g.coords, { color: '#2a6fb5', weight: 2, dashArray: '4 4' }).addTo(map).bindTooltip(g.name + ' (KMZ)'); all.push(...g.coords); });
      map.fitBounds(L.latLngBounds(all).pad(.1));
      setTimeout(() => map.invalidateSize(), 100);
    } else {
      box.innerHTML = `<p class="muted" style="padding:16px">Biblioteca de mapas indisponível. Verifique a conexão.</p>`;
    }
  }

  /* ================= MANUTENÇÃO ================= */
  const TIPOS = ['Rompimento', 'Fusão', 'Reparo', 'Intervenção', 'Inspeção', 'Limpeza de conectores', 'Troca de cabo'];
  function manForm(pre = {}) {
    if (!store.require('medicao.importar')) return;
    const ts = store.state.trechos;
    ui.modal({ title: 'Registrar manutenção', wide: true, body: `<form class="form-grid" id="mf">
      ${ui.field('Trecho', `<select name="trechoId" required>${ts.map(t => `<option value="${t.id}" ${pre.trechoId === t.id ? 'selected' : ''}>${U.esc((store.get('links', t.linkId) || {}).nome)} / ${U.esc(t.nome)}</option>`).join('')}</select>`, '', 'full')}
      ${ui.field('Tipo', ui.select('tipo', TIPOS, 'Reparo'))}${ui.field('Data e hora', ui.input('data', new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16), 'type="datetime-local"'))}
      ${ui.field('Fusões realizadas', ui.input('fusoes', 0, 'type="number" min="0"'))}${ui.field('Distância do ponto (m)', ui.input('pontoM', '', 'type="number" step="any"'), 'Distância a partir do POP A, se conhecida')}
      ${ui.field('Responsável', ui.input('resp', store.user().nome, 'readonly'))}
      ${ui.field('Descrição', '<textarea name="descricao" required placeholder="O que foi feito, causa, material usado…"></textarea>', '', 'full')}</form>
      <p class="small muted">${store.online ? '' : 'Sem internet: o registro fica salvo no aparelho e sincroniza depois.'} Após salvar, você pode anexar fotos ao trecho.</p>`,
      actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Salvar registro', cls: 'primary', icon: 'check', onClick: (b) => {
        const f = ui.formData(U.$('#mf', b)); if (!f.descricao.trim()) { ui.toast('Descreva a manutenção.', 'err'); return false; }
        const t = store.get('trechos', f.trechoId);
        store.upsert('maintenance', { id: U.uid('man_'), trechoId: t.id, linkId: t.linkId, tipo: f.tipo, data: new Date(f.data).toISOString(), fusoes: +f.fusoes || 0, pontoM: f.pontoM ? +f.pontoM : null, descricao: f.descricao.trim(), responsavel: store.user().nome }, `Manutenção (${f.tipo}) em ${t.nome}`);
        ui.toast('Manutenção registrada. Faça uma nova medição para atualizar o histórico.', 'ok', 6000); FC.go('manutencao');
      } }] });
  }
  function renderManut(el, params) {
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Operação</span><h1>Controle de manutenção</h1><p class="muted small">Intervenções, rompimentos, fusões e reparos por trecho.</p></div><div class="acts"><button class="btn primary" id="nm">${ui.icon('plus')}Registrar manutenção</button></div></div>
      <section class="kpis">${TIPOS.slice(0, 5).map(t => `<div class="kpi"><span class="l">${t}</span><span class="v">${store.state.maintenance.filter(m => m.tipo === t).length}</span></div>`).join('')}<div class="kpi accent"><span class="l">Fusões registradas</span><span class="v">${U.sum(store.state.maintenance, m => m.fusoes)}</span></div></section>
      <section class="panel" id="mt"></section>`;
    U.$('#nm').onclick = () => manForm({ trechoId: params.trechoId });
    if (params.novo) setTimeout(() => manForm({ trechoId: params.trechoId }), 50);
    ui.table(U.$('#mt'), { rows: store.state.maintenance, sortKey: 'data', empty: 'Nenhuma manutenção registrada.', onRow: m => FC.go('historico', { trechoId: m.trechoId }), columns: [
      { key: 'data', label: 'Data', render: m => U.dt(m.data) }, { key: 'tipo', label: 'Tipo', render: m => `<span class="tag">${U.esc(m.tipo)}</span>${ui.demo(m)}` },
      { key: 'tr', label: 'Enlace / trecho', sort: m => (store.get('links', m.linkId) || {}).nome, render: m => `${U.esc((store.get('links', m.linkId) || {}).nome || '—')} / <b>${U.esc((store.get('trechos', m.trechoId) || {}).nome || '—')}</b>` },
      { key: 'descricao', label: 'Descrição', render: m => `<span class="small">${U.esc(m.descricao)}</span>` }, { key: 'fusoes', label: 'Fusões', num: true }, { key: 'pontoM', label: 'Ponto', num: true, render: m => U.m(m.pontoM, 0) }, { key: 'responsavel', label: 'Responsável' }
    ] });
  }

  /* ================= CHECKLIST ================= */
  const CHECK = {
    'Antes da medição': ['EPI e sinalização do local conferidos', 'Trecho e fibra identificados (nome do arquivo padronizado)', 'Conectores inspecionados com microscópio', 'Conectores limpos e reinspecionados', 'Bobina de lançamento conectada (e de recepção, se aplicável)', 'Fibra sem tráfego ou filtro adequado para fibra ativa', 'λ, pulso, alcance (1,5–2× L) e IOR do cabo configurados'],
    'Durante a medição': ['Traço sem ruído excessivo (tempo de média adequado)', 'Fim de fibra compatível com a distância do OZmap', 'Eventos conferidos com as caixas/CEOs do projeto', 'Medição repetida em 1550 nm quando houver suspeita de curvatura', 'Medição bidirecional quando houver ganho aparente'],
    'Depois da medição': ['Arquivo .SOR salvo e copiado', 'Teste importado no FiberControl', 'Fotos de caixas/CEOs anexadas', 'Tampas e protetores recolocados', 'Observações de campo registradas']
  };
  function renderCheck(el, params) {
    const ts = store.state.trechos;
    const sel = params.trechoId || (ts[0] || {}).id;
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Campo</span><h1>Checklist de campo</h1><p class="muted small">Verificação antes, durante e depois de cada medição. Funciona sem internet.</p></div></div>
      <section class="panel"><div class="filters">${ui.field('Trecho', `<select id="ckt">${ts.map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${U.esc((store.get('links', t.linkId) || {}).nome)} / ${U.esc(t.nome)}${store.state.checklists[t.id] && store.state.checklists[t.id].done ? ' ✓' : ''}</option>`).join('')}</select>`, '', 'wide')}</div></section><div id="ckb"></div>`;
    if (!sel) { U.$('#ckb').innerHTML = '<section class="panel"><p class="muted">Cadastre um trecho primeiro.</p></section>'; return; }
    U.$('#ckt').onchange = (e) => FC.go('checklist', { trechoId: e.target.value });
    const ck = store.state.checklists[sel] = store.state.checklists[sel] || { items: {}, done: false };
    const total = Object.values(CHECK).flat().length;
    const draw = () => {
      const n = Object.values(ck.items).filter(Boolean).length;
      U.$('#ckb').innerHTML = `<section class="panel"><header><h3>${n} de ${total} itens</h3>${ck.done ? ui.badge('verde', 'Concluído por ' + ck.by + ' em ' + U.dt(ck.at)) : ui.badge('amarelo', 'Em andamento')}</header><div class="meter"><i style="width:${n / total * 100}%"></i></div>
        <div class="grid g3">${Object.entries(CHECK).map(([fase, items]) => `<div class="panel" style="background:var(--surface-2)"><h4>${fase}</h4>${items.map((it, i) => { const k = fase + '|' + i; return `<label class="check" style="padding:6px 0"><input type="checkbox" data-k="${U.esc(k)}" ${ck.items[k] ? 'checked' : ''}> ${U.esc(it)}</label>`; }).join('')}</div>`).join('')}</div>
        <div class="btn-row"><button class="btn primary" id="ckd" ${n === total ? '' : 'disabled'}>${ui.icon('check')}Concluir checklist</button><button class="btn ghost" id="ckr">Reiniciar</button><button class="btn" id="cki">${ui.icon('upload')}Importar teste deste trecho</button></div></section>`;
      U.$$('[data-k]').forEach(c => c.onchange = () => { ck.items[c.dataset.k] = c.checked; if (!c.checked) ck.done = false; store.save(); draw(); });
      U.$('#ckd').onclick = () => { Object.assign(ck, { done: true, by: store.user().nome, at: U.now() }); store.audit('concluiu', 'checklist', sel, 'Checklist de campo ' + (store.get('trechos', sel) || {}).nome); store.save(); ui.toast('Checklist concluído e registrado.', 'ok'); draw(); };
      U.$('#ckr').onclick = () => { ck.items = {}; ck.done = false; store.save(); draw(); };
      U.$('#cki').onclick = () => FC.go('otdr', { trechoId: sel, tab: 'individual' });
    };
    draw();
  }

  /* ================= AUDITORIA ================= */
  function renderAudit(el) {
    if (!store.can('auditoria.ver')) { el.innerHTML = `<div class="note warn">${ui.icon('alert')}<div>Seu perfil não tem acesso à auditoria.</div></div>`; return; }
    const A = store.state.audit;
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Rastreabilidade</span><h1>Auditoria</h1><p class="muted small">Quem criou, editou, importou, certificou ou configurou cada informação.</p></div><div class="acts"><button class="btn" id="ax">${ui.icon('download')}Exportar XLSX</button></div></div>
      <section class="panel"><div class="filters">${ui.field('Usuário', ui.select('au', [['', 'Todos'], ...U.uniq(A.map(a => a.user))], ''))}${ui.field('Ação', ui.select('aa', [['', 'Todas'], ...U.uniq(A.map(a => a.acao))], ''))}${ui.field('Entidade', ui.select('ae', [['', 'Todas'], ...U.uniq(A.map(a => a.entidade)).map(e => [e, FC.entityLabel(e)])], ''))}${ui.field('De', ui.input('ad', '', 'type="date"'))}${ui.field('Até', ui.input('at', '', 'type="date"'))}${ui.field('Texto', ui.input('aq', '', 'type="search"'), '', 'wide')}</div></section><section class="panel" id="atb"></section>`;
    const rows = () => { const f = ui.formData(el); const q = U.norm(f.aq); return A.filter(a => (!f.au || a.user === f.au) && (!f.aa || a.acao === f.aa) && (!f.ae || a.entidade === f.ae) && (!f.ad || a.at.slice(0, 10) >= f.ad) && (!f.at || a.at.slice(0, 10) <= f.at) && (!q || U.norm(a.detalhe + ' ' + a.user).includes(q))); };
    const draw = () => ui.table(U.$('#atb'), { rows: rows(), sortKey: 'at', pageSize: 40, columns: [
      { key: 'at', label: 'Data/hora', render: a => U.dt(a.at) }, { key: 'user', label: 'Usuário', render: a => `${U.esc(a.user)}${a.role ? `<br><span class="tiny muted">${U.esc((FC.roles[a.role] || {}).label || '')}</span>` : ''}` },
      { key: 'acao', label: 'Ação', render: a => `<span class="tag">${U.esc(a.acao)}</span>` }, { key: 'entidade', label: 'Entidade', render: a => U.esc(FC.entityLabel(a.entidade)) }, { key: 'detalhe', label: 'Detalhe', render: a => `<span class="small">${U.esc(a.detalhe || '')}</span>${ui.demo(a)}` }
    ] });
    el.addEventListener('input', U.debounce(draw, 200)); el.addEventListener('change', draw); draw();
    U.$('#ax').onclick = () => FC.reports.exportRows(rows().map(a => ({ 'Data/hora': U.dt(a.at), Usuário: a.user, Perfil: (FC.roles[a.role] || {}).label || '', Ação: a.acao, Entidade: FC.entityLabel(a.entidade), Detalhe: a.detalhe })), 'auditoria', 'xlsx', 'Auditoria');
  }

  FC.registerModule({ id: 'mapa', order: 20, title: 'Mapa dos enlaces', icon: 'map', group: 'tools', field: true, render: renderMapa });
  FC.registerModule({ id: 'checklist', order: 21, title: 'Checklist de campo', icon: 'list', group: 'tools', field: true, render: renderCheck });
  FC.registerModule({ id: 'manutencao', order: 22, title: 'Manutenção', icon: 'wrench', group: 'tools', field: true, render: renderManut });
  FC.registerModule({ id: 'auditoria', order: 23, title: 'Auditoria', icon: 'audit', group: 'tools', field: false, render: renderAudit });
})(window.FC = window.FC || {});
