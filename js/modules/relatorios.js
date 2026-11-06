/* Módulo 9 — Relatórios automáticos */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, store = FC.store, R = FC.reports;
  const sel = { tipo: 'individual', linkId: '', projeto: '' };

  function render(el, params) {
    Object.assign(sel, params.tipo ? { tipo: params.tipo } : {}, params.linkId ? { linkId: params.linkId } : {});
    const links = store.state.links, projs = U.uniq(links.map(l => l.projeto));
    if (!sel.linkId && links[0]) sel.linkId = links[0].id;
    if (!sel.projeto && projs[0]) sel.projeto = projs[0];
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Documentação</span><h1>Relatórios</h1><p class="muted small">PDF com a logo ClickIP e planilhas XLSX geradas a partir dos dados atuais.</p></div></div>
      <section class="grid g-auto">${Object.entries(R.templates).map(([k, v]) => `<button class="kpi" data-t="${k}" style="text-align:left;${sel.tipo === k ? 'border-color:var(--teal);box-shadow:inset 0 -3px 0 var(--teal)' : ''}"><span class="l">Modelo</span><b>${U.esc(v.label)}</b><span class="s">${{ individual: 'Um enlace e todos os seus trechos', projeto: 'Todos os enlaces de um projeto', divergencias: 'Trechos amarelos/vermelhos e acima do orçamento', certificacao: 'Status, aprovador e hash das assinaturas', capacidade: 'Coluna de fibras restantes e alertas' }[k]}</span></button>`).join('')}</section>
      <section class="panel"><div class="filters">
        ${R.templates[sel.tipo].needsLink ? ui.field('Enlace', ui.select('rl', links.map(l => [l.id, l.nome]), sel.linkId), '', 'wide') : ''}
        ${R.templates[sel.tipo].needsProject || ['divergencias', 'certificacao', 'capacidade'].includes(sel.tipo) ? ui.field('Projeto', ui.select('rp', [...(R.templates[sel.tipo].needsProject ? [] : [['', 'Todos']]), ...projs], R.templates[sel.tipo].needsProject ? sel.projeto : (params.projeto || '')), '', 'wide') : ''}
        <div class="btn-row"><button class="btn primary" id="gp">${ui.icon('download')}Gerar PDF</button><button class="btn" id="gx">${ui.icon('download')}Gerar XLSX</button><button class="btn" id="gd">${ui.icon('drive')}Enviar ao Drive</button></div></div></section>
      <section class="panel"><header><h3>Prévia — ${U.esc(R.templates[sel.tipo].label)}</h3><span class="sub" id="pc"></span></header><div id="pv"></div></section>`;
    U.$$('[data-t]', el).forEach(b => b.onclick = () => { sel.tipo = b.dataset.t; FC.go('relatorios', {}); });
    const opts = () => ({ linkId: (U.$('#rl') || {}).value || sel.linkId, projeto: (U.$('#rp') || {}).value || (R.templates[sel.tipo].needsProject ? sel.projeto : '') });
    const preview = () => {
      const o = opts(); sel.linkId = o.linkId; if (U.$('#rp')) sel.projeto = U.$('#rp').value || sel.projeto;
      const rows = R.rowsFor(sel.tipo, o);
      U.$('#pc').textContent = rows.length + ' trecho(s)';
      const cols = sel.tipo === 'capacidade' ? ['Enlace', 'Trecho', 'Fibras (cabo/livres)', 'Situação das fibras'] : sel.tipo === 'certificacao' ? ['Enlace', 'Trecho', 'Comparativo', 'Certificação', 'Data da medição', 'Responsável técnico', 'Aprovador'] : ['Enlace', 'Trecho', 'POP A → POP B', 'OZmap (m)', 'OTDR (m)', 'Diferença (m)', 'Diferença (%)', 'Perda prevista (dB)', 'Perda medida (dB)', 'Emendas', 'Conectores', 'Situação das fibras', 'Certificação', 'Data da medição', 'Responsável técnico'];
      U.$('#pv').innerHTML = `<div class="table-scroll"><table class="tbl"><thead><tr>${cols.map(c => `<th>${U.esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 60).map(r => `<tr>${cols.map(c => `<td class="${typeof r[c] === 'number' ? 'num' : ''}">${U.esc(r[c] === '' || r[c] == null ? '—' : r[c])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="empty">Sem registros para este modelo.</td></tr>`}</tbody></table></div>${rows.length > 60 ? '<p class="small muted">Prévia limitada a 60 linhas; o arquivo contém todas.</p>' : ''}`;
    };
    ['#rl', '#rp'].forEach(s => { const e = U.$(s); e && (e.onchange = preview); });
    preview();
    U.$('#gp').onclick = () => store.require('relatorio.gerar') && R.generate(sel.tipo, 'pdf', opts());
    U.$('#gx').onclick = () => store.require('relatorio.gerar') && R.generate(sel.tipo, 'xlsx', opts());
    U.$('#gd').onclick = async () => {
      if (!store.require('drive.usar')) return;
      const blob = await R.generate(sel.tipo, 'pdf', Object.assign(opts(), { returnBlob: true }));
      if (blob) FC.drive.upload(blob, `${sel.tipo}-${U.now().slice(0, 10)}.pdf`, opts());
    };
  }
  FC.registerModule({ id: 'relatorios', order: 9, title: 'Relatórios', icon: 'report', group: 'main', field: false, render });
})(window.FC = window.FC || {});
