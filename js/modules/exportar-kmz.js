/* ClickIP FiberControl — Exportação KMZ/KML: rota, caixas e eventos ruins do OTDR
 * ---------------------------------------------------------------------------------
 * Gera um arquivo para Google Earth / Google Maps / QGIS com:
 *   • a ROTA do trecho (t.coords, em [lat, lng]);
 *   • as CAIXAS (t.caixas) — com coordenadas próprias ou posicionadas pela distância no traçado;
 *   • os EVENTOS RUINS do teste OTDR (nível "reprovado" e "atenção" de FC.calc.analyze),
 *     posicionados sobre a rota a partir da distância medida, usando o mesmo fator
 *     (OTDR ÷ OZmap), bobina de lançamento e sentido de medição do diagrama de caixas.
 *
 * Com o KMZ da rede da empresa carregado (botão no diálogo), cada evento ruim é localizado no
 * cabo certo e associado à caixa mais próxima (a PARTE 2, no fim do arquivo, faz isso).
 *
 * Instalação: salvar em js/modules/exportar-kmz.js e incluir em index.html, depois de
 * js/modules/ferramentas.js e antes de <script>FC.boot();</script>:
 *   <script src="js/modules/exportar-kmz.js"></script>
 * Os botões "Exportar KMZ" aparecem sozinhos em Análise OTDR e em Comparativo > Caixas.
 */
