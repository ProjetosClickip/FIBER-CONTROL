/* Módulo 8 — Histórico de medições (registro permanente e comparação) */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, C = FC.calc, store = FC.store;

  function render(el, params) {
    const ts = store.state.trechos.filter(t => C.measurementsOf(t.id).length);
    const sel = params.trechoId || (ts.find(t => C.measurementsOf(t.id).length > 1) || ts[0] || {}).id || '';
    const alerts = [];
    store.state.trechos.forEach(t => { const ms = C.measurementsOf(t.id); for (let i = 1; i < ms.length; i++) { const d = C.diffMeasurements(ms[i - 1], ms[i]); if (d.piora) alerts.push({ t, a: ms[i - 1], b: ms[i], d }); } });
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Rastreabilidade</span><h1>Histórico de medições</h1><p class="muted small">Cada importação gera um novo registro; nenhuma medição anterior é apagada.</p></div><div class="acts"><button class="btn" id="hx">${ui.icon('download')}Exportar histórico</button></div></div>
      ${alerts.length ? `<section class="panel"><header><h3>Alertas de piora na perda óptica</h3><span class="sub">Aumento ≥ ${store.state.settings.history.lossWorsenDb} dB entre medições consecutivas</span></header>${alerts.map(x => `<div class="note bad">${ui.icon('alert')}<div><b>${U.esc((store.get('links', x.t.linkId) || {}).nome)} / ${U.esc(x.t.nome)}</b>: perda ${U.db(x.a.totalLoss)} → ${U.db(x.b.totalLoss)} (${'+' + U.db(x.d.dLoss)}) em ${U.date(x.b.data)} · ${x.d.novos.length} evento(s) novo(s) <button class="btn sm" data-ht="${x.t.id}">Comparar</button></div></div>`).join('')}</section>` : ''}
      <section class="panel"><div class="filters">${ui.field('Trecho', `<select id="ht">${ts.map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${U.esc((store.get('links', t.linkId) || {}).nome)} / ${U.esc(t.nome)} (${C.measurementsOf(t.id).length})</option>`).join('')}</select>`, '', 'wide')}</div></section>
      <div id="hbody"></div>`;
    U.$$('[data-ht]', el).forEach(b => b.onclick = () => FC.go('historico', { trechoId: b.dataset.ht }));
    U.$('#hx').onclick = () => FC.reports.exportRows(store.state.measurements.map(m => ({ Data: U.dt(m.data), Enlace: (store.get('links', m.linkId) || {}).nome, Trecho: (store.get('trechos', m.trechoId) || {}).nome, Arquivo: m.fileName, Origem: m.source, 'λ (nm)': m.wavelength, 'Distância (m)': C.otdrNet(m), 'Perda (dB)': m.totalLoss, ORL: m.orl, Eventos: (m.events || []).length, Responsável: m.responsavel })), 'historico-medicoes', 'xlsx', 'Histórico de medições');
    const s = U.$('#ht'); if (!s) { U.$('#hbody').innerHTML = '<section class="panel"><p class="muted">Ainda não há medições registradas.</p></section>'; return; }
    s.onchange = () => FC.go('historico', { trechoId: s.value });
    if (sel) draw(U.$('#hbody'), store.get('trechos', sel));
  }

  function draw(box, t) {
    const ms = C.measurementsOf(t.id), l = store.get('links', t.linkId);
    const mans = store.state.maintenance.filter(x => x.trechoId === t.id).sort((a, b) => b.data.localeCompare(a.data));
    const opts = ms.map((m, i) => [m.id, `#${i + 1} · ${U.dt(m.data)} · ${m.wavelength || '?'} nm · ${m.fileName || m.source}`]);
    box.innerHTML = `<section class="grid g2">
      <div class="panel"><header><h3>Linha do tempo — ${U.esc(l.nome)} / ${U.esc(t.nome)}</h3></header><div class="chart-box"><canvas id="hc"></canvas></div></div>
      <div class="panel"><header><h3>Medições e manutenções</h3><button class="btn sm" id="nm">${ui.icon('wrench')}Registrar manutenção</button></header>
        <ul class="activity">${[...ms.map(m => ({ d: m.data, h: `${ui.icon('otdr')} <b>Medição</b> ${U.esc(m.fileName || m.source)} · ${U.km(C.otdrNet(m))} · ${U.db(m.totalLoss)}${ui.demo(m)}<br><span class="tiny muted">${U.dt(m.data)} · ${U.esc(m.responsavel || '')}</span>` })), ...mans.map(x => ({ d: x.data, h: `${ui.icon('wrench')} <b>${U.esc(x.tipo)}</b> ${U.esc(x.descricao)}${x.fusoes ? ' · ' + x.fusoes + ' fusões' : ''}<br><span class="tiny muted">${U.dt(x.data)} · ${U.esc(x.responsavel || '')}</span>` }))].sort((a, b) => b.d.localeCompare(a.d)).map(x => `<li style="grid-template-columns:1fr">${x.h}</li>`).join('')}</ul></div></section>
      ${ms.length > 1 ? `<section class="panel"><header><h3>Comparar medições</h3></header><div class="filters">${ui.field('Medição anterior', ui.select('ha', opts, ms[ms.length - 2].id), '', 'wide')}${ui.field('Medição atual', ui.select('hb', opts, ms[ms.length - 1].id), '', 'wide')}</div><div id="hcmp"></div></section>` : `<section class="panel"><p class="muted">Há apenas uma medição deste trecho. Ao importar uma nova, a comparação aparece aqui.</p></section>`}`;
    U.$('#nm', box).onclick = () => FC.go('manutencao', { novo: true, trechoId: t.id });
    const p = ui.palette();
    ui.chart(U.$('#hc', box), { type: 'line', data: { labels: ms.map(m => U.date(m.data)), datasets: [{ label: 'Perda total (dB)', data: ms.map(m => m.totalLoss), borderColor: p.orange, backgroundColor: p.orange, yAxisID: 'y', tension: .2 }, { label: 'Distância (km)', data: ms.map(m => C.otdrNet(m) != null ? +(C.otdrNet(m) / 1000).toFixed(4) : null), borderColor: p.teal, backgroundColor: p.teal, yAxisID: 'y1', tension: .2 }] }, options: { scales: { y: { position: 'left', title: { display: true, text: 'dB' } }, y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'km' } } } } });
    if (ms.length > 1) {
      const cmp = () => {
        const a = store.get('measurements', U.$('#ha', box).value), b = store.get('measurements', U.$('#hb', box).value);
        const d = C.diffMeasurements(a, b);
        const man = store.state.maintenance.filter(x => x.trechoId === t.id && x.data >= (a.data || '') && x.data <= (b.data || '9'));
        U.$('#hcmp', box).innerHTML = `<div class="table-scroll"><table class="tbl"><thead><tr><th></th><th>Medição anterior</th><th>Medição atual</th><th class="num">Alteração</th></tr></thead><tbody>
          <tr><td>Data</td><td>${U.dt(a.data)}</td><td>${U.dt(b.data)}</td><td></td></tr>
          <tr><td>Responsável</td><td>${U.esc(a.responsavel)}</td><td>${U.esc(b.responsavel)}</td><td></td></tr>
          <tr><td>Comprimento de onda</td><td>${a.wavelength || '—'} nm</td><td>${b.wavelength || '—'} nm</td><td class="num">${d.sameWl ? '' : '<span class="warn-text">diferente</span>'}</td></tr>
          <tr><td>Distância</td><td class="num">${U.m(C.otdrNet(a), 1)}</td><td class="num">${U.m(C.otdrNet(b), 1)}</td><td class="num">${d.dDist != null ? (d.dDist > 0 ? '+' : '') + U.m(d.dDist, 1) : '—'}</td></tr>
          <tr class="${d.piora ? 'row-bad' : ''}"><td>Perda total</td><td class="num">${U.db(a.totalLoss, 3)}</td><td class="num">${U.db(b.totalLoss, 3)}</td><td class="num"><b class="${d.piora ? 'bad-text' : ''}">${d.dLoss != null ? (d.dLoss > 0 ? '+' : '') + U.db(d.dLoss, 3) : '—'}</b></td></tr>
          <tr><td>Eventos</td><td class="num">${(a.events || []).length}</td><td class="num">${(b.events || []).length}</td><td class="num">${(b.events || []).length - (a.events || []).length}</td></tr>
          <tr><td>Manutenções no período</td><td colspan="3">${man.length ? man.map(x => `${U.date(x.data)} — ${U.esc(x.tipo)}: ${U.esc(x.descricao)} (${U.esc(x.responsavel)})`).join('<br>') : '—'}</td></tr></tbody></table></div>
          ${d.piora ? `<div class="note bad">${ui.icon('alert')}<div><b>Piora significativa</b> de ${U.db(d.dLoss)} (limite ${store.state.settings.history.lossWorsenDb} dB).</div></div>` : ''}
          <div class="grid g3"><div><h4>Eventos novos (${d.novos.length})</h4>${evList(d.novos)}</div><div><h4>Eventos que desapareceram (${d.sumidos.length})</h4>${evList(d.sumidos)}</div><div><h4>Eventos com perda alterada (${d.alterados.length})</h4>${d.alterados.length ? `<ul class="list-plain small">${d.alterados.map(x => `<li>${U.km(x.e.distM, 3)}: ${U.db(x.p.loss, 3)} → ${U.db(x.e.loss, 3)} (${x.d > 0 ? '+' : ''}${U.num(x.d, 3)})</li>`).join('')}</ul>` : '<p class="muted small">Nenhum</p>'}</div></div>
          <p class="tiny muted">Eventos são considerados o mesmo quando estão a até ${store.state.settings.history.eventMatchM} m de distância (configurável).</p>`;
      };
      U.$('#ha', box).onchange = cmp; U.$('#hb', box).onchange = cmp; cmp();
    }
  }
  const evList = (l) => l.length ? `<ul class="list-plain small">${l.map(e => `<li>${U.km(e.distM, 3)} · ${U.db(e.loss, 3)} · ${U.esc(e.kind || '')}</li>`).join('')}</ul>` : '<p class="muted small">Nenhum</p>';

  FC.registerModule({ id: 'historico', order: 8, title: 'Histórico de Medições', icon: 'history', group: 'main', field: false, render });
})(window.FC = window.FC || {});
