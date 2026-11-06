/* Módulo 3 — Análise OTDR (individual, importação em lote, orçamento de perda, medições) */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, C = FC.calc, store = FC.store, I = FC.importers;
  let tab = 'individual';

  /* ---------- Associação automática teste → enlace/trecho ---------- */
  /** Associa o teste a um enlace já cadastrado SOMENTE quando os POPs (origem/extremidade) coincidem.
   *  O código do cabo (ex.: 4L24F) se repete entre enlaces diferentes, então só é usado quando o teste não traz POPs. */
  FC.matchTarget = (d) => {
    const links = store.state.links, n = U.norm;
    let link = null;
    if (d.popA && d.popB) {
      link = links.find(l => (n(l.popA) === n(d.popA) && n(l.popB) === n(d.popB)) || (n(l.popA) === n(d.popB) && n(l.popB) === n(d.popA))) || null;
    } else {
      link = links.find(l => n(l.nome) === n(d.nome)) || (d.caboId ? links.find(l => l.caboId && n(l.caboId) === n(d.caboId)) : null) || null;
    }
    let trecho = null;
    if (link) {
      const ts = store.state.trechos.filter(t => t.linkId === link.id);
      const nome = d.trecho || d.trechoNome;
      trecho = nome ? ts.find(t => n(t.nome) === n(nome)) || null : (ts.length === 1 ? ts[0] : null);
    }
    return { link, trecho };
  };
  /** O enlace cadastrado tem os mesmos POPs do teste? */
  FC.samePops = (l, d) => !d.popA || !d.popB || !l || ((U.norm(l.popA) === U.norm(d.popA) && U.norm(l.popB) === U.norm(d.popB)) || (U.norm(l.popA) === U.norm(d.popB) && U.norm(l.popB) === U.norm(d.popA)));

  /** Persiste uma medição (cria enlace/trecho quando necessário). Retorna a medição. */
  FC.saveMeasurement = async ({ res, derived, buf, file, fileName, hash, linkId, newLinkName, trechoId, newTrechoName, manual = {}, relPath }) => {
    const u = store.user();
    let link = linkId ? store.get('links', linkId) : null;
    if (!link) {
      link = { id: U.uid('lnk_'), nome: newLinkName || derived.nome, popA: derived.popA || '', popB: derived.popB || '', caboId: derived.caboId || '', tipoCabo: derived.tipoCabo || '', fibras: derived.fibras || null, regiao: derived.regiao || '', projeto: derived.projeto, responsavel: u.nome, criadoEm: U.now(), obs: '', origem: derived.origem, criadoPorTeste: fileName };
      store.upsert('links', link, 'Enlace criado automaticamente a partir do teste ' + fileName);
    }
    let trecho = trechoId ? store.get('trechos', trechoId) : null;
    if (!trecho) {
      const n = store.state.trechos.filter(t => t.linkId === link.id).length;
      trecho = { id: U.uid('tr_'), linkId: link.id, ordem: n + 1, nome: newTrechoName || derived.trecho || ('T' + String(n + 1).padStart(2, '0')), tipo: 'Aéreo', ozmapM: null, caboFO: derived.fibras || link.fibras || null, emendas: Math.max(0, (res.draft.events || []).filter(e => e.kind === 'nao-refletivo').length), conectores: 2, wavelength: res.draft.wavelength || 1550, componentes: [] };
      store.upsert('trechos', trecho, `Trecho ${trecho.nome} criado a partir do teste ${fileName}`);
    }
    const d = Object.assign({}, res.draft, manual);
    let att = null;
    if (buf) att = await store.putFile(new File([buf], fileName, { type: file && file.type || 'application/octet-stream' }), { trechoId: trecho.id, linkId: link.id, categoria: res.kind === 'SOR' ? 'Arquivo SOR' : res.kind === 'PDF' ? 'Relatório OTDR (PDF)' : res.kind === 'IMG' ? 'Fotografia de campo' : 'Documento complementar', hash });
    const m = {
      id: U.uid('med_'), trechoId: trecho.id, linkId: link.id, data: d.data || U.now(), importedAt: U.now(), responsavel: u.nome, source: res.kind, fileName, fileHash: hash, attachmentId: att ? att.id : null,
      wavelength: d.wavelength ? +d.wavelength : null, lengthM: d.lengthM != null && d.lengthM !== '' ? +d.lengthM : null, launchM: +d.launchM || 0, receiveM: +d.receiveM || 0,
      totalLoss: d.totalLoss != null && d.totalLoss !== '' ? +d.totalLoss : null, totalLossOrigin: manual.totalLoss != null && manual.totalLoss !== '' && +manual.totalLoss !== res.draft.totalLoss ? 'manual' : d.totalLossOrigin || null,
      orl: d.orl ? +d.orl : null, ior: d.ior || null, pulseNs: d.pulseNs || null, resolutionM: d.resolutionM || null, equipamento: d.equipamento || null, operadorOTDR: d.operadorOTDR || (d.gen && d.gen.operator) || null, avgAtt: d.avgAtt || null, fiberId: (d.gen && d.gen.fiberId) || null, direction: (d.gen && d.gen.direction) || null, os: (d.gen && d.gen.os) || null, fiberType: d.fiberType || null, buildCondition: d.buildCondition || null,
      events: d.events || [], extracted: res.extracted, missing: res.missing, warnings: res.warnings, manualFields: Object.keys(manual).filter(k => manual[k] !== '' && manual[k] != null), obs: manual.obs || '', relPath: relPath || null, hasTrace: !!res.trace
    };
    delete m.gen;
    if (res.trace) await U.idb.put('traces', m.id, res.trace);
    store.upsert('measurements', m, `Medição importada (${res.kind}) ${fileName} → ${link.nome} / ${trecho.nome}`);
    return m;
  };

  /* ---------- Página ---------- */
  function render(el, params) {
    if (params.measurementId || params.trechoId) tab = 'individual';
    if (params.tab) tab = params.tab;
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Módulo de destaque</span><h1>Análise OTDR</h1><p class="muted small">Leitura real de .SOR (Telcordia SR-4731), PDF, CSV/XLSX e imagem. O que não puder ser extraído é indicado para preenchimento manual.</p></div></div>
      <div class="tabs" role="tablist">${[['individual', 'Análise individual'], ['lote', 'Importação em lote'], ['budget', 'Orçamento de perda'], ['lista', 'Medições registradas']].map(([k, l]) => `<button role="tab" class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div id="otab"></div>`;
    U.$$('[data-tab]', el).forEach(b => b.onclick = () => { tab = b.dataset.tab; FC.route.params = {}; FC.go('otdr', { tab }); });
    const box = U.$('#otab', el);
    ({ individual: () => renderIndividual(box, params), lote: () => renderBatch(box), budget: () => renderBudget(box, params), lista: () => renderList(box) })[tab]();
  }

  /* ---------- Individual ---------- */
  function renderIndividual(box, params) {
    let m = params.measurementId ? store.get('measurements', params.measurementId) : params.trechoId ? C.latest(params.trechoId) : null;
    box.innerHTML = `<section class="panel"><div class="dz" id="dz">${ui.icon('upload')}<b>Arraste o teste do OTDR aqui</b><span class="small muted">PDF do SmartOTDR, .SOR / .CSOR: enlace, POPs (Origem/Extremidade), cabo, fibras, OS e medição são preenchidos automaticamente. Também aceita CSV, XLSX e foto da tela.</span><div class="btn-row"><button class="btn primary" id="pick">Selecionar arquivo</button><button class="btn" id="manual">${ui.icon('edit')}Registrar manualmente</button></div></div></section><div id="ares"></div>`;
    ui.dropzone(U.$('#dz', box), (fs) => fs[0] && handleFile(fs[0], params));
    U.$('#pick', box).onclick = async () => { const [f] = await ui.pickFiles({ accept: I.accept }); f && handleFile(f, params); };
    U.$('#manual', box).onclick = () => reviewImport({ kind: 'MANUAL', ok: true, draft: { source: 'MANUAL', events: [], gen: {} }, extracted: [], missing: ['Todos os campos (registro manual)'], warnings: [] }, null, { name: 'registro-manual' }, null, params);
    if (m) showAnalysis(U.$('#ares', box), m);
  }

  async function handleFile(file, params) {
    if (!store.require('medicao.importar')) return;
    const kind = I.kindOf(file.name);
    if (!kind) return ui.toast('Formato não suportado: ' + file.name, 'err');
    if (kind === 'CSV' || kind === 'XLSX') { tab = 'lote'; FC.go('otdr', { tab: 'lote' }); setTimeout(() => batchAdd([file]), 50); return; }
    // PDF do relatório e .SOR/.CSOR: mesmo cadastro automático da aba Enlaces (POPs, cabo, fibras, OS, técnico, medição)
    if (kind === 'SOR' || kind === 'PDF') return FC.importTest(params && params.linkId ? store.get('links', params.linkId) : null, [file], { after: 'otdr', trechoId: params && params.trechoId });
    const out = U.$('#ares'); out.innerHTML = `<section class="panel"><p class="muted">Lendo ${U.esc(file.name)}…</p><div class="meter"><i id="prog" style="width:15%"></i></div></section>`;
    try {
      const buf = await U.readAsArrayBuffer(file);
      const hash = await U.sha256(buf);
      const dup = store.state.measurements.find(x => x.fileHash === hash);
      let results;
      if (kind === 'SOR') results = await I.readSOR(file, buf);
      else if (kind === 'PDF') results = await I.readPDF(file, buf);
      else results = await I.readImage(file, (s, p) => { const g = U.$('#prog'); if (g) g.style.width = Math.round(p * 100) + '%'; });
      reviewImport(results[0], buf, file, hash, params, dup, results.length > 1 ? results : null);
    } catch (e) {
      out.innerHTML = `<section class="panel"><div class="note bad">${ui.icon('alert')}<div><b>Não foi possível interpretar ${U.esc(file.name)}.</b><br>${U.esc(e.message)}<br><span class="small">O arquivo não foi alterado. Você pode registrar os valores manualmente.</span></div></div><button class="btn" id="mnl">Preencher manualmente</button></section>`;
      U.$('#mnl').onclick = () => reviewImport({ kind: kind, ok: false, draft: { source: kind, events: [], gen: {} }, extracted: [], missing: ['Arquivo não interpretado: ' + e.message], warnings: [] }, null, file, null, params);
    }
  }

  /** Tela de revisão: mostra o que foi extraído, o que falta e onde associar */
  function reviewImport(res, buf, file, hash, params, dup, multi) {
    const out = U.$('#ares');
    const d = res.draft;
    const derived = I.derive({ gen: d.gen || {}, fileName: file.name, relPath: file.webkitRelativePath || '', text: res.text || '' });
    let target = FC.matchTarget(derived);
    if (params && params.trechoId) { const t = store.get('trechos', params.trechoId); if (t) target = { trecho: t, link: store.get('links', t.linkId) }; }
    if (params && params.linkId && !target.link) target.link = store.get('links', params.linkId);
    const links = store.state.links;
    const fieldRow = (key, label, val, unit, attrs = 'type="number" step="any"') => {
      const got = val != null && val !== '';
      return ui.field(label + (unit ? ` (${unit})` : ''), ui.input('mf_' + key, got ? val : '', attrs + (got ? '' : ' placeholder="Não extraído — preencher"')), got ? `<span class="auto">lido do arquivo</span>` : '<span class="warn-text">não encontrado no arquivo</span>');
    };
    out.innerHTML = `<section class="panel">
      <header><div><span class="eyebrow">Revisão da importação</span><h3>${U.esc(file.name)}</h3></div>${ui.badge(res.ok ? 'verde' : 'amarelo', res.ok ? 'Arquivo interpretado' : 'Leitura parcial')}</header>
      ${dup ? `<div class="note warn">${ui.icon('alert')}<div><b>Arquivo duplicado:</b> este mesmo arquivo (SHA-256 idêntico) já foi importado em ${U.dt(dup.importedAt)} por ${U.esc(dup.responsavel)}. <button class="btn sm" id="seeDup">Ver medição existente</button></div></div>` : ''}
      ${multi ? `<div class="note">${ui.icon('layers')}<div>Arquivo com ${multi.length} traços. Mostrando o 1º; use a Importação em lote para todos.</div></div>` : ''}
      ${res.warnings.length ? `<div class="note warn">${ui.icon('alert')}<div>${res.warnings.map(U.esc).join('<br>')}</div></div>` : ''}
      <div class="grid g2">
        <div class="grid"><h4>Extraído do arquivo</h4><div class="chips">${res.extracted.map(x => `<span class="badge ok">${U.esc(x)}</span>`).join('') || '<span class="muted small">Nada extraído automaticamente</span>'}</div>
          <h4>Não disponível</h4><div class="chips">${res.missing.map(x => `<span class="badge mute">${U.esc(x)}</span>`).join('') || '<span class="muted small">Nenhum</span>'}</div>
          ${d.equipamento ? `<p class="small">Equipamento: <b>${U.esc(d.equipamento)}</b>${d.modulo ? ' · módulo ' + U.esc(d.modulo) : ''}${d.fiberType ? ' · ' + U.esc(d.fiberType) : ''}</p>` : ''}
          ${res.text ? `<details><summary class="small">Texto lido (${res.text.length} caracteres)</summary><pre class="small" style="white-space:pre-wrap;max-height:220px;overflow:auto;background:var(--surface-2);padding:10px;border-radius:8px">${U.esc(res.text.slice(0, 6000))}</pre></details>` : ''}
        </div>
        <div class="grid"><h4>Identificação automática do enlace</h4>
          <div class="kv">${['nome', 'popA', 'popB', 'caboId', 'tipoCabo', 'fibras', 'projeto', 'regiao', 'trecho'].map(k => `<div><span class="k">${{ nome: 'Enlace', popA: 'POP origem', popB: 'POP destino', caboId: 'Cabo', tipoCabo: 'Tipo de cabo', fibras: 'Fibras', projeto: 'Projeto', regiao: 'Região', trecho: 'Trecho' }[k]}</span><span class="v">${U.esc(derived[k] || '—')}</span><span class="tiny muted">${U.esc(derived.origem[k] || '')}</span></div>`).join('')}</div>
        </div>
      </div>
      <form class="form-grid" id="rf">
        ${ui.field('Enlace', ui.select('linkId', [['', '+ Novo: ' + derived.nome], ...links.map(l => [l.id, l.nome])], target.link ? target.link.id : ''), target.link ? '<span class="auto">associado automaticamente</span>' : 'Será criado com os dados identificados', 'full')}
        ${ui.field('Trecho', '<select id="trechoId" name="trechoId"></select>', '')}
        ${ui.field('Nome do novo trecho', ui.input('newTrecho', derived.trecho || ''), 'Usado quando “Novo trecho”')}
        ${fieldRow('lengthM', 'Comprimento total', d.lengthM != null ? +(+d.lengthM).toFixed(2) : null, 'm')}
        ${fieldRow('wavelength', 'Comprimento de onda', d.wavelength, 'nm')}
        ${fieldRow('totalLoss', 'Atenuação total', d.totalLoss != null ? +(+d.totalLoss).toFixed(3) : null, 'dB')}
        ${fieldRow('orl', 'ORL', d.orl, 'dB')}
        ${ui.field('Bobina de lançamento (m)', ui.input('mf_launchM', 0, 'type="number" step="any" min="0"'), 'Descontada da distância')}
        ${ui.field('Bobina de recepção (m)', ui.input('mf_receiveM', 0, 'type="number" step="any" min="0"'))}
        ${ui.field('Data da medição', ui.input('mf_data', (d.data || U.now()).slice(0, 16), 'type="datetime-local"'), d.data ? '<span class="auto">gravada pelo OTDR</span>' : 'Data atual')}
        ${ui.field('Observações', '<textarea name="mf_obs"></textarea>', '', 'full')}
      </form>
      <div class="btn-row"><button class="btn primary" id="saveImp">${ui.icon('check')}Salvar medição e analisar</button><button class="btn ghost" id="cancelImp">Cancelar</button></div>
    </section>`;
    const sel = U.$('#linkId', out), tsel = U.$('#trechoId', out);
    const fillT = () => { const ts = store.state.trechos.filter(t => t.linkId === sel.value).sort((a, b) => a.ordem - b.ordem); tsel.innerHTML = `<option value="">+ Novo trecho</option>` + ts.map(t => `<option value="${t.id}" ${target.trecho && target.trecho.id === t.id ? 'selected' : ''}>${U.esc(t.nome)} · ${U.esc(t.tipo || '')} · OZmap ${U.m(t.ozmapM, 0)}</option>`).join(''); };
    sel.onchange = fillT; fillT();
    const sd = U.$('#seeDup', out); sd && (sd.onclick = () => FC.go('otdr', { measurementId: dup.id }));
    U.$('#cancelImp', out).onclick = () => { out.innerHTML = ''; };
    U.$('#saveImp', out).onclick = async () => {
      const f = ui.formData(U.$('#rf', out));
      const manual = {};
      ['lengthM', 'wavelength', 'totalLoss', 'orl', 'launchM', 'receiveM'].forEach(k => { if (f['mf_' + k] !== '') manual[k] = U.parseNum(f['mf_' + k]); });
      manual.data = f.mf_data ? new Date(f.mf_data).toISOString() : U.now(); manual.obs = f.mf_obs;
      if (manual.lengthM == null && manual.totalLoss == null) { ui.toast('Informe ao menos o comprimento ou a atenuação total.', 'err'); return; }
      const m = await FC.saveMeasurement({ res, derived, buf, file, fileName: file.name, hash, linkId: f.linkId, trechoId: f.trechoId, newTrechoName: f.newTrecho, manual, relPath: file.webkitRelativePath });
      ui.toast('Medição registrada. Análise gerada.', 'ok');
      FC.go('otdr', { measurementId: m.id });
    };
  }

  /** Visão geral automática do teste */
  async function showAnalysis(out, m) {
    const t = store.get('trechos', m.trechoId), l = store.get('links', m.linkId);
    const a = C.analyze(m, t);
    const icon = { excelente: 'star', ok: 'check', atencao: 'alert', reprovado: 'x', insuficiente: 'file' }[a.result];
    const trace = m.hasTrace ? await U.idb.get('traces', m.id) : null;
    const prev = C.measurementsOf(m.trechoId).filter(x => x.id !== m.id && (x.data || '') < (m.data || '')).pop();
    out.innerHTML = `<section class="panel">
      <header><div><span class="eyebrow">Visão geral do teste</span><h2>${U.esc(l ? l.nome : '—')} <span class="muted">/ ${U.esc(t ? t.nome : '—')}</span>${ui.demo(m)}</h2><p class="small muted">${U.esc(m.fileName || 'Registro manual')} · ${U.esc(m.source)} · medido em ${U.dt(m.data)} por ${U.esc(m.responsavel || '—')}${m.equipamento ? ' · ' + U.esc(m.equipamento) : ''}</p></div>
      <div class="btn-row"><button class="btn primary" id="rep">${ui.icon('report')}Gerar relatório</button><button class="btn" id="edm">${ui.icon('edit')}Corrigir dados</button><button class="btn" id="hist">${ui.icon('history')}Histórico</button>${m.attachmentId ? `<button class="btn" id="orig">${ui.icon('file')}Arquivo original</button>` : ''}${store.can('certificacao.aprovar') ? `<button class="btn" id="cert">${ui.icon('cert')}Certificar</button>` : ''}</div></header>
      <div class="result-hero ${a.result}"><div class="ring ${a.result}">${ui.icon(icon)}</div><div><div class="big">${C.resultLabel[a.result]}</div>
        <p class="small">${a.result === 'insuficiente' ? 'Não há dados suficientes para classificar este teste. Faltam: <b>' + U.esc(a.missing.join(', ')) + '</b>.' : `Parâmetros analisados: <b>${U.esc(a.analyzed.join(' · '))}</b>`}</p>
        ${a.missing.length && a.result !== 'insuficiente' ? `<p class="small muted">Não disponíveis neste teste: ${U.esc(a.missing.join(', '))}</p>` : ''}</div></div>
      <div class="kv">
        <div><span class="k">Distância total</span><span class="v num">${U.km(C.otdrNet(m))}</span>${m.launchM || m.receiveM ? `<span class="tiny muted">bruto ${U.km(m.lengthM)} − bobinas</span>` : ''}</div>
        <div><span class="k">Comprimento de onda</span><span class="v">${m.wavelength ? m.wavelength + ' nm' : '—'}</span></div>
        <div><span class="k">Atenuação total</span><span class="v num">${U.db(m.totalLoss, 3)}</span>${m.totalLossOrigin ? `<span class="tiny muted">${U.esc(m.totalLossOrigin)}</span>` : ''}</div>
        <div><span class="k">Atenuação média</span><span class="v num">${a.attPerKm != null ? U.num(a.attPerKm, 3) + ' dB/km' : '—'}</span></div>
        <div><span class="k">ORL</span><span class="v num">${U.db(m.orl)}</span></div>
        <div><span class="k">Emendas (perda)</span><span class="v num">${a.events.filter(e => e.cls === 'splice').length} · ${U.db(a.spliceLoss, 3)}</span></div>
        <div><span class="k">Conectores (perda)</span><span class="v num">${a.events.filter(e => e.cls === 'conn').length} · ${U.db(a.connLoss, 3)}</span></div>
        <div><span class="k">Refletivos / não refletivos</span><span class="v">${a.reflective} / ${a.nonReflective}</span></div>
        <div><span class="k">IOR · Pulso</span><span class="v">${m.ior || '—'} · ${m.pulseNs ? m.pulseNs + ' ns' : '—'}</span></div>
      </div></section>
      <section class="grid g2">
        <div class="panel span2"><header><h3>Gráfico do traçado</h3><span class="sub">${trace ? 'Traço real lido do arquivo · clique em um evento' : m.events.length ? 'Sem traço no arquivo: diagrama esquemático reconstruído a partir dos eventos' : 'Sem dados de traço'}</span></header>${trace || m.events.length ? '<div class="chart-box tall"><canvas id="tc"></canvas></div>' : '<p class="muted">Este teste não contém traço nem eventos. Use o arquivo .SOR para ver o gráfico.</p>'}</div>
      </section>
      <section class="panel"><header><h3>Eventos identificados</h3><span class="sub">${a.events.length} evento(s)</span></header><div id="evt"></div></section>
      <section class="grid g2">
        <div class="panel"><header><h3>Possíveis problemas</h3></header>${a.issues.length ? `<ul class="list-plain">${a.issues.map(i => `<li>${ui.badge(i.level)} ${U.esc(i.msg)}</li>`).join('')}</ul>` : `<div class="note ok">${ui.icon('check')}<div>Nenhum problema identificado nos parâmetros disponíveis.</div></div>`}</div>
        <div class="panel"><header><h3>Comparação com os parâmetros esperados</h3></header><div id="exp"></div></div>
      </section>
      ${prev ? `<section class="panel"><header><h3>Mudanças desde a medição anterior (${U.date(prev.data)})</h3><button class="btn sm ghost" id="hist2">Comparar no histórico</button></header>${historySummary(prev, m)}</section>` : ''}`;
    const cmp = a.compare || C.compare(t, m), bud = a.budget || C.budget(t, m), T = store.state.settings.otdr;
    const exp = [
      ['Distância × OZmap', cmp.status === 'sem-dados' ? 'OZmap não informado' : `${U.m(cmp.otdr, 0)} × ${U.m(cmp.base, 0)}${cmp.factor !== 1 ? ' (fator ' + U.num(cmp.factor, 3) + ')' : ''}`, cmp.status === 'sem-dados' ? '—' : `${U.pct(cmp.diffPct)} (tol. ${cmp.tol.max}%)`, cmp.status === 'sem-dados' ? 'sem-dados' : cmp.status],
      ['Perda × orçamento', bud.pred ? `${U.db(bud.measured)} × ${U.db(bud.pred.total)} previsto` : 'Parâmetros insuficientes', bud.diff != null ? U.db(bud.diff) : '—', bud.status === 'ok' ? 'verde' : bud.status === 'atencao' ? 'amarelo' : bud.status === 'acima' ? 'vermelho' : 'sem-dados'],
      ['Margem do sistema', `Orçamento ${U.db(store.state.settings.budget.systemBudget)} − margem ${U.db(store.state.settings.budget.safetyMargin)}`, bud.margin != null ? U.db(bud.margin) : '—', bud.margin == null ? 'sem-dados' : bud.margin < 0 ? 'vermelho' : bud.margin < 2 ? 'amarelo' : 'verde'],
      ['ORL', m.orl ? U.db(m.orl) : 'Não disponível', `mín. ${T.orl.ok} dB`, !m.orl ? 'sem-dados' : m.orl >= T.orl.ok ? 'verde' : m.orl >= T.orl.atencao ? 'amarelo' : 'vermelho'],
      ['Emendas cadastradas × detectadas', `${t ? t.emendas : '—'} cadastradas`, `${a.events.filter(e => e.cls === 'splice').length} detectadas`, !t || !a.events.length ? 'sem-dados' : Math.abs(t.emendas - a.events.filter(e => e.cls === 'splice').length) <= 1 ? 'verde' : 'amarelo']
    ];
    U.$('#exp', out).innerHTML = `<div class="table-scroll"><table class="tbl"><thead><tr><th>Parâmetro</th><th>Valores</th><th class="num">Resultado</th><th>Situação</th></tr></thead><tbody>${exp.map(r => `<tr><td>${r[0]}</td><td class="small">${U.esc(r[1])}</td><td class="num">${U.esc(r[2])}</td><td>${ui.badge(r[3], r[3] === 'verde' ? 'OK' : r[3] === 'amarelo' ? 'Atenção' : r[3] === 'vermelho' ? 'Fora' : 'Sem dados')}</td></tr>`).join('')}</tbody></table></div>`;
    const boxOf = {}; if (t && (t.caixas || []).length && FC.boxes) FC.boxes.match(t, m).rows.forEach(x => { if (x.ev) boxOf[x.ev.n] = x; });
    ui.table(U.$('#evt', out), {
      rows: a.events, sortKey: 'distM', sortDir: 'asc', pageSize: 50, empty: 'Nenhum evento disponível neste teste.', id: 'evtTbl',
      rowClass: e => e.level === 'reprovado' ? 'row-bad' : e.level === 'atencao' ? 'row-warn' : '',
      columns: [
        { key: 'n', label: 'Nº', num: true }, { key: 'tipo', label: 'Tipo', render: e => `${U.esc(e.tipo)}<br><span class="tiny muted">${U.esc(e.kind || '')}${e.code ? ' · ' + U.esc(e.code) : ''}</span>` },
        { key: 'distM', label: 'Distância', num: true, render: e => U.km(e.distM, 4) }, { key: 'gapM', label: 'Do anterior', num: true, render: e => e.gapM != null ? U.m(e.gapM, 1) : '—' },
        { key: 'loss', label: 'Perda', num: true, render: e => U.db(e.loss, 3) }, { key: 'reflectance', label: 'Refletância', num: true, render: e => e.reflectance ? U.db(e.reflectance, 1) : '—' },
        { key: 'slope', label: 'Atenuação seção', num: true, render: e => e.slope ? U.num(e.slope, 3) + ' dB/km' : '—' },
        { key: 'cx', label: 'Caixa (OZmap)', sortable: false, render: e => { const x = boxOf[e.n]; return x ? `<b>${U.esc(x.c.nome)}</b><br><span class="tiny muted">${U.m(x.ozD, 0)} no traçado</span>` : (t && (t.caixas || []).length && !e.end && e.distM > 1 ? '<span class="tiny bad-text">sem caixa</span>' : '—'); } },
        { key: 'level', label: 'Avaliação', render: e => e.cls === 'end' && e.level === 'ok' ? ui.badge('info', 'Fim') : ui.badge(e.level) }, { key: 'note', label: 'Observação', render: e => `<span class="small">${U.esc(e.note || '')}</span>` }
      ]
    });
    const cv = U.$('#tc', out);
    if (cv) ui.traceChart(cv, { trace, events: a.events, lengthM: m.lengthM, onPick: (e) => { const rows = U.$$('#evtTbl tbody tr', out); rows.forEach(r => r.style.outline = ''); const r = rows.find(r => r.firstElementChild && r.firstElementChild.textContent.trim() === String(e.n)); if (r) { r.style.outline = '2px solid var(--orange)'; r.scrollIntoView({ block: 'center', behavior: 'smooth' }); } ui.toast(`Evento ${e.n}: ${e.tipo} a ${U.km(e.distM, 4)} · ${U.db(e.loss, 3)}${e.note ? ' · ' + e.note : ''}`, e.level === 'reprovado' ? 'err' : e.level === 'atencao' ? 'warn' : 'info', 6000); } });
    U.$('#rep', out).onclick = () => FC.reports.otdrPDF(m);
    U.$('#hist', out).onclick = () => FC.go('historico', { trechoId: m.trechoId });
    const h2 = U.$('#hist2', out); h2 && (h2.onclick = () => FC.go('historico', { trechoId: m.trechoId }));
    const og = U.$('#orig', out); og && (og.onclick = () => { const at = store.get('attachments', m.attachmentId); at ? ui.openAttachment(at) : ui.toast('Anexo não encontrado.', 'err'); });
    const ce = U.$('#cert', out); ce && (ce.onclick = () => FC.go('certificacoes', { trechoId: m.trechoId }));
    U.$('#edm', out).onclick = () => editMeasurement(m);
  }
  FC.showAnalysis = showAnalysis;

  function historySummary(a, b) {
    const d = C.diffMeasurements(a, b);
    return `<div class="kv"><div><span class="k">Δ distância</span><span class="v num">${d.dDist != null ? U.m(d.dDist, 1) : '—'}</span></div><div><span class="k">Δ perda</span><span class="v num ${d.piora ? 'bad-text' : ''}">${d.dLoss != null ? (d.dLoss > 0 ? '+' : '') + U.db(d.dLoss, 3) : '—'}</span></div><div><span class="k">Eventos novos</span><span class="v">${d.novos.length}</span></div><div><span class="k">Eventos que sumiram</span><span class="v">${d.sumidos.length}</span></div></div>${d.piora ? `<div class="note bad">${ui.icon('alert')}<div>Piora significativa da perda (limite ${store.state.settings.history.lossWorsenDb} dB).</div></div>` : ''}${!d.sameWl ? `<div class="note warn">${ui.icon('alert')}<div>Comprimentos de onda diferentes (${a.wavelength} × ${b.wavelength} nm): a comparação de perda não é direta.</div></div>` : ''}`;
  }
  FC.historySummary = historySummary;

  function editMeasurement(m) {
    if (!store.require('medicao.importar')) return;
    ui.modal({
      title: 'Corrigir dados da medição', body: `<p class="small muted">A alteração fica registrada na auditoria com os valores anteriores.</p><form class="form-grid" id="emf">
        ${ui.field('Comprimento total (m)', ui.input('lengthM', m.lengthM, 'type="number" step="any"'))}${ui.field('Comprimento de onda (nm)', ui.input('wavelength', m.wavelength, 'type="number"'))}
        ${ui.field('Atenuação total (dB)', ui.input('totalLoss', m.totalLoss, 'type="number" step="any"'))}${ui.field('ORL (dB)', ui.input('orl', m.orl, 'type="number" step="any"'))}
        ${ui.field('Bobina de lançamento (m)', ui.input('launchM', m.launchM, 'type="number" step="any"'))}${ui.field('Bobina de recepção (m)', ui.input('receiveM', m.receiveM, 'type="number" step="any"'))}
        ${ui.field('Observações', `<textarea name="obs">${U.esc(m.obs || '')}</textarea>`, '', 'full')}</form>`,
      actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Salvar', cls: 'primary', onClick: (b) => {
        const f = ui.formData(U.$('#emf', b)); const before = { lengthM: m.lengthM, wavelength: m.wavelength, totalLoss: m.totalLoss, orl: m.orl, launchM: m.launchM, receiveM: m.receiveM };
        ['lengthM', 'wavelength', 'totalLoss', 'orl', 'launchM', 'receiveM'].forEach(k => { m[k] = f[k] === '' ? null : U.parseNum(f[k]); if (before[k] !== m[k] && !(m.manualFields || []).includes(k)) (m.manualFields = m.manualFields || []).push(k); });
        if (before.totalLoss !== m.totalLoss) m.totalLossOrigin = 'manual';
        m.obs = f.obs; store.upsert('measurements', m, 'Correção manual: ' + JSON.stringify(before)); FC.rerender();
      } }]
    });
  }

  /* ---------- Importação em lote ---------- */
  let batch = [];
  function renderBatch(box) {
    box.innerHTML = `<section class="panel"><div class="dz" id="bdz">${ui.icon('layers')}<b>Importação em lote</b><span class="small muted">Selecione vários arquivos OTDR ou uma pasta inteira (a 1ª pasta vira o projeto). Planilhas CSV/XLSX com resultados também são aceitas.</span>
      <div class="btn-row"><button class="btn primary" id="bfiles">Selecionar arquivos</button><button class="btn" id="bdir">${ui.icon('folder')}Selecionar pasta</button>${batch.length ? '<button class="btn ghost" id="bclr">Limpar lista</button>' : ''}</div></div></section>
      <section class="panel" id="bres" ${batch.length ? '' : 'hidden'}></section>`;
    ui.dropzone(U.$('#bdz', box), batchAdd);
    U.$('#bfiles', box).onclick = async () => batchAdd(await ui.pickFiles({ multiple: true, accept: I.accept }));
    U.$('#bdir', box).onclick = async () => batchAdd(await ui.pickFiles({ directory: true }));
    const c = U.$('#bclr', box); c && (c.onclick = () => { batch = []; renderBatch(box); });
    if (batch.length) drawBatch();
  }
  async function batchAdd(files) {
    if (!files.length || !store.require('medicao.importar')) return;
    const res = U.$('#bres'); if (res) { res.hidden = false; res.innerHTML = `<p class="muted">Processando ${files.length} arquivo(s)…</p><div class="meter"><i id="bprog" style="width:0"></i></div>`; }
    const known = new Map(store.state.measurements.filter(m => m.fileHash).map(m => [m.fileHash, m]));
    let i = 0;
    for (const f of files) {
      i++; const g = U.$('#bprog'); if (g) g.style.width = (i / files.length * 100) + '%';
      const kind = I.kindOf(f.name);
      const row = { id: U.uid('b'), file: f, name: f.name, rel: f.webkitRelativePath || '', kind, status: 'ok', msg: '', sel: true };
      if (!kind) { if (f.webkitRelativePath) continue; row.status = 'erro'; row.msg = 'Formato não suportado'; row.sel = false; batch.push(row); continue; }
      try {
        const buf = await U.readAsArrayBuffer(f); row.buf = buf; row.hash = await U.sha256(buf);
        if (known.has(row.hash)) { row.status = 'duplicado'; row.msg = 'Já importado em ' + U.date(known.get(row.hash).importedAt); row.sel = false; }
        else if (batch.some(b => b.hash === row.hash)) { row.status = 'duplicado'; row.msg = 'Repetido neste lote'; row.sel = false; }
        if (kind === 'CSV' || kind === 'XLSX') { await sheetRows(f, buf); continue; }
        const rs = kind === 'SOR' ? await I.readSOR(f, buf) : kind === 'PDF' ? await I.readPDF(f, buf) : await I.readImage(f);
        rs.forEach((r, k) => {
          const rr = k ? Object.assign({}, row, { id: U.uid('b'), name: f.name + ' #' + (k + 1) }) : row;
          rr.res = r; rr.derived = I.derive({ gen: r.draft.gen || {}, fileName: f.name, relPath: rr.rel, text: r.text || '' });
          const tg = FC.matchTarget(rr.derived); rr.linkId = tg.link ? tg.link.id : ''; rr.trechoId = tg.trecho ? tg.trecho.id : ''; rr.newTrecho = rr.derived.trecho || '';
          if (!r.ok && rr.status === 'ok') { rr.status = 'parcial'; rr.msg = 'Faltando: ' + r.missing.join(', '); }
          batch.push(rr);
        });
        if (!rs.length) { row.status = 'erro'; row.msg = 'Sem traços'; batch.push(row); }
      } catch (e) { row.status = 'erro'; row.msg = e.message; row.sel = false; batch.push(row); }
    }
    drawBatch();
  }
  /** Planilha de resultados: cada linha vira uma medição tabular */
  async function sheetRows(f, buf) {
    const sheets = await I.readSheet(f, buf);
    sheets.forEach(sh => {
      const map = I.guessColumns(sh.headers, I.specOTDR);
      sh.rows.forEach((r, i) => {
        const len = map.otdr ? I.toMeters(r[map.otdr], map.otdr) : null;
        const loss = map.perda ? U.parseNum(r[map.perda]) : null;
        const draft = { source: f.name.endsWith('.csv') ? 'CSV' : 'XLSX', lengthM: len, totalLoss: loss != null ? Math.abs(loss) : null, totalLossOrigin: loss != null ? 'arquivo' : null, wavelength: map.lambda ? U.parseNum(r[map.lambda]) : null, orl: map.orl ? U.parseNum(r[map.orl]) : null, events: [], gen: { cableId: map.cabo ? r[map.cabo] : '' } };
        const missing = []; if (len == null) missing.push('Comprimento'); if (draft.totalLoss == null) missing.push('Perda'); if (!draft.wavelength) missing.push('λ');
        const res = { kind: draft.source, ok: len != null || draft.totalLoss != null, draft, extracted: ['Linha ' + (i + 2) + ' de ' + sh.name], missing, warnings: [] };
        const enl = map.enlace ? String(r[map.enlace]).trim() : '', tr = map.trecho ? String(r[map.trecho]).trim() : '';
        const derived = I.derive({ gen: {}, fileName: enl || f.name, relPath: '' }); if (enl) { derived.nome = enl; const pp = enl.split(/\s+x\s+/i); if (pp.length === 2) { derived.popA = pp[0]; derived.popB = pp[1]; } }
        derived.trecho = tr || derived.trecho;
        const tg = FC.matchTarget(derived);
        const oz = map.ozmap ? I.toMeters(r[map.ozmap], map.ozmap) : null;
        batch.push({ id: U.uid('b'), name: `${f.name} › ${sh.name} › linha ${i + 2}`, kind: draft.source, status: res.ok ? 'ok' : 'erro', msg: res.ok ? '' : 'Linha sem comprimento/perda', sel: res.ok, res, derived, linkId: tg.link ? tg.link.id : '', trechoId: tg.trecho ? tg.trecho.id : '', newTrecho: derived.trecho || '', ozFromSheet: oz, hash: null });
      });
    });
  }
  function batchMetrics(r) {
    const t = r.trechoId ? store.get('trechos', r.trechoId) : null;
    const oz = t && t.ozmapM ? +t.ozmapM : r.ozFromSheet || null;
    const L = r.res ? r.res.draft.lengthM : null;
    const fake = Object.assign({}, t || { tipo: 'Aéreo' }, { ozmapM: oz, id: '__b' });
    const c = L != null && oz ? C.compare(fake, { lengthM: L }) : null;
    return { oz, L, diffM: c ? c.diffM : null, diffPct: c ? c.diffPct : null, st: c ? c.status : 'sem-dados', loss: r.res ? r.res.draft.totalLoss : null };
  }
  function drawBatch() {
    const box = U.$('#bres'); if (!box) return; box.hidden = false;
    const links = store.state.links;
    const counts = { ok: 0, parcial: 0, duplicado: 0, erro: 0 }; batch.forEach(b => counts[b.status] = (counts[b.status] || 0) + 1);
    box.innerHTML = `<header><div><h3>Resultados do lote</h3><span class="sub">${batch.length} item(ns) · ${counts.ok} ok · ${counts.parcial || 0} parciais · ${counts.duplicado || 0} duplicados · ${counts.erro || 0} com erro</span></div>
      <div class="btn-row"><button class="btn" id="bx">${ui.icon('download')}Exportar XLSX</button><button class="btn" id="bp">${ui.icon('download')}Exportar PDF</button><button class="btn primary" id="bs">${ui.icon('check')}Salvar selecionados</button></div></header>
      <div class="table-scroll"><table class="tbl"><thead><tr><th><input type="checkbox" id="ball" aria-label="Selecionar todos" checked></th><th>Arquivo</th><th>Enlace</th><th>Trecho</th><th class="num">OTDR</th><th class="num">OZmap</th><th class="num">Diferença</th><th class="num">Perda</th><th>Status</th><th>Importação</th></tr></thead><tbody>
      ${batch.map(r => { const mt = batchMetrics(r); const ts = store.state.trechos.filter(t => t.linkId === r.linkId); return `<tr data-b="${r.id}" class="${r.status === 'erro' ? 'row-bad' : r.status === 'duplicado' ? 'row-warn' : ''}">
        <td><input type="checkbox" data-f="sel" ${r.sel ? 'checked' : ''} ${r.res ? '' : 'disabled'} aria-label="Selecionar"></td>
        <td><b class="small">${U.esc(r.name)}</b><br><span class="tiny muted">${U.esc(r.kind || '')}${r.rel ? ' · ' + U.esc(r.rel) : ''}</span></td>
        <td>${r.res ? `<select data-f="linkId" style="min-width:180px"><option value="">+ Novo: ${U.esc(r.derived.nome)}</option>${links.map(l => `<option value="${l.id}" ${l.id === r.linkId ? 'selected' : ''}>${U.esc(l.nome)}</option>`).join('')}</select>` : '—'}</td>
        <td>${r.res ? `<select data-f="trechoId" style="min-width:110px"><option value="">+ Novo ${U.esc(r.newTrecho || '')}</option>${ts.map(t => `<option value="${t.id}" ${t.id === r.trechoId ? 'selected' : ''}>${U.esc(t.nome)}</option>`).join('')}</select>` : '—'}</td>
        <td class="num">${U.m(mt.L, 1)}</td><td class="num">${U.m(mt.oz, 0)}</td><td class="num">${mt.diffPct != null ? U.pct(mt.diffPct) + '<br><span class="tiny muted">' + U.m(mt.diffM, 0) + '</span>' : '—'}</td><td class="num">${U.db(mt.loss)}</td>
        <td>${ui.badge(mt.st)}</td><td>${ui.badge(r.status === 'ok' ? 'verde' : r.status === 'parcial' ? 'amarelo' : 'vermelho', { ok: 'OK', parcial: 'Parcial', duplicado: 'Duplicado', erro: 'Erro' }[r.status])}${r.msg ? `<br><span class="tiny muted">${U.esc(r.msg)}</span>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>`;
    box.onchange = (e) => {
      const tr = e.target.closest('[data-b]'); if (e.target.id === 'ball') { batch.forEach(b => { if (b.res) b.sel = e.target.checked; }); return drawBatch(); }
      if (!tr) return; const r = batch.find(b => b.id === tr.dataset.b), f = e.target.dataset.f;
      if (f === 'sel') r.sel = e.target.checked; else { r[f] = e.target.value; if (f === 'linkId') r.trechoId = ''; drawBatch(); }
    };
    const rowsOut = () => batch.filter(b => b.res).map(r => { const mt = batchMetrics(r); const l = store.get('links', r.linkId); const t = store.get('trechos', r.trechoId); return { Enlace: l ? l.nome : r.derived.nome, Trecho: t ? t.nome : (r.newTrecho || 'novo'), OTDR: mt.L != null ? +mt.L.toFixed(1) : '', OZmap: mt.oz != null ? +(+mt.oz).toFixed(1) : '', Diferença: mt.diffM != null ? `${mt.diffM.toFixed(1)} m (${mt.diffPct.toFixed(2)}%)` : '', Perda: mt.loss != null ? +(+mt.loss).toFixed(3) : '', Status: { verde: 'Dentro da tolerância', amarelo: 'Atenção', vermelho: 'Fora da tolerância', 'sem-dados': 'Sem dados' }[mt.st], Arquivo: r.name, Importação: r.status }; });
    U.$('#bx', box).onclick = () => FC.reports.exportRows(rowsOut(), 'importacao-lote', 'xlsx', 'Importação em lote OTDR');
    U.$('#bp', box).onclick = () => FC.reports.exportRows(rowsOut(), 'importacao-lote', 'pdf', 'Importação em lote OTDR — consolidado');
    U.$('#bs', box).onclick = async () => {
      const sel = batch.filter(b => b.sel && b.res);
      if (!sel.length) return ui.toast('Nenhum item selecionado.', 'warn');
      let n = 0;
      const created = {};
      for (const r of sel) {
        const key = U.norm(r.derived.nome);
        const linkId = r.linkId || created[key] || '';
        const m = await FC.saveMeasurement({ res: r.res, derived: r.derived, buf: r.buf, file: r.file, fileName: r.file ? r.file.name : r.name, hash: r.hash, linkId, trechoId: r.trechoId, newTrechoName: r.newTrecho, relPath: r.rel });
        if (!r.linkId) created[key] = m.linkId;
        if (r.ozFromSheet) { const t = store.get('trechos', m.trechoId); if (t && !t.ozmapM) { t.ozmapM = r.ozFromSheet; store.upsert('trechos', t); } }
        r.status = 'salvo'; n++;
      }
      store.audit('importou', 'measurements', null, `Importação em lote: ${n} teste(s)`);
      batch = batch.filter(b => !b.sel || !b.res);
      ui.toast(`${n} medição(ões) salvas e comparadas com o OZmap.`, 'ok');
      FC.go('comparativo');
    };
  }
  FC.batchAdd = batchAdd;

  /* ---------- Orçamento de perda ---------- */
  function renderBudget(box, params) {
    const S = store.state.settings.budget;
    const wls = Object.keys(S.wavelengths);
    box.innerHTML = `<section class="grid g2"><div class="panel"><header><h3>Calculadora de link budget</h3><span class="sub">Parâmetros editáveis em Configurações</span></header>
      <div class="field"><span class="lbl">Carregar de um trecho medido</span><select id="bt"><option value="">— Manual —</option>${store.state.trechos.filter(t => C.latest(t.id)).map(t => `<option value="${t.id}" ${params.trechoId === t.id ? 'selected' : ''}>${U.esc((store.get('links', t.linkId) || {}).nome)} / ${U.esc(t.nome)}</option>`).join('')}</select></div>
      <form class="form-grid" id="bf">
        ${ui.field('Distância total (km)', ui.input('dist', '10', 'type="number" step="any" min="0"'))}
        ${ui.field('Comprimento de onda', ui.select('wl', wls.map(w => [w, w + ' nm']), '1550'))}
        ${ui.field('Atenuação (dB/km)', ui.input('att', S.wavelengths[1550].att, 'type="number" step="0.001"'), 'Padrão do λ, editável aqui')}
        ${ui.field('Quantidade de emendas', ui.input('ns', 4, 'type="number" min="0"'))}
        ${ui.field('Perda média por emenda (dB)', ui.input('ps', S.splice, 'type="number" step="0.01"'))}
        ${ui.field('Quantidade de conectores', ui.input('nc', 2, 'type="number" min="0"'))}
        ${ui.field('Perda média por conector (dB)', ui.input('pc', S.connector, 'type="number" step="0.01"'))}
        ${ui.field('Perdas adicionais (dB)', ui.input('ex', 0, 'type="number" step="0.01"'))}
        <div class="field full"><span class="lbl">Componentes ópticos cadastrados</span><div class="chips">${S.components.map(c => `<label class="check tag"><input type="checkbox" name="c_${c.id}"> ${U.esc(c.nome)} (${U.db(c.perda)})</label>`).join('') || '<span class="muted small">Nenhum</span>'}</div></div>
        ${ui.field('Perda medida pelo OTDR (dB)', ui.input('med', '', 'type="number" step="any" placeholder="opcional"'))}
      </form></div>
      <div class="panel"><header><h3>Resultado</h3></header><div id="bout"></div></div></section>`;
    const f = U.$('#bf', box);
    const calc = () => {
      const v = ui.formData(f);
      const comp = U.sum(S.components.filter(c => v['c_' + c.id]), c => c.perda);
      const p = C.predictedLoss({ distM: U.parseNum(v.dist) * 1000, wavelength: +v.wl, splices: +v.ns, connectors: +v.nc, extra: (U.parseNum(v.ex) || 0) + comp, att: U.parseNum(v.att), spliceLoss: U.parseNum(v.ps), connLoss: U.parseNum(v.pc) });
      const med = U.parseNum(v.med);
      const diff = med != null && p ? med - p.total : null;
      const margin = med != null ? S.systemBudget - med - S.safetyMargin : p ? S.systemBudget - p.total - S.safetyMargin : null;
      const st = diff == null ? 'sem-dados' : diff <= 0 ? 'ok' : diff <= S.toleranceDb ? 'atencao' : 'reprovado';
      U.$('#bout', box).innerHTML = p ? `<div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <div class="kpi accent"><span class="l">Perda prevista</span><span class="v">${U.db(p.total)}</span></div>
        <div class="kpi"><span class="l">Perda medida</span><span class="v">${U.db(med)}</span></div>
        <div class="kpi ${diff > S.toleranceDb ? 'bad' : diff > 0 ? 'warn' : diff != null ? 'ok' : ''}"><span class="l">Diferença</span><span class="v">${diff != null ? (diff > 0 ? '+' : '') + U.db(diff) : '—'}</span></div>
        <div class="kpi ${margin < 0 ? 'bad' : margin < 2 ? 'warn' : 'ok'}"><span class="l">Margem disponível</span><span class="v">${U.db(margin)}</span><span class="s">orçamento ${U.db(S.systemBudget)} − ${med != null ? 'medido' : 'previsto'} − segurança ${U.db(S.safetyMargin)}</span></div></div>
        <div class="result-hero ${st === 'sem-dados' ? 'insuficiente' : st}"><div class="ring ${st === 'sem-dados' ? 'insuficiente' : st}">${ui.icon(st === 'ok' ? 'check' : st === 'sem-dados' ? 'calc' : 'alert')}</div><div><div class="big">${st === 'sem-dados' ? 'Informe a perda medida' : st === 'ok' ? 'Dentro do previsto' : st === 'atencao' ? 'Acima do previsto (tolerância)' : 'Reprovado: acima do previsto'}</div><p class="small">Tolerância configurada: ${U.db(S.toleranceDb)} acima do previsto.</p></div></div>
        <h4>Memória de cálculo</h4><div class="table-scroll"><table class="tbl"><tbody>
        <tr><td>Fibra</td><td class="num">${U.num(U.parseNum(v.dist), 3)} km × ${U.num(p.att, 3)} dB/km</td><td class="num">${U.db(p.fiber, 3)}</td></tr>
        <tr><td>Emendas</td><td class="num">${v.ns} × ${U.db(p.spliceLoss)}</td><td class="num">${U.db(p.splices, 3)}</td></tr>
        <tr><td>Conectores</td><td class="num">${v.nc} × ${U.db(p.connLoss)}</td><td class="num">${U.db(p.connectors, 3)}</td></tr>
        <tr><td>Adicionais + componentes</td><td></td><td class="num">${U.db(p.extra, 3)}</td></tr>
        <tr><td><b>Perda prevista</b></td><td></td><td class="num"><b>${U.db(p.total, 3)}</b></td></tr></tbody></table></div>` : '<p class="muted">Preencha distância e atenuação.</p>';
    };
    f.addEventListener('input', calc);
    U.$('#wl', f).onchange = () => { U.$('#att', f).value = S.wavelengths[U.$('#wl', f).value].att; calc(); };
    const bt = U.$('#bt', box);
    const loadT = () => {
      const t = store.get('trechos', bt.value); if (!t) return calc();
      const m = C.latest(t.id);
      U.$('#dist', f).value = ((C.otdrNet(m) || t.ozmapM || 0) / 1000).toFixed(3);
      if (m.wavelength && S.wavelengths[Math.round(m.wavelength)]) { U.$('#wl', f).value = Math.round(m.wavelength); U.$('#att', f).value = S.wavelengths[Math.round(m.wavelength)].att; }
      U.$('#ns', f).value = t.emendas || 0; U.$('#nc', f).value = t.conectores || 0; U.$('#ex', f).value = t.perdaAdicional || 0; U.$('#med', f).value = m.totalLoss != null ? m.totalLoss : '';
      S.components.forEach(c => { const cb = f.querySelector(`[name="c_${c.id}"]`); if (cb) cb.checked = (t.componentes || []).includes(c.id); });
      calc();
    };
    bt.onchange = loadT; bt.value ? loadT() : calc();
  }

  /* ---------- Lista de medições ---------- */
  function renderList(box) {
    box.innerHTML = `<section class="panel">${FC.filt.html('m')}</section><section class="panel" id="ml"></section>`;
    FC.filt.bind(box, 'm', (r) => r ? FC.rerender() : draw());
    const draw = () => ui.table(U.$('#ml', box), {
      rows: FC.filt.measurements(), sortKey: 'data', onRow: m => FC.go('otdr', { measurementId: m.id }),
      columns: [
        { key: 'data', label: 'Data', render: m => U.dt(m.data) },
        { key: 'enl', label: 'Enlace / trecho', sort: m => (store.get('links', m.linkId) || {}).nome, render: m => `${U.esc((store.get('links', m.linkId) || {}).nome || '—')} / <b>${U.esc((store.get('trechos', m.trechoId) || {}).nome || '—')}</b>${ui.demo(m)}` },
        { key: 'fileName', label: 'Arquivo', render: m => `<span class="small">${U.esc(m.fileName || '—')}</span>` }, { key: 'source', label: 'Origem' },
        { key: 'wavelength', label: 'λ', num: true }, { key: 'lengthM', label: 'Comprimento', num: true, render: m => U.m(C.otdrNet(m), 1) },
        { key: 'totalLoss', label: 'Perda', num: true, render: m => U.db(m.totalLoss) },
        { key: 'res', label: 'Resultado', sort: m => C.analyze(m, store.get('trechos', m.trechoId)).result, render: m => ui.badge(C.analyze(m, store.get('trechos', m.trechoId)).result) },
        { key: 'responsavel', label: 'Responsável' }
      ]
    });
    draw();
  }

  FC.registerModule({ id: 'otdr', order: 3, title: 'Análise OTDR', icon: 'otdr', group: 'main', field: true, render });
})(window.FC = window.FC || {});
