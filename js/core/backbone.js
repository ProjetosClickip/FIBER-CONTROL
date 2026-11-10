/* ClickIP FiberControl — backbone do OZmap (KMZ): POPs, caixas, cabos e rotas entre POPs
 * O KMZ do OZmap traz a GEOMETRIA (linha desenhada) de cada cabo, sem o plano de fusão.
 * Por isso a lista de ligações POP↔POP vem do diagrama (editável) e, para cada uma, este módulo
 * procura no grafo de cabos a rota cujo comprimento × fator de sobra mais se aproxima da distância
 * informada (o OZmap soma reservas/sobras ao traçado; em Manaus o fator observado é ≈ 1,25).
 */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else (root.FC = root.FC || {}).bb = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const R = 6371000, rad = Math.PI / 180;
  const hav = (a, b) => { const dLa = (b[0] - a[0]) * rad, dLo = (b[1] - a[1]) * rad; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  const pathLen = (c) => { let s = 0; for (let i = 1; i < c.length; i++) s += hav(c[i - 1], c[i]); return s; };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

  /* ---------- Leitura do KML exportado pelo OZmap ---------- */
  function field(desc, name) { const m = String(desc || '').match(new RegExp(name + '\\s*:\\s*([^\\n]+)', 'i')); return m ? m[1].trim() : ''; }
  /** doc = Document XML (DOMParser). Retorna { pops, boxes, cables } */
  function parseKML(doc) {
    const out = { pops: [], boxes: [], cables: [] };
    const txt = (el, sel) => { const e = el.querySelector(sel); return e ? e.textContent.trim() : ''; };
    doc.querySelectorAll('Placemark').forEach(pm => {
      const name = (pm.querySelector(':scope > name') || {}).textContent || '';
      const desc = txt(pm, 'description') || Array.from(pm.querySelectorAll('ExtendedData Data')).map(d => d.getAttribute('name') + ': ' + txt(d, 'value')).join('\n');
      const folders = []; let p = pm.parentElement; while (p && p.tagName !== 'Document') { if (p.tagName === 'Folder') folders.unshift(txt(p, ':scope > name')); p = p.parentElement; }
      const folder = folders.join(' / ');
      const cEl = pm.querySelector('LineString coordinates, Point coordinates'); if (!cEl) return;
      const coords = cEl.textContent.trim().split(/\s+/).map(s => s.split(',').map(Number)).filter(a => a.length >= 2 && isFinite(a[0])).map(a => [+a[1].toFixed(6), +a[0].toFixed(6)]);
      if (!coords.length) return;
      const tipo = field(desc, 'Tipo'), estado = field(desc, 'Estado de implanta[çc][ãa]o'), obs = field(desc, 'Observa[çc][õo]es');
      if (pm.querySelector('LineString')) {
        const m = tipo.match(/(\d+)\s*L\s*(\d+)\s*F/i) || tipo.match(/(\d+)\s*F(?:O)?\b/i);
        out.cables.push({ name: name.trim(), tipo, fo: m ? +(m[2] || m[1]) : null, tubos: m && m[2] ? +m[1] : null, estado, obs, folder, coords, len: pathLen(coords) });
      } else if (/pop/i.test(folder) || /^POP\b|DATA ?CENTER/i.test(name)) {
        out.pops.push({ name: name.trim(), estado, obs, folder, pt: coords[0] });
      } else {
        out.boxes.push({ name: name.trim(), tipo: tipo || folder.split(' / ').pop(), categoria: folder.split(' / ').pop(), estado, pt: coords[0] });
      }
    });
    return out;
  }

  /* ---------- Grafo: nós = POPs/caixas/junções; arestas = cabos ---------- */
  function buildGraph(data, { snapM = 30, joinM = 12 } = {}) {
    const nodes = [], cell = 0.0005, grid = new Map();
    const key = (pt) => Math.round(pt[0] / cell) + ':' + Math.round(pt[1] / cell);
    const add = (n) => { n.id = nodes.length; nodes.push(n); const k = key(n.pt); (grid.get(k) || grid.set(k, []).get(k)).push(n.id); return n.id; };
    data.pops.forEach(p => add({ kind: 'POP', name: p.name, pt: p.pt, ref: p }));
    data.boxes.forEach(b => add({ kind: 'BOX', name: b.name, pt: b.pt, tipo: b.tipo, ref: b }));
    const near = (pt, maxd, filter) => {
      const [a, b] = key(pt).split(':').map(Number); let best = null, bd = maxd;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) (grid.get((a + i) + ':' + (b + j)) || []).forEach(id => { const n = nodes[id]; if (filter && !filter(n)) return; const d = hav(pt, n.pt); if (d <= bd) { bd = d; best = id; } });
      return best;
    };
    const edges = [], adj = [];
    let soltas = 0;
    data.cables.forEach((c, ci) => {
      const ends = [c.coords[0], c.coords[c.coords.length - 1]].map(pt => {
        let id = near(pt, snapM, n => n.kind !== 'JUNCAO');
        if (id == null) id = near(pt, joinM, n => n.kind === 'JUNCAO');
        if (id == null) { soltas++; id = add({ kind: 'JUNCAO', name: 'Junção ' + c.name, pt }); }
        return id;
      });
      if (ends[0] === ends[1]) return;
      const e = { id: edges.length, a: ends[0], b: ends[1], len: c.len, cable: ci };
      edges.push(e); (adj[e.a] = adj[e.a] || []).push(e); (adj[e.b] = adj[e.b] || []).push(e);
    });
    return { nodes, edges, adj, soltas, data };
  }

  /* ---------- Dijkstra (heap binário) e k caminhos mais curtos (Yen) ---------- */
  class Heap {
    constructor() { this.h = []; }
    get size() { return this.h.length; }
    push(k, v) { const h = this.h; h.push([k, v]); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
    pop() { const h = this.h, top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top; }
  }
  function dijkstra(g, s, t, { banNodes = new Set(), banEdges = new Set(), noTransitPop = true } = {}) {
    const dist = new Map([[s, 0]]), prev = new Map(), done = new Set();
    const pq = new Heap(); pq.push(0, s);
    while (pq.size) {
      const [d, u] = pq.pop();
      if (done.has(u)) continue; done.add(u);
      if (u === t) break;
      if (noTransitPop && u !== s && g.nodes[u].kind === 'POP') continue;
      (g.adj[u] || []).forEach(e => {
        if (banEdges.has(e.id)) return; const v = e.a === u ? e.b : e.a; if (banNodes.has(v)) return;
        const nd = d + e.len; if (nd < (dist.has(v) ? dist.get(v) : Infinity)) { dist.set(v, nd); prev.set(v, [u, e.id]); pq.push(nd, v); }
      });
    }
    if (!dist.has(t)) return null;
    const nodes = [t], edges = []; let u = t;
    while (u !== s) { const [p, eid] = prev.get(u); edges.unshift(eid); nodes.unshift(p); u = p; }
    return { len: dist.get(t), nodes, edges };
  }
  function yen(g, s, t, K = 25, opts = {}) {
    const first = dijkstra(g, s, t, opts); if (!first) return [];
    const A = [first], B = [], sig = (p) => p.edges.join(',');
    const seen = new Set([sig(first)]);
    for (let k = 1; k < K; k++) {
      const last = A[k - 1];
      for (let i = 0; i < last.nodes.length - 1; i++) {
        const spur = last.nodes[i], rootN = last.nodes.slice(0, i + 1), rootE = last.edges.slice(0, i);
        const banEdges = new Set(), banNodes = new Set(rootN.slice(0, -1));
        A.forEach(p => { if (p.nodes.length > i && p.nodes.slice(0, i + 1).join(',') === rootN.join(',')) banEdges.add(p.edges[i]); });
        const sp = dijkstra(g, spur, t, Object.assign({}, opts, { banEdges, banNodes }));
        if (!sp) continue;
        const rootLen = rootE.reduce((a, eid) => a + g.edges[eid].len, 0);
        const cand = { len: rootLen + sp.len, nodes: rootN.slice(0, -1).concat(sp.nodes), edges: rootE.concat(sp.edges) };
        const sg = sig(cand); if (!seen.has(sg)) { seen.add(sg); B.push(cand); }
      }
      if (!B.length) break;
      B.sort((x, y) => x.len - y.len); A.push(B.shift());
    }
    return A;
  }

  /** Escolhe a rota cujo comprimento × fator mais se aproxima da distância do diagrama */
  function bestRoute(g, s, t, targetM, factor = 1.25, K = 30) {
    let paths = yen(g, s, t, K, { noTransitPop: true });
    let transit = false;
    if (!paths.length) { paths = yen(g, s, t, Math.min(K, 12), { noTransitPop: false }); transit = true; }
    if (!paths.length) return null;
    const score = (p) => targetM ? Math.abs(p.len * factor - targetM) / targetM : p.len;
    const best = paths.slice().sort((a, b) => score(a) - score(b))[0];
    return Object.assign({}, best, { ratio: targetM ? targetM / best.len : null, err: targetM ? (best.len * factor - targetM) / targetM : null, candidates: paths.length, viaOutroPop: transit, shortest: paths[0].len });
  }

  /** Detalha a rota: geometria contínua, caixas em ordem com distância acumulada, cabos e capacidades */
  function details(g, route) {
    const coords = [], cabos = [], caixas = []; let acc = 0;
    route.edges.forEach((eid, i) => {
      const e = g.edges[eid], c = g.data.cables[e.cable], from = route.nodes[i];
      let cc = c.coords.slice(); if (e.a !== from) cc.reverse();
      if (coords.length) cc = cc.slice(1);
      coords.push(...cc);
      cabos.push({ nome: c.name, tipo: c.tipo, fo: c.fo, estado: c.estado, obs: c.obs, inicioM: acc, len: c.len });
      acc += c.len;
      const n = g.nodes[route.nodes[i + 1]];
      if (i < route.edges.length - 1 && n.kind !== 'JUNCAO') caixas.push({ id: n.id, nome: n.name, tipo: n.tipo || n.kind, distKmzM: acc, lat: n.pt[0], lng: n.pt[1] });
    });
    const fos = cabos.filter(c => c.fo).map(c => c.fo);
    const byFo = {}; cabos.forEach(c => { if (c.fo) byFo[c.fo] = (byFo[c.fo] || 0) + c.len; });
    const principal = Object.keys(byFo).sort((a, b) => byFo[b] - byFo[a])[0];
    const reducoes = []; for (let i = 1; i < cabos.length; i++) if (cabos[i].fo && cabos[i - 1].fo && cabos[i].fo < cabos[i - 1].fo) reducoes.push({ em: caixas[i - 1] ? caixas[i - 1].nome : 'emenda', de: cabos[i - 1].fo, para: cabos[i].fo, distKmzM: cabos[i].inicioM });
    const grupos = {}; cabos.forEach(c => { if (c.obs && !/ANATEL|implantado em|padr[aã]o/i.test(c.obs)) grupos[c.obs] = (grupos[c.obs] || 0) + 1; });
    return { coords: coords.map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]), cabos, caixas, kmzM: acc, foMin: fos.length ? Math.min(...fos) : null, foMax: fos.length ? Math.max(...fos) : null, foPrincipal: principal ? +principal : null, reducoes, grupos: Object.keys(grupos), tipos: [...new Set(cabos.map(c => c.tipo))] };
  }

  /** Associa nomes (do diagrama ou do teste) aos POPs do KMZ */
  function findPop(g, label, mapa) {
    const want = norm(mapa && mapa[label] || label);
    const pops = g.nodes.filter(n => n.kind === 'POP');
    return pops.find(n => norm(n.name) === want) || pops.find(n => norm(n.name).includes(want)) || null;
  }

  return { parseKML, buildGraph, dijkstra, yen, bestRoute, details, findPop, hav, pathLen, norm };
});
