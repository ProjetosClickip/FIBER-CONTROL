/* Módulo 4 — Comparativo OTDR × OZmap, ranking de divergências e fator de correção */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, C = FC.calc, store = FC.store;
  let tab = 'comparativo', rankBy = 'pct';

  function render(el, params) {
    if (params.tab) tab = params.tab;
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Funcionalidade principal</span><h1>Comparativo OTDR × OZmap</h1><p class="muted small">Distância medida (fibra) × distância do traçado. Recalculado sempre que medições, distâncias ou tolerâncias mudam.</p></div>
      <div class="acts"><button class="btn orange" id="cImp">${ui.icon('otdr')}Importar teste</button><button class="btn primary" id="cBox">${ui.icon('map')}Importar diagrama de caixas</button><button class="btn" id="tolBtn">${ui.icon('gear')}Tolerâncias</button><button class="btn" id="xls">${ui.icon('download')}XLSX</button><button class="btn" id="pdf">${ui.icon('download')}PDF</button></div></div>
      <div class="tabs">${[['comparativo', 'Comparativo'], ['ranking', 'Ranking de divergências'], ['caixas', 'Diagrama de caixas'], ['fator', 'Fator de correção']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div id="ctab"></div>`;
    U.$$('[data-tab]', el).forEach(b => b.onclick = () => { tab = b.dataset.tab; FC.go('comparativo', { tab }); });
    U.$('#tolBtn').onclick = () => tolModal();
    U.$('#cImp').onclick = () => FC.importTest(null, null, { after: 'comparativo', trechoId: params.trechoId });
    U.$('#cBox').onclick = () => FC.boxes.importFlow(params.trechoId);
    const box = U.$('#ctab', el);
    ({ comparativo: () => renderCompare(box, params), ranking: () => renderRanking(box), caixas: () => FC.boxes.render(box, params), fator: () => renderFactor(box) })[tab]();
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
      <label class="check full"><input type="checkbox" name="allowPerLink" ${t.allowPerLink ? 'checked' : ''}> Permitir tolerância individual por enlace (aplicação individual)</label>
      <label class="check full"><input type="checkbox" name="useApprovedFactor" ${t.useApprovedFactor ? 'checked' : ''}> Comparar contra OZmap × fator de correção <b>aprovado</b> do tipo de trecho</label></div>
      <h4>Tolerância específica por tipo de trecho</h4><div class="table-scroll"><table class="tbl"><thead><tr><th>Tipo</th><th>Máximo (%)</th><th>Faixa de atenção (%)</th><th>Usar específica</th></tr></thead><tbody>
      ${store.state.settings.trechoTypes.map(k => { const v = t.byType[k]; return `<tr><td>${U.esc(k)}</td><td><input type="number" step="0.1" name="tmax_${k}" value="${v ? v.max : t.max}"></td><td><input type="number" step="0.1" name="tatt_${k}" value="${v ? v.attention : t.attention}"></td><td><input type="checkbox" name="tuse_${k}" ${v ? 'checked' : ''}></td></tr>`; }).join('')}</tbody></table></div>`,
      actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Salvar e recalcular', cls: 'primary', onClick: (b) => {
        const f = ui.formData(b);
        const byType = {}; store.state.settings.trechoTypes.forEach(k => { if (f['tuse_' + k]) byType[k] = { max: +f['tmax_' + k], attention: +f['tatt_' + k] }; });
        if (+f.attention > +f.max) { ui.toast('A faixa de atenção não pode ser maior que a tolerância máxima.', 'err'); return false; }
        store.setSettings('tolerance', Object.assign({}, t, { max: +f.max, attention: +f.attention, allowPerLink: f.allowPerLink, useApprovedFactor: f.useApprovedFactor, byType }), 'Tolerâncias OTDR × OZmap');
        ui.toast('Tolerâncias salvas. Resultados recalculados.', 'ok'); FC.rerender();
      } }]
    });
  }

  function renderCompare(box, params) {
    const t = store.state.settings.tolerance;
    box.innerHTML = `<section class="panel">${FC.filt.html('c')}<div class="btn-row small"><span class="badge ok">VERDE ≤ ${U.num(t.max - t.attention, 1)}%</span><span class="badge warn">AMARELO ${U.num(t.max - t.attention, 1)}–${U.num(t.max, 1)}%</span><span class="badge bad">VERMELHO &gt; ${U.num(t.max, 1)}%</span><span class="muted">Regra global${Object.keys(t.byType).length ? ' · específicas para ' + Object.keys(t.byType).join(', ') : ''}${t.useApprovedFactor ? ' · usando fatores aprovados' : ''}</span></div></section>
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

  function renderFactor(box) {
    const S = store.state.settings.correction;
    const stats = C.correctionStats();
    box.innerHTML = `<section class="panel"><header><div><h3>Fator de correção por tipo de trecho</h3><span class="sub">Média da razão OTDR ÷ OZmap das medições existentes (valores atípicos acima de 2σ descartados com 4+ amostras)</span></div></header>
      <div class="note">${ui.icon('alert')}<div>Os fatores são <b>sugestões</b>. Nada é aplicado sem aprovação de um perfil autorizado (Administrador ou Engenheiro). Após aprovar, ative “Comparar contra OZmap × fator aprovado” em Tolerâncias.</div></div>
      <div class="table-scroll"><table class="tbl"><thead><tr><th>Tipo de trecho</th><th class="num">Amostras</th><th class="num">Usadas</th><th class="num">Média</th><th class="num">Mediana</th><th class="num">Desvio</th><th class="num">Fator sugerido</th><th class="num">Sobra média</th><th>Fator aprovado</th><th></th></tr></thead><tbody>
      ${stats.map(s => { const ap = S.approved[s.tipo]; return `<tr><td><b>${U.esc(s.tipo)}</b></td><td class="num">${s.samples}</td><td class="num">${s.used}${s.outliers ? ` <span class="tiny muted">(−${s.outliers})</span>` : ''}</td><td class="num">${U.num(s.mean, 4)}</td><td class="num">${U.num(s.median, 4)}</td><td class="num">${U.num(s.sd, 4)}</td><td class="num"><b>${U.num(s.factor, 4)}</b></td><td class="num">${U.pct(s.sobraPct)}</td>
        <td>${ap ? `${ui.badge('verde', U.num(ap.factor, 4))}<br><span class="tiny muted">${U.esc(ap.by)} · ${U.date(ap.at)} · ${ap.samples} amostras</span>` : '<span class="muted small">Não aprovado</span>'}</td>
        <td><div class="btn-row" style="flex-wrap:nowrap">${s.samples < 3 ? '<span class="tiny muted">mín. 3 amostras</span>' : `<button class="btn sm primary" data-ap="${U.esc(s.tipo)}">Aprovar</button>`}${ap ? `<button class="btn sm ghost" data-rv="${U.esc(s.tipo)}">Revogar</button>` : ''}</div></td></tr>`; }).join('') || '<tr><td colspan="10" class="empty">Sem trechos com medição e OZmap para calcular.</td></tr>'}
      </tbody></table></div></section>
      <section class="grid g2"><div class="panel"><header><h3>Aplicação ao traçado</h3><span class="sub">OZmap × fator → distância estimada corrigida</span></header><div id="fapp"></div></div>
      <div class="panel"><header><h3>Estimativa de comprimento físico</h3><span class="sub">Decomposição dos elementos de campo</span></header>
      <form class="form-grid" id="ef">${ui.field('Distância OZmap (m)', ui.input('ozmapM', 1000, 'type="number" step="any"'))}${ui.field('Reservas técnicas (qtd)', ui.input('reservas', 2, 'type="number" min="0"'))}${ui.field('Metros por reserva', ui.input('reservaM', S.reserveM, 'type="number" step="any"'))}${ui.field('Subidas/descidas (qtd)', ui.input('subidas', 4, 'type="number" min="0"'))}${ui.field('Metros por subida/descida', ui.input('subidaM', S.riseM, 'type="number" step="any"'))}${ui.field('Curvas e sobras (%)', ui.input('curvasPct', S.curvePct, 'type="number" step="any"'))}${ui.field('Desvios de infraestrutura (%)', ui.input('desvioPct', S.detourPct, 'type="number" step="any"'))}${ui.field('Excesso de fibra no cabo — EFL (%)', ui.input('eflPct', S.efl, 'type="number" step="any"'), 'Fibra é mais longa que o cabo (construção em hélice)')}</form><div id="eout"></div></div></section>`;
    // aplicação por trecho
    const rows = store.state.trechos.filter(t => t.ozmapM).map(t => { const s = stats.find(x => x.tipo === (t.tipo || 'Sem tipo')); const ap = S.approved[t.tipo]; const f = ap ? ap.factor : s ? s.factor : null; return { t, l: store.get('links', t.linkId), f, ap: !!ap, n: s ? s.used : 0, sobra: s ? s.sobraPct : null, m: C.otdrNet(C.latest(t.id)) }; });
    ui.table(U.$('#fapp', box), { rows, pageSize: 8, sortKey: 'oz', columns: [
      { key: 'tr', label: 'Trecho', sort: r => r.l.nome, render: r => `${U.esc(r.l.nome)} / <b>${U.esc(r.t.nome)}</b>` },
      { key: 'oz', label: 'OZmap', num: true, sort: r => r.t.ozmapM, render: r => U.m(r.t.ozmapM, 0) },
      { key: 'est', label: 'Corrigida', num: true, sort: r => r.f ? r.t.ozmapM * r.f : null, render: r => r.f ? U.m(r.t.ozmapM * r.f, 0) : '—' },
      { key: 'f', label: 'Fator', num: true, render: r => r.f ? `${U.num(r.f, 4)} ${r.ap ? ui.badge('verde', 'aprovado') : ui.badge('sem-dados', 'sugerido')}` : '—' },
      { key: 'sobra', label: 'Sobra média', num: true, render: r => U.pct(r.sobra) }, { key: 'n', label: 'Amostras', num: true },
      { key: 'm', label: 'OTDR', num: true, render: r => U.m(r.m, 0) }
    ] });
    U.$$('[data-ap]', box).forEach(b => b.onclick = async () => {
      if (!store.require('fator.aprovar')) return;
      const s = stats.find(x => x.tipo === b.dataset.ap);
      if (!(await ui.confirm('Aprovar fator de correção', `Aprovar o fator ${U.num(s.factor, 4)} (sobra ${U.pct(s.sobraPct)}) para trechos do tipo ${s.tipo}, com base em ${s.used} amostras?`, 'Aprovar'))) return;
      const ap = Object.assign({}, S.approved, { [s.tipo]: { factor: +s.factor.toFixed(5), by: store.user().nome, at: U.now(), samples: s.used } });
      store.setSettings('correction.approved', ap, `Fator de correção aprovado (${s.tipo})`); ui.toast('Fator aprovado e registrado na auditoria.', 'ok'); FC.rerender();
    });
    U.$$('[data-rv]', box).forEach(b => b.onclick = () => { if (!store.require('fator.aprovar')) return; const ap = Object.assign({}, S.approved); delete ap[b.dataset.rv]; store.setSettings('correction.approved', ap, `Fator revogado (${b.dataset.rv})`); FC.rerender(); });
    const ef = U.$('#ef', box);
    const est = () => {
      const v = ui.formData(ef); Object.keys(v).forEach(k => v[k] = U.parseNum(v[k]) || 0);
      const r = C.estimatePhysical(v);
      U.$('#eout', box).innerHTML = r ? `<div class="table-scroll"><table class="tbl"><tbody>
        <tr><td>Traçado OZmap</td><td class="num">${U.m(r.base, 1)}</td></tr><tr><td>+ Curvas e sobras</td><td class="num">${U.m(r.curvas, 1)}</td></tr><tr><td>+ Desvios de infraestrutura</td><td class="num">${U.m(r.desvios, 1)}</td></tr><tr><td>+ Reservas técnicas</td><td class="num">${U.m(r.reservas, 1)}</td></tr><tr><td>+ Subidas e descidas</td><td class="num">${U.m(r.subidas, 1)}</td></tr>
        <tr><td><b>Comprimento de cabo estimado</b></td><td class="num"><b>${U.m(r.cable, 1)}</b></td></tr><tr><td>+ Excesso de fibra (EFL)</td><td class="num">${U.m(r.efl, 1)}</td></tr><tr><td><b>Comprimento de fibra esperado no OTDR</b></td><td class="num"><b>${U.m(r.fiber, 1)}</b></td></tr><tr><td>Fator equivalente</td><td class="num"><b>${U.num(r.factor, 4)}</b> (${U.pct((r.factor - 1) * 100)})</td></tr></tbody></table></div>` : '';
    };
    ef.addEventListener('input', est); est();
  }

  FC.registerModule({ id: 'comparativo', order: 4, title: 'Comparativo OTDR × OZmap', icon: 'compare', group: 'main', field: false, render });
})(window.FC = window.FC || {});
