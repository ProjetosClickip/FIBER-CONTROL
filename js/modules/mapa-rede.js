/* Mapa da rede (KMZ do OZmap) + localização e exportação do trecho atenuado
 * - Lê o KMZ exportado do OZmap e desenha no Leaflet: cabos (cor por capacidade), caixas e POPs.
 * - A rede fica salva neste aparelho (IndexedDB) e como anexo (Supabase Storage) para a equipe.
 * - Trecho atenuado: a partir de um teste OTDR (ou de uma distância digitada), percorre a rota de cabos
 *   entre os POPs, localiza o ponto do evento e exporta em KMZ só o pedaço de cabo entre as caixas vizinhas.
 */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, store = FC.store, C = FC.calc;
  const CAT = 'Rede OZmap (KMZ)';
  const M = { rede: null, g: null, map: null, layers: {}, tool: { mid: '', a: '', b: '', routes: [], ri: 0, ev: '', dist: '', fator: '' }, hl: null };
  const FO_COLORS = [[6, '#8a96a3', '≤ 6FO'], [12, '#0f9d6b', '12FO'], [24, '#2a6fb5', '24FO'], [36, '#7b5cff', '36FO'], [48, '#fe6218', '48FO'], [72, '#d7372b', '72FO'], [999, '#002947', '≥ 144FO']];
  const foColor = (fo) => (FO_COLORS.find(([m]) => (fo || 0) <= m) || FO_COLORS[FO_COLORS.length - 1])[1];
  const BOX_COLORS = { CEO: '#002947', CEOS: '#01a09c', CTO: '#0f9d6b', CDO: '#7b5cff' };
  const boxColor = (b) => BOX_COLORS[(b.categoria || '').toUpperCase()] || '#8a96a3';
  const projetado = (estado) => /projeto|n[aã]o implantad/i.test(estado || '');

  /* ---------- Carregar a rede ---------- */
  async function parseFile(blob, name) {
    let xml;
    if (/\.kmz$/i.test(name)) { const z = await JSZip.loadAsync(blob); const f = Object.values(z.files).find(f => /\.kml$/i.test(f.name)); if (!f) throw new Error('KMZ sem arquivo KML interno'); xml = await f.async('text'); }
    else xml = await blob.text();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('KML inválido');
    const data = FC.bb.parseKML(doc);
    if (!data.cables.length && !data.pops.length) throw new Error('Nenhum cabo ou POP encontrado no arquivo');
    return data;
  }
  async function setRede(data, arquivo, em) {
    M.rede = { data, arquivo, em: em || U.now() }; M.g = null;
    await U.idb.put('traces', 'rede-ozmap', M.rede);
  }
  async function loadSaved() {
    if (M.rede) return M.rede;
    const r = await U.idb.get('traces', 'rede-ozmap');
    if (r) { M.rede = r; return r; }
    // rede enviada por alguém da equipe (anexo no Supabase Storage)
    const att = store.state.attachments.filter(a => a.categoria === CAT).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
    if (att) { const blob = await store.getFile(att); if (blob) { await setRede(await parseFile(blob, att.nome), att.nome, att.createdAt); return M.rede; } }
    return null;
  }
  const graph = () => M.g || (M.g = FC.bb.buildGraph(M.rede.data));

  /* ---------- POPs: códigos dos testes → POP do KMZ ---------- */
  function popByCode(code) {
    if (!code || !M.rede) return '';
    const pops = M.rede.data.pops.map(p => p.name), n = FC.bb.norm;
    const sem = (x) => n(x).replace(/^POP\s+/, '');  // "POP-COR" e "COR" são o mesmo código
    const al = (store.state.settings.popAliases || []).find(a => sem(a.codigo) === sem(code));
    if (al && pops.includes(al.pop)) return al.pop;
    const c = sem(code);
    return pops.find(p => n(p) === c) || pops.find(p => n(p).split(' ').includes(c)) || pops.find(p => n(p).includes(c)) || '';
  }

  /* ---------- Página ---------- */
  async function render(el) {
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Ferramentas</span><h1>Mapa da rede</h1><p class="muted small" id="mrInfo">Carregando…</p></div>
      <div class="acts"><button class="btn primary" id="mrLoad">${ui.icon('upload')}Carregar KMZ da rede</button></div></div>
      <div class="mr-grid"><div class="map mr-map" id="mrMap"></div><aside class="panel mr-side" id="mrSide"></aside></div>`;
    U.$('#mrLoad').onclick = async () => {
      if (!store.require('enlace.editar')) return;
      const [f] = await ui.pickFiles({ accept: '.kmz,.kml' }); if (!f) return;
      U.$('#mrInfo').textContent = 'Lendo ' + f.name + '…';
      try {
        const data = await parseFile(f, f.name); await setRede(data, f.name);
        store.putFile(f, { categoria: CAT }).catch(() => {}); // compartilha com a equipe
        store.audit('importou', 'rede', null, `${f.name}: ${data.pops.length} POPs, ${data.boxes.length} caixas, ${data.cables.length} cabos`);
        ui.toast(`Rede carregada: ${data.pops.length} POPs, ${data.boxes.length} caixas, ${data.cables.length} cabos.`, 'ok'); FC.rerender();
      } catch (e) { ui.toast('KMZ: ' + e.message, 'err', 8000); U.$('#mrInfo').textContent = 'Erro ao ler o arquivo.'; }
    };
    let rede = null;
    try { rede = await loadSaved(); } catch (e) { ui.toast('Não foi possível abrir a rede salva: ' + e.message, 'warn'); }
    if (!document.body.contains(el) || FC.route.id !== 'mapa') return;
    if (!rede) {
      U.$('#mrInfo').textContent = 'Nenhuma rede carregada.';
      U.$('#mrMap').innerHTML = `<div class="dz" style="height:100%;justify-content:center">${ui.icon('map')}<b>Carregue o KMZ exportado do OZmap</b><span class="small muted">Pastas Pops, Caixas e Cabos. O arquivo fica salvo neste aparelho e disponível para a equipe.</span></div>`;
      U.$('#mrSide').innerHTML = codesHTML(); bindCodes(); return;
    }
    const d = rede.data;
    U.$('#mrInfo').innerHTML = `${U.esc(rede.arquivo)} · ${d.pops.length} POPs · ${d.boxes.length} caixas · ${d.cables.length} cabos (${U.km(U.sum(d.cables, c => c.len), 1)} desenhados) · carregado em ${U.dt(rede.em)}`;
    drawMap(d);
    side();
  }

  function drawMap(d) {
    if (!window.L) { U.$('#mrMap').innerHTML = '<p class="muted" style="padding:16px">Biblioteca de mapas indisponível. Verifique a conexão.</p>'; return; }
    const map = M.map = L.map('mrMap', { preferCanvas: true, zoomControl: true });
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, maxNativeZoom: 19, attribution: '© OpenStreetMap' });
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19, attribution: 'Imagens © Esri' });
    osm.addTo(map);
    osm.on('tileerror', () => { const n = U.$('#mrNote'); if (n) n.textContent = 'Fundo do mapa indisponível (sem internet ou bloqueado). Cabos, caixas e POPs continuam corretos.'; });
    // cabos agrupados por capacidade
    const L_ = M.layers = { cabos: {}, caixas: {}, pops: L.layerGroup(), trechos: L.layerGroup() };
    FO_COLORS.forEach(([, , lab]) => L_.cabos[lab] = L.layerGroup().addTo(map));
    d.cables.forEach(c => {
      const lab = (FO_COLORS.find(([m]) => (c.fo || 0) <= m) || FO_COLORS[FO_COLORS.length - 1])[2];
      L.polyline(c.coords, { color: foColor(c.fo), weight: c.fo >= 48 ? 3.5 : c.fo >= 24 ? 2.6 : 1.8, opacity: .9, dashArray: projetado(c.estado) ? '6 6' : null })
        .bindPopup(`<b>${U.esc(c.name)}</b><br>${U.esc(c.tipo)}<br>${c.fo ? c.fo + ' fibras · ' : ''}${U.m(c.len, 0)} desenhados<br>${U.esc(c.estado)}${c.obs ? '<br><i>' + U.esc(c.obs) + '</i>' : ''}`)
        .addTo(L_.cabos[lab]);
    });
    // caixas por categoria (aparecem a partir do zoom 14)
    d.boxes.forEach(b => {
      const k = (b.categoria || 'Outras').toUpperCase(); L_.caixas[k] = L_.caixas[k] || L.layerGroup();
      L.circleMarker(b.pt, { radius: 4.5, color: '#fff', weight: 1, fillColor: boxColor(b), fillOpacity: projetado(b.estado) ? .35 : 1 })
        .bindPopup(`<b>${U.esc(b.name)}</b><br>${U.esc(b.tipo)}<br>${U.esc(b.estado)}<br><span class="tiny">${b.pt[0].toFixed(6)}, ${b.pt[1].toFixed(6)}</span>`).addTo(L_.caixas[k]);
    });
    const codeOf = {}; (store.state.settings.popAliases || []).forEach(a => { if (a.pop && !codeOf[a.pop]) codeOf[a.pop] = a.codigo; });
    d.pops.forEach(p => {
      const lbl = codeOf[p.name] || p.name.replace(/^POP\s*[-–]?\s*/i, '');
      L.circleMarker(p.pt, { radius: 8, color: '#002947', weight: 2, fillColor: projetado(p.estado) ? '#ffffff' : '#fe6218', fillOpacity: 1 })
        .bindTooltip(lbl, { permanent: true, direction: 'right', className: 'mr-pop', offset: [8, 0] })
        .bindPopup(`<b>${U.esc(p.name)}</b>${codeOf[p.name] ? ' · ' + U.esc(codeOf[p.name]) : ''}<br>${U.esc(p.estado)}${p.obs ? '<br><i>' + U.esc(p.obs) + '</i>' : ''}<div style="margin-top:6px;display:flex;gap:6px"><button class="btn sm" data-popa="${U.esc(p.name)}">Origem</button><button class="btn sm" data-popb="${U.esc(p.name)}">Destino</button></div>`)
        .addTo(L_.pops);
    });
    L_.pops.addTo(map);
    // trechos cadastrados no sistema (coloridos pelo comparativo)
    store.state.trechos.filter(t => t.coords && t.coords.length > 1).forEach(t => {
      const s = C.compare(t).status, p = ui.palette(), l = store.get('links', t.linkId) || {};
      L.polyline(t.coords, { color: s === 'verde' ? p.ok : s === 'amarelo' ? p.warn : s === 'vermelho' ? p.bad : p.mute, weight: 6, opacity: .55 }).bindTooltip(`${l.nome} / ${t.nome}`).addTo(L_.trechos);
    });
    const caixasZoom = () => { const z = map.getZoom(); Object.entries(L_.caixas).forEach(([k, g]) => { const on = M.boxOn ? M.boxOn[k] !== false : true; (z >= 14 && on) ? g.addTo(map) : map.removeLayer(g); }); U.$$('.mr-pop').forEach(t => t.style.display = z >= 12 ? '' : 'none'); };
    map.on('zoomend', caixasZoom);
    L.control.layers({ 'Mapa': osm, 'Satélite': sat }, null, { position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    const all = d.pops.map(p => p.pt).concat(d.cables.flatMap(c => [c.coords[0], c.coords[c.coords.length - 1]]));
    map.fitBounds(L.latLngBounds(all).pad(.05));
    setTimeout(() => { map.invalidateSize(); caixasZoom(); }, 60);
    M.caixasZoom = caixasZoom;
    map.on('popupopen', (e) => {
      const n = e.popup.getElement();
      U.$$('[data-popa]', n).forEach(b => b.onclick = () => { M.tool.a = b.dataset.popa; M.tool.routes = []; side('atenuado'); map.closePopup(); });
      U.$$('[data-popb]', n).forEach(b => b.onclick = () => { M.tool.b = b.dataset.popb; M.tool.routes = []; side('atenuado'); map.closePopup(); });
    });
  }

  /* ---------- Painel lateral ---------- */
  let sideTab = 'atenuado';
  function side(tab) {
    if (tab) sideTab = tab;
    const box = U.$('#mrSide'); if (!box) return;
    box.innerHTML = `<div class="tabs">${[['atenuado', 'Trecho atenuado'], ['camadas', 'Camadas'], ['buscar', 'Buscar'], ['codigos', 'Códigos']].map(([k, l]) => `<button class="${sideTab === k ? 'on' : ''}" data-st="${k}">${l}</button>`).join('')}</div><div id="mrTab"></div><p class="tiny muted" id="mrNote"></p>`;
    U.$$('[data-st]', box).forEach(b => b.onclick = () => side(b.dataset.st));
    ({ atenuado: tabAtenuado, camadas: tabCamadas, buscar: tabBuscar, codigos: () => { U.$('#mrTab').innerHTML = codesHTML(); bindCodes(); } })[sideTab]();
  }

  function tabCamadas() {
    const L_ = M.layers, map = M.map; M.boxOn = M.boxOn || {};
    const cnt = (g) => g.getLayers().length;
    U.$('#mrTab').innerHTML = `<h4>Cabos por capacidade</h4>${FO_COLORS.map(([, col, lab]) => `<label class="check"><input type="checkbox" data-lc="${lab}" ${map.hasLayer(L_.cabos[lab]) ? 'checked' : ''}><span class="mr-sw" style="background:${col}"></span>${lab} <span class="muted tiny">(${cnt(L_.cabos[lab])})</span></label>`).join('')}
      <p class="tiny muted">Linha tracejada = cabo em projeto / não implantado.</p>
      <h4>Caixas <span class="tiny muted">(a partir do zoom 14)</span></h4>${Object.keys(L_.caixas).sort().map(k => `<label class="check"><input type="checkbox" data-lb="${U.esc(k)}" ${M.boxOn[k] !== false ? 'checked' : ''}><span class="mr-sw round" style="background:${BOX_COLORS[k] || '#8a96a3'}"></span>${U.esc(k)} <span class="muted tiny">(${cnt(L_.caixas[k])})</span></label>`).join('')}
      <h4>Outros</h4><label class="check"><input type="checkbox" id="lpPops" ${map.hasLayer(L_.pops) ? 'checked' : ''}><span class="mr-sw round" style="background:#fe6218"></span>POPs (${cnt(L_.pops)})</label>
      <label class="check"><input type="checkbox" id="lpTr" ${map.hasLayer(L_.trechos) ? 'checked' : ''}><span class="mr-sw" style="background:var(--ok)"></span>Trechos cadastrados (${cnt(L_.trechos)})</label>`;
    U.$$('[data-lc]').forEach(c => c.onchange = () => c.checked ? L_.cabos[c.dataset.lc].addTo(map) : map.removeLayer(L_.cabos[c.dataset.lc]));
    U.$$('[data-lb]').forEach(c => c.onchange = () => { M.boxOn[c.dataset.lb] = c.checked; M.caixasZoom(); });
    U.$('#lpPops').onchange = (e) => e.target.checked ? L_.pops.addTo(map) : map.removeLayer(L_.pops);
    U.$('#lpTr').onchange = (e) => e.target.checked ? L_.trechos.addTo(map) : map.removeLayer(L_.trechos);
  }

  function tabBuscar() {
    U.$('#mrTab').innerHTML = `<input id="mrQ" type="search" placeholder="POP, caixa (ex.: CEO-1019) ou cabo" autocomplete="off"><div id="mrQr" class="mr-results"></div>`;
    const d = M.rede.data, q = U.$('#mrQ');
    q.oninput = U.debounce(() => {
      const s = FC.bb.norm(q.value); if (s.length < 2) { U.$('#mrQr').innerHTML = ''; return; }
      const hits = [];
      d.pops.forEach(p => FC.bb.norm(p.name).includes(s) && hits.push({ t: 'POP', n: p.name, pt: p.pt }));
      d.boxes.forEach(b => FC.bb.norm(b.name).includes(s) && hits.push({ t: b.categoria || 'Caixa', n: b.name, pt: b.pt, sub: b.tipo }));
      d.cables.forEach(c => (FC.bb.norm(c.name).includes(s) || FC.bb.norm(c.obs).includes(s)) && hits.push({ t: 'Cabo', n: c.name, line: c.coords, sub: c.tipo }));
      U.$('#mrQr').innerHTML = hits.slice(0, 40).map((h, i) => `<a href="#" data-h="${i}"><span class="tag">${U.esc(h.t)}</span> <b>${U.esc(h.n)}</b>${h.sub ? `<br><span class="tiny muted">${U.esc(h.sub)}</span>` : ''}</a>`).join('') || '<p class="muted small">Nada encontrado.</p>';
      U.$$('#mrQr [data-h]').forEach(a => a.onclick = (e) => { e.preventDefault(); const h = hits[+a.dataset.h]; if (h.line) { M.map.fitBounds(L.latLngBounds(h.line).pad(.3)); flash(L.polyline(h.line, { color: '#ffd23f', weight: 9, opacity: .8 })); } else { M.map.setView(h.pt, 18); flash(L.circleMarker(h.pt, { radius: 14, color: '#ffd23f', weight: 4, fill: false })); } });
    }, 150);
    q.focus();
  }
  function flash(layer) { layer.addTo(M.map); setTimeout(() => M.map.removeLayer(layer), 4000); }

  /* ---------- Trecho atenuado ---------- */
  function tabAtenuado() {
    const T = M.tool, pops = M.rede.data.pops.map(p => p.name).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const ms = store.state.measurements.slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const m = T.mid ? store.get('measurements', T.mid) : null;
    const t = m ? store.get('trechos', m.trechoId) : null;
    const an = m ? C.analyze(m, t) : null;
    const evs = an ? an.events.filter(e => e.distM > 1) : [];
    const bad = evs.filter(e => e.level === 'reprovado' || e.level === 'atencao' || e.end);
    if (m && !T.ev && !T.dist) { const w = evs.find(e => e.level === 'reprovado') || evs.find(e => e.level === 'atencao') || evs.find(e => e.end); if (w) T.ev = String(w.n); }
    const r = T.routes[T.ri];
    U.$('#mrTab').innerHTML = `
      <p class="small muted">Escolha o teste, confirme os POPs e o evento: o sistema percorre a rota de cabos e marca onde está a atenuação.</p>
      ${ui.field('Teste OTDR', `<select id="taM"><option value="">— distância digitada (sem teste) —</option>${ms.map(x => { const l = store.get('links', x.linkId) || {}; return `<option value="${x.id}" ${x.id === T.mid ? 'selected' : ''}>${U.esc(l.nome || '?')} · ${U.date(x.data)} · ${U.esc(x.fileName || x.source)}</option>`; }).join('')}</select>`)}
      <div class="form-grid" style="grid-template-columns:1fr 1fr">${ui.field('POP de origem (onde o OTDR estava)', `<select id="taA"><option value="">—</option>${pops.map(p => `<option ${p === T.a ? 'selected' : ''}>${U.esc(p)}</option>`).join('')}</select>`)}${ui.field('POP de destino', `<select id="taB"><option value="">—</option>${pops.map(p => `<option ${p === T.b ? 'selected' : ''}>${U.esc(p)}</option>`).join('')}</select>`)}</div>
      <div class="btn-row"><button class="btn sm" id="taSwap">⇄ Inverter</button><button class="btn sm primary" id="taRoute" ${T.a && T.b ? '' : 'disabled'}>${ui.icon('layers')}Traçar rota</button></div>
      ${T.routes.length ? `<h4>Rota</h4><div class="mr-routes">${T.routes.map((x, i) => `<label class="check"><input type="radio" name="taR" value="${i}" ${i === T.ri ? 'checked' : ''}> Rota ${i + 1}: <b>${U.m(x.len, 0)}</b> desenhados · ${x.det.caixas.length} caixas${i === T.best ? ' <span class="badge ok">mais próxima do teste</span>' : ''}</label>`).join('')}</div>` : ''}
      ${r ? `<h4>Evento</h4>${m ? `<select id="taE">${evs.map(e => `<option value="${e.n}" ${String(e.n) === T.ev ? 'selected' : ''}>Evento ${e.n} · ${U.m(e.distM, 1)} · ${U.db(e.loss, 3)} · ${U.esc(e.end ? 'Fim de fibra' : C.resultLabel[e.level] || e.level)}</option>`).join('')}<option value="" ${!T.ev ? 'selected' : ''}>Outra distância…</option></select>` : ''}
        ${!m || !T.ev ? ui.field('Distância no OTDR (m)', ui.input('taD', T.dist, 'type="number" step="0.1" min="0" placeholder="ex.: 3250"')) : ''}
        ${ui.field('Fator fibra ÷ traçado desenhado', ui.input('taF', fatorAtual(m, r), 'type="number" step="0.001" min="1" max="2"'), fatorHint(m, r))}
        <div id="taRes"></div>` : ''}
      ${!bad.length && m ? '<p class="small ok-text">Este teste não tem eventos de atenção/reprovados. Escolha o evento manualmente.</p>' : ''}`;
    const $ = (id) => U.$('#' + id);
    $('taM').onchange = () => { T.mid = $('taM').value; T.ev = ''; T.dist = ''; T.fator = ''; T.routes = []; const mm = store.get('measurements', T.mid); if (mm) { const l = store.get('links', mm.linkId) || {}; T.a = popByCode(l.popA) || T.a; T.b = popByCode(l.popB) || T.b; if (mm.direcaoInversa) [T.a, T.b] = [T.b, T.a]; } tabAtenuado(); if (T.a && T.b) traceRoute(); };
    $('taA').onchange = () => { T.a = $('taA').value; T.routes = []; tabAtenuado(); };
    $('taB').onchange = () => { T.b = $('taB').value; T.routes = []; tabAtenuado(); };
    $('taSwap').onclick = () => { [T.a, T.b] = [T.b, T.a]; T.routes = []; tabAtenuado(); if (T.a && T.b) traceRoute(); };
    $('taRoute').onclick = traceRoute;
    U.$$('[name=taR]').forEach(x => x.onchange = () => { T.ri = +x.value; T.fator = ''; tabAtenuado(); locate(); });
    const e = $('taE'); e && (e.onchange = () => { T.ev = e.value; tabAtenuado(); locate(); });
    const dd = $('taD'); dd && (dd.oninput = U.debounce(() => { T.dist = dd.value; locate(); }, 250));
    const ff = $('taF'); ff && (ff.oninput = U.debounce(() => { T.fator = ff.value; locate(); }, 250));
    if (r) locate();
  }
  /** Fator = comprimento da fibra (OTDR) ÷ comprimento desenhado. Usa o próprio teste quando ele vai até o POP de destino. */
  function fatorAtual(m, r) {
    if (M.tool.fator) return M.tool.fator;
    const L = m ? C.otdrNet(m) : null, k = L && r ? L / r.len : null;
    return (k && k >= 1 && k <= 1.6 ? k : +(store.state.settings.rede || {}).fator || 1.2).toFixed(3);
  }
  function fatorHint(m, r) {
    const L = m ? C.otdrNet(m) : null, k = L && r ? L / r.len : null;
    if (k && k >= 1 && k <= 1.6) return `Calculado pelo próprio teste: fibra ${U.m(L, 0)} ÷ traçado ${U.m(r.len, 0)}.`;
    if (k && k < 1) return `<span class="warn-text">O teste termina antes do fim da rota (possível rompimento): usando o fator padrão.</span>`;
    return 'Fator padrão (fibra é mais longa que o traçado por reservas, subidas e curvas).';
  }

  function traceRoute() {
    const T = M.tool, g = graph();
    const A = FC.bb.findPop(g, T.a), B = FC.bb.findPop(g, T.b);
    if (!A || !B) return ui.toast('POP não encontrado na rede.', 'err');
    let ps = FC.bb.yen(g, A.id, B.id, 6, { noTransitPop: true });
    if (!ps.length) ps = FC.bb.yen(g, A.id, B.id, 4, { noTransitPop: false });
    if (!ps.length) { T.routes = []; tabAtenuado(); return ui.toast('Não há caminho de cabos entre esses POPs no KMZ.', 'warn', 6000); }
    T.routes = ps.map(p => Object.assign(p, { det: FC.bb.details(g, p) }));
    const m = T.mid ? store.get('measurements', T.mid) : null, L = m ? C.otdrNet(m) : null, f0 = +(store.state.settings.rede || {}).fator || 1.2;
    T.best = 0;
    if (L) { let be = Infinity; T.routes.forEach((x, i) => { const er = Math.abs(x.len * f0 - L); if (er < be) { be = er; T.best = i; } }); }
    T.ri = T.best; T.fator = '';
    tabAtenuado();
  }

  /** Ponto na distância x (m) ao longo da polilinha; retorna ponto e índice do segmento */
  function pointAt(coords, x) {
    let acc = 0;
    for (let i = 1; i < coords.length; i++) {
      const s = FC.bb.hav(coords[i - 1], coords[i]);
      if (acc + s >= x) { const t = s ? (x - acc) / s : 0; return { pt: [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t], i }; }
      acc += s;
    }
    return { pt: coords[coords.length - 1], i: coords.length - 1, alem: true };
  }
  function slice(coords, x0, x1) {
    const a = pointAt(coords, x0), b = pointAt(coords, x1);
    return [a.pt, ...coords.slice(a.i, b.i), b.pt];
  }

  function locate() {
    const T = M.tool, r = T.routes[T.ri], out = U.$('#taRes'); if (!r || !out) return;
    const m = T.mid ? store.get('measurements', T.mid) : null;
    const ev = m && T.ev ? (m.events || []).find(e => String(e.n) === T.ev) : null;
    const dOtdr = ev ? ev.distM : U.parseNum(T.dist);
    if (dOtdr == null) { out.innerHTML = '<p class="small muted">Informe a distância do evento.</p>'; clearHL(); drawRoute(r); return; }
    const launch = m ? (+m.launchM || 0) : 0;
    const f = U.parseNum(T.fator || fatorAtual(m, r)) || 1.2;
    const x = Math.max(0, (dOtdr - launch) / f);
    const det = r.det, cx = det.caixas;
    const prev = [{ nome: T.a, distKmzM: 0, pop: true }].concat(cx).filter(b => b.distKmzM <= x).pop();
    const next = cx.concat([{ nome: T.b, distKmzM: r.len, pop: true }]).find(b => b.distKmzM > x);
    const p = pointAt(det.coords, x), seg = slice(det.coords, prev.distKmzM, next.distKmzM);
    const cabos = det.cabos.filter(c => c.inicioM < next.distKmzM && c.inicioM + c.len > prev.distKmzM);
    const an = m ? C.analyze(m, store.get('trechos', m.trechoId)) : null, ea = ev && an ? an.events.find(e => e.n === ev.n) : null;
    M.res = { r, x, f, dOtdr, launch, prev, next, p, seg, cabos, ev, ea, m };
    out.innerHTML = `${p.alem ? `<div class="note warn">${ui.icon('alert')}<div>A distância passa do fim da rota desenhada (${U.m(r.len, 0)} × ${U.num(f, 3)} = ${U.m(r.len * f, 0)} de fibra). Confira os POPs, a rota ou o fator.</div></div>` : ''}
      <div class="kv"><div><span class="k">No traçado</span><span class="v num">${U.m(x, 0)} de ${U.esc(short(T.a))}</span></div>
      <div><span class="k">Coordenadas</span><span class="v small">${p.pt[0].toFixed(6)}, ${p.pt[1].toFixed(6)}</span></div>
      <div><span class="k">Entre</span><span class="v small">${U.esc(prev.nome)} <span class="muted">(${U.m((x - prev.distKmzM) * f, 0)} de fibra antes)</span><br>e ${U.esc(next.nome)} <span class="muted">(${U.m((next.distKmzM - x) * f, 0)} depois)</span></span></div>
      <div><span class="k">Trecho atenuado</span><span class="v num">${U.m(next.distKmzM - prev.distKmzM, 0)} desenhados · ${cabos.length} cabo(s)</span></div>
      ${ev ? `<div><span class="k">Evento</span><span class="v small">${U.db(ev.loss, 3)}${ev.reflectance ? ' · refl. ' + U.db(ev.reflectance, 1) : ''}<br>${ea ? ui.badge(ea.level) : ''}</span></div>` : ''}</div>
      <p class="tiny muted">${cabos.map(c => U.esc(c.nome) + ' (' + U.esc(c.tipo) + ')').join(' · ')}</p>
      <div class="btn-row"><button class="btn sm" id="taGo">${ui.icon('map')}Centralizar</button><a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${p.pt[0].toFixed(6)},${p.pt[1].toFixed(6)}">Google Maps</a><button class="btn sm orange" id="taKmz">${ui.icon('download')}Exportar KMZ do trecho atenuado</button></div>`;
    U.$('#taGo').onclick = () => M.map.fitBounds(L.latLngBounds(seg).pad(.4));
    U.$('#taKmz').onclick = exportKMZ;
    drawRoute(r);
    M.hl.seg = L.polyline(seg, { color: '#d7372b', weight: 8, opacity: .9 }).addTo(M.map);
    [prev, next].forEach(b => { if (!b.pop || true) { const pt = b.lat != null ? [b.lat, b.lng] : pointAt(det.coords, b.distKmzM).pt; M.hl.box.push(L.circleMarker(pt, { radius: 8, color: '#fff', weight: 2, fillColor: '#c98a00', fillOpacity: 1 }).bindTooltip(b.nome, { permanent: true, direction: 'top', className: 'mr-pop' }).addTo(M.map)); } });
    M.hl.ev = L.circleMarker(p.pt, { radius: 11, color: '#fff', weight: 3, fillColor: '#d7372b', fillOpacity: 1, className: 'mr-pulse' }).bindTooltip(ev ? `Evento ${ev.n} · ${U.m(ev.distM, 1)} · ${U.db(ev.loss, 3)}` : `${U.m(dOtdr, 1)} no OTDR`, { permanent: true, direction: 'bottom', className: 'mr-pop mr-ev' }).addTo(M.map);
    M.map.fitBounds(L.latLngBounds(seg).pad(.6));
  }
  const short = (n) => String(n || '').replace(/^POP\s*[-–]?\s*/i, '');
  function clearHL() { if (M.hl) { [M.hl.route, M.hl.seg, M.hl.ev, ...(M.hl.box || [])].forEach(l => l && M.map.removeLayer(l)); } M.hl = { box: [] }; }
  function drawRoute(r) { clearHL(); M.hl.route = L.polyline(r.det.coords, { color: '#ffd23f', weight: 7, opacity: .75 }).addTo(M.map); M.hl.route.bringToBack(); }

  /* ---------- KMZ só do trecho atenuado ---------- */
  async function exportKMZ() {
    const R = M.res; if (!R) return;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const ll = (p) => `${p[1].toFixed(7)},${p[0].toFixed(7)},0`;
    const l = R.m ? store.get('links', R.m.linkId) || {} : {};
    const titulo = `Trecho atenuado ${short(M.tool.a)} → ${short(M.tool.b)}${R.ev ? ' · evento ' + R.ev.n : ''}`;
    const gmaps = `https://www.google.com/maps?q=${R.p.pt[0].toFixed(6)},${R.p.pt[1].toFixed(6)}`;
    const info = [
      R.m ? `Teste: ${l.nome || ''} · ${U.dt(R.m.data)} · ${R.m.fileName || ''}` : 'Distância informada manualmente',
      `Distância no OTDR: ${U.num(R.dOtdr, 1)} m${R.launch ? ` (bobina de lançamento ${R.launch} m descontada)` : ''}`,
      R.ev ? `Perda do evento: ${U.num(R.ev.loss, 3)} dB${R.ev.reflectance ? ' · refletância ' + U.num(R.ev.reflectance, 1) + ' dB' : ''}${R.ea ? ' · ' + (C.resultLabel[R.ea.level] || '') : ''}` : '',
      `Posição no traçado: ${U.num(R.x, 0)} m a partir de ${M.tool.a} (fator fibra ÷ traçado ${U.num(R.f, 3)})`,
      `Entre ${R.prev.nome} e ${R.next.nome} (${U.num(R.next.distKmzM - R.prev.distKmzM, 0)} m desenhados)`,
      `Cabos: ${R.cabos.map(c => c.nome + ' — ' + c.tipo).join('; ')}`,
      `Rede: ${M.rede.arquivo}`
    ].filter(Boolean);
    const boxPt = (b) => b.lat != null ? [b.lat, b.lng] : pointAt(R.r.det.coords, b.distKmzM).pt;
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(titulo)}</name><description>${esc(info.join('\n'))}</description>
<Style id="seg"><LineStyle><color>ff2b37d7</color><width>6</width></LineStyle></Style>
<Style id="ev"><IconStyle><color>ff2b37d7</color><scale>1.3</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/caution.png</href></Icon></IconStyle></Style>
<Style id="cx"><IconStyle><color>ff008ac9</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/orange-circle.png</href></Icon></IconStyle></Style>
<Placemark><name>${esc(R.ev ? `Evento ${R.ev.n} · ${U.num(R.ev.loss, 2)} dB` : `Ponto a ${U.num(R.dOtdr, 0)} m`)}</name><styleUrl>#ev</styleUrl><description><![CDATA[${info.map(esc).join('<br>')}<br><a href="${gmaps}">Abrir no Google Maps</a>]]></description><Point><coordinates>${ll(R.p.pt)}</coordinates></Point></Placemark>
<Placemark><name>${esc(`Trecho atenuado: ${R.prev.nome} → ${R.next.nome}`)}</name><styleUrl>#seg</styleUrl><description>${esc(info.slice(3).join('\n'))}</description><LineString><tessellate>1</tessellate><coordinates>${R.seg.map(ll).join(' ')}</coordinates></LineString></Placemark>
${[R.prev, R.next].map((b, i) => `<Placemark><name>${esc(b.nome)}</name><styleUrl>#cx</styleUrl><description>${esc(`${i ? 'Caixa/POP depois do evento' : 'Caixa/POP antes do evento'}${b.tipo ? ' · ' + b.tipo : ''} · ${U.num(Math.abs(R.x - b.distKmzM) * R.f, 0)} m de fibra até o evento`)}</description><Point><coordinates>${ll(boxPt(b))}</coordinates></Point></Placemark>`).join('\n')}
</Document></kml>`;
    const zip = new JSZip(); zip.file('doc.kml', kml);
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz' });
    const nome = ('trecho-atenuado-' + short(M.tool.a) + '-' + short(M.tool.b) + (R.ev ? '-ev' + R.ev.n : '')).replace(/[^\w-]+/g, '-').toLowerCase() + '.kmz';
    U.download(blob, nome);
    store.audit('exportou', 'rede', null, `${nome}: ${R.prev.nome} → ${R.next.nome}`);
  }

  /* ---------- Códigos dos POPs ---------- */
  function codesHTML() {
    const pops = M.rede ? M.rede.data.pops.map(p => p.name).sort() : [];
    const al = store.state.settings.popAliases || [];
    return `<h4>Códigos dos POPs</h4><p class="small muted">Os testes usam códigos curtos na Origem/Extremidade (ex.: DC1, COR). Associe cada código ao POP do KMZ para o mapa achar a rota sozinho.</p>
      <div class="table-scroll"><table class="tbl"><thead><tr><th>Código</th><th>POP no KMZ</th><th></th><th></th></tr></thead><tbody>${al.map((a, i) => `<tr><td><input data-ac="${i}" value="${U.esc(a.codigo)}" style="width:80px"></td><td><select data-ap="${i}"><option value="">—</option>${pops.map(p => `<option ${p === a.pop ? 'selected' : ''}>${U.esc(p)}</option>`).join('')}</select></td><td class="tiny muted">${U.esc(a.obs || '')}</td><td><button class="btn sm ghost" data-adel="${i}">${ui.icon('trash')}</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Nenhum código.</td></tr>'}</tbody></table></div><button class="btn sm" id="alAdd">${ui.icon('plus')}Código</button>`;
  }
  function bindCodes() {
    const al = () => (store.state.settings.popAliases || []).map(a => Object.assign({}, a));
    const re = () => { if (M.rede) side('codigos'); else FC.rerender(); };
    const a1 = U.$('#alAdd'); a1 && (a1.onclick = () => { store.setSettings('popAliases', [...al(), { codigo: '', pop: '' }]); re(); });
    U.$$('[data-ac]').forEach(i => i.onchange = () => { const a = al(); a[+i.dataset.ac].codigo = i.value.trim().toUpperCase(); store.setSettings('popAliases', a, 'Código de POP'); });
    U.$$('[data-ap]').forEach(i => i.onchange = () => { const a = al(); a[+i.dataset.ap].pop = i.value; store.setSettings('popAliases', a, 'Código de POP'); });
    U.$$('[data-adel]').forEach(b => b.onclick = () => { const a = al(); a.splice(+b.dataset.adel, 1); store.setSettings('popAliases', a, 'Código de POP removido'); re(); });
  }

  /* estilos do mapa */
  const st = document.createElement('style');
  st.textContent = `.mr-grid{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:14px;align-items:start}.mr-map{height:calc(100vh - 210px);min-height:460px}
  .mr-side{max-height:calc(100vh - 210px);overflow:auto;gap:10px}.mr-side .tabs button{padding:8px 10px;font-size:.8rem}
  .mr-sw{display:inline-block;width:18px;height:4px;border-radius:2px}.mr-sw.round{width:11px;height:11px;border-radius:50%}
  .mr-results a{display:block;padding:7px 4px;border-bottom:1px solid var(--line);color:var(--fg);text-decoration:none}.mr-results a:hover{background:var(--accent-soft)}
  .mr-routes{display:grid;gap:4px}.leaflet-tooltip.mr-pop{font:600 11px var(--font-body);padding:1px 5px;background:rgba(255,255,255,.88);color:#002947;border:0;box-shadow:none}
  .leaflet-tooltip.mr-ev{background:#d7372b;color:#fff}.mr-pulse{animation:mrp 1.2s ease-in-out infinite}@keyframes mrp{50%{stroke-width:9;stroke-opacity:.4}}
  .leaflet-control-layers{background:var(--surface);color:var(--fg);border-radius:8px;box-shadow:0 1px 5px rgba(0,0,0,.35);padding:6px 10px;font-size:12px}.leaflet-control-layers label{display:flex;gap:6px;align-items:center}.leaflet-control-layers-toggle{display:none}.leaflet-control-scale-line{background:rgba(255,255,255,.8);border:2px solid #555;border-top:0;padding:0 4px;font-size:11px;color:#333}
  body.field .mr-map{height:62vh}
  @media (max-width:920px){.mr-grid{grid-template-columns:minmax(0,1fr)}.mr-map{height:60vh}.mr-side{max-height:none}}
  @media (prefers-reduced-motion:reduce){.mr-pulse{animation:none}}`;
  document.head.appendChild(st);

  FC.mapaRede = { loadSaved, parseFile, setRede, state: M, locate, exportKMZ };
  FC.registerModule({ id: 'mapa', order: 20, title: 'Mapa da rede', icon: 'map', group: 'tools', field: true, render });
})(window.FC = window.FC || {});
