/* ClickIP FiberControl — geração de relatórios PDF (jsPDF + AutoTable) e XLSX (SheetJS) */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, C = FC.calc, store = FC.store;
  const R = FC.reports = {};
  const NAVY = [0, 41, 71], TEAL = [1, 160, 156], ORANGE = [254, 98, 24];
  let logoCache = null;

  R.logo = () => logoCache || (logoCache = new Promise((res) => {
    const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0); res({ data: c.toDataURL('image/jpeg', .92), w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => res(null); img.src = FC.LOGO.light;
  }));

  const need = () => { if (!window.jspdf || !window.jspdf.jsPDF) { ui.toast('Biblioteca de PDF não carregou (verifique a internet).', 'err'); return false; } return true; };

  async function newDoc(title, subtitle, landscape = true) {
    const doc = new window.jspdf.jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const lg = await R.logo();
    if (lg) doc.addImage(lg.data, 'JPEG', 12, 9, 48, 48 * lg.h / lg.w);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...NAVY); doc.text(title, W - 12, 15, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90); doc.text(subtitle || '', W - 12, 21, { align: 'right' });
    doc.setDrawColor(...TEAL); doc.setLineWidth(.8); doc.line(12, 27, W - 12, 27);
    doc.setDrawColor(...ORANGE); doc.setLineWidth(.8); doc.line(W - 40, 27, W - 12, 27);
    doc._y = 33;
    return doc;
  }
  function footer(doc) {
    const n = doc.getNumberOfPages(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), u = store.user();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(120); doc.text(`ClickIP FiberControl · gerado em ${U.dt(U.now())} por ${u ? u.nome : '—'}${store.state.meta.demo ? ' · CONTÉM DADOS DE DEMONSTRAÇÃO' : ''}`, 12, H - 7); doc.text(`Página ${i} de ${n}`, W - 12, H - 7, { align: 'right' }); }
  }
  function kv(doc, pairs, cols = 4) {
    const W = doc.internal.pageSize.getWidth() - 24, cw = W / cols; let x = 12, y = doc._y, i = 0;
    pairs.forEach(([k, v]) => {
      doc.setFontSize(7); doc.setTextColor(120); doc.text(String(k).toUpperCase(), x, y);
      doc.setFontSize(9.5); doc.setTextColor(20); doc.text(doc.splitTextToSize(String(v == null ? '—' : v), cw - 4), x, y + 4.5);
      i++; x += cw; if (i % cols === 0) { x = 12; y += 12; }
    });
    doc._y = y + (i % cols ? 12 : 0) + 2;
  }
  function table(doc, head, body, opts = {}) {
    doc.autoTable(Object.assign({ head: [head], body, startY: doc._y, theme: 'grid', styles: { fontSize: 7.6, cellPadding: 1.6, overflow: 'linebreak' }, headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [244, 248, 250] }, margin: { left: 12, right: 12 } }, opts));
    doc._y = doc.lastAutoTable.finalY + 6;
  }
  const save = (doc, name) => { footer(doc); const blob = doc.output('blob'); U.download(blob, name + '.pdf'); store.audit('gerou', 'relatorio', null, name + '.pdf'); return blob; };
  const stLabel = { verde: 'VERDE', amarelo: 'AMARELO', vermelho: 'VERMELHO', 'sem-dados': 'Sem dados' };

  /** Linha completa de um trecho com todos os campos exigidos nos relatórios */
  R.trechoRow = (t) => {
    const l = store.get('links', t.linkId) || {}, m = C.latest(t.id), c = C.compare(t, m), b = C.budget(t, m), cap = C.capacity(t);
    return {
      Projeto: l.projeto, 'POP A → POP B': `${l.popA || '—'} → ${l.popB || '—'}`, Enlace: l.nome, Trecho: t.nome, Tipo: t.tipo,
      'OZmap (m)': c.ozmap != null ? +c.ozmap.toFixed(1) : '', 'OTDR (m)': c.otdr != null ? +c.otdr.toFixed(1) : '', 'Diferença (m)': c.diffM != null ? +c.diffM.toFixed(1) : '', 'Diferença (%)': c.diffPct != null ? +c.diffPct.toFixed(2) : '', Comparativo: stLabel[c.status],
      'Perda prevista (dB)': b.pred ? +b.pred.total.toFixed(3) : '', 'Perda medida (dB)': b.measured != null ? +b.measured.toFixed(3) : '', 'λ (nm)': m ? m.wavelength : '',
      Emendas: t.emendas, Conectores: t.conectores, 'Fibras (cabo/livres)': `${t.caboFO || '?'}FO / ${cap.rest == null ? '?' : cap.rest}`, 'Situação das fibras': { verde: 'Adequada', amarelo: 'Baixa', vermelho: 'Esgotada', 'sem-dados': 'Sem dados' }[cap.status],
      Certificação: C.statusLabel[C.trechoStatus(t)], 'Data da medição': m ? U.date(m.data) : '', 'Responsável técnico': m ? m.responsavel : l.responsavel, Aprovador: t.certificacao && t.certificacao.status === 'certificado' ? t.certificacao.aprovador : '', Observações: [t.obs, m && m.obs].filter(Boolean).join(' | ')
    };
  };
  const pdfCols = ['Trecho', 'OZmap (m)', 'OTDR (m)', 'Diferença (m)', 'Diferença (%)', 'Comparativo', 'Perda prevista (dB)', 'Perda medida (dB)', 'Emendas', 'Conectores', 'Fibras (cabo/livres)', 'Certificação', 'Data da medição', 'Responsável técnico', 'Observações'];
  const colorize = (data) => { if (data.section !== 'body') return; const v = String(data.cell.raw); if (v === 'VERMELHO' || v === 'Esgotada' || v === 'Divergente') data.cell.styles.textColor = [200, 40, 30]; if (v === 'AMARELO' || v === 'Baixa') data.cell.styles.textColor = [170, 115, 0]; if (v === 'VERDE' || v === 'Certificado' || v === 'Adequada') data.cell.styles.textColor = [10, 130, 80]; };

  /* ---------- Exportação genérica ---------- */
  R.exportRows = async (rows, name, fmt, title) => {
    if (!rows.length) return ui.toast('Nada para exportar.', 'warn');
    if (fmt === 'xlsx') return R.xlsx({ [title.slice(0, 30)]: rows }, name);
    if (!need()) return;
    const doc = await newDoc(title, `${rows.length} registros`);
    const head = Object.keys(rows[0]);
    table(doc, head, rows.map(r => head.map(h => r[h] == null ? '' : r[h])), { didParseCell: colorize });
    return save(doc, name);
  };
  R.xlsx = (sheets, name, returnBlob = false) => {
    if (!window.XLSX) return ui.toast('Biblioteca de planilhas não carregou.', 'err');
    const wb = XLSX.utils.book_new();
    Object.entries(sheets).forEach(([n, rows]) => { const ws = XLSX.utils.json_to_sheet(rows); ws['!cols'] = Object.keys(rows[0] || {}).map(k => ({ wch: Math.min(40, Math.max(10, k.length + 2, ...rows.slice(0, 50).map(r => String(r[k] == null ? '' : r[k]).length))) })); XLSX.utils.book_append_sheet(wb, ws, n.replace(/[\\/?*[\]:]/g, '-').slice(0, 31)); });
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (returnBlob) return blob;
    U.download(blob, name + '.xlsx'); store.audit('gerou', 'relatorio', null, name + '.xlsx');
    return blob;
  };

  /* ---------- Modelos ---------- */
  R.templates = {
    individual: { label: 'Relatório individual de enlace', needsLink: true },
    projeto: { label: 'Relatório consolidado de projeto', needsProject: true },
    divergencias: { label: 'Relatório de divergências' },
    certificacao: { label: 'Relatório de certificação' },
    capacidade: { label: 'Relatório de capacidade de fibras' }
  };
  R.rowsFor = (tipo, { linkId, projeto } = {}) => {
    let ts = store.state.trechos;
    if (tipo === 'individual') ts = ts.filter(t => t.linkId === linkId);
    if (projeto) ts = ts.filter(t => (store.get('links', t.linkId) || {}).projeto === projeto);
    if (tipo === 'divergencias') ts = ts.filter(t => ['vermelho', 'amarelo'].includes(C.compare(t).status) || C.budget(t).status === 'acima').sort((a, b) => Math.abs(C.compare(b).diffPct || 0) - Math.abs(C.compare(a).diffPct || 0));
    const sortL = (a, b) => ((store.get('links', a.linkId) || {}).nome || '').localeCompare((store.get('links', b.linkId) || {}).nome || '') || (a.ordem || 0) - (b.ordem || 0);
    if (tipo !== 'divergencias') ts = [...ts].sort(sortL);
    return ts.map(R.trechoRow);
  };
  R.generate = async (tipo, fmt, opts = {}) => {
    const rows = R.rowsFor(tipo, opts);
    const tpl = R.templates[tipo];
    const fname = (tipo + '-' + (opts.linkId ? (store.get('links', opts.linkId) || {}).nome : opts.projeto || 'geral')).replace(/[^\w-]+/g, '-').toLowerCase() + '-' + U.now().slice(0, 10);
    if (fmt === 'xlsx') {
      const sheets = { [tpl.label.slice(0, 31)]: rows.length ? rows : [{ Aviso: 'Sem registros' }] };
      if (tipo === 'capacidade') sheets['Fibras'] = rows.map(r => ({ Enlace: r.Enlace, Trecho: r.Trecho, 'Fibras (cabo/livres)': r['Fibras (cabo/livres)'], Situação: r['Situação das fibras'] }));
      if (tipo === 'certificacao') sheets['Assinaturas'] = store.state.trechos.filter(t => t.certificacao && t.certificacao.status === 'certificado').map(t => ({ Enlace: (store.get('links', t.linkId) || {}).nome, Trecho: t.nome, Data: U.dt(t.certificacao.data), Aprovador: t.certificacao.aprovador, Resultado: t.certificacao.resultado || '', 'Hash SHA-256': t.certificacao.assinaturaHash }));
      return R.xlsx(sheets, fname, opts.returnBlob);
    }
    if (!need()) return;
    if (tipo === 'individual') { const l = store.get('links', opts.linkId); return R.linkPDF(l, opts.returnBlob); }
    const doc = await newDoc(tpl.label, opts.projeto ? 'Projeto: ' + opts.projeto : 'Todos os projetos');
    const all = rows;
    const n = (k, v) => all.filter(r => r[k] === v).length;
    kv(doc, [['Trechos', all.length], ['Certificados', n('Certificação', 'Certificado')], ['Divergentes', n('Comparativo', 'VERMELHO')], ['Atenção', n('Comparativo', 'AMARELO')], ['Capacidade esgotada', n('Situação das fibras', 'Esgotada')], ['Capacidade baixa', n('Situação das fibras', 'Baixa')], ['Tolerância global', store.state.settings.tolerance.max + '%'], ['Mín. fibras livres', store.state.settings.fibers.min]]);
    let cols = ['Enlace', ...pdfCols];
    if (tipo === 'capacidade') cols = ['Enlace', 'Trecho', 'Tipo', 'Fibras (cabo/livres)', 'Situação das fibras', 'Observações'];
    if (tipo === 'certificacao') cols = ['Enlace', 'Trecho', 'Comparativo', 'Perda medida (dB)', 'Certificação', 'Data da medição', 'Responsável técnico', 'Aprovador'];
    if (tipo === 'divergencias') cols = ['Enlace', 'Trecho', 'Tipo', 'OZmap (m)', 'OTDR (m)', 'Diferença (m)', 'Diferença (%)', 'Comparativo', 'Perda prevista (dB)', 'Perda medida (dB)', 'Responsável técnico'];
    table(doc, cols, all.map(r => cols.map(c => r[c] == null ? '' : r[c])), { didParseCell: colorize });
    if (opts.returnBlob) { footer(doc); return doc.output('blob'); }
    return save(doc, fname);
  };

  R.linkPDF = async (l, returnBlob = false) => {
    if (!l || !need()) return;
    const doc = await newDoc('Relatório individual de enlace', l.projeto);
    const tot = FC.linkTotals(l);
    kv(doc, [['Projeto', l.projeto], ['POP A → POP B', `${l.popA || '—'} → ${l.popB || '—'}`], ['Enlace', l.nome], ['Cabo', `${l.caboId || '—'} (${l.tipoCabo || '—'})`], ['Fibras', (l.fibras || '—') + ' FO'], ['Distância OZmap', U.km(tot.oz)], ['Região', l.regiao], ['Responsável técnico', l.responsavel], ['Trechos', tot.ts.length], ['Certificação', `${tot.cert}/${tot.ts.length} (${U.num(tot.pct, 0)}%)`], ['Cadastro', U.dt(l.criadoEm)], ['Observações', l.obs || '—']]);
    const rows = R.rowsFor('individual', { linkId: l.id });
    table(doc, pdfCols, rows.map(r => pdfCols.map(c => r[c] == null ? '' : r[c])), { didParseCell: colorize });
    const certs = tot.ts.filter(t => t.certificacao && t.certificacao.status === 'certificado');
    if (certs.length) {
      doc.setFontSize(10); doc.setTextColor(...NAVY); doc.text('Aprovações registradas', 12, doc._y); doc._y += 4;
      table(doc, ['Trecho', 'Data', 'Aprovador', 'Hash SHA-256 da assinatura'], certs.map(t => [t.nome, U.dt(t.certificacao.data), t.certificacao.aprovador, (t.certificacao.assinaturaHash || '').slice(0, 40)]));
    }
    const name = ('enlace-' + l.nome).replace(/[^\w-]+/g, '-').toLowerCase();
    if (returnBlob) { footer(doc); return doc.output('blob'); }
    return save(doc, name);
  };

  R.otdrPDF = async (m) => {
    if (!need()) return;
    const t = store.get('trechos', m.trechoId), l = store.get('links', m.linkId), a = C.analyze(m, t);
    const doc = await newDoc('Relatório de teste OTDR', `${l.nome} / ${t.nome}`);
    kv(doc, [['Projeto', l.projeto], ['POP A → POP B', `${l.popA || '—'} → ${l.popB || '—'}`], ['Enlace / trecho', `${l.nome} / ${t.nome}`], ['Arquivo', m.fileName || 'manual'], ['Data da medição', U.dt(m.data)], ['Responsável técnico', m.responsavel], ['Equipamento', m.equipamento || '—'], ['λ', (m.wavelength || '—') + ' nm'],
      ['Distância OTDR', U.km(C.otdrNet(m))], ['Distância OZmap', U.km(t.ozmapM)], ['Diferença', a.compare && a.compare.diffM != null ? `${U.m(a.compare.diffM, 1)} (${U.pct(a.compare.diffPct)})` : '—'], ['Atenuação total', U.db(m.totalLoss, 3)],
      ['Perda prevista', a.budget && a.budget.pred ? U.db(a.budget.pred.total, 3) : '—'], ['ORL', U.db(m.orl)], ['Emendas / conectores', `${t.emendas} / ${t.conectores}`], ['RESULTADO', C.resultLabel[a.result]]]);
    const cv = document.getElementById('tc');
    if (cv) { try { const W = doc.internal.pageSize.getWidth() - 24; const img = cv.toDataURL('image/png'); const h = Math.min(70, W * cv.height / cv.width); doc.addImage(img, 'PNG', 12, doc._y, h * cv.width / cv.height, h); doc._y += h + 4; } catch (e) { /* */ } }
    doc.setFontSize(8); doc.setTextColor(90); doc.text('Parâmetros analisados: ' + a.analyzed.join(', ') + (a.missing.length ? ' · Não disponíveis: ' + a.missing.join(', ') : ''), 12, doc._y, { maxWidth: doc.internal.pageSize.getWidth() - 24 }); doc._y += 8;
    table(doc, ['Nº', 'Tipo', 'Distância (km)', 'Do anterior (m)', 'Perda (dB)', 'Refletância (dB)', 'Avaliação', 'Observação'], a.events.map(e => [e.n, e.tipo, U.num(e.distM / 1000, 4), e.gapM != null ? U.num(e.gapM, 1) : '', U.num(e.loss, 3), e.reflectance ? U.num(e.reflectance, 1) : '', C.resultLabel[e.level] || e.level, e.note || '']));
    if (a.issues.length) { table(doc, ['Possíveis problemas'], a.issues.map(i => [`[${C.resultLabel[i.level]}] ${i.msg}`])); }
    if (m.obs) { doc.setFontSize(9); doc.setTextColor(20); doc.text('Observações: ' + m.obs, 12, doc._y, { maxWidth: doc.internal.pageSize.getWidth() - 24 }); }
    return save(doc, ('teste-otdr-' + l.nome + '-' + t.nome).replace(/[^\w-]+/g, '-').toLowerCase());
  };
  R.capacityReport = (fmt) => R.generate('capacidade', fmt);
})(window.FC = window.FC || {});
