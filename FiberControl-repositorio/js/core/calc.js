/* ClickIP FiberControl — motor de cálculos técnicos (funções puras, testáveis) */
(function (FC) {
  'use strict';
  const C = FC.calc = {};
  const S = () => FC.store.state.settings;
  const U = FC.util;

  /* ---------------- Medições ---------------- */
  C.measurementsOf = (trechoId) => FC.store.state.measurements.filter(m => m.trechoId === trechoId).sort((a, b) => (a.data || '').localeCompare(b.data || '') || (a.importedAt || '').localeCompare(b.importedAt || ''));
  C.latest = (trechoId) => { const l = C.measurementsOf(trechoId); return l[l.length - 1] || null; };
  /** Distância líquida da fibra sob teste (desconta bobinas de lançamento/recepção quando informadas) */
  C.otdrNet = (m) => m && m.lengthM != null ? m.lengthM - (+m.launchM || 0) - (+m.receiveM || 0) : null;

  /* ---------------- Tolerâncias OTDR × OZmap ---------------- */
  C.tolFor = (trecho, link) => {
    const t = S().tolerance;
    if (t.allowPerLink && link && link.tolCustom && link.tolCustom.max != null) return { max: +link.tolCustom.max, attention: +link.tolCustom.attention, source: 'Individual do enlace' };
    if (trecho && t.byType[trecho.tipo]) return { max: +t.byType[trecho.tipo].max, attention: +t.byType[trecho.tipo].attention, source: 'Tipo: ' + trecho.tipo };
    return { max: +t.max, attention: +t.attention, source: 'Global' };
  };

  C.classify = (pct, tol) => {
    if (pct == null || isNaN(pct)) return 'sem-dados';
    const a = Math.abs(pct);
    if (a > tol.max) return 'vermelho';
    if (a > tol.max - tol.attention) return 'amarelo';
    return 'verde';
  };

  /** Comparativo de um trecho com sua medição (padrão: última medição) */
  C.compare = (trecho, meas) => {
    const link = FC.store.get('links', trecho.linkId);
    const m = meas === undefined ? C.latest(trecho.id) : meas;
    const tol = C.tolFor(trecho, link);
    const oz = trecho.ozmapM != null && trecho.ozmapM !== '' ? +trecho.ozmapM : null;
    const otdr = C.otdrNet(m);
    const fac = S().tolerance.useApprovedFactor && S().correction.approved[trecho.tipo] ? S().correction.approved[trecho.tipo].factor : 1;
    const base = oz != null ? oz * fac : null;
    if (oz == null || otdr == null || !oz) return { otdr, ozmap: oz, base, factor: fac, diffM: null, diffPct: null, status: 'sem-dados', tol, m };
    const diffM = otdr - base;
    const diffPct = diffM / base * 100;
    return { otdr, ozmap: oz, base, factor: fac, diffM, diffPct, status: C.classify(diffPct, tol), tol, m };
  };

  /* ---------------- Orçamento de perda (link budget) ---------------- */
  C.attFor = (wl) => { const w = S().budget.wavelengths[Math.round(wl)]; return w ? +w.att : null; };
  /** Perda prevista = (Distância × Atenuação/km) + (Emendas × Perda/emenda) + (Conectores × Perda/conector) + Perdas adicionais */
  C.predictedLoss = ({ distM, wavelength, splices = 0, connectors = 0, extra = 0, att = null, spliceLoss = null, connLoss = null }) => {
    const b = S().budget;
    const a = att != null ? +att : C.attFor(wavelength);
    if (distM == null || a == null) return null;
    const sl = spliceLoss != null ? +spliceLoss : +b.splice, cl = connLoss != null ? +connLoss : +b.connector;
    const fiber = distM / 1000 * a, sp = (+splices || 0) * sl, cn = (+connectors || 0) * cl;
    return { att: a, spliceLoss: sl, connLoss: cl, fiber, splices: sp, connectors: cn, extra: +extra || 0, total: fiber + sp + cn + (+extra || 0) };
  };
  C.componentsLoss = (ids) => U.sum(S().budget.components.filter(c => (ids || []).includes(c.id)), c => c.perda);

  C.budget = (trecho, meas) => {
    const m = meas === undefined ? C.latest(trecho.id) : meas;
    const wl = m && m.wavelength ? m.wavelength : (trecho.wavelength || 1550);
    const dist = C.otdrNet(m) != null ? C.otdrNet(m) : (trecho.ozmapM != null ? +trecho.ozmapM : null);
    const pred = C.predictedLoss({ distM: dist, wavelength: wl, splices: trecho.emendas, connectors: trecho.conectores, extra: C.componentsLoss(trecho.componentes) + (+trecho.perdaAdicional || 0) });
    const b = S().budget;
    const measured = m && m.totalLoss != null ? +m.totalLoss : null;
    if (!pred || measured == null) return { pred, measured, wl, diff: null, margin: measured != null ? b.systemBudget - measured - b.safetyMargin : null, status: 'sem-dados' };
    const diff = measured - pred.total;
    const status = diff <= 0 ? 'ok' : diff <= b.toleranceDb ? 'atencao' : 'acima';
    return { pred, measured, wl, diff, margin: b.systemBudget - measured - b.safetyMargin, status };
  };

  /* ---------------- Análise OTDR ---------------- */
  C.eventKind = (e, i, events) => {
    if (e.end) return { tipo: 'Fim de fibra', cls: 'end' };
    if (e.loss < 0) return { tipo: 'Ganho aparente', cls: 'gain' };
    if (e.kind === 'refletivo' || e.kind === 'refletivo-saturado') return i === 0 ? { tipo: 'Conector de lançamento', cls: 'conn' } : { tipo: 'Conector / evento refletivo', cls: 'conn' };
    return { tipo: 'Emenda / evento não refletivo', cls: 'splice' };
  };

  /** Classifica um teste OTDR. Retorna 'insuficiente' quando faltam dados — nunca inventa resultado. */
  C.analyze = (m, trecho) => {
    const T = S().otdr;
    const out = { analyzed: [], missing: [], issues: [], events: [], result: 'insuficiente' };
    if (!m) { out.missing.push('Medição'); return out; }
    const sev = { excelente: 0, ok: 1, atencao: 2, reprovado: 3 };
    let worst = 0;
    const flag = (level, msg, ev) => { worst = Math.max(worst, sev[level]); if (level !== 'excelente' && level !== 'ok') out.issues.push({ level, msg, ev }); };
    const L = C.otdrNet(m);
    if (L != null) out.analyzed.push('Comprimento total'); else out.missing.push('Comprimento total');
    if (m.wavelength) out.analyzed.push('Comprimento de onda'); else out.missing.push('Comprimento de onda');
    if (m.totalLoss != null) out.analyzed.push('Atenuação total' + (m.totalLossOrigin === 'calculado' ? ' (calculada)' : '')); else out.missing.push('Atenuação total');
    if (m.orl) out.analyzed.push('ORL'); else out.missing.push('ORL');
    const evs = m.events || [];
    if (evs.length) out.analyzed.push('Eventos (' + evs.length + ')'); else out.missing.push('Lista de eventos');

    evs.forEach((e, i) => {
      const k = C.eventKind(e, i, evs);
      const prev = evs[i - 1];
      const row = Object.assign({}, e, k, { gapM: prev ? e.distM - prev.distM : null, level: 'ok', note: '' });
      if (k.cls === 'splice') {
        row.level = e.loss <= T.splice.excelente ? 'excelente' : e.loss <= T.splice.ok ? 'ok' : e.loss <= T.splice.atencao ? 'atencao' : 'reprovado';
        if (row.level === 'atencao') row.note = 'Perda de emenda elevada — verificar fusão ou possível curvatura';
        if (row.level === 'reprovado') row.note = 'Perda acima do limite — refazer fusão / investigar macrocurvatura';
      } else if (k.cls === 'conn' && i > 0) {
        row.level = e.loss <= T.connector.excelente ? 'excelente' : e.loss <= T.connector.ok ? 'ok' : e.loss <= T.connector.atencao ? 'atencao' : 'reprovado';
        if (e.reflectance != null && e.reflectance !== 0) {
          if (e.reflectance > T.reflectance.atencao) { row.level = 'reprovado'; row.note = 'Refletância alta — conector sujo/danificado ou trinca'; }
          else if (e.reflectance > T.reflectance.ok && sev[row.level] < 2) { row.level = 'atencao'; row.note = 'Refletância acima do recomendado — limpar e inspecionar conector'; }
        }
        if (!row.note && row.level === 'reprovado') row.note = 'Perda de conector acima do limite';
      } else if (k.cls === 'gain') {
        row.level = e.loss < T.gainWarn ? 'atencao' : 'ok';
        if (row.level === 'atencao') row.note = 'Ganho aparente (diferença de diâmetro de campo modal) — medir nos dois sentidos e usar a média';
      } else if (k.cls === 'end') {
        row.note = 'Final de fibra';
        if (trecho && trecho.ozmapM && L != null && L < trecho.ozmapM * (1 - T.endBeforeOzmapPct / 100)) {
          row.level = 'reprovado'; row.note = 'Fim de fibra antes do previsto no OZmap — possível rompimento';
        }
      }
      if (row.level !== 'excelente' && row.level !== 'ok') flag(row.level, `Evento ${e.n} a ${U.m(e.distM)}: ${row.note || row.tipo}`, e.n);
      else worst = Math.max(worst, i > 0 && k.cls !== 'end' ? sev[row.level] : 0);
      out.events.push(row);
    });
    const emendas = out.events.filter(e => e.cls === 'splice'), conns = out.events.filter(e => e.cls === 'conn');
    out.spliceLoss = U.sum(emendas, e => Math.max(0, e.loss));
    out.connLoss = U.sum(conns.slice(1), e => Math.max(0, e.loss));
    out.reflective = out.events.filter(e => e.kind && e.kind.startsWith('refletivo')).length;
    out.nonReflective = out.events.filter(e => e.kind === 'nao-refletivo').length;

    if (m.orl) {
      const lv = m.orl >= T.orl.ok ? 'ok' : m.orl >= T.orl.atencao ? 'atencao' : 'reprovado';
      if (lv !== 'ok') flag(lv, `ORL de ${U.db(m.orl)} abaixo do recomendado (${T.orl.ok} dB)`);
    }
    if (trecho) {
      const bud = C.budget(trecho, m);
      out.budget = bud;
      if (bud.status !== 'sem-dados') {
        out.analyzed.push('Orçamento de perda');
        if (bud.status === 'atencao') flag('atencao', `Perda medida ${U.db(bud.measured)} acima do previsto (${U.db(bud.pred.total)}) dentro da tolerância`);
        if (bud.status === 'acima') flag('reprovado', `Perda medida ${U.db(bud.measured)} excede o previsto (${U.db(bud.pred.total)}) em ${U.db(bud.diff)}`);
        if (bud.status === 'ok' && bud.diff <= -0.15 * bud.pred.total && worst <= 1) worst = Math.min(worst, 0);
      }
      const cmp = C.compare(trecho, m);
      out.compare = cmp;
      if (cmp.status !== 'sem-dados') {
        out.analyzed.push('Comparativo OZmap');
        if (cmp.status === 'amarelo') flag('atencao', `Diferença de ${U.pct(cmp.diffPct)} em relação ao OZmap (faixa de atenção)`);
        if (cmp.status === 'vermelho') flag('reprovado', `Diferença de ${U.pct(cmp.diffPct)} em relação ao OZmap (fora da tolerância de ${cmp.tol.max}%)`);
      }
      if (m.wavelength && m.totalLoss != null && L) {
        const att = C.attFor(m.wavelength);
        const perKm = m.totalLoss / (L / 1000);
        out.attPerKm = perKm;
        if (att && perKm > att * 1.25 + 0.05 && !(bud && bud.status !== 'sem-dados')) flag('atencao', `Atenuação média ${U.num(perKm, 3)} dB/km acima do esperado (${att} dB/km)`);
      }
    }
    // Mínimo para classificar: comprimento + (perda total ou eventos)
    const enough = L != null && (m.totalLoss != null || evs.length > 0);
    out.result = !enough ? 'insuficiente' : ['excelente', 'ok', 'atencao', 'reprovado'][worst];
    return out;
  };
  C.resultLabel = { excelente: 'Excelente', ok: 'Dentro dos parâmetros', atencao: 'Atenção', reprovado: 'Reprovado', insuficiente: 'Dados insuficientes' };

  /* ---------------- Fator de correção ---------------- */
  C.correctionStats = (filterFn = () => true) => {
    const rows = [];
    FC.store.state.trechos.filter(filterFn).forEach(t => {
      const m = C.latest(t.id); const L = C.otdrNet(m);
      if (L && t.ozmapM > 0) rows.push({ t, ratio: L / t.ozmapM, otdr: L });
    });
    const by = U.groupBy(rows, r => r.t.tipo || 'Sem tipo');
    return Object.entries(by).map(([tipo, rs]) => {
      const ratios = rs.map(r => r.ratio);
      const mean = U.avg(ratios), sd = U.stdev(ratios);
      const kept = rs.length >= 4 ? ratios.filter(x => Math.abs(x - mean) <= 2 * sd) : ratios; // remove valores atípicos (> 2σ)
      const factor = U.avg(kept);
      return { tipo, samples: rs.length, used: kept.length, outliers: rs.length - kept.length, mean, median: U.median(ratios), sd, factor, sobraPct: (factor - 1) * 100, rows: rs };
    }).sort((a, b) => a.tipo.localeCompare(b.tipo));
  };
  /** Estimativa do comprimento físico a partir do traçado e dos elementos de campo */
  C.estimatePhysical = ({ ozmapM, reservas = 0, reservaM = 0, subidas = 0, subidaM = 0, curvasPct = 0, desvioPct = 0, eflPct = 0 }) => {
    if (!ozmapM) return null;
    const base = +ozmapM;
    const curvas = base * curvasPct / 100, desvios = base * desvioPct / 100;
    const res = reservas * reservaM, sub = subidas * subidaM;
    const cable = base + curvas + desvios + res + sub;
    const fiber = cable * (1 + eflPct / 100);
    return { base, curvas, desvios, reservas: res, subidas: sub, cable, efl: fiber - cable, fiber, factor: fiber / base };
  };

  /* ---------------- Capacidade / entronques ---------------- */
  C.capacity = (t) => {
    const min = +S().fibers.min;
    const ref = +S().fibers.reference;
    const rest = t.fibrasRestantes == null || t.fibrasRestantes === '' ? null : +t.fibrasRestantes;
    const status = rest == null ? 'sem-dados' : rest <= 0 ? 'vermelho' : rest <= min ? 'amarelo' : 'verde';
    return { rest, status, total: t.caboFO || null, semRef: t.caboFO != null && +t.caboFO !== ref, usoPct: t.caboFO && rest != null ? (1 - rest / t.caboFO) * 100 : null };
  };
  C.entronques = () => {
    const out = [];
    const st = FC.store.state;
    st.trechos.forEach(t => {
      const link = FC.store.get('links', t.linkId);
      if (t.caboConectadoFO && t.caboFO && +t.caboConectadoFO < +t.caboFO) {
        out.push({ t, link, principal: +t.caboFO, conectado: +t.caboConectadoFO, local: t.entronqueLocal || t.caixa || '', origem: 'Cadastro do trecho' });
      }
    });
    // Detecção automática: redução de capacidade entre trechos consecutivos do mesmo enlace
    st.links.forEach(l => {
      const ts = st.trechos.filter(t => t.linkId === l.id).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
      for (let i = 1; i < ts.length; i++) {
        const a = ts[i - 1], b = ts[i];
        if (a.caboFO && b.caboFO && +b.caboFO < +a.caboFO && !out.some(o => o.t.id === b.id || o.t.id === a.id)) {
          out.push({ t: b, link: l, principal: +a.caboFO, conectado: +b.caboFO, local: b.caixa || ('Entre ' + a.nome + ' e ' + b.nome), origem: 'Detectado na sequência' });
        }
      }
    });
    const min = +S().fibers.min;
    out.forEach(o => {
      const cap = C.capacity(o.t);
      o.rest = cap.rest;
      o.gargalos = [];
      o.gargalos.push(`Redução de ${o.principal}FO para ${o.conectado}FO (${Math.round((1 - o.conectado / o.principal) * 100)}% menos capacidade)`);
      if (cap.rest != null && cap.rest <= 0) o.gargalos.push('Sem fibras livres no cabo conectado');
      else if (cap.rest != null && cap.rest <= min) o.gargalos.push(`Somente ${cap.rest} fibra(s) livre(s)`);
      o.critico = cap.rest != null && cap.rest <= min;
      o.level = cap.rest != null && cap.rest <= 0 ? 'vermelho' : o.critico ? 'amarelo' : 'verde';
    });
    return out;
  };

  /* ---------------- Status e certificação ---------------- */
  C.trechoStatus = (t) => {
    if (t.certificacao && t.certificacao.status === 'certificado') return 'certificado';
    const m = C.latest(t.id);
    if (!m) return 'pendente';
    const cmp = C.compare(t, m), bud = C.budget(t, m);
    if (cmp.status === 'vermelho' || bud.status === 'acima') return 'divergente';
    return 'medido';
  };
  C.statusLabel = { pendente: 'Pendente', medido: 'Medido', divergente: 'Divergente', certificado: 'Certificado' };

  C.certRequirements = (t) => {
    const c = S().certification, m = C.latest(t.id), reqs = [];
    if (c.requireMeasurement) reqs.push({ k: 'Medição OTDR registrada', ok: !!m });
    if (c.requireAttachment) reqs.push({ k: 'Arquivo OTDR anexado (SOR ou PDF)', ok: (FC.store.state.attachments || []).some(a => a.trechoId === t.id && ['sor', 'pdf', 'msor'].includes(U.ext(a.nome))) || !!(m && m.attachmentId) });
    if (c.requireComparisonOk) { const cmp = C.compare(t, m || null); reqs.push({ k: 'Comparativo OTDR × OZmap ' + (c.allowAttention ? 'verde ou amarelo' : 'verde'), ok: cmp.status === 'verde' || (c.allowAttention && cmp.status === 'amarelo'), detail: cmp.status }); }
    if (c.requireBudgetOk) { const b = C.budget(t, m || null); reqs.push({ k: 'Perda dentro do orçamento' + (c.allowAttention ? ' (ou tolerância)' : ''), ok: b.status === 'ok' || (c.allowAttention && b.status === 'atencao'), detail: b.status }); }
    if (c.requireChecklist) { const ck = FC.store.state.checklists[t.id]; reqs.push({ k: 'Checklist de campo concluído', ok: !!(ck && ck.done) }); }
    return { reqs, ok: reqs.every(r => r.ok) };
  };

  /* ---------------- Histórico ---------------- */
  C.diffMeasurements = (a, b) => {
    const tol = +S().history.eventMatchM;
    const ea = (a.events || []).filter(e => !e.end), eb = (b.events || []).filter(e => !e.end);
    const match = (e, list) => list.find(x => Math.abs(x.distM - e.distM) <= tol);
    const novos = eb.filter(e => !match(e, ea));
    const sumidos = ea.filter(e => !match(e, eb));
    const alterados = eb.map(e => { const p = match(e, ea); return p && Math.abs((e.loss || 0) - (p.loss || 0)) >= 0.05 ? { e, p, d: e.loss - p.loss } : null; }).filter(Boolean);
    const dDist = C.otdrNet(b) != null && C.otdrNet(a) != null ? C.otdrNet(b) - C.otdrNet(a) : null;
    const dLoss = b.totalLoss != null && a.totalLoss != null ? b.totalLoss - a.totalLoss : null;
    return { dDist, dLoss, novos, sumidos, alterados, piora: dLoss != null && dLoss >= +S().history.lossWorsenDb, sameWl: a.wavelength === b.wavelength };
  };
})(window.FC = window.FC || {});
