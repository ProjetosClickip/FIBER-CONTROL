/* Módulo 9 — Relatórios automáticos */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, store = FC.store, R = FC.reports;
  const sel = { tipo: 'individual', linkId: '', projeto: '' };
  // informações editáveis do relatório (lembradas neste aparelho) e edições de células da prévia
  const META_KEY = 'fc-relatorio-meta';
  const metaLoad = () => { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; } };
  const metaSave = (m) => { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { /* sem armazenamento: segue */ } };
  let edits = {};
  const EDITAVEIS = ['Enlace', 'Trecho', 'POP A → POP B', 'Tipo', 'Emendas', 'Conectores', 'Certificação', 'Data da medição', 'Responsável técnico', 'Aprovador', 'Observações', 'Situação das fibras', 'Fibras (cabo/livres)'];

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
        <div class="btn-row"><button class="btn primary" id="gp">${ui.icon('download')}Gerar PDF</button><button class="btn" id="gx">${ui.icon('download')}Gerar XLSX</button></div></div></section>
      <section class="panel"><header><div><h3>Informações do relatório</h3><span class="sub">Editáveis: valem só para o documento gerado (o cadastro não muda)</span></div></header>
        <form class="form-grid" id="rmeta">
          ${ui.field('Título', ui.input('titulo', '', `placeholder="${U.esc(R.templates[sel.tipo].label)}" maxlength="120"`))}
          ${ui.field('Subtítulo', ui.input('subtitulo', '', 'placeholder="Projeto ou enlace" maxlength="140"'))}
          ${ui.field('Cliente / destinatário', ui.input('cliente', '', 'maxlength="120"'))}
          ${ui.field('Responsável técnico', ui.input('responsavel', '', `placeholder="${U.esc((store.user() || {}).nome || '')}" maxlength="80"`))}
          ${ui.field('OS / referência', ui.input('os', '', 'maxlength="60"'))}
          ${ui.field('Data do relatório', ui.input('data', '', 'type="date"'))}
          ${ui.field('Observações / conclusão', '<textarea name="conclusao" maxlength="3000" rows="3"></textarea>', '', 'full')}
        </form><div class="btn-row"><button class="btn sm ghost" id="rmClr">Limpar informações</button></div></section>
      <section class="panel"><header><div><h3>Prévia — <span id="pvt">${U.esc(R.templates[sel.tipo].label)}</span></h3><span class="sub"><span id="pc"></span> · toque numa célula com borda tracejada para editar</span></div><button class="btn sm ghost" id="edClr" hidden>Desfazer edições da tabela</button></header><div id="pv"></div></section>`;
    const mform = U.$('#rmeta', el), mem = metaLoad();
    U.$$('input,textarea', mform).forEach(i => { if (mem[i.name] != null) i.value = mem[i.name]; });
    const meta = () => { const d = ui.formData(mform); const out = {}; Object.keys(d).forEach(k => { const v = String(d[k] || '').trim(); if (v) out[k] = v; }); if (out.data) out.data = U.date(out.data + 'T12:00:00'); if (!out.responsavel) out.responsavel = (store.user() || {}).nome; return out; };
    mform.addEventListener('input', () => { const d = ui.formData(mform); metaSave(d); U.$('#pvt').textContent = d.titulo || R.templates[sel.tipo].label; });
    U.$('#rmClr').onclick = () => { mform.reset(); metaSave({}); U.$('#pvt').textContent = R.templates[sel.tipo].label; };
    U.$$('[data-t]', el).forEach(b => b.onclick = () => { sel.tipo = b.dataset.t; edits = {}; FC.go('relatorios', {}); });
    const opts = () => ({ linkId: (U.$('#rl') || {}).value || sel.linkId, projeto: (U.$('#rp') || {}).value || (R.templates[sel.tipo].needsProject ? sel.projeto : '') });
    const preview = () => {
      const o = opts(); sel.linkId = o.linkId; if (U.$('#rp')) sel.projeto = U.$('#rp').value || sel.projeto;
      const rows = R.applyEdits(R.rowsFor(sel.tipo, o), edits);
      U.$('#pc').textContent = rows.length + ' trecho(s)';
      const cols = sel.tipo === 'capacidade' ? ['Enlace', 'Trecho', 'Fibras (cabo/livres)', 'Situação das fibras'] : sel.tipo === 'certificacao' ? ['Enlace', 'Trecho', 'Comparativo', 'Certificação', 'Data da medição', 'Responsável técnico', 'Aprovador'] : ['Enlace', 'Trecho', 'POP A → POP B', 'OZmap (m)', 'OTDR (m)', 'Diferença (m)', 'Diferença (%)', 'Perda prevista (dB)', 'Perda medida (dB)', 'Emendas', 'Conectores', 'Situação das fibras', 'Certificação', 'Data da medição', 'Responsável técnico', 'Observações'];
      U.$('#pv').innerHTML = `<div class="table-scroll"><table class="tbl"><thead><tr>${cols.map(c => `<th>${U.esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 60).map(r => `<tr>${cols.map(c => { const ed = EDITAVEIS.includes(c), mud = edits[r._id] && c in edits[r._id]; return `<td class="${typeof r[c] === 'number' ? 'num' : ''}${ed ? ' rp-ed' : ''}${mud ? ' rp-mud' : ''}" ${ed ? `contenteditable="plaintext-only" spellcheck="false" data-r="${U.esc(r._id)}" data-c="${U.esc(c)}"` : ''}>${U.esc(r[c] === '' || r[c] == null ? '—' : r[c])}</td>`; }).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="empty">Sem registros para este modelo.</td></tr>`}</tbody></table></div>${rows.length > 60 ? '<p class="small muted">Prévia limitada a 60 linhas; o arquivo contém todas.</p>' : ''}`;
    };
    ['#rl', '#rp'].forEach(s => { const e = U.$(s); e && (e.onchange = preview); });
    // edição das células da prévia
    U.$('#pv').addEventListener('focusout', (e) => {
      const td = e.target.closest('[data-r]'); if (!td) return;
      const v = td.textContent.replace(/\s+/g, ' ').trim().slice(0, 300), id = td.dataset.r, c = td.dataset.c;
      const orig = R.rowsFor(sel.tipo, opts()).find(x => x._id === id) || {};
      const o = orig[c] == null || orig[c] === '' ? '—' : String(orig[c]);
      if (v === o || (v === '—' && (orig[c] == null || orig[c] === ''))) { if (edits[id]) { delete edits[id][c]; if (!Object.keys(edits[id]).length) delete edits[id]; } }
      else (edits[id] = edits[id] || {})[c] = v;
      td.classList.toggle('rp-mud', !!(edits[id] && c in edits[id])); U.$('#edClr').hidden = !Object.keys(edits).length;
    });
    U.$('#pv').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest('[data-r]')) { e.preventDefault(); e.target.blur(); } });
    U.$('#edClr').onclick = () => { edits = {}; U.$('#edClr').hidden = true; preview(); };
    U.$('#edClr').hidden = !Object.keys(edits).length;
    preview();
    const full = () => Object.assign(opts(), { meta: meta(), edits });
    U.$('#gp').onclick = () => store.require('relatorio.gerar') && R.generate(sel.tipo, 'pdf', full());
    U.$('#gx').onclick = () => store.require('relatorio.gerar') && R.generate(sel.tipo, 'xlsx', full());
  }
  FC.registerModule({ id: 'relatorios', order: 9, title: 'Relatórios', icon: 'report', group: 'main', field: false, render });
})(window.FC = window.FC || {});