(function (FC) {
  'use strict';
  const K = FC.kmz = FC.kmz || {};

  /* ---------- Geometria (própria, sem depender de FC.geo) ---------- */
  const R = 6371008.8, rad = (x) => x * Math.PI / 180;
  const hav = (a, b) => {
    const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  };
  const pathLen = (r) => { let s = 0; for (let i = 1; i < r.length; i++) s += hav(r[i - 1], r[i]); return s; };
  /** Ponto [lat, lng] a "d" metros do início da rota (d é limitado ao tamanho da rota) */
  const pointAt = (route, d) => {
    if (!route || !route.length) return null;
    if (route.length === 1 || d <= 0) return route[0].slice(0, 2);
    let cum = 0;
    for (let i = 1; i < route.length; i++) {
      const seg = hav(route[i - 1], route[i]);
      if (cum + seg >= d) { const t = seg ? (d - cum) / seg : 0; return [route[i - 1][0] + (route[i][0] - route[i - 1][0]) * t, route[i - 1][1] + (route[i][1] - route[i - 1][1]) * t]; }
      cum += seg;
    }
    return route[route.length - 1].slice(0, 2);
  };
  K._geo = { hav, pathLen, pointAt };

  /* ---------- XML ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const cdata = (s) => '<![CDATA[' + String(s).replace(/\]\]>/g, ']]]]><![CDATA[>') + ']]>';
  const ll = (p) => `${p[1].toFixed(7)},${p[0].toFixed(7)},0`;
  const f = (v, d = 1) => (v == null || isNaN(v) ? '—' : (+v).toFixed(d).replace('.', ','));
  const LEVEL = { reprovado: 'Reprovado', atencao: 'Atenção', ok: 'OK' };
  const ICON = 'http://maps.google.com/mapfiles/kml/';
  // KML usa cor em AABBGGRR
  const STYLES = `
  <Style id="rota"><LineStyle><color>ffc8781f</color><width>4</width></LineStyle></Style>
  <Style id="caixa"><IconStyle><color>ffc8781f</color><scale>1.0</scale><Icon><href>${ICON}shapes/placemark_square.png</href></Icon></IconStyle><LabelStyle><scale>0.8</scale></LabelStyle></Style>
  <Style id="caixaRuim"><IconStyle><color>ff2a2ae0</color><scale>1.1</scale><Icon><href>${ICON}shapes/placemark_square.png</href></Icon></IconStyle><LabelStyle><scale>0.8</scale></LabelStyle></Style>
  <Style id="evReprovado"><IconStyle><scale>1.2</scale><Icon><href>${ICON}paddle/red-circle.png</href></Icon></IconStyle></Style>
  <Style id="evAtencao"><IconStyle><scale>1.1</scale><Icon><href>${ICON}paddle/ylw-circle.png</href></Icon></IconStyle></Style>
  <Style id="evOk"><IconStyle><scale>0.7</scale><Icon><href>${ICON}paddle/grn-circle.png</href></Icon></IconStyle><LabelStyle><scale>0</scale></LabelStyle></Style>
  <Style id="fim"><IconStyle><scale>1.2</scale><Icon><href>${ICON}paddle/orange-blank.png</href></Icon></IconStyle></Style>`;

  const table = (rows) => '<table border="0" cellpadding="3" cellspacing="0">' + rows.filter(Boolean).map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('') + '</table>';

  /** Posição de um evento do OTDR sobre a rota. Mesma regra do diagrama de caixas. */
  K.eventPosition = (e, ctx) => {
    const x = Math.max(0, (e.distM - (ctx.launchM || 0)) / (ctx.factor || 1)); // metros do ponto de medição, em escala OZmap
    const fromA = ctx.fromB && ctx.oz ? ctx.oz - x : x;                        // metros a partir do POP A
    const clamp = Math.min(Math.max(fromA, 0), ctx.oz || fromA);
    const dGeom = ctx.oz ? clamp * (ctx.geoLen / ctx.oz) : clamp;               // alinha a geometria à distância oficial
    return { ozFromA: fromA, point: pointAt(ctx.route, Math.min(dGeom, ctx.geoLen)), beyond: ctx.oz ? fromA > ctx.oz * 1.0005 || fromA < 0 : false };
  };

  /**
   * Monta o KML. t = trecho, m = medição, r = FC.boxes.match(t, m), events = FC.calc.analyze(m, t).events
   * opts: { includeAttention=true, includeAll=false }
   */
  K.build = ({ link, t, m, r, events, opts = {} }) => {
    const o = Object.assign({ includeAttention: true, includeAll: false }, opts);
    let route = (t.coords || []).filter(p => p && isFinite(p[0]) && isFinite(p[1]));
    const caixas = t.caixas || [];
    const warnings = [];
    if (route.length < 2) {
      const pts = caixas.filter(c => isFinite(c.lat) && isFinite(c.lng)).sort((a, b) => (a.distM || 0) - (b.distM || 0)).map(c => [c.lat, c.lng]);
      if (pts.length >= 2) { route = pts; warnings.push('O trecho não tem traçado cadastrado: a rota foi aproximada ligando as caixas em linha reta. Importe o KMZ do OZmap no Comparativo > Caixas para ter o traçado real.'); }
      else throw new Error('Este trecho não tem traçado nem caixas com coordenadas. Importe o KMZ/KML do OZmap em Comparativo > Caixas e tente de novo.');
    }
    const geoLen = pathLen(route);
    const oz = (r && r.oz) || +t.ozmapM || geoLen;
    const ctx = { route, geoLen, oz, factor: r ? r.factor : 1, fromB: r ? r.fromB : false, launchM: m ? (+m.launchM || 0) : 0 };
    if (ctx.oz && Math.abs(geoLen - ctx.oz) / ctx.oz > 0.15) warnings.push(`A geometria (${f(geoLen, 0)} m) difere ${f(Math.abs(geoLen - ctx.oz) / ctx.oz * 100, 0)}% da distância do OZmap (${f(ctx.oz, 0)} m); as posições foram escaladas para a distância do OZmap.`);

    const bad = events.filter(e => !e.end && (e.level === 'reprovado' || (o.includeAttention && e.level === 'atencao')));
    const rest = o.includeAll ? events.filter(e => !e.end && !bad.includes(e)) : [];
    const endEv = events.find(e => e.end);
    const rowOf = new Map(); // evento nº → caixa casada
    (r ? r.rows : []).forEach(x => { if (x.ev) rowOf.set(x.ev.n, x); });
    const orphan = new Set((r ? r.orphans : []).map(e => e.n));

    const evPlacemark = (e, vis) => {
      const pos = K.eventPosition(e, ctx); if (!pos.point) return '';
      const cx = rowOf.get(e.n);
      const style = e.level === 'reprovado' ? 'evReprovado' : e.level === 'atencao' ? 'evAtencao' : 'evOk';
      const desc = table([['Avaliação', LEVEL[e.level] || e.level], ['Tipo', e.tipo], ['Distância no OTDR', f(e.distM, 1) + ' m'], ['Distância a partir de ' + (link && link.popA || 'A'), f(pos.ozFromA, 0) + ' m'], ['Perda', f(e.loss, 3) + ' dB'], ['Refletância', e.reflectance ? f(e.reflectance, 1) + ' dB' : null], ['Atenuação da seção', e.slope ? f(e.slope, 3) + ' dB/km' : null], ['Caixa (OZmap)', cx ? cx.c.nome : orphan.has(e.n) ? 'sem caixa no diagrama' : null], ['Observação', e.note]]);
      return `<Placemark><name>${esc(`Evento ${e.n} · ${f(e.loss, 2)} dB`)}</name>${vis ? '' : '<visibility>0</visibility>'}<styleUrl>#${style}</styleUrl><description>${cdata(desc + (pos.beyond ? '<p><i>Evento fora da extensão da rota; posição limitada ao extremo.</i></p>' : ''))}</description><Point><coordinates>${ll(pos.point)}</coordinates></Point></Placemark>`;
    };

    const boxPlacemark = (c) => {
      const row = r && r.rows.find(x => x.c === c);
      let p = isFinite(c.lat) && isFinite(c.lng) ? [c.lat, c.lng] : (c.distM != null ? pointAt(route, Math.min(c.distM * (geoLen / oz), geoLen)) : null);
      if (!p) return '';
      const ev = row && row.ev;
      const ruim = ev && (ev.level === 'reprovado' || ev.level === 'atencao');
      const sit = !row ? '' : { casada: 'Evento encontrado no OTDR', 'sem-evento': 'Sem evento no OTDR', passagem: 'Passagem / reserva', 'sem-medicao': 'Sem medição', 'sem-posicao': 'Sem posição' }[row.status];
      const desc = table([['Tipo', c.tipo], ['Distância no traçado', c.distM != null ? f(c.distM, 0) + ' m' : null], ['Ação', c.acao], ['Execução', c.status], ['Situação no OTDR', sit], ev ? ['Evento OTDR', `nº ${ev.n} · ${f(ev.distM, 1)} m · ${f(ev.loss, 3)} dB · ${LEVEL[ev.level] || ''}`] : null, c.obs ? ['Obs.', c.obs] : null]);
      return `<Placemark><name>${esc(c.nome)}</name><styleUrl>#${ruim ? 'caixaRuim' : 'caixa'}</styleUrl><description>${cdata(desc)}</description><Point><coordinates>${ll(p)}</coordinates></Point></Placemark>`;
    };

    const title = `${link ? link.nome : 'Enlace'} / ${t.nome}`;
    const resumo = `${bad.length} evento(s) ruim(ns) · ${caixas.length} caixa(s) · rota ${f(geoLen, 0)} m` + (m ? ` · medição de ${(m.data || '').slice(0, 10)}` : '');
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(title)}</name><description>${esc(resumo)}</description>${STYLES}
<Folder><name>Rota</name><Placemark><name>${esc(title)}</name><styleUrl>#rota</styleUrl><description>${cdata(table([['Enlace', link && link.nome], ['Trecho', t.nome], ['Comprimento da rota', f(geoLen, 0) + ' m'], ['Distância OZmap', f(oz, 0) + ' m'], m ? ['Distância OTDR', f(m.lengthM, 0) + ' m'] : null, m ? ['Medição', (m.data || '').slice(0, 16).replace('T', ' ') + (m.fileName ? ' · ' + m.fileName : '')] : null, ['Fator OTDR ÷ OZmap', f(ctx.factor, 4)]]))}</description><LineString><tessellate>1</tessellate><coordinates>${route.map(ll).join(' ')}</coordinates></LineString></Placemark></Folder>
<Folder><name>Caixas (${caixas.length})</name>${caixas.map(boxPlacemark).join('')}</Folder>
<Folder><name>Eventos ruins (${bad.length})</name>${bad.map(e => evPlacemark(e, true)).join('')}</Folder>${rest.length ? `<Folder><name>Demais eventos (${rest.length})</name><visibility>0</visibility>${rest.map(e => evPlacemark(e, false)).join('')}</Folder>` : ''}${endEv ? (() => { const p = K.eventPosition(endEv, ctx); return p.point ? `<Folder><name>Fim da fibra medida</name><Placemark><name>Fim da fibra (OTDR)</name><styleUrl>#fim</styleUrl><description>${cdata(table([['Distância no OTDR', f(endEv.distM, 1) + ' m'], ['Rota total (OZmap)', f(oz, 0) + ' m'], ['Falta até o fim da rota', f(ctx.fromB ? p.ozFromA : oz - p.ozFromA, 0) + ' m']]))}</description><Point><coordinates>${ll(p.point)}</coordinates></Point></Placemark></Folder>` : ''; })() : ''}
</Document></kml>`;
    return { kml, warnings, stats: { bad: bad.length, rest: rest.length, caixas: caixas.length, geoLen, oz, factor: ctx.factor } };
  };

  /** Empacota em KMZ (ZIP com doc.kml) */
  K.toKMZ = async (kml) => {
    const z = new window.JSZip(); z.file('doc.kml', kml);
    return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz', compression: 'DEFLATE' });
  };

  /* ---------- Interface ---------- */
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); };

  K._x = { esc, cdata, ll, f, table, STYLES, LEVEL, download };

  /* ---------- Botões nas telas existentes (sem editar otdr.js / caixas.js) ---------- */
  const inject = () => {
    const U = FC.util, ui = FC.ui, store = FC.store, C = FC.calc; if (!U || !ui || !store || !C || !FC.route) return;
    const mk = (id, cls) => { const b = document.createElement('button'); b.id = id; b.className = cls; b.type = 'button'; b.innerHTML = ui.icon('map') + 'Exportar KMZ'; return b; };
    if (FC.route.id === 'otdr') {
      const rep = document.getElementById('rep');
      if (rep && !document.getElementById('kmzBtn')) {
        const p = FC.route.params || {};
        const m = p.measurementId ? store.get('measurements', p.measurementId) : p.trechoId ? C.latest(p.trechoId) : null;
        if (m) { const b = mk('kmzBtn', 'btn'); b.onclick = () => K.exportFlow(store.get('trechos', m.trechoId), m); rep.after(b); }
      }
    } else if (FC.route.id === 'comparativo') {
      const x = document.getElementById('bxX'), sel = document.getElementById('bxs');
      if (x && sel && !document.getElementById('kmzBtn2')) {
        const b = mk('kmzBtn2', 'btn'); b.onclick = () => { const t = store.get('trechos', sel.value); K.exportFlow(t, t && C.latest(t.id)); }; x.after(b);
      }
    }
  };
  let tmr = null;
  new MutationObserver(() => { clearTimeout(tmr); tmr = setTimeout(inject, 60); }).observe(document.documentElement, { childList: true, subtree: true });
})(window.FC = window.FC || {});

/* =====================================================================================
 * PARTE 2 — KMZ/KML da REDE da empresa
 * Carrega (uma vez) o KMZ de toda a rede, escolhe o(s) cabo(s) do enlace, posiciona os
 * eventos ruins sobre o cabo, identifica a caixa mais próxima e gera o KMZ + lista XLSX.
 * ===================================================================================== */
(function (FC) {
  'use strict';
  const K = FC.kmz, X = K._x, G = K._geo;
  const { esc, cdata, ll, f, table, STYLES, LEVEL, download } = X;
  const hav = G.hav, pathLen = G.pathLen, pointAt = G.pointAt;
  const rad = (x) => x * Math.PI / 180;
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* ---------- Leitura de KML/KMZ (parser próprio, sem DOM) ---------- */
  const decode = (s) => String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
  const plain = (s) => decode(s || '').replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const parseCoords = (s) => s.trim().split(/\s+/).map(t => t.split(',')).map(a => [parseFloat(a[1]), parseFloat(a[0])]).filter(p => isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180);

  K.parseKML = (xml, src) => {
    const lines = [], points = [], stack = [];
    const re = /<Folder\b[^>]*>|<\/Folder\s*>|<Placemark\b[\s\S]*?<\/Placemark\s*>/gi;
    let m;
    while ((m = re.exec(xml))) {
      const tok = m[0];
      if (/^<\/Folder/i.test(tok)) { stack.pop(); continue; }
      if (/^<Folder/i.test(tok)) {
        const rest = xml.slice(re.lastIndex, re.lastIndex + 800);
        const cut = rest.search(/<Placemark\b|<Folder\b/i);
        const nm = /<name>([\s\S]*?)<\/name>/i.exec(cut >= 0 ? rest.slice(0, cut) : rest);
        stack.push(nm ? plain(nm[1]) : '');
        continue;
      }
      const nameM = /<name>([\s\S]*?)<\/name>/i.exec(tok), dM = /<description>([\s\S]*?)<\/description>/i.exec(tok);
      const name = nameM ? plain(nameM[1]) : '', desc = dM ? plain(dM[1]) : '';
      const props = {};
      tok.replace(/<Data\s+name="([^"]*)"[^>]*>\s*<value>([\s\S]*?)<\/value>/gi, (a, k, v) => { props[k] = plain(v); return a; });
      tok.replace(/<SimpleData\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/SimpleData>/gi, (a, k, v) => { props[k] = plain(v); return a; });
      const folder = stack.filter(Boolean).join(' / ');
      for (const g of tok.matchAll(/<(Point|LineString)\b[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/gi)) {
        const c = parseCoords(g[2]);
        if (/^point$/i.test(g[1]) && c.length) points.push({ name: name || '(sem nome)', desc: desc.slice(0, 300), props, folder, lat: c[0][0], lng: c[0][1], src });
        else if (/^linestring$/i.test(g[1]) && c.length >= 2) { const len = pathLen(c); lines.push({ name: name || folder || '(sem nome)', desc: desc.slice(0, 300), props, folder, coords: c, len, key: (name || folder) + '|' + Math.round(len), src }); }
      }
    }
    return { lines, points };
  };

  K.readNetFile = async (file) => {
    const buf = await file.arrayBuffer(); const ext = String(file.name).split('.').pop().toLowerCase();
    const xmls = [];
    if (ext === 'kmz') {
      const z = await window.JSZip.loadAsync(buf);
      const names = Object.keys(z.files).filter(n => /\.kml$/i.test(n) && !z.files[n].dir);
      if (!names.length) throw new Error('O KMZ não contém arquivo .kml.');
      for (const n of names) xmls.push(await z.files[n].async('string'));
    } else xmls.push(new TextDecoder('utf-8').decode(buf));
    const out = { lines: [], points: [] };
    xmls.forEach(x => { const r = K.parseKML(x, file.name); out.lines.push(...r.lines); out.points.push(...r.points); });
    return out;
  };

  /* ---------- Armazenamento da rede (IndexedDB próprio; não mexe no banco do app) ---------- */
  const DB = {
    open: () => new Promise((res, rej) => { const q = indexedDB.open('fc-rede', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }),
    async get(k) { const db = await DB.open(); return new Promise((res, rej) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    async put(k, v) { const db = await DB.open(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); },
    async del(k) { const db = await DB.open(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
  };
  K._net = null;
  K.loadNet = async () => { if (K._net) return K._net; try { K._net = (await DB.get('rede')) || null; } catch (e) { /* sem IndexedDB: segue só em memória */ } return K._net; };
  K.saveNet = async (net) => { K._net = net; try { await DB.put('rede', net); } catch (e) { /* idem */ } };
  K.clearNet = async () => { K._net = null; try { await DB.del('rede'); } catch (e) { /* idem */ } };

  /* ---------- Escolha do cabo ---------- */
  K.rankLines = (net, { terms, L, q }) => {
    const qs = (q || '').split(/\s+/).filter(Boolean);
    return net.lines.filter(l => l.len >= 30).map(l => {
      const hay = norm(l.name + ' ' + l.folder + ' ' + Object.values(l.props).join(' '));
      let s = 0;
      terms.forEach(t => { if (t && hay.includes(t)) s += 10 + Math.min(5, t.length / 2); });
      qs.forEach(w => { s += hay.includes(w) ? 8 : -100; });
      if (L && l.len) s += Math.max(0, 6 - Math.abs(l.len - L) / L * 20);
      return { l, s };
    }).sort((a, b) => b.s - a.s);
  };

  /** Une vários segmentos de linha numa rota contínua (inverte e ordena pelas pontas mais próximas) */
  K.chain = (lines) => {
    const warn = [];
    const pool = lines.map(l => ({ l, c: l.coords }));
    const first = pool.shift();
    const parts = [{ l: first.l, c: first.c.slice() }];
    const head = () => parts[0].c[0], tail = () => { const c = parts[parts.length - 1].c; return c[c.length - 1]; };
    while (pool.length) {
      let best = null; const H = head(), T = tail();
      pool.forEach((p, i) => {
        const a = p.c[0], b = p.c[p.c.length - 1];
        [[hav(T, a), 'tail', false], [hav(T, b), 'tail', true], [hav(H, b), 'head', false], [hav(H, a), 'head', true]].forEach(([d, w, rv]) => { if (!best || d < best.d) best = { d, i, w, rv }; });
      });
      const p = pool.splice(best.i, 1)[0], c = best.rv ? p.c.slice().reverse() : p.c.slice();
      if (best.d > 40) warn.push(`Há um vão de ${Math.round(best.d)} m entre "${p.l.name}" e o segmento vizinho; confira se não falta um trecho do cabo.`);
      if (best.w === 'tail') parts.push({ l: p.l, c }); else parts.unshift({ l: p.l, c });
    }
    const coords = [];
    parts.forEach(p => { p.i0 = Math.max(0, coords.length - (coords.length && hav(coords[coords.length - 1], p.c[0]) < 1 ? 1 : 0)); p.c.forEach((pt, k) => { if (k === 0 && coords.length && hav(coords[coords.length - 1], pt) < 1) return; coords.push(pt); }); p.i1 = coords.length - 1; });
    const cum = [0]; for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + hav(coords[i - 1], coords[i]));
    parts.forEach(p => { p.from = cum[p.i0]; p.to = cum[p.i1]; });
    return { coords, cum, len: cum[cum.length - 1], parts, warn };
  };

  K.project = (ch, pt) => {
    const c = ch.coords, kx = Math.cos(rad(c[0][0])) * 111320, ky = 110540, qx = pt[1] * kx, qy = pt[0] * ky;
    let best = { off: Infinity, along: 0 };
    for (let i = 1; i < c.length; i++) {
      const ax = c[i - 1][1] * kx, ay = c[i - 1][0] * ky, bx = c[i][1] * kx, by = c[i][0] * ky, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const u = L2 ? Math.max(0, Math.min(1, ((qx - ax) * dx + (qy - ay) * dy) / L2)) : 0;
      const off = Math.hypot(ax + u * dx - qx, ay + u * dy - qy);
      if (off < best.off) best = { off, along: ch.cum[i - 1] + u * (ch.cum[i] - ch.cum[i - 1]) };
    }
    return best;
  };

  /** Pontos da rede a até maxOff metros da rota (com a distância ao longo dela) */
  K.nearBoxes = (net, ch, maxOff) => {
    let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
    ch.coords.forEach(p => { la0 = Math.min(la0, p[0]); la1 = Math.max(la1, p[0]); lo0 = Math.min(lo0, p[1]); lo1 = Math.max(lo1, p[1]); });
    const pLat = maxOff / 110540, pLng = maxOff / (111320 * Math.max(0.2, Math.cos(rad((la0 + la1) / 2))));
    const out = [];
    net.points.forEach(p => {
      if (p.lat < la0 - pLat || p.lat > la1 + pLat || p.lng < lo0 - pLng || p.lng > lo1 + pLng) return;
      const r = K.project(ch, [p.lat, p.lng]);
      if (r.off <= maxOff) out.push(Object.assign({}, p, { along: r.along, off: r.off }));
    });
    return out;
  };

  /** Em que ponta da rota o OTDR mediu? Procura o POP (pelo nome) perto de cada ponta. */
  K.guessDirection = (ch, net, link, fromB) => {
    const start = ch.coords[0], end = ch.coords[ch.coords.length - 1];
    const find = (needle) => {
      if (!needle || needle.length < 3) return null; let b = null;
      net.points.forEach(p => { if (norm(p.name).includes(needle)) { const ds = hav(start, [p.lat, p.lng]), de = hav(end, [p.lat, p.lng]), d = Math.min(ds, de); if (d <= 400 && (!b || d < b.d)) b = { d, atStart: ds <= de, name: p.name }; } });
      return b;
    };
    const o = norm(fromB ? link.popB : link.popA), other = norm(fromB ? link.popA : link.popB);
    const a = find(o); if (a) return { rev: !a.atStart, why: `"${a.name}" fica perto do ${a.atStart ? 'início' : 'fim'} da rota` };
    const b = find(other); if (b) return { rev: b.atStart, why: `"${b.name}" fica perto do ${b.atStart ? 'início' : 'fim'} da rota` };
    return { rev: false, why: null };
  };
  K.endNames = (net, ch) => {
    const near = (pt) => { let b = null; net.points.forEach(p => { const d = hav(pt, [p.lat, p.lng]); if (d <= 300 && (!b || d < b.d)) b = { d, name: p.name }; }); return b; };
    return { start: near(ch.coords[0]), end: near(ch.coords[ch.coords.length - 1]) };
  };

  /** Posiciona os eventos na rota e acha a caixa mais próxima, a anterior e a seguinte */
  K.placeNet = ({ ch, events, m, Lnet, scale, rev, boxes, tol }) => {
    const ratio = scale === 'fit' && Lnet ? ch.len / Lnet : 1, launch = +m.launchM || 0;
    const bx = boxes.map(b => Object.assign({}, b, { s: rev ? ch.len - b.along : b.along })).sort((a, b) => a.s - b.s);
    return events.map(e => {
      const sRaw = Math.max(0, e.distM - launch) * ratio, s = Math.min(sRaw, ch.len);
      const along = rev ? ch.len - s : s;
      const part = ch.parts.find(p => along >= p.from && along <= p.to) || ch.parts[ch.parts.length - 1];
      let nearest = null, prev = null, next = null;
      bx.forEach(b => { const d = b.s - s; if (!nearest || Math.abs(d) < Math.abs(nearest.d)) nearest = { b, d }; if (d <= 0 && (!prev || d > prev.d)) prev = { b, d }; if (d > 0 && (!next || d < next.d)) next = { b, d }; });
      const t = tol ? tol(s) : 30;
      return { e, s, along, beyond: sRaw > ch.len * 1.001, point: pointAt(ch.coords, along), part, nearest, prev, next, close: !!(nearest && Math.abs(nearest.d) <= t) };
    });
  };

  /* ---------- Saída KML (modo rede) ---------- */
  const rel = (d) => d == null ? '' : Math.abs(d) < 1 ? 'no mesmo ponto' : `${f(Math.abs(d), 0)} m ${d < 0 ? 'antes' : 'depois'} do evento (no sentido da medição)`;
  K.buildNet = ({ link, t, m, ch, rows, boxes, rev, ratio, opts = {}, warnings = [] }) => {
    const o = Object.assign({ includeAttention: true, includeAll: false }, opts);
    const isBad = (r) => r.e.level === 'reprovado' || (o.includeAttention && r.e.level === 'atencao');
    const bad = rows.filter(isBad), rest = o.includeAll ? rows.filter(r => !isBad(r)) : [];
    const hot = new Set(bad.filter(r => r.close).map(r => r.nearest.b));
    const bxS = (b) => rev ? ch.len - b.along : b.along;
    const title = `${link.nome || 'Enlace'} / ${t.nome}`;
    const cablePm = ch.parts.map(p => `<Placemark><name>${esc(p.l.name)}</name><styleUrl>#rota</styleUrl><description>${cdata(table([['Cabo / segmento', p.l.name], ['Pasta', p.l.folder], ['Comprimento do segmento', f(p.len || (p.to - p.from), 0) + ' m'], ['Observação', p.l.desc]].concat(Object.entries(p.l.props).slice(0, 12))))}</description><LineString><tessellate>1</tessellate><coordinates>${p.c.map(ll).join(' ')}</coordinates></LineString></Placemark>`).join('');
    const boxPm = boxes.map(b => `<Placemark><name>${esc(b.name)}</name><styleUrl>#${hot.has(b) ? 'caixaRuim' : 'caixa'}</styleUrl><description>${cdata(table([['Tipo / pasta', b.folder], ['Distância desde onde o OTDR mediu', f(bxS(b), 0) + ' m (na rota)'], ['Afastamento da rota', f(b.off, 0) + ' m'], ['Observação', b.desc]].concat(Object.entries(b.props).slice(0, 12))))}</description><Point><coordinates>${ll([b.lat, b.lng])}</coordinates></Point></Placemark>`).join('');
    const evPm = (r, vis) => {
      const e = r.e, c = r.nearest;
      const style = e.level === 'reprovado' ? 'evReprovado' : e.level === 'atencao' ? 'evAtencao' : 'evOk';
      const tag = c && r.close ? ' · ' + c.b.name : '';
      const lat = r.point[0].toFixed(6), lng = r.point[1].toFixed(6);
      const desc = table([['Avaliação', LEVEL[e.level] || e.level], ['Tipo', e.tipo], ['Distância no OTDR', f(e.distM, 1) + ' m'], ['Distância na rota', f(r.s, 0) + ' m (desde onde o OTDR mediu)'], ['Perda', f(e.loss, 3) + ' dB'], ['Refletância', e.reflectance ? f(e.reflectance, 1) + ' dB' : null], ['Atenuação da seção', e.slope ? f(e.slope, 3) + ' dB/km' : null], ['Observação', e.note], ['Cabo / segmento', r.part.l.name], ['Pasta', r.part.l.folder],
        ['Caixa mais próxima', c ? `${c.b.name} (${c.b.folder || 'sem pasta'}) — ${rel(c.d)}${r.close ? '' : ' [fora da tolerância]'}` : 'nenhuma caixa encontrada junto ao cabo'],
        ['Caixa anterior', r.prev ? `${r.prev.b.name} — ${f(Math.abs(r.prev.d), 0)} m antes` : null], ['Caixa seguinte', r.next ? `${r.next.b.name} — ${f(r.next.d, 0)} m depois` : null]]);
      return `<Placemark><name>${esc(`Evento ${e.n} · ${f(e.loss, 2)} dB${tag}`)}</name>${vis ? '' : '<visibility>0</visibility>'}<styleUrl>#${style}</styleUrl><description>${cdata(desc + `<p>Coordenadas: ${lat}, ${lng} — <a href="https://www.google.com/maps?q=${lat},${lng}">abrir no mapa</a></p>` + (r.beyond ? '<p><i>Evento além da extensão da rota; posição limitada ao extremo.</i></p>' : ''))}</description><Point><coordinates>${ll(r.point)}</coordinates></Point></Placemark>`;
    };
    const sub = `${bad.length} evento(s) ruim(ns) · ${boxes.length} caixa(s) · cabo ${f(ch.len, 0)} m` + (m ? ` · medição de ${(m.data || '').slice(0, 10)}` : '');
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(title)}</name><description>${esc(sub)}</description>${STYLES}
<Folder><name>Cabo (${ch.parts.length} segmento${ch.parts.length > 1 ? 's' : ''})</name>${cablePm}</Folder>
<Folder><name>Caixas ao longo do cabo (${boxes.length})</name>${boxPm}</Folder>
<Folder><name>Eventos ruins (${bad.length})</name>${bad.map(r => evPm(r, true)).join('')}</Folder>${rest.length ? `<Folder><name>Demais eventos (${rest.length})</name><visibility>0</visibility>${rest.map(r => evPm(r, false)).join('')}</Folder>` : ''}
</Document></kml>`;
    return { kml, warnings, stats: { bad: bad.length, rest: rest.length, caixas: boxes.length, len: ch.len } };
  };

  /* ---------- Diálogo ---------- */
  K.exportFlow = async (t, m) => {
    const U = FC.util, ui = FC.ui, C = FC.calc, store = FC.store;
    if (!t) return ui.toast('Selecione um trecho.', 'warn');
    if (!m) return ui.toast('Este trecho não tem medição OTDR. Importe um teste primeiro.', 'warn');
    const link = store.get('links', t.linkId) || {};
    const a = C.analyze(m, t), evs = a.events.filter(e => !e.end), n = evs;
    const nBad = n.filter(e => e.level === 'reprovado').length, nWarn = n.filter(e => e.level === 'atencao').length;
    let net = await K.loadNet();
    const hasRoute = (t.coords || []).filter(p => p && isFinite(p[0])).length >= 2;
    const Lnet = C.otdrNet(m) || m.lengthM || null;
    const fromB = m.direcaoInversa != null ? !!m.direcaoInversa : !!(link.popB && String(m.direction || '').toUpperCase().startsWith(String(link.popB).toUpperCase()));
    const SB = (store.state.settings && store.state.settings.boxes) || {};
    const tol = (s) => Math.max(+SB.matchM || 30, s * (+SB.matchPct || 2) / 100);
    const JUNK = /poste|pole|cliente|assinante|drop/i;
    const S = { sel: new Set(), q: '', rev: false, revTouched: false, scale: 'fit', scaleTouched: false, off: 80, off2: new Set(), seen: new Set(), ch: null, rows: null, near: [], boxes: [], why: null };
    const grp = (p) => p.folder || '(sem pasta)';
    const terms = [...new Set([link.caboId, link.nome, ...(String(link.nome || '').split(/\s+x\s+/i)), link.popA, link.popB].map(norm).filter(x => x && x.length >= 3))];

    ui.modal({
      title: 'Exportar KMZ — ' + (link.nome || '') + ' / ' + t.nome, wide: true,
      body: `<p class="small muted">Teste de ${U.esc((m.data || '').slice(0, 10))} (${U.esc(m.fileName || 'registro manual')}). Abre no Google Earth, Google Maps (Meus Mapas) e QGIS.</p>
        <div class="note ${nBad ? 'bad' : 'ok'}">${ui.icon(nBad ? 'alert' : 'check')}<div><b>${nBad}</b> evento(s) reprovado(s) e <b>${nWarn}</b> em atenção, de ${n.length} evento(s).</div></div>
        <form class="grid" id="kf" onsubmit="return false">
          <div class="field"><span class="lbl">De onde vêm a rota e as caixas</span><select name="src" id="kSrc"><option value="rede">KMZ da rede da empresa (localiza cabo e caixa)</option>${hasRoute ? '<option value="trecho">Rota e caixas cadastradas neste trecho</option>' : ''}</select></div>
          <div id="kRede" class="grid">
            <div class="note" id="kNet"></div>
            <div class="btn-row"><button type="button" class="btn sm" id="kLoad">${ui.icon('upload')}Carregar KMZ/KML da rede</button><button type="button" class="btn sm ghost" id="kClear">Remover rede salva</button></div>
            <div id="kPick" class="grid">
              <div class="field"><span class="lbl">Cabo(s) deste enlace <span class="muted small" id="kCnt"></span></span><input id="kq" placeholder="Filtrar pelo nome do cabo…" autocomplete="off"></div>
              <div id="kList" style="max-height:190px;overflow:auto;border:1px solid var(--line,#8884);border-radius:8px;padding:6px 10px"></div>
              <div class="form-grid">
                <div class="field"><span class="lbl">Onde o OTDR mediu</span><select id="kDir"></select><span class="small muted" id="kWhy"></span></div>
                <div class="field"><span class="lbl">Escala das distâncias</span><select id="kScale"><option value="fit">Ajustar ao comprimento do cabo</option><option value="direct">Distância do OTDR direta (1:1)</option></select></div>
                <div class="field"><span class="lbl">Caixas a até (m) do cabo</span><input id="kOff" type="number" min="5" max="500" value="80"></div>
              </div>
              <div><span class="lbl small">Tipos de ponto a incluir</span><div class="chips" id="kGroups"></div></div>
              <div id="kPrev"></div>
            </div>
          </div>
          <label class="check"><input type="checkbox" name="warn" checked> Incluir eventos em <b>atenção</b> (além dos reprovados)</label>
          <label class="check"><input type="checkbox" name="all"> Incluir também os demais eventos (ficam ocultos no mapa)</label>
          <label class="check" id="kRemL"><input type="checkbox" name="remember" checked> Lembrar o cabo escolhido para este trecho</label>
          <div class="field"><span class="lbl">Formato</span><select name="fmt"><option value="kmz">KMZ (compactado)</option><option value="kml">KML (texto)</option></select></div>
        </form>`,
      onOpen: (b) => {
        const $ = (s) => U.$(s, b);
        const fd = () => ui.formData($('#kf'));
        const bad = (r) => r.e.level === 'reprovado' || (fd().warn && r.e.level === 'atencao');

        const renderNet = () => {
          if (!net || !net.lines.length) { $('#kNet').className = 'note warn'; $('#kNet').innerHTML = `${ui.icon('alert')}<div><b>Nenhuma rede carregada.</b> Clique em “Carregar KMZ/KML da rede” e escolha o arquivo com a rede inteira da empresa. Ele fica salvo neste navegador; você só refaz quando a rede mudar.</div>`; $('#kPick').hidden = true; $('#kClear').hidden = true; return false; }
          $('#kNet').className = 'note ok'; $('#kNet').innerHTML = `${ui.icon('check')}<div>Rede carregada: <b>${net.lines.length}</b> linha(s) de cabo e <b>${net.points.length}</b> ponto(s)${net.files ? ' · ' + U.esc(net.files.join(', ')) : ''}.</div>`;
          $('#kPick').hidden = false; $('#kClear').hidden = false; return true;
        };
        const renderList = () => {
          const ranked = K.rankLines(net, { terms, L: Lnet, q: norm(S.q) }).filter(x => x.s > -50);
          const shown = ranked.slice(0, 25), pinned = net.lines.filter(l => S.sel.has(l.key) && !shown.some(x => x.l.key === l.key)).map(l => ({ l, s: 0 }));
          $('#kCnt').textContent = S.sel.size ? `· ${S.sel.size} selecionado(s)` : '';
          $('#kList').innerHTML = pinned.concat(shown).map(({ l }) => `<label class="check" style="display:flex;gap:8px;align-items:flex-start;padding:3px 0"><input type="checkbox" data-k="${U.esc(l.key)}" ${S.sel.has(l.key) ? 'checked' : ''}><span><b>${U.esc(l.name)}</b> <span class="tiny muted">${U.esc(l.folder || '')} · ${f(l.len / 1000, 2)} km</span></span></label>`).join('') || '<span class="muted small">Nenhum cabo encontrado com esse filtro.</span>';
        };
        const compute = () => {
          const lines = net.lines.filter(l => S.sel.has(l.key));
          if (!lines.length) { S.ch = null; S.rows = null; return; }
          S.ch = K.chain(lines);
          const g = K.guessDirection(S.ch, net, link, fromB);
          if (!S.revTouched) S.rev = g.rev; S.why = g.why;
          S.near = K.nearBoxes(net, S.ch, S.off);
          S.near.forEach(p => { const k = grp(p); if (!S.seen.has(k)) { S.seen.add(k); if (JUNK.test(k)) S.off2.add(k); } });
          S.boxes = S.near.filter(p => !S.off2.has(grp(p)));
          const okRatio = Lnet && Math.abs(S.ch.len / Lnet - 1) <= 0.25;
          if (!S.scaleTouched) S.scale = okRatio ? 'fit' : 'direct';
          S.rows = K.placeNet({ ch: S.ch, events: evs, m, Lnet, scale: S.scale, rev: S.rev, boxes: S.boxes, tol });
        };
        const renderPrev = () => {
          if (!S.ch) { $('#kPrev').innerHTML = '<p class="muted small">Marque o cabo do enlace na lista acima.</p>'; $('#kGroups').innerHTML = ''; return; }
          const en = K.endNames(net, S.ch);
          $('#kDir').innerHTML = `<option value="0" ${!S.rev ? 'selected' : ''}>Início da rota${en.start ? ' (perto de ' + U.esc(en.start.name) + ')' : ''}</option><option value="1" ${S.rev ? 'selected' : ''}>Fim da rota${en.end ? ' (perto de ' + U.esc(en.end.name) + ')' : ''}</option>`;
          $('#kWhy').textContent = S.revTouched ? '' : (S.why ? 'Detectado: ' + S.why + '.' : 'Não consegui detectar pelo nome do POP; confira.');
          $('#kScale').value = S.scale;
          const gs = {}; S.near.forEach(p => { gs[grp(p)] = (gs[grp(p)] || 0) + 1; });
          $('#kGroups').innerHTML = Object.keys(gs).sort().map(k => `<label class="check tag"><input type="checkbox" data-g="${U.esc(k)}" ${S.off2.has(k) ? '' : 'checked'}> ${U.esc(k.split(' / ').slice(-2).join(' / '))} (${gs[k]})</label>`).join('') || '<span class="muted small">Nenhum ponto da rede junto a este cabo.</span>';
          const w = S.ch.warn.slice(); const ratio = Lnet ? S.ch.len / Lnet : null;
          if (ratio && Math.abs(ratio - 1) > 0.25) w.push(`O cabo escolhido tem ${f(S.ch.len / 1000, 2)} km e o OTDR mediu ${f(Lnet / 1000, 2)} km (${f((ratio - 1) * 100, 0)}%). Confira se marcou todos os segmentos do cabo.`);
          const rows = S.rows.filter(bad);
          S.warnings = w;
          $('#kPrev').innerHTML = `${w.map(x => `<div class="note warn">${ui.icon('alert')}<div>${U.esc(x)}</div></div>`).join('')}<div class="table-scroll"><table class="tbl"><thead><tr><th>Evento</th><th class="num">OTDR</th><th class="num">Perda</th><th>Avaliação</th><th>Cabo / segmento</th><th>Caixa mais próxima</th><th>Coordenadas</th></tr></thead><tbody>${rows.map(r => `<tr class="${r.e.level === 'reprovado' ? 'row-bad' : 'row-warn'}"><td>${r.e.n}</td><td class="num">${U.m(r.e.distM, 0)}</td><td class="num">${U.db(r.e.loss, 3)}</td><td>${ui.badge(r.e.level)}</td><td class="small">${U.esc(r.part.l.name)}</td><td class="small">${r.nearest ? `<b>${U.esc(r.nearest.b.name)}</b><br><span class="tiny ${r.close ? 'muted' : 'bad-text'}">${U.esc(rel(r.nearest.d))}${r.close ? '' : ' · fora da tolerância'}</span>` : '<span class="tiny bad-text">nenhuma caixa</span>'}</td><td class="small">${r.point[0].toFixed(5)}, ${r.point[1].toFixed(5)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhum evento ruim neste teste.</td></tr>'}</tbody></table></div><div class="btn-row"><button type="button" class="btn sm" id="kXls">${ui.icon('download')}Lista dos eventos (XLSX)</button></div>`;
          const x = $('#kXls'); x && (x.onclick = () => FC.reports.exportRows(rows.map(r => ({ Evento: r.e.n, Avaliação: LEVEL[r.e.level] || r.e.level, 'Distância OTDR (m)': +r.e.distM.toFixed(1), 'Perda (dB)': r.e.loss, Latitude: +r.point[0].toFixed(6), Longitude: +r.point[1].toFixed(6), 'Cabo / segmento': r.part.l.name, Pasta: r.part.l.folder, 'Caixa mais próxima': r.nearest ? r.nearest.b.name : '', 'Tipo da caixa': r.nearest ? r.nearest.b.folder : '', 'Distância até a caixa (m)': r.nearest ? +r.nearest.d.toFixed(0) : '', 'Caixa anterior': r.prev ? r.prev.b.name : '', 'Caixa seguinte': r.next ? r.next.b.name : '' })), 'eventos-' + U.norm((link.nome || '') + '-' + t.nome).replace(/[^a-z0-9]+/g, '-'), 'xlsx', 'Eventos ruins — ' + (link.nome || '') + ' / ' + t.nome));
        };
        const update = () => { if (!renderNet()) return; compute(); renderPrev(); };
        const refresh = () => { const rede = $('#kSrc').value === 'rede'; $('#kRede').hidden = !rede; $('#kRemL').hidden = !rede; if (rede) { if (renderNet()) { renderList(); update(); } } };

        // seleção inicial: cabo já lembrado para o trecho, senão o melhor palpite pelo nome
        const initSel = () => {
          if (!net) return; const saved = (t.redeCabos || []).filter(k => net.lines.some(l => l.key === k));
          if (saved.length) { saved.forEach(k => S.sel.add(k)); if (t.redeInverso != null) { S.rev = !!t.redeInverso; S.revTouched = true; } return; }
          const top = K.rankLines(net, { terms, L: Lnet, q: '' })[0]; if (top && top.s >= 10) S.sel.add(top.l.key);
        };
        $('#kSrc').value = hasRoute && !(net && net.lines.length) ? 'trecho' : 'rede';
        initSel(); refresh();

        $('#kSrc').onchange = refresh;
        $('#kq').oninput = U.debounce(() => { S.q = $('#kq').value; renderList(); }, 150);
        $('#kList').onchange = (e) => { const k = e.target.dataset.k; if (k == null) return; e.target.checked ? S.sel.add(k) : S.sel.delete(k); S.revTouched = false; S.scaleTouched = false; $('#kCnt').textContent = S.sel.size ? `· ${S.sel.size} selecionado(s)` : ''; update(); };
        $('#kDir').onchange = () => { S.rev = $('#kDir').value === '1'; S.revTouched = true; update(); };
        $('#kScale').onchange = () => { S.scale = $('#kScale').value; S.scaleTouched = true; update(); };
        $('#kOff').onchange = () => { S.off = Math.max(5, Math.min(500, +$('#kOff').value || 80)); update(); };
        $('#kGroups').onchange = (e) => { const k = e.target.dataset.g; if (k == null) return; e.target.checked ? S.off2.delete(k) : S.off2.add(k); update(); };
        $('#kf').addEventListener('change', (e) => { if (e.target.name === 'warn' && S.ch) renderPrev(); });
        $('#kLoad').onclick = async () => {
          const files = await ui.pickFiles({ accept: '.kmz,.kml', multiple: true }); if (!files.length) return;
          ui.toast('Lendo a rede… arquivos grandes podem levar alguns segundos.', 'info', 4000);
          try {
            const all = { lines: [], points: [], files: [], at: U.now() };
            for (const fl of files) { const r = await K.readNetFile(fl); all.lines.push(...r.lines); all.points.push(...r.points); all.files.push(fl.name); }
            if (!all.lines.length) throw new Error('Nenhuma linha de cabo encontrada no arquivo. A rede precisa ter os cabos como linhas (LineString).');
            await K.saveNet(all); net = all; S.sel.clear(); S.seen.clear(); S.off2.clear(); initSel(); refresh();
            ui.toast(`Rede carregada: ${all.lines.length} linhas e ${all.points.length} pontos.`, 'ok');
          } catch (e) { ui.toast('Não consegui ler a rede: ' + e.message, 'err', 9000); }
        };
        $('#kClear').onclick = async () => { await K.clearNet(); net = null; S.sel.clear(); refresh(); ui.toast('Rede removida deste navegador.', 'ok'); };
      },
      actions: [{ label: 'Cancelar', cls: 'ghost' }, {
        label: 'Gerar arquivo', cls: 'primary', icon: 'download', onClick: async (b) => {
          const o = ui.formData(U.$('#kf', b));
          try {
            let out;
            const opts = { includeAttention: !!o.warn, includeAll: !!o.all };
            if (o.src === 'trecho') {
              let r = null; try { r = FC.boxes && FC.boxes.match(t, m); } catch (e) { /* sem caixas casadas */ }
              out = K.build({ link, t, m, r, events: a.events, opts });
            } else {
              if (!S.ch) throw new Error('Marque o cabo do enlace na lista antes de gerar o arquivo.');
              out = K.buildNet({ link, t, m, ch: S.ch, rows: S.rows, boxes: S.boxes, rev: S.rev, opts, warnings: S.warnings || [] });
              if (o.remember) { t.redeCabos = [...S.sel]; t.redeInverso = S.rev; store.upsert('trechos', t, 'Cabo(s) da rede vinculados ao trecho: ' + [...S.sel].join('; ')); }
            }
            const base = U.norm(`${link.nome}-${t.nome}`).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + (m.data || '').slice(0, 10);
            if (o.fmt === 'kml') download(new Blob([out.kml], { type: 'application/vnd.google-earth.kml+xml' }), base + '.kml');
            else download(await K.toKMZ(out.kml), base + '.kmz');
            const wn = (out.warnings || [])[0];
            ui.toast(`Arquivo gerado: ${out.stats.bad} evento(s) ruim(ns), ${out.stats.caixas} caixa(s).` + (wn ? ' Atenção: ' + wn : ''), wn ? 'warn' : 'ok', wn ? 10000 : 5000);
            store.audit && store.audit('exportou', 'trechos', t.id, 'KMZ/KML gerado: ' + base);
          } catch (e) { ui.toast(e.message, 'err', 9000); return false; }
        }
      }]
    });
  };
})(window.FC = window.FC || {});
