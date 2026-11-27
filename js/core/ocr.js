/* ClickIP FiberControl — leitura do teste pela FOTO (tela do OTDR ou relatório impresso/na tela)
 *
 * Objetivo: registrar o que está na foto da mesma forma que a leitura do PDF.
 *  1. Tratamento da imagem: corrige a orientação, uniformiza a iluminação (sombra, reflexo, tela escura)
 *     e amplia o texto pequeno.
 *  2. OCR (Tesseract, português) com correção automática da inclinação da foto.
 *  3. Leitura por POSIÇÃO, como no PDF: cada tabela é localizada pelo cabeçalho (Laser, Perda total, ORL,
 *     Fim da fibra… / Evento, Distância, Perda, Reflect., Declive, Secção, P. Total) e os valores são lidos
 *     na coluna certa, compensando a inclinação local da foto.
 *  4. Conferência cruzada: distância de cada evento = anterior + secção; fim da fibra = último evento;
 *     perda total = P. Total do último evento. Corrige pontos decimais perdidos e completa o que faltou.
 *  O técnico confere tudo na tela de importação antes de salvar (nada é gravado sem conferência).
 */
(function (FC) {
  'use strict';
  const U = FC.util, I = FC.importers;
  const LIB = {
    ocr: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
    worker: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    core: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
    lang: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/por@1.0.0/4.0.0_best_int'
  };
  const MAX_IMG = 25 * 1024 * 1024;

  /* ---------- 1. Tratamento da imagem ---------- */
  I.prepImage = async (file) => {
    if (file.size > MAX_IMG) throw new Error('Foto muito grande (máximo 25 MB).');
    if (file.type && !/^image\/(png|jpe?g|webp|heic|heif|bmp|gif)$/i.test(file.type)) throw new Error('Arquivo não é uma foto (use JPG ou PNG).');
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Não foi possível abrir a foto. Use JPG ou PNG (no iPhone: Ajustes › Câmera › Formatos › Mais compatível).')); i.src = url; });
      const k = Math.min(3, Math.max(0.5, 3000 / Math.max(img.width, img.height, 1)));
      const W = Math.round(img.width * k), H = Math.round(img.height * k);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, W, H);
      const id = g.getImageData(0, 0, W, H), px = id.data, n = W * H;
      // tela escura (OTDR com fundo preto)? decide pela luminância média
      let soma = 0; for (let i = 0; i < n; i += 7) soma += 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      const escuro = soma / (n / 7) < 110;
      // canal que mais destaca o texto: texto escuro/azul em fundo claro → menor canal; tela escura → maior canal invertido
      const gray = new Float32Array(n);
      for (let i = 0; i < n; i++) { const r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2]; gray[i] = escuro ? 255 - Math.max(r, gg, b) : Math.min(r, gg, b); }
      // fundo estimado numa versão reduzida (desfoque grande) → remove sombra, reflexo e degradê de luz
      const f = 8, sw = Math.ceil(W / f), sh = Math.ceil(H / f), small = new Float32Array(sw * sh);
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { let m = 0, c = 0; for (let yy = y * f; yy < Math.min(H, y * f + f); yy += 2) for (let xx = x * f; xx < Math.min(W, x * f + f); xx += 2) { const v = gray[yy * W + xx]; if (v > m) m = v; c++; } small[y * sw + x] = m; } // máximo local = papel/fundo
      const R = Math.max(2, Math.round(Math.max(sw, sh) / 30)), I2 = new Float64Array((sw + 1) * (sh + 1));
      for (let y = 0; y < sh; y++) { let row = 0; for (let x = 0; x < sw; x++) { row += small[y * sw + x]; I2[(y + 1) * (sw + 1) + x + 1] = I2[y * (sw + 1) + x + 1] + row; } }
      const bg = new Float32Array(sw * sh);
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const x0 = Math.max(0, x - R), x1 = Math.min(sw, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(sh, y + R + 1); bg[y * sw + x] = (I2[y1 * (sw + 1) + x1] - I2[y0 * (sw + 1) + x1] - I2[y1 * (sw + 1) + x0] + I2[y0 * (sw + 1) + x0]) / ((x1 - x0) * (y1 - y0)); }
      const hist = new Uint32Array(256);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, b = Math.max(40, bg[Math.min(sh - 1, (y / f) | 0) * sw + Math.min(sw - 1, (x / f) | 0)]);
        let v = gray[i] / b * 255; v = v > 255 ? 255 : v; gray[i] = v; hist[v | 0]++;
      }
      let lo = 0, acc = 0; for (; lo < 255 && (acc += hist[lo]) < n * 0.005; lo++);
      const amp = Math.max(30, 235 - lo);
      for (let i = 0; i < n; i++) { let v = (gray[i] - lo) * 255 / amp; v = v < 0 ? 0 : v > 255 ? 255 : v; px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v; px[i * 4 + 3] = 255; }
      g.putImageData(id, 0, 0);
      return { canvas: cv, escuro, w: img.width, h: img.height, k };
    } finally { URL.revokeObjectURL(url); }
  };

  /* ---------- 2. OCR ---------- */
  let worker = null;
  I.ocrEngine = async (onProgress) => {
    await U.loadScript(LIB.ocr);
    if (!worker) worker = window.Tesseract.createWorker('por', 1, { workerPath: LIB.worker, corePath: LIB.core, langPath: LIB.lang, logger: m => I._ocrLog && m.progress != null && I._ocrLog(m.status, m.progress) }).catch(e => { worker = null; throw e; });
    I._ocrLog = onProgress;
    return worker;
  };
  /** Trocas comuns do OCR dentro de números (O→0, l/I→1, S→5, B→8) e traços tipográficos */
  I.ocrFix = (t) => String(t || '').replace(/[‐–—−]/g, '-').split(/(\s+)/).map(w => /[A-Za-z]{2,}|[A-HJ-NP-RT-Z]/.test(w.replace(/^[lIOoSB]+|[lIOoSB]+$/g, '')) && !/^[\d.,lIOoSB|-]+$/.test(w) ? w : fixNum(w)).join('');
  const fixNum = (t) => String(t || '').replace(/(?<=[\d,.\-])[Oo](?=[\d,.]|\b)|(?<=\b)[Oo](?=[,.]\d)/g, '0').replace(/(?<=\d)[lI|](?=\d)|(?<=[\s(])[lI](?=[,.]\d)/g, '1').replace(/(?<=\d[,.]?)S(?=\d)/g, '5').replace(/(?<=\d)B(?=\d)/g, '8');
  /** Palavras com caixa (x0,y0,x1,y1), centro e altura */
  const wordsOf = (data) => (data.lines || []).flatMap(l => (l.words || []).filter(w => w.text && w.text.trim()).map(w => ({ t: I.ocrFix(w.text.trim()), x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1, cx: (w.bbox.x0 + w.bbox.x1) / 2, cy: (w.bbox.y0 + w.bbox.y1) / 2, h: w.bbox.y1 - w.bbox.y0, conf: w.confidence })));
  /** Texto montado pelas posições das palavras (linhas de leitura, colunas separadas por espaços largos) */
  function textOf(W) {
    const ws = W.slice().sort((a, b) => a.cy - b.cy), rows = [];
    ws.forEach(w => { const r = rows.find(r => Math.abs(r.cy - w.cy) < Math.min(r.h, w.h) * 0.55); if (r) { r.ws.push(w); r.cy = (r.cy * (r.ws.length - 1) + w.cy) / r.ws.length; } else rows.push({ cy: w.cy, h: w.h, ws: [w] }); });
    return rows.sort((a, b) => a.cy - b.cy).map(r => { r.ws.sort((a, b) => a.x0 - b.x0); return r.ws.map((w, i) => (i ? (w.x0 - r.ws[i - 1].x1 > w.h * 1.6 ? '    ' : ' ') : '') + w.t).join(''); }).join('\n');
  }
  /** Linhas no formato do leitor posicional de PDF (reaproveita a leitura do relatório Viavi) */
  I.ocrRows = (data) => (data.lines || []).map(l => {
    const items = (l.words || []).filter(w => w.text && w.text.trim()).map(w => ({ s: I.ocrFix(w.text.trim()), x: w.bbox.x0, w: w.bbox.x1 - w.bbox.x0, y: -w.bbox.y0 }));
    return { page: 1, y: items.length ? items[0].y : 0, items, text: items.map(i => i.s).join(' ') };
  }).filter(r => r.items.length);

  /* ---------- 3. Leitura por posição ---------- */
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  const norm = (s) => U.norm(s).replace(/[^a-z0-9]/g, '');
  /** Localiza um cabeçalho de tabela: cada coluna é uma lista de palavras (ex.: ['perda','total']).
   *  Devolve centros das colunas, ângulo local da linha do cabeçalho e altura do texto. */
  function findHeader(W, cols, minCols) {
    const hits = [];
    cols.forEach((c, ci) => W.forEach((w, wi) => {
      if (!c.words[0].test(norm(w.t))) return;
      // palavras seguintes da mesma coluna (à direita, mesma linha)
      let last = w, ok = true, x1 = w.x1;
      for (let j = 1; j < c.words.length && ok; j++) {
        const nx = W.filter(v => v !== last && v.x0 > last.cx && v.x0 - last.x1 < last.h * 2.5 && Math.abs(v.cy - last.cy) < last.h * 0.7).sort((a, b) => a.x0 - b.x0)[0];
        if (nx && c.words[j].test(norm(nx.t))) { last = nx; x1 = nx.x1; } else if (!c.optional) ok = false; else break;
      }
      if (ok) hits.push({ ci, key: c.key, x0: w.x0, x1, cx: (w.x0 + x1) / 2, cy: w.cy, h: w.h, wi });
    }));
    // agrupa por linha (permitindo inclinação): escolhe o conjunto com mais colunas distintas
    let best = null;
    hits.forEach(a => {
      const grp = hits.filter(b => Math.abs((b.cy - a.cy) - (b.cx - a.cx) * 0.06 * Math.sign(b.cx - a.cx) * 0) < a.h * 2.2 || Math.abs(b.cy - a.cy) < Math.abs(b.cx - a.cx) * 0.08 + a.h * 1.2);
      const byCol = {}; grp.forEach(b => { if (!byCol[b.key] || Math.abs(b.cy - a.cy) < Math.abs(byCol[b.key].cy - a.cy)) byCol[b.key] = b; });
      const n = Object.keys(byCol).length;
      if (n >= minCols && (!best || n > best.n)) best = { n, cols: byCol };
    });
    if (!best) return null;
    const hs = Object.values(best.cols).sort((a, b) => a.cx - b.cx);
    // inclinação local: regressão linear dos centros do cabeçalho
    const mx = hs.reduce((s, h) => s + h.cx, 0) / hs.length, my = hs.reduce((s, h) => s + h.cy, 0) / hs.length;
    let num = 0, den = 0; hs.forEach(h => { num += (h.cx - mx) * (h.cy - my); den += (h.cx - mx) ** 2; });
    const slope = den ? Math.max(-0.15, Math.min(0.15, num / den)) : 0;
    // colunas não reconhecidas (palavra ilegível): posição deduzida pela ordem fixa da tabela
    const order = cols.map(c => c.key), found = order.filter(k => best.cols[k]);
    order.forEach((k, i) => {
      if (best.cols[k]) return;
      const prev = order.slice(0, i).reverse().find(x => best.cols[x]), next = order.slice(i + 1).find(x => best.cols[x]);
      if (!prev || !next) return;
      const a = best.cols[prev], b = best.cols[next], ia = order.indexOf(prev), ib = order.indexOf(next), f = (i - ia) / (ib - ia);
      best.cols[k] = { key: k, cx: a.cx + (b.cx - a.cx) * f, cy: a.cy + (b.cy - a.cy) * f, h: a.h, deduzida: true };
    });
    const all = Object.values(best.cols).sort((a, b) => a.cx - b.cx);
    return { cols: best.cols, list: all, slope, mx, my, h: median(hs.map(x => x.h)) || 20, found };
  }
  /** Linha "endireitada": y relativo ao cabeçalho, compensando a inclinação local */
  const relY = (hd, w) => (w.cy - hd.my) - hd.slope * (w.cx - hd.mx);
  const relX = (hd, w) => w.cx + hd.slope * (w.cy - hd.my);
  const isNum = (t) => /^[~<>]?-?\d+([.,]\d+)?$/.test(t);
  const numOf = (t, dec) => {
    let s = String(t).replace(/^[~<>]+/, '').replace(',', '.');
    if (dec && /^-?\d+$/.test(s) && s.replace('-', '').length > dec) s = s.slice(0, s.length - dec) + '.' + s.slice(s.length - dec); // ponto decimal perdido na foto
    const v = parseFloat(s); return isNaN(v) ? null : v;
  };
  /** Agrupa palavras em linhas (endireitadas) abaixo do cabeçalho */
  function rowsBelow(W, hd, fromH, toH) {
    const ws = W.map(w => ({ w, ry: relY(hd, w), rx: relX(hd, w) })).filter(o => o.ry > hd.h * fromH && o.ry < hd.h * toH).sort((a, b) => a.ry - b.ry);
    const rows = [];
    ws.forEach(o => { const r = rows.find(r => Math.abs(r.ry - o.ry) < hd.h * 0.55); if (r) { r.items.push(o); r.ry = (r.ry * (r.items.length - 1) + o.ry) / r.items.length; } else rows.push({ ry: o.ry, items: [o] }); });
    rows.sort((a, b) => a.ry - b.ry); rows.forEach(r => r.items.sort((a, b) => a.rx - b.rx));
    return rows;
  }
  /** Atribui cada número à coluna mais próxima (se estiver perto o bastante) */
  function toColumns(row, hd, keys) {
    const cs = hd.list.filter(c => keys.includes(c.key)), out = {};
    const gap = cs.length > 1 ? median(cs.slice(1).map((c, i) => c.cx - cs[i].cx)) : 300;
    row.items.forEach(o => {
      const t = o.w.t.replace(/^[~]+/, ''); if (!isNum(t)) return;
      const c = cs.reduce((b, c) => Math.abs(c.cx - o.rx) < Math.abs(b.cx - o.rx) ? c : b, cs[0]);
      if (c && Math.abs(c.cx - o.rx) < gap * 0.6 && out[c.key] == null) out[c.key] = t;
    });
    return out;
  }

  const SUMMARY = [
    { key: 'laser', words: [/^laser$/] }, { key: 'loss', words: [/^perda$/, /^total$/] }, { key: 'orl', words: [/^(link)?orl$/, /^orl$/], optional: true },
    { key: 'end', words: [/^fim$/, /^da$/, /^fibra$/] }, { key: 'dir', words: [/^dire[cç]ao$/] }, { key: 'avg', words: [/^perda$/, /^media$/] }, { key: 'nev', words: [/^evento$/] }
  ];
  const EVENTS = [
    { key: 'n', words: [/^evento$/] }, { key: 'dist', words: [/^distancia$/] }, { key: 'loss', words: [/^perda$/] }, { key: 'refl', words: [/^reflect/] },
    { key: 'slope', words: [/^declive$/] }, { key: 'sec', words: [/^sec[cç]ao$/] }, { key: 'cum', words: [/^p$/, /^total$/] }
  ];
  const scale = (v, m) => v == null ? null : +(v * m).toFixed(3);
  const DEC = { dist: 2, sec: 2, loss: 3, cum: 3, refl: 2, slope: 3, end: 2, avg: 3, orlv: 2 };

  /** Resumo do relatório/tela: Laser · Perda total · ORL · Fim da fibra · Direção · Perda média · Eventos */
  function readSummary(W) {
    const hd = findHeader(W, SUMMARY.filter(c => c.key !== 'avg'), 3); if (!hd) return null;
    const rows = rowsBelow(W, hd, 0.5, 3.2); if (!rows.length) return null;
    const v = toColumns(rows[0], hd, ['laser', 'loss', 'orl', 'end', 'nev']);
    const out = {};
    if (v.laser) { const wl = numOf(v.laser); if ([1310, 1383, 1490, 1550, 1577, 1625, 1650].includes(wl)) out.wavelength = wl; }
    if (v.loss) out.totalLoss = numOf(v.loss, 3);
    if (v.orl) out.orl = numOf(v.orl, 2);
    if (v.end) out.lengthM = numOf(v.end, 2);
    if (v.nev) out.nEventos = numOf(v.nev);
    // perda média: palavra numérica perto da coluna "Perda Média" (cabeçalho de duas palavras)
    const avgH = findHeader(W, [{ key: 'avg', words: [/^perda$/, /^media$/] }, ...SUMMARY.filter(c => c.key === 'end' || c.key === 'nev')], 2);
    if (avgH && avgH.cols.avg) { const r2 = rowsBelow(W, avgH, 0.5, 3.2)[0]; const vv = r2 && toColumns(r2, avgH, ['avg', 'end', 'nev']); if (vv && vv.avg) out.avgAtt = numOf(vv.avg, 3); }
    return out;
  }
  /** Tabela de eventos: Evento | Distância | Perda | Reflect. | Declive | Secção | P. Total */
  function readEvents(W) {
    const hd = findHeader(W, EVENTS, 4); if (!hd) return null;
    const rows = rowsBelow(W, hd, 0.4, 40);
    // unidade da coluna Distância: km (algumas telas) ou m (relatório Viavi)
    const dC = hd.cols.dist, km = !!dC && W.some(w => /^\(?km\)?$/i.test(w.t) && Math.abs(relY(hd, w)) < hd.h * 2.8 && Math.abs(relX(hd, w) - dC.cx) < hd.h * 7);
    const dDec = km ? 0 : DEC.dist, mult = km ? 1000 : 1;
    const evs = [];
    for (const r of rows) {
      const v = toColumns(r, hd, ['dist', 'loss', 'refl', 'slope', 'sec', 'cum']);
      // número do evento: inteiro pequeno à esquerda da coluna Distância
      const distC = hd.cols.dist ? hd.cols.dist.cx : Infinity;
      const nTok = r.items.find(o => /^\d{1,3}$/.test(o.w.t) && o.rx < distC - hd.h);
      const nums = Object.keys(v).length;
      if (!nums) { if (evs.length && r.items.some(o => /[a-z]{4,}/i.test(o.w.t))) break; continue; } // fim da tabela
      if (nums === 1 && v.dist == null && v.sec == null && v.cum == null) continue; // linha de unidades/ruído
      evs.push({ n: nTok ? +nTok.w.t : null, dist: v.dist != null ? scale(numOf(v.dist, dDec), mult) : null, loss: v.loss != null ? numOf(v.loss, DEC.loss) : null, refl: v.refl != null ? numOf(v.refl, DEC.refl) : null, slope: v.slope != null ? numOf(v.slope, DEC.slope) : null, sec: v.sec != null ? scale(numOf(v.sec, km ? 0 : DEC.sec), mult) : null, cum: v.cum != null ? numOf(v.cum, DEC.cum) : null });
      if (evs.length > 200) break;
    }
    return evs.length ? evs : null;
  }
  /** Conferência cruzada da tabela de eventos com as regras do próprio relatório */
  function reconcile(evs, sum) {
    // 1º evento começa no zero (conector do OTDR)
    if (evs[0] && evs[0].dist == null && (evs[0].sec === 0 || evs[0].cum === 0)) evs[0].dist = 0;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i], p = evs[i - 1];
      if (p && p.dist != null && e.sec != null) {
        const exp = +(p.dist + e.sec).toFixed(2);
        if (e.dist == null) { e.dist = exp; e.fix = (e.fix || []).concat('distância = anterior + secção'); }
        else if (Math.abs(e.dist - exp) > 1) {
          const alt = [e.dist / 10, e.dist / 100, e.dist * 10].find(x => Math.abs(x - exp) <= 1);
          e.dist = alt != null ? +alt.toFixed(2) : exp; e.fix = (e.fix || []).concat('distância conferida pela secção');
        }
      }
      if (e.n == null) e.n = (p && p.n != null ? p.n : i) + 1;
    }
    // números de evento repetidos/fora de ordem → sequência
    evs.forEach((e, i) => { if (i && e.n <= evs[i - 1].n) e.n = evs[i - 1].n + 1; });
    const last = evs[evs.length - 1];
    if (sum) {
      if (last && last.dist != null && sum.lengthM != null && Math.abs(last.dist - sum.lengthM) > 1) {
        const alt = [sum.lengthM / 10, sum.lengthM / 100, sum.lengthM * 10].find(x => Math.abs(x - last.dist) <= 1);
        if (alt != null) sum.lengthM = +alt.toFixed(2);
      }
      if (sum.lengthM == null && last && last.dist != null) sum.lengthM = last.dist;
      if (last && last.cum != null && sum.totalLoss != null && Math.abs(last.cum - sum.totalLoss) > 0.01) {
        const alt = [sum.totalLoss / 10, sum.totalLoss / 100, sum.totalLoss * 10].find(x => Math.abs(x - last.cum) <= 0.01);
        if (alt != null) sum.totalLoss = +alt.toFixed(3);
      }
      if (sum.totalLoss == null && last && last.cum != null) sum.totalLoss = last.cum;
    }
    return evs.filter(e => e.dist != null).map(e => ({ n: e.n, distM: e.dist, loss: e.loss != null ? e.loss : 0, reflectance: e.refl != null ? e.refl : 0, kind: e.refl != null ? 'refletivo' : 'nao-refletivo', end: false, slope: e.slope || 0, cumLoss: e.cum != null ? e.cum : undefined, ocr: true, conferido: e.fix }));
  }

  /** Campos do cabeçalho por rótulo (Ident. Cabo, ID da Fibra, Origem, Extremidade, ID da OS, ID do Técnico, Data) */
  const LABELS = [['cableId', /(?:Ident\.?\s*(?:do\s*)?Cabo|Cable\s*ID)/i], ['fiberId', /(?:ID\s*da\s*Fibra(?:\s*\/?\s*N[úu]mero)?|Fiber\s*(?:ID|Number))/i], ['locationA', /(?:Origem|Location\s*A|Ponta\s*A)/i], ['locationB', /(?:Extremidade|Location\s*B|Ponta\s*B)/i], ['os', /(?:ID\s*da\s*OS|Job\s*ID)/i], ['operator', /(?:ID\s*do\s*T[ée]cnico|Operador|Operator)/i]];
  I.genFromText = (text) => {
    const gen = {};
    const lines = text.replace(/\b1D\b/g, 'ID').replace(/\bIDda/gi, 'ID da ').replace(/\bIDdo/gi, 'ID do ').split('\n');
    const all = LABELS.map(l => l[1].source).join('|');
    lines.forEach(line => LABELS.forEach(([k, re]) => {
      if (gen[k]) return;
      const m = line.match(new RegExp(re.source + '\\s*[:;=.]?\\s*(.+?)(?=\\s{2,}|\\s+(?:' + all + ')\\s*[:;=]|$)', 'i'));
      if (m) { let v = m[1].replace(/^[:;=.\s]+/, '').trim().replace(/[|;]+$/, '').trim(); if (v.length >= 1 && v.length <= 60) gen[k] = v; }
    }));
    // códigos curtos (POP, cabo, OS): "DC]" → "DC1", "0OS-…" → "OS-…", "FO7" → "F07"
    Object.keys(gen).forEach(k => { gen[k] = gen[k].replace(/^0(?=[A-Z]{2})/, '').replace(/(?<=[A-Z0-9])[\]|!](?=\s|$|>|-)/g, '1').replace(/\s+>\s*/g, '>'); });
    if (gen.fiberId) gen.fiberId = gen.fiberId.replace(/^([A-Z]{1,2})[Oo](?=\d+$)/, (x, a) => a + '0');
    // o mesmo código costuma aparecer mais de uma vez (ex.: cabo no nome do arquivo): vale a grafia mais frequente
    const conf = (x) => x.toUpperCase().replace(/[1LI|]/g, '1').replace(/[0O]/g, '0').replace(/[5S]/g, '5').replace(/[8B]/g, '8');
    const toks = text.split(/[\s_:;,()]+/).filter(Boolean);
    ['cableId', 'fiberId', 'locationA', 'locationB'].forEach(k => {
      if (!gen[k] || /\s/.test(gen[k])) return;
      const c = conf(gen[k]), cnt = {};
      toks.forEach(t => { if (t.length === gen[k].length && conf(t) === c) cnt[t] = (cnt[t] || 0) + 1; });
      const best = Object.entries(cnt).sort((a, b) => b[1] - a[1] || /[A-Z]/.test(b[0]) - /[A-Z]/.test(a[0]))[0];
      if (best && best[1] > (cnt[gen[k]] || 0)) gen[k] = best[0];
    });
    if (gen.os) { gen.project = gen.os; gen.projectSrc = 'ID da OS (foto)'; }
    const eq = text.match(/(Smart\s*OTDR[^\n]{0,30}?\(S\/N\s*\d+\)|MTS[- ]?\d{3,4}\w*|FTB[- ]?\d{3,4}\w*|AQ\d{4}\w*)/i); if (eq) gen.equipment = eq[1].replace(/Smart\s*o?TDR/i, 'SmartOTDR').trim();
    const dt = text.match(/\bData\s*[:;]?\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?:\s*\(UTC([+-]\d{1,2})\))?/);
    if (dt) { const off = dt[6] ? +dt[6] : -4; gen.dataISO = new Date(`${dt[3]}-${dt[2]}-${dt[1]}T${dt[4]}:${dt[5]}:00${off < 0 ? '-' : '+'}${String(Math.abs(off)).padStart(2, '0')}:00`).toISOString(); }
    const ior = text.match(/(?:IOR|[ÍI]ndice)[^\n]{0,60}?\b(1[.,]4\d{3,4})\s*\(?\s*(G\s*6\d{2}[^)\n]{0,12})?/i) || text.match(/\b(1[.,]4\d{3,4})\s*\(\s*(G\s*6\d{2}[^)\n]{0,12})/); if (ior) { gen.ior = U.parseNum(ior[1]); if (ior[2]) gen.fiberType = ior[2].replace(/\s+/g, '/').replace(/[^\w/]/g, ''); }
    return gen;
  };

  /** Lê UMA foto: OCR + leitura por posição + conferência */
  async function ocrOne(file, onProgress) {
    onProgress && onProgress('Preparando a imagem', 0.03);
    const prep = await I.prepImage(file);
    const w = await I.ocrEngine((s, p) => onProgress && onProgress(s, 0.08 + p * 0.85));
    await w.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1', user_defined_dpi: '300' }).catch(() => {});
    const { data } = await w.recognize(prep.canvas, { rotateAuto: true });
    const W = wordsOf(data);
    return { data, prep, text: textOf(W), W };
  }
  function interpret(o) {
    const { text, W } = o, d = { source: 'IMG', gen: {}, events: [] }, found = [];
    const sum = readSummary(W) || {};
    const evRaw = readEvents(W);
    if (evRaw) d.events = reconcile(evRaw, sum);
    // complementos por texto (telas de outros fabricantes / layout diferente)
    const f = I.fieldsFromText(text);
    // "Rótulo: valor" na mesma linha (telas) vale mais que o quadro de resumo; o quadro completa o resto
    ['wavelength', 'lengthM', 'totalLoss', 'orl', 'ior', 'pulseNs'].forEach(k => { if (f.d[k] != null && f.d[k] !== '') sum[k] = f.d[k]; });
    if (!d.events.length) { const ev = I.eventsFromOcr ? I.eventsFromOcr(I.ocrRows(o.data)) : []; d.events = ev.length >= f.d.events.length ? ev : f.d.events; }
    Object.assign(d, { wavelength: sum.wavelength, lengthM: sum.lengthM, totalLoss: sum.totalLoss, orl: sum.orl, avgAtt: sum.avgAtt });
    if (d.totalLoss != null) d.totalLossOrigin = 'arquivo';
    if (d.orl > 100 && d.orl < 9000) d.orl = +(d.orl / 100).toFixed(2); // vírgula perdida (38,20 → 3820)
    d.gen = I.genFromText(text);
    if (d.gen.ior) d.ior = d.gen.ior; if (d.gen.fiberType) d.fiberType = d.gen.fiberType; if (d.gen.dataISO) d.data = d.gen.dataISO;
    if (d.gen.locationA && d.gen.locationB) d.gen.direction = `${d.gen.locationA} -> ${d.gen.locationB}`;
    d.equipamento = d.gen.equipment || null; d.operadorOTDR = d.gen.operator || null;
    if (d.events.length) {
      const last = d.events[d.events.length - 1];
      if (d.lengthM == null) d.lengthM = last.distM;
      if (Math.abs(last.distM - d.lengthM) <= Math.max(1, d.lengthM * 0.001)) last.end = true;
      if (d.totalLoss == null) { const cum = U.sum(d.events.filter(e => !e.end), e => +e.loss || 0); if (cum > 0) { d.totalLoss = +cum.toFixed(3); d.totalLossOrigin = 'soma dos eventos (foto)'; } }
    }
    [['wavelength', 'λ'], ['totalLoss', 'Perda total'], ['orl', 'ORL'], ['lengthM', 'Fim da fibra'], ['ior', 'IOR'], ['avgAtt', 'Perda média'], ['data', 'Data da medição']].forEach(([k, l]) => d[k] != null && found.push(l));
    if (d.events.length) found.push(d.events.length + ' eventos');
    if (d.gen.cableId) found.push('Ident. cabo'); if (d.gen.locationA) found.push('Origem/Extremidade'); if (d.gen.os) found.push('OS'); if (d.gen.operator) found.push('Técnico');
    return { d, found, conf: o.data.confidence, escuro: o.prep.escuro };
  }
  const score = (r) => r.found.length * 10 + r.d.events.length * 3;
  /** Junta várias fotos do MESMO teste (ex.: resumo numa foto, tabela de eventos na outra) */
  function merge(rs) {
    const best = rs.slice().sort((a, b) => score(b) - score(a));
    const d = { source: 'IMG', gen: {}, events: [] };
    best.forEach(r => {
      Object.keys(r.d).forEach(k => { if (k === 'gen' || k === 'events') return; if (d[k] == null && r.d[k] != null) d[k] = r.d[k]; });
      Object.keys(r.d.gen).forEach(k => { if (!d.gen[k] && r.d.gen[k]) d.gen[k] = r.d.gen[k]; });
      const n = (l) => l.length * 10 + l.filter(e => e.kind === 'refletivo').length;
      if (n(r.d.events) > n(d.events)) d.events = r.d.events;
    });
    return d;
  }

  I.readImages = async (files, onProgress) => {
    files = Array.from(files);
    const raw = [];
    for (let i = 0; i < files.length; i++) raw.push(await ocrOne(files[i], (s, p) => onProgress && onProgress((files.length > 1 ? `Foto ${i + 1}/${files.length}: ` : '') + s, (i + p) / files.length)));
    onProgress && onProgress('Interpretando', 0.98);
    const rs = raw.map(interpret), d = merge(rs);
    const found = [];
    [['wavelength', 'λ'], ['totalLoss', 'Perda total'], ['orl', 'ORL'], ['lengthM', 'Fim da fibra'], ['ior', 'IOR'], ['avgAtt', 'Perda média'], ['data', 'Data da medição']].forEach(([k, l]) => d[k] != null && found.push(l));
    if (d.events.length) found.push(d.events.length + ' eventos');
    if (d.gen.cableId) found.push('Ident. cabo'); if (d.gen.locationA) found.push('Origem/Extremidade'); if (d.gen.os) found.push('OS'); if (d.gen.operator) found.push('Técnico');
    const missing = [];
    if (d.lengthM == null) missing.push('Comprimento total'); if (!d.wavelength) missing.push('Comprimento de onda'); if (d.totalLoss == null) missing.push('Atenuação total'); if (!d.orl) missing.push('ORL'); if (!d.events.length) missing.push('Eventos'); if (!d.gen.locationA) missing.push('Origem/Extremidade');
    const conf = Math.round(U.sum(rs, r => r.conf || 0) / rs.length);
    const corrigidos = d.events.filter(e => e.conferido && e.conferido.length).length;
    return [{ kind: 'IMG', format: `Foto${files.length > 1 ? 's (' + files.length + ')' : ''} da tela/relatório · leitura por posição${rs.some(r => r.escuro) ? ' · tela escura' : ''}`, ok: found.length > 0, draft: d, extracted: found, missing,
      warnings: ['Leitura por foto: confira cada valor e a tabela de eventos com a foto antes de salvar.'].concat(corrigidos ? [corrigidos + ' distância(s) conferida(s) pela secção do relatório.'] : []).concat(conf && conf < 60 ? ['Foto com pouca nitidez (confiança ' + conf + '%): se possível, tire outra foto mais de frente, sem reflexo.'] : []),
      text: raw.map(r => r.text).join('\n\n'), conf }];
  };
  I.readImage = (file, onProgress) => I.readImages([file], onProgress);
})(window.FC = window.FC || {});
