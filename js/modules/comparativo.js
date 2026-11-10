/* Módulo 4 — Comparativo OTDR × OZmap, ranking de divergências e diagrama de caixas */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, C = FC.calc, store = FC.store;
  let tab = 'comparativo', rankBy = 'pct';

  function render(el, params) {
    if (params.tab) tab = params.tab;
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Funcionalidade principal</span><h1>Comparativo OTDR × OZmap</h1><p class="muted small">Distância medida (fibra) × distância do traçado. Recalculado sempre que medições, distâncias ou tolerâncias mudam.</p></div>
      <div class="acts"><button class="btn orange" id="cImp">${ui.icon('otdr')}Importar teste</button><button class="btn primary" id="cBox">${ui.icon('map')}Importar diagrama de caixas</button><button class="btn" id="tolBtn">${ui.icon('gear')}Tolerâncias</button><button class="btn" id="xls">${ui.icon('download')}XLSX</button><button class="btn" id="pdf">${ui.icon('download')}PDF</button></div></div>
      <div class="tabs">${[['comparativo', 'Comparativo'], ['ranking', 'Ranking de divergências'], ['caixas', 'Diagrama de caixas']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div id="ctab"></div>`;
    U.$$('[data-tab]', el).forEach(b => b.onclick = () => { tab = b.dataset.tab; FC.go('comparativo', { tab }); });
    U.$('#tolBtn').onclick = () => tolModal();
    U.$('#cImp').onclick = () => FC.importTest(null, null, { after: 'comparativo', trechoId: params.trechoId });
    U.$('#cBox').onclick = () => FC.boxes.importFlow(params.trechoId);
    const box = U.$('#ctab', el);
    ({ comparativo: () => renderCompare(box, params), ranking: () => renderRanking(box), caixas: () => FC.boxes.render(box, params) })[tab]();
    U.$('#xls').onclick = () => FC.reports.exportRows(rowsFor(FC.filt.trechos()), 'comparativo-otdr-ozmap', 'xlsx', 'Comparativo OTDR × OZmap');
    U.$('#pdf').onclick = () => FC.reports.exportRows(rowsFor(FC.filt.trechos()), 'comparativo-otdr-ozmap', 'pdf', 'Comparativo OTDR × OZmap');
  }
  const rowsFor = (ts) => ts.map(t => { const c = C.compare(t), l = store.get('links', t.linkId); return { Enlace: l.nome, Trecho: t.nome, Tipo: t.tipo, OTDR: c.otdr != null ? +c.otdr.toFixed(1) : '', OZmap: c.ozmap != null ? +c.ozmap.toFixed(1) : '', 'Diferença (m)': c.diffM != null ? +c.diffM.toFixed(1) : '', 'Diferença (%)': c.diffPct != null ? +c.diffPct.toFixed(2) : '', Perda: c.m && c.m.totalLoss != null ? c.m.totalLoss : '', Tolerância: c.tol.max + '% (' + c.tol.source + ')', Status: { verde: 'VERDE', amarelo: 'AMARELO', vermelho: 'VERMELHO', 'sem-dados': 'SEM DADOS' }[c.status] }; });

  function tolModal() {
    if (!store.require('config.tecnica')) return;
    const t = store.state.settings.tolerance;
    ui.modal({
      title: 'Tolerâncias OTDR × OZmap', wide: true,
      body: `<p class="small muted">VERDE: |diferença| ≤ máximo − faixa de atenção · AMARELO: até o máximo · VERMELHO: acima do máximo.</p>
      <div class="form-grid" id="tf">${ui.field('Tolerância máxima global (%)', ui.input('max', t.max, 'type="number" step="0.1" min="0"'))}${ui.field('Faixa de atenção (%)', ui.input('attention', t.attention, 'type="number" step="0.1" min="0"'))}
      <label class="check full"><input type="checkbox" name="allowPerLink" ${t.allowPerLink ? 'checked' : ''}> Permitir tolerância individual por enlace (aplicação individual)</label></div>
      <h4>Tolerância específica por tipo de trecho</h4><div class="table-scroll"><table class="tbl"><thead><tr><th>Tipo</th><th>Máximo (%)</th><th>Faixa de atenção (%)</th><th>Usar específica</th></tr></thead><tbody>
      ${store.state.settings.trechoTypes.map(k => { const v = t.byType[k]; return `<tr><td>${U.esc(k)}</td><td><input type="number" step="0.1" name="tmax_${k}" value="${v ? v.max : t.max}"></td><td><input type="number" step="0.1" name="tatt_${k}" value="${v ? v.attention : t.attention}"></td><td><input type="checkbox" name="tuse_${k}" ${v ? 'checked' : ''}></td></tr>`; }).join('')}</tbody></table></div>`,
      actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Salvar e recalcular', cls: 'primary', onClick: (b) => {
        const f = ui.formData(b);
        const byType = {}; store.state.settings.trechoTypes.forEach(k => { if (f['tuse_' + k]) byType[k] = { max: +f['tmax_' + k], attention: +f['tatt_' + k] }; });
        if (+f.attention > +f.max) { ui.toast('A faixa de atenção não pode ser maior que a tolerância máxima.', 'err'); return false; }
        store.setSettings('tolerance', Object.assign({}, t, { max: +f.max, attention: +f.attention, allowPerLink: f.allowPerLink, byType }), 'Tolerâncias OTDR × OZmap');
        ui.toast('Tolerâncias salvas. Resultados recalculados.', 'ok'); FC.rerender();
      } }]
    });
  }

  function renderCompare(box, params) {
    const t = store.state.settings.tolerance;
    box.innerHTML = `<section class="panel">${FC.filt.html('c')}<div class="btn-row small"><span class="badge ok">VERDE ≤ ${U.num(t.max - t.attention, 1)}%</span><span class="badge warn">AMARELO ${U.num(t.max - t.attention, 1)}–${U.num(t.max, 1)}%</span><span class="badge bad">VERMELHO &gt; ${U.num(t.max, 1)}%</span><span class="muted">Regra global${Object.keys(t.byType).length ? ' · específicas para ' + Object.keys(t.byType).join(', ') : ''}</span></div></section>
      <section class="kpis" id="ck"></section><section class="panel" id="ct"></section>`;
    FC.filt.bind(box, 'c', (r) => r ? FC.rerender() : draw());
    const draw = () => {
      const ts = FC.filt.trechos(); const cs = ts.map(t => ({ t, c: C.compare(t), l: store.get('links', t.linkId) }));
      const n = (s) => cs.filter(x => x.c.status === s).length;
      const valid = cs.filter(x => x.c.diffPct != null);
      U.$('#ck').innerHTML = `<div class="kpi ok"><span class="l">Verde</span><span class="v">${n('verde')}</span></div><div class="kpi warn"><span class="l">Amarelo</span><span class="v">${n('amarelo')}</span></div><div class="kpi bad"><span class="l">Vermelho</span><span class="v">${n('vermelho')}</span></div><div class="kpi"><span class="l">Sem dados</span><span class="v">${n('sem-dados')}</span><span class="s">sem medição ou sem OZmap</span></div><div class="kpi accent"><span class="l">Diferença média</span><span class="v">${valid.length ? U.pct(U.avg(valid.map(x => x.c.diffPct)), 2) : '—'}</span><span class="s">${valid.length} trechos</span></div>`;
      ui.table(U.$('#ct'), {
        rows: cs, sortKey: 'pct', onRow: r => FC.go('otdr', { trechoId: r.t.id }), rowClass: r => r.c.status === 'vermelho' ? 'row-bad' : r.c.status === 'amarelo' ? 'row-warn' : r.c.status === 'verde' ? 'row-ok' : '',
        columns: [
          { key: 'enl', label: 'Enlace', sort: r => r.l.nome, render: r => U.esc(r.l.nome) + ui.demo(r.t) },
          { key: 'tr', label: 'Trecho', sort: r => r.t.nome, render: r => `<b>${U.esc(r.t.nome)}</b> <span class="tag">${U.esc(r.t.tipo || '')}</span>` },
          { key: 'otdr', label: 'Distância OTDR', num: true, sort: r => r.c.otdr, render: r => U.m(r.c.otdr, 1) },
          { key: 'oz', label: 'Distância OZmap', num: true, sort: r => r.c.ozmap, render: r => `<input type="number" step="0.1" class="ozin" data-t="${r.t.id}" value="${r.t.ozmapM == null ? '' : r.t.ozmapM}" style="width:110px;text-align:right" aria-label="Distância OZmap" ${store.can('enlace.editar') ? '' : 'disabled'}>${r.c.factor !== 1 ? `<br><span class="tiny muted">× ${U.num(r.c.factor, 3)} = ${U.m(r.c.base, 0)}</span>` : ''}` },
          { key: 'dm', label: 'Diferença (m)', num: true, sort: r => r.c.diffM, render: r => U.m(r.c.diffM, 1) },
          { key: 'pct', label: 'Diferença (%)', num: true, sort: r => r.c.diffPct == null ? null : Math.abs(r.c.diffPct), render: r => `<b>${U.pct(r.c.diffPct)}</b>` },
          { key: 'tol', label: 'Tolerância', sort: r => r.c.tol.max, render: r => `<span class="small">${r.c.tol.max}% · ${U.esc(r.c.tol.source)}</span>` },
          { key: 'st', label: 'Classificação', sort: r => ['verde', 'amarelo', 'vermelho', 'sem-dados'].indexOf(r.c.status), render: r => ui.badge(r.c.status, { verde: 'VERDE', amarelo: 'AMARELO', vermelho: 'VERMELHO', 'sem-dados': 'Sem dados' }[r.c.status]) }
        ]
      });
      U.$$('.ozin', box).forEach(i => i.onchange = () => {
        const t = store.get('trechos', i.dataset.t); const old = t.ozmapM; const v = i.value === '' ? null : U.parseNum(i.value);
        FC.snapshotLink(store.get('links', t.linkId), `Distância OZmap de ${t.nome}: ${old} → ${v} m (edição no comparativo)`);
        t.ozmapM = v; store.upsert('trechos', t, `OZmap de ${t.nome}: ${old} → ${v} m`); ui.toast('Distância atualizada e comparativo recalculado.', 'ok'); draw();
      });
      U.$$('.ozin', box).forEach(i => i.onclick = (e) => e.stopPropagation());
    };
    draw();
    if (params.trechoId) setTimeout(() => { const i = U.$(`.ozin[data-t="${params.trechoId}"]`); if (i) { i.closest('tr').style.outline = '2px solid var(--orange)'; i.scrollIntoView({ block: 'center' }); } }, 50);
  }

  function renderRanking(box) {
    const team = store.state.users.filter(u => u.ativo && ['admin', 'engenheiro', 'supervisor'].includes(u.role));
    const draw = () => {
      const cs = store.state.trechos.map(t => ({ t, c: C.compare(t), l: store.get('links', t.linkId) })).filter(x => x.c.diffM != null);
      cs.sort((a, b) => rankBy === 'pct' ? Math.abs(b.c.diffPct) - Math.abs(a.c.diffPct) : Math.abs(b.c.diffM) - Math.abs(a.c.diffM));
      const top = cs.slice(0, 10);
      box.innerHTML = `<section class="panel"><header><div><h3>Top 10 — maior divergência OTDR × OZmap</h3><span class="sub">${cs.length} trechos comparáveis</span></div><div class="seg" role="group" aria-label="Ordenar por"><button class="${rankBy === 'm' ? 'on' : ''}" data-r="m">Maior diferença (m)</button><button class="${rankBy === 'pct' ? 'on' : ''}" data-r="pct">Maior diferença (%)</button></div></header>
        <div class="chart-box short"><canvas id="rk"></canvas></div>
        <div class="table-scroll"><table class="tbl"><thead><tr><th class="num">Pos.</th><th>Enlace</th><th>Trecho</th><th class="num">OTDR</th><th class="num">OZmap</th><th class="num">Diferença (m)</th><th class="num">Diferença (%)</th><th>Situação</th><th>Responsável pela revisão</th></tr></thead><tbody>
        ${top.map((x, i) => `<tr class="${x.c.status === 'vermelho' ? 'row-bad' : x.c.status === 'amarelo' ? 'row-warn' : ''}"><td class="num"><b>${i + 1}º</b></td><td>${U.esc(x.l.nome)}</td><td>${U.esc(x.t.nome)}</td><td class="num">${U.m(x.c.otdr, 1)}</td><td class="num">${U.m(x.c.ozmap, 0)}</td><td class="num">${U.m(x.c.diffM, 1)}</td><td class="num"><b>${U.pct(x.c.diffPct)}</b></td><td>${ui.badge(x.c.status)}</td>
          <td><select data-rev="${x.t.id}" aria-label="Responsável pela revisão" ${store.can('certificacao.aprovar') ? '' : 'disabled'}><option value="">— definir —</option>${team.map(u => `<option ${x.t.revisor === u.nome ? 'selected' : ''}>${U.esc(u.nome)}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="9" class="empty">Nenhum trecho com medição e OZmap.</td></tr>'}
        </tbody></table></div></section>`;
      U.$$('[data-r]', box).forEach(b => b.onclick = () => { rankBy = b.dataset.r; draw(); });
      U.$$('[data-rev]', box).forEach(s => s.onchange = () => { const t = store.get('trechos', s.dataset.rev); t.revisor = s.value; store.upsert('trechos', t, `Revisor da divergência de ${t.nome}: ${s.value || '—'}`); ui.toast('Responsável pela revisão definido.', 'ok'); });
      const p = ui.palette();
      ui.chart(U.$('#rk', box), { type: 'bar', data: { labels: top.map((x, i) => `${i + 1}º ${x.t.nome}`), datasets: [{ label: rankBy === 'pct' ? 'Diferença (%)' : 'Diferença (m)', data: top.map(x => rankBy === 'pct' ? +x.c.diffPct.toFixed(2) : +x.c.diffM.toFixed(1)), backgroundColor: top.map(x => x.c.status === 'vermelho' ? p.bad : x.c.status === 'amarelo' ? p.warn : p.ok), borderRadius: 4 }] }, options: { plugins: { legend: { display: false } } } });
    };
    draw();
  }

  FC.registerModule({ id: 'comparativo', order: 4, title: 'Comparativo OTDR × OZmap', icon: 'compare', group: 'main', field: false, render });
})(window.FC = window.FC || {});
