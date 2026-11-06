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
    ocr: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
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
    if (gen.locationA && gen.locationB) set('trechoNome', `${gen.locationA}-${gen.locationB}`, 'Origem/Extremidade');
    // observações automáticas com tudo o que o teste informa e não tem campo próprio
    const obs = [gen.fiberId && 'Fibra: ' + gen.fiberId, gen.os && 'OS: ' + gen.os, gen.operator && 'Técnico OTDR: ' + gen.operator, gen.equipment && 'Equipamento: ' + gen.equipment, gen.calibration && 'Calibração: ' + gen.calibration, gen.direction && 'Direção: ' + gen.direction, gen.alarmStd && 'Limites: ' + gen.alarmStd].filter(Boolean);
    if (obs.length) { out.obs = obs.join(' · '); out.origem.obs = 'Dados do teste'; }
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
      const m = l.match(/^\s*(\d{1,3})\s+(?:[A-Za-zÀ-ÿ/ ]{0,20}\s+)?(\d+[.,]\d{2,4})\s*(?:km)?\s+(-?\d+[.,]\d{2,3})\s*(?:dB)?(?:\s+(-\d{1,2}[.,]\d{1,3}|>-?\d+[.,]?\d*|-{2,}))?/);
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

  I.readImage = async (file, onProgress) => {
    await U.loadScript(LIB.ocr);
    const res = await window.Tesseract.recognize(file, 'eng', { logger: m => onProgress && m.progress != null && onProgress(m.status, m.progress) });
    const text = res.data.text || '';
    const f = I.fieldsFromText(text);
    return [{ kind: 'IMG', ok: f.found.length > 0, draft: Object.assign({ source: 'IMG', gen: {} }, f.d), extracted: f.found, missing: f.missing, warnings: ['OCR experimental: confira cada valor com a tela do equipamento.'], text }];
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
    cabo: [/^cabo$|identificacao do cabo|^id cabo/], capacidade: [/capacidade|^fo$|fibras$|qtd.*fibra/], conectado: [/conectado|derivacao|entronque/], caixa: [/caixa|ceo|local/], tipo: [/^tipo/]
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
