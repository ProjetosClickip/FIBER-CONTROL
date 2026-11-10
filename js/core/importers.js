/* ClickIP FiberControl — importação de arquivos (SOR, PDF, CSV/XLSX, PNG/JPG)
 * Regra: só registra o que foi realmente lido do arquivo. O que não for extraído
 * fica listado em `missing` e o técnico preenche manualmente.
 */
(function (FC) {
  'use strict';
  const U = FC.util;
  const I = FC.importers = {};
  const LIB = {
    pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
    pdfWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
    ocr: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
    ocrWorker: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    ocrCore: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
    ocrLang: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/por@1.0.0/4.0.0_best_int'
  };
  I.accept = '.sor,.msor,.csor,.pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg';
  I.kindOf = (name) => { const e = U.ext(name); return e === 'sor' || e === 'msor' || e === 'csor' ? 'SOR' : e === 'pdf' ? 'PDF' : e === 'csv' ? 'CSV' : (e === 'xlsx' || e === 'xls') ? 'XLSX' : ['png', 'jpg', 'jpeg'].includes(e) ? 'IMG' : null; };

  /* ---------- Derivação automática dos dados do enlace a partir do teste ---------- */
  I.derive = ({ gen = {}, fileName = '', relPath = '', text = '' }) => {
    const S = FC.store.state.settings;
    const base = fileName.replace(/\.[^.]+$/, '');
    const hay = [gen.cableId, gen.cableCode, gen.comments, base, relPath, text.slice(0, 3000)].filter(Boolean).join(' | ');
    const out = { origem: {} };
    const set = (k, v, src) => { if (v != null && v !== '' && out[k] == null) { out[k] = typeof v === 'string' ? v.trim() : v; out.origem[k] = src; } };

    set('popA', gen.locationA, 'Local A do teste'); set('popB', gen.locationB, 'Local B do teste');
    if (!out.popA) {
      const m = hay.match(/(POP[\w-]*?)\s*(?:\sx\s|_x_|\s-\s|\sa\s|_TO_|>|→)\s*(POP[\w-]*)/i) || base.match(/(POP[-\w]+?)_(POP[-\w]+?)(?:_|$)/i);
      if (m) { set('popA', m[1].toUpperCase(), 'Nome do arquivo'); set('popB', m[2].toUpperCase(), 'Nome do arquivo'); }
    }
    set('projeto', gen.project, gen.projectSrc || 'ID da OS do teste');
    set('caboId', gen.cableId, 'Ident. Cabo do teste');
    if (!out.caboId) { const m = hay.match(/\b(CB[-_]?[A-Z0-9-]+|CABO[-_ ]?[A-Z0-9-]+)/i); if (m) set('caboId', m[1].toUpperCase().replace(/_/g, '-'), 'Nome do arquivo'); }
    // quantidade de fibras: "48F", "AS80 48FO", "4L24F" (24 fibras) — no código do cabo, depois no ID do cabo
    const reFO = /(?:^|[^\d])(\d{1,3})\s*(?:FO|F|FIBRAS?)(?![A-Z])/i;
    const fo = (gen.cableCode || '').match(reFO) || (gen.cableId || '').match(reFO) || hay.match(/\b(\d{1,3})\s*(?:FO|F|FIBRAS)\b/i);
    if (fo && +fo[1] > 0 && +fo[1] <= 432) set('fibras', +fo[1], fo.input === gen.cableCode ? 'Código do cabo' : fo.input === gen.cableId ? 'Ident. Cabo do teste' : 'Identificação do teste');
    if (gen.cableCode) set('tipoCabo', gen.cableCode.replace(/\s*\d{1,3}\s*(F|FO|FIBRAS?)\b/i, '').trim() || gen.cableCode, 'Código do cabo');
    if (!out.tipoCabo && gen.fiberType) set('tipoCabo', 'Monomodo ' + gen.fiberType, 'Tipo de fibra do teste (IOR)');
    if (!out.tipoCabo) { const m = hay.match(/\b(CFOA[-\w]*|AS\d{2,3}|ASU\d+|DROP[-\w]*|CFOT[-\w]*)/i); if (m) set('tipoCabo', m[1].toUpperCase(), 'Identificação do teste'); }
    const tr = hay.match(/\b(?:T|TR|TRECHO)[-_ ]?(\d{1,3})\b/i); if (tr) set('trecho', 'T' + tr[1].padStart(2, '0'), 'Nome do arquivo');
    set('fibra', gen.fiberId, 'ID da fibra do teste');
    set('os', gen.os, 'ID da OS do teste');
    const pj = (gen.comments || '').match(/PROJ(?:ETO)?\s*[:=]\s*([^;|]+)/i) || text.match(/Projeto\s*[:=]\s*([^\n;|]+)/i);
    if (pj) set('projeto', pj[1], 'Comentário do teste');
    if (!out.projeto && relPath && relPath.includes('/')) set('projeto', relPath.split('/')[0], 'Pasta de origem');
    const rg = (gen.comments || '').match(/REG(?:I[AÃ]O)?\s*[:=]\s*([^;|]+)/i);
    if (rg) set('regiao', rg[1], 'Comentário do teste');
    if (!out.regiao) {
      const pops = [out.popA, out.popB, out.caboId].filter(Boolean).join(' ');
      const rule = S.regionRules.find(r => { try { return new RegExp(r.pattern, 'i').test(pops); } catch (e) { return false; } });
      if (rule) set('regiao', rule.regiao, 'Regra POP → Região');
    }
    set('operador', gen.operator, 'Técnico gravado no OTDR');
    // observações automáticas com tudo o que o teste informa e não tem campo próprio
    const obs = [gen.fiberId && 'Fibra: ' + gen.fiberId, gen.os && 'OS: ' + gen.os, gen.operator && 'Técnico OTDR: ' + gen.operator, gen.equipment && 'Equipamento: ' + gen.equipment, gen.calibration && 'Calibração: ' + gen.calibration, gen.direction && 'Direção: ' + gen.direction, gen.alarmStd && 'Limites: ' + gen.alarmStd].filter(Boolean);
    if (obs.length) { out.obs = obs.join(' · '); out.origem.obs = 'Dados do teste'; }
    if (out.popA && out.popB) set('trechoNome', `${out.popA}-${out.popB}`, 'Origem/Extremidade');
    out.nome = out.popA && out.popB ? `${out.popA} x ${out.popB}` : (out.caboId || base);
    out.origem.nome = out.popA && out.popB ? 'Locais A/B' : out.caboId ? 'Cable ID' : 'Nome do arquivo';
    if (!out.projeto) { out.projeto = S.defaultProject; out.origem.projeto = 'Padrão (não encontrado no teste)'; }
    if (!out.regiao) { out.regiao = ''; out.origem.regiao = 'Não encontrado — preencher'; }
    return out;
  };

  /* ---------- SOR ---------- */
  I.readSOR = async (file, buf) => {
    buf = buf || await U.readAsArrayBuffer(file);
    let parts;
    const u8 = new Uint8Array(buf, 0, 4);
    if (u8[0] === 0x50 && u8[1] === 0x4B && window.JSZip) { // contêiner ZIP (ex.: .csor/.msor) com vários .sor dentro
      const zip = await JSZip.loadAsync(buf);
      parts = await Promise.all(Object.values(zip.files).filter(f => !f.dir && /\.sor$/i.test(f.name)).map(f => f.async('arraybuffer')));
      if (!parts.length) throw new Error('Contêiner sem arquivos .sor internos');
    } else parts = SORParser.splitMulti(buf);
    return parts.map((b, i) => {
      const p = SORParser.parseSOR(b);
      const events = (p.events || []).map(e => ({ n: e.number, distM: +(e.distanceKm * 1000).toFixed(2), loss: e.loss, reflectance: e.reflectance, kind: e.kind, end: e.end, slope: e.slope, code: e.code }));
      const draft = {
        source: 'SOR', wavelength: p.wavelength || null, lengthM: p.fiberLengthKm != null ? +(p.fiberLengthKm * 1000).toFixed(2) : null,
        totalLoss: p.totalLoss, totalLossOrigin: p.totalLossOrigin, orl: p.orl || null, ior: p.fixed ? p.fixed.ior : null,
        pulseNs: p.fixed && p.fixed.pulseWidths ? p.fixed.pulseWidths[0] : null, resolutionM: p.fixed ? p.fixed.resolutionM : null,
        data: p.fixed && p.fixed.date ? p.fixed.date : null, events,
        equipamento: p.supplier ? [p.supplier.supplier, p.supplier.otdr, p.supplier.otdrSN && ('SN ' + p.supplier.otdrSN)].filter(Boolean).join(' ') : null,
        modulo: p.supplier ? p.supplier.module : null, fiberType: p.general ? p.general.fiberType : null,
        buildCondition: p.general ? p.general.buildConditionLabel : null, gen: p.general || {}
      };
      const extracted = [];
      if (draft.lengthM != null) extracted.push('Comprimento'); if (draft.wavelength) extracted.push('λ'); if (draft.totalLoss != null) extracted.push('Perda total' + (p.totalLossOrigin === 'calculado' ? ' (calc.)' : ''));
      if (draft.orl) extracted.push('ORL'); if (events.length) extracted.push(events.length + ' eventos'); if (p.trace) extracted.push('Traço ' + p.trace.points + ' pts');
      return { kind: 'SOR', part: parts.length > 1 ? i + 1 : null, ok: p.ok, parsed: p, draft, trace: p.trace ? SORParser.downsample(p.trace, 1600) : null, extracted, missing: p.missing, warnings: p.warnings, proprietary: p.proprietary };
    });
  };

  /* ---------- Texto (PDF/OCR): reconhecimento de campos ---------- */
  I.fieldsFromText = (text) => {
    const t = text.replace(/\s+/g, ' ');
    const d = { events: [] }, found = [];
    const num = (re) => { const m = t.match(re); return m ? U.parseNum(m[1]) : null; };
    const wl = t.match(/\b(1270|1310|1383|1490|1550|1577|1625|1650)\s*nm\b/i); if (wl) { d.wavelength = +wl[1]; found.push('λ'); }
    let km = num(/(?:Fiber\s*Length|Link\s*Length|Comprimento(?:\s*(?:total|da\s*fibra|do\s*enlace))?|Dist[âa]ncia\s*total|Fiber\s*End|Fim\s*da\s*fibra|Span\s*Length)\s*[:=]?\s*([\d.,]+)\s*km/i);
    if (km != null) { d.lengthM = km * 1000; found.push('Comprimento'); }
    else { const mm = num(/(?:Fiber\s*Length|Link\s*Length|Comprimento(?:\s*total)?|Dist[âa]ncia\s*total)\s*[:=]?\s*([\d.,]+)\s*m\b/i); if (mm != null) { d.lengthM = mm; found.push('Comprimento'); } }
    const loss = num(/(?:Total\s*Loss|Link\s*Loss|Span\s*Loss|Perda\s*total|Atenua[çc][ãa]o\s*total|End.to.end\s*loss)\s*[:=]?\s*(-?[\d.,]+)\s*dB/i);
    if (loss != null) { d.totalLoss = Math.abs(loss); d.totalLossOrigin = 'arquivo'; found.push('Perda total'); }
    const orl = num(/\bORL\s*[:=]?\s*([\d.,]+)\s*dB/i); if (orl != null) { d.orl = orl; found.push('ORL'); }
    const ior = num(/(?:IOR|[ÍI]ndice\s*de\s*refra[çc][ãa]o|Refractive\s*Index)\s*[:=]?\s*(1[.,]\d{3,6})/i); if (ior) { d.ior = ior; found.push('IOR'); }
    const pw = num(/(?:Pulse(?:\s*Width)?|Pulso)\s*[:=]?\s*([\d.,]+)\s*ns/i); if (pw) d.pulseNs = pw;
    // Tabela de eventos: "N  dist(km)  perda(dB)  refl(dB)" em linhas
    const lines = text.split(/\n/);
    lines.forEach(l => {
      const m = l.match(/^\s*(\d{1,3})\s+(?:[A-Za-zÀ-ÿ/ ]{0,20}\s+)?(\d+[.,]\d{2,4})\s*(?:km)?\s+(-?\d+[.,]\d{2,3})(?:\s*dB)?(?:\s+(-\d{1,2}[.,]\d{1,3}|>-?\d+[.,]?\d*|-{2,}))?/);
      if (m) d.events.push({ n: +m[1], distM: U.parseNum(m[2]) * 1000, loss: U.parseNum(m[3]), reflectance: m[4] && /^-\d/.test(m[4]) ? U.parseNum(m[4]) : 0, kind: m[4] && /^-\d/.test(m[4]) ? 'refletivo' : 'nao-refletivo', end: false, slope: 0 });
    });
    if (d.events.length) { d.events.sort((a, b) => a.distM - b.distM); found.push(d.events.length + ' eventos (tabela)'); if (d.lengthM && Math.abs(d.events[d.events.length - 1].distM - d.lengthM) < 50) d.events[d.events.length - 1].end = true; }
    const missing = [];
    if (d.lengthM == null) missing.push('Comprimento total'); if (!d.wavelength) missing.push('Comprimento de onda'); if (d.totalLoss == null) missing.push('Atenuação total'); if (d.orl == null) missing.push('ORL'); if (!d.events.length) missing.push('Eventos');
    return { d, found, missing };
  };

  /** Lê o PDF preservando as posições (x,y) de cada texto: permite ler tabelas por coluna */
  I.pdfRows = async (buf) => {
    await U.loadScript(LIB.pdf);
    const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = LIB.pdfWorker;
    const doc = await lib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
    const rows = [];
    for (let p = 1; p <= Math.min(doc.numPages, 15); p++) {
      const pg = await doc.getPage(p); const c = await pg.getTextContent();
      const items = c.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str.trim(), x: i.transform[4], w: i.width || 0, y: i.transform[5] })).sort((a, b) => b.y - a.y || a.x - b.x);
      let cur = null;
      items.forEach(it => { if (!cur || Math.abs(cur.y - it.y) > 2.5) { cur = { page: p, y: it.y, items: [] }; rows.push(cur); } cur.items.push(it); });
    }
    rows.forEach(r => { r.items.sort((a, b) => a.x - b.x); r.text = r.items.map(i => i.s).join(' '); });
    return rows;
  };

  /** Relatório PDF do Viavi SmartOTDR / Fiber Optics (rótulos em português) */
  I.parseViaviPDF = (rows) => {
    const all = rows.map(r => r.text).join('\n');
    if (!/Ident\.?\s*Cabo|Origem\s*:|Fim da Fibra|SmartOTDR/i.test(all)) return null;
    const LABELS = ['Ident. Cabo', 'ID da Fibra /Número', 'ID da Fibra / Número', 'ID da Fibra', 'Origem', 'Extremidade', 'ID da OS', 'ID do Técnico', 'Data de Calibração', 'Data de impressão', 'Fiber Optics', 'Arquivo', 'Data'];
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/\s+/g, '\\s*');
    const lab = (name) => {
      const others = LABELS.filter(l => l !== name).map(esc).join('|');
      const m = all.match(new RegExp(esc(name) + '\\s*:\\s*(.+?)(?=\\s+(?:' + others + ')\\s*:|\\n|$)', 'i'));
      return m ? m[1].trim() : null;
    };
    const gen = { cableId: lab('Ident. Cabo'), fiberId: lab('ID da Fibra /Número') || lab('ID da Fibra'), locationA: lab('Origem'), locationB: lab('Extremidade'), os: lab('ID da OS'), operator: lab('ID do Técnico'), calibration: lab('Data de Calibração') };
    if (gen.os) { gen.project = gen.os; gen.projectSrc = 'ID da OS do teste'; }
    const eq = all.match(/(SmartOTDR[^\n]*?\(S\/N\s*\d+\))/i) || all.match(/(MTS\s*\d+\w*[^\n]*?\(S\/N\s*\d+\))/i); if (eq) gen.equipment = eq[1].replace(/\s+/g, ' ');
    const ft = all.match(/IOR[\s\S]{0,120}?1[.,]\d{3,6}\s*\(([^)]+)\)/i) || all.match(/1[.,]\d{4,6}\s*\(([^)]+)\)/); if (ft) gen.fiberType = ft[1].replace(/\s+/g, '/');
    const std = all.match(/Limites\s+(IEC[^\n]+?\(\d{4}\))/i); if (std) gen.alarmStd = std[1];
    const d = { source: 'PDF', events: [], gen }, found = [];
    const iorM = all.match(/(1[.,]\d{4,6})\s*\(/); if (iorM) { d.ior = U.parseNum(iorM[1]); found.push('IOR'); }
    const dt = all.match(/\bData\s*:\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?:\s*\(UTC([+-]\d{1,2})\))?/);
    if (dt) { const off = dt[6] ? +dt[6] : -3; const sign = off < 0 ? '-' : '+'; d.data = new Date(`${dt[3]}-${dt[2]}-${dt[1]}T${dt[4]}:${dt[5]}:00${sign}${String(Math.abs(off)).padStart(2, '0')}:00`).toISOString(); found.push('Data da medição'); }

    // Tabela "Resumo": cabeçalho + 1ª linha de dados, lida por coluna (posição x)
    const colOf = (hdr, x) => hdr.reduce((b, h) => Math.abs(h.c - x) < Math.abs(b.c - x) ? h : b, hdr[0]);
    const hi = rows.findIndex(r => /Laser/i.test(r.text) && /Perda Total/i.test(r.text) && /Fim da Fibra/i.test(r.text));
    if (hi >= 0) {
      const hdr = rows[hi].items.map(i => ({ s: i.s, c: i.x + i.w / 2 }));
      const data = rows.slice(hi + 1, hi + 4).find(r => /\d/.test(r.text) && r.items.length >= 4);
      if (data) {
        const v = {};
        data.items.forEach(it => { const h = colOf(hdr, it.x + it.w / 2).s; v[h] = (v[h] ? v[h] + ' ' : '') + it.s; });
        const pick = (re) => { const k = Object.keys(v).find(k => re.test(k)); return k ? v[k] : null; };
        let wl = U.parseNum(pick(/Laser/i)), loss = U.parseNum(pick(/Perda Total/i)), orl = U.parseNum(pick(/ORL/i)), end = U.parseNum(pick(/Fim da Fibra/i));
        // reforço por expressão regular (caso o cabeçalho venha quebrado em vários pedaços)
        const rx = data.text.match(/\.c?m?sor\s+(\d{4})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+(.+?)\s+([\d.,]+)\s+(\d+)/i);
        if (rx) { wl = wl || +rx[1]; loss = loss != null ? loss : U.parseNum(rx[2]); orl = orl || U.parseNum(rx[3]); end = end || U.parseNum(rx[4]); gen.direction = rx[5].trim(); }
        else gen.direction = pick(/Dire/i);
        if (wl) { d.wavelength = wl; found.push('λ'); } if (loss != null) { d.totalLoss = loss; d.totalLossOrigin = 'arquivo'; found.push('Perda total'); }
        if (orl) { d.orl = orl; found.push('ORL'); } if (end != null) { d.lengthM = end; found.push('Fim da fibra'); }
        const avg = U.parseNum(pick(/Perda M/i)); if (avg) d.avgAtt = avg;
      }
    }
    // Tabela de eventos: Evento | Distância m | Perda dB | Reflect. dB | Declive dB/km | Secção m | P. Total dB
    const ei = rows.findIndex(r => /^Evento\b/i.test(r.items[0] ? r.items[0].s : '') && /Dist/i.test(r.text) && /Reflect/i.test(r.text));
    if (ei >= 0) {
      const hdr = rows[ei].items.map(i => ({ s: i.s, c: i.x + i.w / 2 }));
      const key = (s) => /^Evento/i.test(s) ? 'n' : /Dist/i.test(s) ? 'dist' : /Reflect/i.test(s) ? 'refl' : /Declive/i.test(s) ? 'slope' : /Sec/i.test(s) ? 'sec' : /P\.?\s*Total/i.test(s) ? 'cum' : /Perda/i.test(s) ? 'loss' : s;
      for (let k = ei + 1; k < rows.length && k < ei + 200; k++) {
        const r = rows[k]; const first = r.items[0] ? r.items[0].s : '';
        if (!/^\d{1,3}$/.test(first)) { if (d.events.length) break; continue; }
        const ev = {};
        r.items.forEach(it => { const t = it.s.replace(/^~\s*/, ''); if (t === '~' || t === '') return; ev[key(colOf(hdr, it.x + it.w / 2).s)] = U.parseNum(t); });
        d.events.push({ n: ev.n, distM: ev.dist, loss: ev.loss != null ? ev.loss : 0, reflectance: ev.refl != null ? ev.refl : 0, kind: ev.refl != null ? 'refletivo' : 'nao-refletivo', end: false, slope: ev.slope || 0, cumLoss: ev.cum });
      }
      if (d.events.length) {
        d.events.sort((a, b) => a.distM - b.distM);
        const last = d.events[d.events.length - 1];
        if (d.lengthM == null || Math.abs(last.distM - d.lengthM) < 1) { last.end = true; if (d.lengthM == null) d.lengthM = last.distM; }
        // o declive informado em cada evento vale para a seção anterior (mesma convenção do SR-4731)
        found.push(d.events.length + ' eventos');
      }
    }
    if (gen.cableId) found.push('Ident. cabo'); if (gen.locationA) found.push('Origem/Extremidade'); if (gen.os) found.push('OS'); if (gen.operator) found.push('Técnico');
    const missing = [];
    if (d.lengthM == null) missing.push('Comprimento total'); if (!d.wavelength) missing.push('Comprimento de onda'); if (d.totalLoss == null) missing.push('Atenuação total'); if (!d.orl) missing.push('ORL'); if (!d.events.length) missing.push('Eventos');
    d.equipamento = gen.equipment || null; d.fiberType = gen.fiberType || null; d.operadorOTDR = gen.operator || null;
    return { d, found, missing, format: 'Viavi SmartOTDR (PDF)' };
  };

  I.readPDF = async (file, buf) => {
    buf = buf || await U.readAsArrayBuffer(file);
    const rows = await I.pdfRows(buf);
    const text = rows.map(r => r.text).join('\n');
    if (!text.trim()) return [{ kind: 'PDF', ok: false, draft: { source: 'PDF', events: [], gen: {} }, extracted: [], missing: ['PDF sem texto (provavelmente imagem). Use OCR ou preenchimento manual.'], warnings: [], text: '' }];
    const v = I.parseViaviPDF(rows);
    if (v) return [{ kind: 'PDF', format: v.format, ok: v.found.length > 2, draft: v.d, extracted: v.found, missing: v.missing, warnings: v.missing.length ? ['Campos não presentes no relatório: preencha manualmente.'] : [], text }];
    const f = I.fieldsFromText(text);
    return [{ kind: 'PDF', ok: f.found.length > 0, draft: Object.assign({ source: 'PDF', gen: {} }, f.d), extracted: f.found, missing: f.missing, warnings: ['Valores extraídos do texto do PDF: confira antes de salvar.'], text }];
  };

  /* ---------- Foto da tela do OTDR / do relatório (OCR) ---------- */
  /** Prepara a foto para o OCR: amplia, converte para cinza, inverte tela escura e reforça o contraste */
  I.prepImage = async (file) => {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Imagem inválida ou formato não suportado pelo navegador')); i.src = url; });
      const k = Math.min(3, Math.max(1, 2200 / Math.max(img.width, 1)));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const g = cv.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, cv.width, cv.height);
      const id = g.getImageData(0, 0, cv.width, cv.height), px = id.data, n = px.length / 4, hist = new Uint32Array(256);
      let soma = 0;
      for (let i = 0; i < n; i++) { const y = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]); px[i * 4] = y; hist[y]++; soma += y; }
      const escuro = soma / n < 110; // tela do OTDR com fundo escuro: inverte para texto preto em fundo claro
      let lo = 0, hi = 255, acc = 0; for (; lo < 255 && (acc += hist[lo]) < n * 0.01; lo++); acc = 0; for (; hi > 0 && (acc += hist[hi]) < n * 0.01; hi--);
      const amp = Math.max(1, hi - lo);
      for (let i = 0; i < n; i++) { let y = (px[i * 4] - lo) * 255 / amp; y = y < 0 ? 0 : y > 255 ? 255 : y; if (escuro) y = 255 - y; px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = y; px[i * 4 + 3] = 255; }
      g.putImageData(id, 0, 0);
      return { canvas: cv, escuro, w: img.width, h: img.height };
    } finally { URL.revokeObjectURL(url); }
  };
  /** Corrige trocas comuns do OCR dentro de números (O→0, l/I→1, S→5, B→8) */
  I.ocrFix = (t) => String(t || '').replace(/(?<=[\d,.\-])[Oo](?=[\d,.]|\b)|(?<=\b)[Oo](?=[,.]\d)/g, '0').replace(/(?<=\d)[lI|](?=\d)|(?<=[\s(])[lI](?=[,.]\d)/g, '1').replace(/(?<=\d[,.]?)S(?=\d)/g, '5').replace(/(?<=\d)B(?=\d)/g, '8').replace(/[‐–—]/g, '-');
  /** Linhas do OCR no mesmo formato do leitor posicional de PDF (permite reaproveitar a leitura do relatório Viavi) */
  I.ocrRows = (data) => (data.lines || []).map(l => {
    const items = (l.words || []).filter(w => w.text && w.text.trim()).map(w => ({ s: I.ocrFix(w.text.trim()), x: w.bbox.x0, w: w.bbox.x1 - w.bbox.x0, y: -w.bbox.y0 }));
    return { page: 1, y: items.length ? items[0].y : 0, items, text: items.map(i => i.s).join(' ') };
  }).filter(r => r.items.length);
  let ocrWorker = null;
  I.ocrEngine = async (onProgress) => {
    await U.loadScript(LIB.ocr);
    if (!ocrWorker) ocrWorker = window.Tesseract.createWorker('por', 1, { workerPath: LIB.ocrWorker, corePath: LIB.ocrCore, langPath: LIB.ocrLang, logger: m => I._ocrLog && m.progress != null && I._ocrLog(m.status, m.progress) }).catch(e => { ocrWorker = null; throw e; });
    I._ocrLog = onProgress;
    return ocrWorker;
  };
  /** Campos do cabeçalho da tela/relatório lidos por rótulo (Origem, Extremidade, Ident. Cabo, Fibra, OS, Técnico) */
  I.genFromText = (text) => {
    const gen = {}, t = text.replace(/[ \t]+/g, ' ');
    const pick = (re) => { const m = t.match(re); return m ? m[1].replace(/\s{2,}.*$/, '').trim().replace(/[|;]+$/, '').trim() : null; };
    const fim = '(?=\\s{2,}|\\s+(?:Extremidade|Origem|Ident|ID d|Fibra|OS|T[ée]cnico|Data|Location|Cable|Fiber|Job|Operator)\\b|\\n|$)';
    gen.locationA = pick(new RegExp('(?:Origem|Location\\s*A|Local\\s*A|Ponta\\s*A)\\s*[:=.]?\\s*(.+?)' + fim, 'i'));
    gen.locationB = pick(new RegExp('(?:Extremidade|Location\\s*B|Local\\s*B|Ponta\\s*B|Destino)\\s*[:=.]?\\s*(.+?)' + fim, 'i'));
    gen.cableId = pick(new RegExp('(?:Ident\\.?\\s*(?:do\\s*)?Cabo|Cable\\s*ID|ID\\s*do\\s*cabo)\\s*[:=.]?\\s*(.+?)' + fim, 'i'));
    gen.fiberId = pick(new RegExp('(?:ID\\s*da\\s*Fibra(?:\\s*/\\s*N[úu]mero)?|Fiber\\s*(?:ID|Number))\\s*[:=.]?\\s*(.+?)' + fim, 'i'));
    gen.os = pick(new RegExp('(?:ID\\s*da\\s*OS|Job\\s*ID|\\bOS)\\s*[:=.]?\\s*(.+?)' + fim, 'i'));
    gen.operator = pick(new RegExp('(?:ID\\s*do\\s*T[ée]cnico|Operador|Operator|T[ée]cnico)\\s*[:=.]?\\s*(.+?)' + fim, 'i'));
    Object.keys(gen).forEach(k => { if (!gen[k] || gen[k].length < 2 || gen[k].length > 60) { delete gen[k]; return; } gen[k] = gen[k].replace(/^0(?=[A-Z]{2})/, ''); });
    if (gen.fiberId) gen.fiberId = gen.fiberId.replace(/^([A-Z]{1,2})[Oo](?=\d+$)/, (x, a) => a + '0'); // "FO7" → "F07"
    if (gen.os) { gen.project = gen.os; gen.projectSrc = 'ID da OS (foto)'; }
    const eq = t.match(/(SmartOTDR[^\n]{0,30}|MTS[- ]?\d{3,4}\w*|FTB[- ]?\d{3,4}\w*|AQ\d{4}\w*)/i); if (eq) gen.equipment = eq[1].trim();
    return gen;
  };
  /** Tabela de eventos de uma tela de OTDR (ou relatório): N  distância  perda  refletância  ... */
  I.eventsFromOcr = (rows) => {
    const hi = rows.findIndex(r => /Dist/i.test(r.text) && /(Perda|Loss|Atten)/i.test(r.text));
    const hdr = hi >= 0 ? rows[hi].text : '';
    let emM = /\(\s*m\s*\)|\bm\b/.test(hdr.replace(/km/gi, '')) && !/\(\s*km\s*\)/i.test(hdr);
    const evs = [];
    rows.slice(hi >= 0 ? hi + 1 : 0).forEach(r => {
      const tk = r.text.replace(/\s*(km|dB\/km|dB|m)\b/gi, ' ').split(/\s+/).filter(Boolean);
      if (!/^\d{1,3}[a-z]?$/i.test(tk[0] || '')) return;
      const nums = tk.slice(1).map(x => x === '--' || x === '-' || x === '~' ? null : /^[<>]?-?\d+([.,]\d+)?$/.test(x.replace(/^[<>]/, '')) ? U.parseNum(x.replace(/^[<>]/, '')) : undefined).filter(v => v !== undefined);
      if (nums.length < 2 || nums[0] == null) return;
      const reflIdx = nums.findIndex((v, i) => i >= 2 && v != null && v < -10 && v > -90);
      evs.push({ n: parseInt(tk[0], 10), dist: nums[0], loss: nums[1] == null ? 0 : nums[1], refl: reflIdx > 0 ? nums[reflIdx] : null });
    });
    if (!evs.length) return [];
    if (!emM && evs.some(e => e.dist > 300)) emM = true; // 300 km não existe em enlace de campo: a coluna está em metros
    const out = evs.filter(e => e.dist >= 0 && Math.abs(e.loss) < 30).map(e => ({ n: e.n, distM: emM ? e.dist : e.dist * 1000, loss: Math.abs(e.loss) < 30 ? e.loss : 0, reflectance: e.refl != null ? e.refl : 0, kind: e.refl != null ? 'refletivo' : 'nao-refletivo', end: false, slope: 0, ocr: true }));
    out.sort((a, b) => a.distM - b.distM);
    return out;
  };

  I.readImage = async (file, onProgress) => {
    onProgress && onProgress('Preparando a imagem', 0.05);
    const prep = await I.prepImage(file);
    const w = await I.ocrEngine((s, p) => onProgress && onProgress(s, 0.1 + p * 0.85));
    await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' }).catch(() => {});
    const { data } = await w.recognize(prep.canvas);
    const text = I.ocrFix(data.text || '');
    const rows = I.ocrRows(data);
    onProgress && onProgress('Interpretando', 0.97);
    // 1º: foto do relatório PDF do Viavi (mesmos rótulos); 2º: tela do equipamento
    let v = null; try { v = I.parseViaviPDF(rows); } catch (e) { v = null; }
    const f = I.fieldsFromText(text);
    const d = Object.assign({ source: 'IMG', gen: {} }, f.d);
    const found = f.found.slice();
    if (v) { ['wavelength', 'lengthM', 'totalLoss', 'totalLossOrigin', 'orl', 'ior', 'avgAtt', 'data', 'equipamento', 'fiberType', 'operadorOTDR'].forEach(k => { if (v.d[k] != null && d[k] == null) d[k] = v.d[k]; }); if (v.d.events.length > d.events.length) d.events = v.d.events; Object.assign(d.gen, v.d.gen); v.found.forEach(x => found.includes(x) || found.push(x)); }
    const g2 = I.genFromText(text); Object.keys(g2).forEach(k => { if (!d.gen[k]) d.gen[k] = g2[k]; });
    ['os', 'project', 'cableId', 'fiberId', 'operator'].forEach(k => { if (typeof d.gen[k] === 'string') d.gen[k] = d.gen[k].replace(/^0(?=[A-Z]{2})/, ''); });
    if (d.gen.fiberId) d.gen.fiberId = d.gen.fiberId.replace(/^([A-Z]{1,2})[Oo](?=\d+$)/, (x, a) => a + '0');
    if (d.gen.locationA && !found.includes('Origem/Extremidade')) found.push('Origem/Extremidade');
    if (d.gen.cableId && !found.includes('Ident. cabo')) found.push('Ident. cabo');
    const ev = I.eventsFromOcr(rows);
    // escolhe a leitura de eventos mais completa (quantidade e refletâncias lidas)
    const nota = (l) => (l || []).length * 10 + (l || []).filter(e => e.kind === 'refletivo').length;
    if (nota(ev) > nota(d.events)) d.events = ev;
    for (let i = found.length - 1; i >= 0; i--) if (/eventos/.test(found[i])) found.splice(i, 1);
    if (d.events.length) found.push(d.events.length + ' eventos');
    if (d.events.length) {
      const last = d.events[d.events.length - 1];
      if (d.lengthM == null) { d.lengthM = last.distM; found.push('Fim da fibra (último evento)'); }
      if (Math.abs(last.distM - d.lengthM) < Math.max(5, d.lengthM * 0.002)) last.end = true;
      if (d.totalLoss == null) { const cum = U.sum(d.events.filter(e => !e.end), e => +e.loss || 0); if (cum > 0) { d.totalLoss = +cum.toFixed(3); d.totalLossOrigin = 'soma dos eventos (foto)'; found.push('Perda total (soma dos eventos)'); } }
    }
    if (!d.equipamento && d.gen.equipment) d.equipamento = d.gen.equipment;
    if (!d.operadorOTDR && d.gen.operator) d.operadorOTDR = d.gen.operator;
    const missing = [];
    if (d.lengthM == null) missing.push('Comprimento total'); if (!d.wavelength) missing.push('Comprimento de onda'); if (d.totalLoss == null) missing.push('Atenuação total'); if (!d.orl) missing.push('ORL'); if (!d.events.length) missing.push('Eventos'); if (!d.gen.locationA) missing.push('Origem/Extremidade');
    return [{ kind: 'IMG', format: 'Foto da tela/relatório (OCR' + (prep.escuro ? ', tela escura invertida' : '') + ')', ok: found.length > 0, draft: d, extracted: found, missing, warnings: ['Leitura por foto (OCR): confira cada valor e a tabela de eventos com a tela do equipamento antes de salvar.'], text, conf: data.confidence }];
  };

  /* ---------- Planilhas ---------- */
  I.readSheet = async (file, buf) => {
    buf = buf || await U.readAsArrayBuffer(file);
    if (!window.XLSX) throw new Error('Biblioteca de planilhas não carregada (verifique a internet).');
    let wb;
    if (/\.csv$/i.test((file && file.name) || '')) {
      // CSV: decodifica como UTF-8 (padrão do OZmap); se houver caracteres inválidos, usa Windows-1252 (Excel BR)
      let txt = new TextDecoder('utf-8').decode(buf); if (txt.includes('\uFFFD')) txt = new TextDecoder('windows-1252').decode(buf);
      wb = XLSX.read(txt.replace(/^\uFEFF/, ''), { type: 'string', raw: false });
    } else wb = XLSX.read(buf, { type: 'array', raw: false });
    const sheets = wb.SheetNames.map(n => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: true });
      return { name: n, rows, headers: rows.length ? Object.keys(rows[0]) : [] };
    }).filter(s => s.rows.length);
    return sheets;
  };
  /** Sugere o mapeamento de colunas comparando cabeçalhos normalizados */
  I.guessColumns = (headers, spec) => {
    const map = {};
    Object.entries(spec).forEach(([k, pats]) => {
      const h = headers.find(h => pats.some(p => p instanceof RegExp ? p.test(U.norm(h)) : U.norm(h) === p));
      if (h) map[k] = h;
    });
    return map;
  };
  I.specOTDR = {
    enlace: [/^enlace|^link|^rota/], trecho: [/^trecho|^segmento|^span|^secao/], otdr: [/otdr|comprimento|fiber length|distancia medida|length/],
    ozmap: [/ozmap|tracado|projeto|distancia (do )?mapa/], perda: [/perda|loss|atenuacao/], lambda: [/lambda|comprimento de onda|wavelength|^nm$/], orl: [/^orl/], data: [/^data|date/], cabo: [/^cabo|cable/]
  };
  I.specOZmap = {
    enlace: [/^enlace|^link|^rota/], trecho: [/^trecho|^segmento|^nome/], ozmap: [/distancia|comprimento|metragem|extensao/], restante: [/48\s*fo.*restante|restante|livres|disponive/],
    cabo: [/^cabo$|identificacao do cabo|^id cabo/], capacidade: [/capacidade|^fo$|fibras$|qtd.*fibra/], caixa: [/caixa|ceo|local/], tipo: [/^tipo/]
  };
  /** Valor em metros: aceita "1,234 km", "1234 m", número puro (heurística: < 100 => km) */
  I.toMeters = (v, header = '') => {
    if (v == null || v === '') return null;
    const s = String(v); const n = U.parseNum(s); if (n == null) return null;
    if (/km/i.test(s) || /\(km\)|km/i.test(header)) return n * 1000;
    if (/\bm\b|\(m\)/i.test(s + ' ' + header)) return n;
    return n < 100 ? n * 1000 : n;
  };
})(window.FC = window.FC || {});
