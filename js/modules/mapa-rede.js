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
  const M = { rede: null, g: null, map: null, layers: {}, codeOf: {}, tool: { mid: '', a: '', b: '', routes: [], ri: 0, fator: '', lance: null, showAll: false, sel: [] }, hl: { items: [], evs: [] }, R: null };
  // Padrão visual ClickIP dos cabos (seguir à risca)
  const FO_COLORS = [[6, '#e10600', '06FO'], [12, '#0047ff', '12FO'], [24, '#ff3fa4', '24FO'], [36, '#8c8c8c', '36FO'], [48, '#000000', '48FO'], [72, '#7b3f00', '72FO'], [999, '#ffffff', '144FO']];
  const SEM_FO = '#b8c2cc';
  const foBucket = (fo) => fo ? (FO_COLORS.find(([m]) => fo <= m) || FO_COLORS[FO_COLORS.length - 1]) : null;
  const foColor = (fo) => (foBucket(fo) || [0, SEM_FO])[1];
  /** Remove caixas "soltas": só ficam as que têm cabo passando a até 12 m */
  function filtrarCaixas(data, maxM = 12) {
    if (data.filtrado) return data;
    const cell = 0.0005, grid = new Map(), key = (a, b) => a + ':' + b;
    data.cables.forEach(c => { for (let i = 1; i < c.coords.length; i++) { const p = c.coords[i - 1], q = c.coords[i];
      const x0 = Math.floor(Math.min(p[0], q[0]) / cell), x1 = Math.floor(Math.max(p[0], q[0]) / cell), y0 = Math.floor(Math.min(p[1], q[1]) / cell), y1 = Math.floor(Math.max(p[1], q[1]) / cell);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = key(x, y); (grid.get(k) || grid.set(k, []).get(k)).push([p, q]); } } });
    const near = (pt) => { const cx = Math.floor(pt[0] / cell), cy = Math.floor(pt[1] / cell), kx = Math.cos(pt[0] * Math.PI / 180) * 111320, ky = 110540;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [p, q] of (grid.get(key(cx + i, cy + j)) || [])) {
        const ax = (p[1] - pt[1]) * kx, ay = (p[0] - pt[0]) * ky, bx = (q[1] - pt[1]) * kx, by = (q[0] - pt[0]) * ky, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
        const t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
        if (Math.hypot(ax + t * dx, ay + t * dy) <= maxM) return true; }
      return false; };
    const antes = data.boxes.length;
    data.boxes = data.boxes.filter(b => near(b.pt));
    data.caixasRemovidas = antes - data.boxes.length; data.filtrado = true;
    return data;
  }
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
    filtrarCaixas(data);
    M.rede = { data, arquivo, em: em || U.now() }; M.g = null;
    await U.idb.put('traces', 'rede-ozmap', M.rede);
  }
  async function loadSaved() {
    if (M.rede) return M.rede;
    const r = await U.idb.get('traces', 'rede-ozmap');
    if (r) { if (!r.data.filtrado) { filtrarCaixas(r.data); await U.idb.put('traces', 'rede-ozmap', r); } M.rede = r; return r; }
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
    U.$('#mrInfo').innerHTML = `${U.esc(rede.arquivo)} · ${d.pops.length} POPs · ${d.boxes.length} caixas${d.caixasRemovidas ? ` (${d.caixasRemovidas} sem cabo ocultadas)` : ''} · ${d.cables.length} cabos (${U.km(U.sum(d.cables, c => c.len), 1)} desenhados) · carregado em ${U.dt(rede.em)}`;
    drawMap(d);
    side();
    if ((M.tool.popSel || []).length) drawPopSel(false);
  }

  function drawMap(d) {
    if (!window.L) { U.$('#mrMap').innerHTML = '<p class="muted" style="padding:16px">Biblioteca de mapas indisponível. Verifique a conexão.</p>'; return; }
    const map = M.map = L.map('mrMap', { preferCanvas: true, zoomControl: true, renderer: L.canvas({ tolerance: 6 }) });
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, maxNativeZoom: 19, attribution: '© OpenStreetMap' });
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19, attribution: 'Imagens © Esri' });
    osm.addTo(map);
    osm.on('tileerror', () => { const n = U.$('#mrNote'); if (n) n.textContent = 'Fundo do mapa indisponível (sem internet ou bloqueado). Cabos, caixas e POPs continuam corretos.'; });
    const L_ = M.layers = { cabos: {}, caixas: {}, pops: L.layerGroup(), trechos: L.layerGroup() };
    FO_COLORS.forEach(([, , lab]) => L_.cabos[lab] = L.layerGroup().addTo(map));
    // cabos: destaque ao passar o mouse, painel completo ao clicar
    d.cables.forEach((c, ci) => {
      const bk = foBucket(c.fo), lab = bk ? bk[2] : 'Sem capacidade';
      L_.cabos[lab] = L_.cabos[lab] || L.layerGroup().addTo(map);
      const w = c.fo >= 48 ? 3.5 : c.fo >= 24 ? 2.8 : 2.2, cor = foColor(c.fo), branco = cor === '#ffffff', dash = projetado(c.estado) ? '6 6' : (!bk ? '2 5' : null);
      if (branco) L.polyline(c.coords, { color: '#3a3a3a', weight: w + 2.2, opacity: .9, dashArray: dash, interactive: false }).addTo(L_.cabos[lab]);
      const pl = L.polyline(c.coords, { color: cor, weight: w, opacity: 1, dashArray: dash });
      pl.on('mouseover', () => { pl.setStyle({ weight: w + 4 }); pl.bringToFront(); });
      pl.on('mouseout', () => pl.setStyle({ weight: w }));
      pl.bindTooltip(`${U.esc(c.name)} · ${c.fo ? c.fo + 'FO' : 'sem capacidade'}`, { sticky: true, className: 'mr-tip' });
      pl.bindPopup(() => cablePopup(ci), { maxWidth: 320 });
      pl.addTo(L_.cabos[lab]);
    });
    // caixas por categoria (a partir do zoom 14), com os cabos ligados a cada uma
    d.boxes.forEach((b, bi) => {
      const k = (b.categoria || 'Outras').toUpperCase(); L_.caixas[k] = L_.caixas[k] || L.layerGroup();
      const cm = L.circleMarker(b.pt, { radius: 4.5, color: '#fff', weight: 1, fillColor: boxColor(b), fillOpacity: projetado(b.estado) ? .35 : 1 });
      cm.on('mouseover', () => cm.setRadius(8)); cm.on('mouseout', () => cm.setRadius(4.5));
      cm.bindTooltip(U.esc(b.name), { direction: 'top', className: 'mr-tip' });
      cm.bindPopup(() => nodePopup(d.pops.length + bi), { maxWidth: 320 }).addTo(L_.caixas[k]);
    });
    const codeOf = {}; (store.state.settings.popAliases || []).forEach(a => { if (a.pop && !codeOf[a.pop]) codeOf[a.pop] = a.codigo; });
    M.codeOf = codeOf;
    d.pops.forEach((p, pi) => {
      const lbl = codeOf[p.name] || short(p.name);
      L.circleMarker(p.pt, { radius: 8, color: '#002947', weight: 2, fillColor: projetado(p.estado) ? '#ffffff' : '#fe6218', fillOpacity: 1 })
        .bindTooltip(U.esc(lbl), { permanent: true, direction: 'right', className: 'mr-pop', offset: [8, 0] })
        .bindPopup(() => nodePopup(pi, true), { maxWidth: 320 })
        .addTo(L_.pops);
    });
    (store.state.settings.popsRede || []).forEach(p => {
      if (d.pops.some(x => x.name === p.nome)) return;
      L.circleMarker([p.lat, p.lng], { radius: 8, color: '#002947', weight: 2, fillColor: projetado(p.estado) ? '#ffffff' : '#fe6218', fillOpacity: 1, dashArray: '3 2' })
        .bindTooltip(U.esc(p.codigo || short(p.nome)), { permanent: true, direction: 'right', className: 'mr-pop', offset: [8, 0] })
        .bindPopup(`<b>${U.esc(p.nome)}</b>${p.codigo ? ' <span class="tag">' + U.esc(p.codigo) + '</span>' : ''}<br>${U.esc(p.estado || '')} · cadastrado no sistema<br><span class="tiny">${p.lat.toFixed(6)}, ${p.lng.toFixed(6)} · ${U.esc(p.por || '')} ${U.date(p.em)}</span>${p.obs ? '<br><i>' + U.esc(p.obs) + '</i>' : ''}`)
        .addTo(L_.pops);
    });
    L_.pops.addTo(map);
    store.state.trechos.filter(t => t.coords && t.coords.length > 1).forEach(t => {
      const s = C.compare(t).status, p = ui.palette(), l = store.get('links', t.linkId) || {};
      L.polyline(t.coords, { color: s === 'verde' ? p.ok : s === 'amarelo' ? p.warn : s === 'vermelho' ? p.bad : p.mute, weight: 6, opacity: .55 }).bindTooltip(`${U.esc(l.nome || '')} / ${U.esc(t.nome)}`).addTo(L_.trechos);
    });
    const caixasZoom = () => { const z = map.getZoom(); Object.entries(L_.caixas).forEach(([k, g]) => { const on = M.boxOn ? M.boxOn[k] !== false : true; if (z >= 14 && on) { if (!map.hasLayer(g)) { g.addTo(map); g.eachLayer(l => l.bringToFront()); } } else map.removeLayer(g); }); L_.pops.eachLayer(l => l.bringToFront()); U.$$('.mr-pop').forEach(t => t.style.display = z >= 12 ? '' : 'none'); };
    map.on('zoomend', caixasZoom);
    L.control.layers({ 'Mapa': osm, 'Satélite': sat }, null, { position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    // botões: rede inteira, tela cheia, minha localização
    const Btns = L.Control.extend({ options: { position: 'topleft' }, onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar mr-btns');
      div.innerHTML = `<a href="#" title="Ver a rede inteira" data-mb="all">⤢</a><a href="#" title="Tela cheia" data-mb="full">⛶</a><a href="#" title="Minha localização" data-mb="gps">◎</a>`;
      L.DomEvent.disableClickPropagation(div);
      div.onclick = (e) => { e.preventDefault(); const k = e.target.dataset.mb; if (k === 'all') fitAll(); if (k === 'full') fullscreen(); if (k === 'gps') gps(); };
      return div; } });
    map.addControl(new Btns());
    // legenda
    const Leg = L.Control.extend({ options: { position: 'bottomleft' }, onAdd() {
      const div = L.DomUtil.create('div', 'mr-legend');
      div.innerHTML = FO_COLORS.map(([, col, lab]) => `<span><i style="background:${col};${col === '#ffffff' ? 'outline:1px solid #3a3a3a' : ''}"></i>${lab}</span>`).join('') + `<span><i class="dot" style="background:#fe6218"></i>POP</span><span><i class="dot" style="background:#002947"></i>CEO</span><span><i class="dot" style="background:#01a09c"></i>CEOS</span>`;
      L.DomEvent.disableClickPropagation(div); return div; } });
    map.addControl(new Leg());
    // botão direito / toque longo: coordenadas do ponto
    map.on('contextmenu', (e) => {
      const la = e.latlng.lat.toFixed(6), lo = e.latlng.lng.toFixed(6);
      L.popup().setLatLng(e.latlng).setContent(`<b>${la}, ${lo}</b><div class="mr-pp-btns"><button class="btn sm" data-copy="${la}, ${lo}">Copiar</button><a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${la},${lo}">Google Maps</a></div>`).openOn(map);
    });
    const fitAll = () => map.fitBounds(L.latLngBounds(d.pops.map(p => p.pt).concat(d.cables.flatMap(c => [c.coords[0], c.coords[c.coords.length - 1]]))).pad(.05));
    fitAll();
    setTimeout(() => { map.invalidateSize(); caixasZoom(); }, 60);
    M.caixasZoom = caixasZoom;
    map.on('popupopen', (e) => {
      const n = e.popup.getElement();
      U.$$('[data-popa]', n).forEach(b => b.onclick = () => { M.tool.a = b.dataset.popa; M.tool.routes = []; side('teste'); map.closePopup(); });
      U.$$('[data-popb]', n).forEach(b => b.onclick = () => { M.tool.b = b.dataset.popb; M.tool.routes = []; side('teste'); map.closePopup(); });
      U.$$('[data-evsel]', n).forEach(b => b.onclick = () => { toggleSel(+b.dataset.evsel); map.closePopup(); });
      U.$$('[data-copy]', n).forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => ui.toast('Coordenadas copiadas.', 'ok'), () => ui.toast('Copie manualmente: ' + b.dataset.copy, 'warn')));
      U.$$('[data-zoomc]', n).forEach(b => b.onclick = () => { const c = M.rede.data.cables[+b.dataset.zoomc]; map.fitBounds(L.latLngBounds(c.coords).pad(.3)); });
      U.$$('[data-gonode]', n).forEach(b => b.onclick = () => { const nd = graph().nodes[+b.dataset.gonode]; map.setView(nd.pt, Math.max(map.getZoom(), 17)); });
    });
  }
  /** Popup do cabo: dados + caixas/POPs nas pontas */
  function cablePopup(ci) {
    const g = graph(), c = M.rede.data.cables[ci], e = g.edges.find(x => x.cable === ci);
    const ends = e ? [g.nodes[e.a], g.nodes[e.b]] : [];
    return `<div class="mr-pp"><b>${U.esc(c.name)}</b><br><span class="small">${U.esc(c.tipo)}</span>
      <div class="mr-pp-kv"><span>Fibras</span><b>${c.fo || '—'}</b><span>Desenhado</span><b>${U.m(c.len, 0)}</b><span>Estado</span><b>${U.esc(c.estado || '—')}</b></div>
      ${c.obs ? `<p class="tiny"><i>${U.esc(c.obs)}</i></p>` : ''}
      ${ends.length ? `<p class="tiny muted">Pontas:</p>${ends.map(n => `<a href="#" class="mr-pp-link" data-gonode="${n.id}">${U.esc(n.kind === 'JUNCAO' ? 'Ponta sem caixa' : n.name)}</a>`).join('')}` : ''}
      <div class="mr-pp-btns"><button class="btn sm" data-zoomc="${ci}">Ver cabo inteiro</button></div></div>`;
  }
  /** Popup de caixa/POP: dados + cabos ligados */
  function nodePopup(id, isPop) {
    const g = graph(), n = g.nodes[id], ref = n.ref || {};
    const cabos = (g.adj[id] || []).map(e => ({ e, c: M.rede.data.cables[e.cable], other: g.nodes[e.a === id ? e.b : e.a] }));
    const code = isPop && M.codeOf ? M.codeOf[n.name] : '';
    return `<div class="mr-pp"><b>${U.esc(n.name)}</b>${code ? ` <span class="tag">${U.esc(code)}</span>` : ''}<br><span class="small">${U.esc(ref.tipo || (isPop ? 'POP' : ''))}</span> · <span class="small">${U.esc(ref.estado || '')}</span>
      <p class="tiny muted">${n.pt[0].toFixed(6)}, ${n.pt[1].toFixed(6)}</p>
      ${cabos.length ? `<p class="tiny muted">${cabos.length} cabo(s) ligado(s):</p>${cabos.slice(0, 8).map(x => `<a href="#" class="mr-pp-link" data-zoomc="${x.e.cable}">${x.c.fo || '?'}FO → ${U.esc(x.other.kind === 'JUNCAO' ? 'ponta sem caixa' : x.other.name)} <span class="muted">(${U.m(x.c.len, 0)})</span></a>`).join('')}` : '<p class="tiny muted">Nenhum cabo ligado a menos de 30 m.</p>'}
      <div class="mr-pp-btns"><button class="btn sm" data-copy="${n.pt[0].toFixed(6)}, ${n.pt[1].toFixed(6)}">Copiar coordenadas</button>${isPop ? `<button class="btn sm" data-popa="${U.esc(n.name)}">Origem</button><button class="btn sm" data-popb="${U.esc(n.name)}">Destino</button>` : ''}</div></div>`;
  }
  function fullscreen() { const el = U.$('.mr-grid'); try { document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen().then(() => setTimeout(() => M.map.invalidateSize(), 200)); } catch (e) { ui.toast('Tela cheia não disponível aqui.', 'warn'); } }
  function gps() {
    if (!navigator.geolocation) return ui.toast('Localização não disponível neste aparelho.', 'warn');
    navigator.geolocation.getCurrentPosition((p) => { const ll = [p.coords.latitude, p.coords.longitude]; if (M.me) M.map.removeLayer(M.me); M.me = L.circleMarker(ll, { radius: 9, color: '#fff', weight: 3, fillColor: '#2a6fb5', fillOpacity: 1 }).bindTooltip('Você está aqui').addTo(M.map); M.map.setView(ll, 17); }, () => ui.toast('Não foi possível obter a localização (permissão negada ou indisponível).', 'warn'), { enableHighAccuracy: true, timeout: 10000 });
  }

  /* ---------- Painel lateral ---------- */
  let sideTab = 'pops';
  function side(tab) {
    if (tab) sideTab = tab;
    const box = U.$('#mrSide'); if (!box) return;
    box.innerHTML = `<div class="tabs">${[['pops', 'POPs'], ['teste', 'Teste OTDR'], ['camadas', 'Camadas'], ['buscar', 'Buscar'], ['codigos', 'Códigos']].map(([k, l]) => `<button class="${sideTab === k ? 'on' : ''}" data-st="${k}">${l}</button>`).join('')}</div><div id="mrTab"></div><p class="tiny muted" id="mrNote"></p>`;
    U.$$('[data-st]', box).forEach(b => b.onclick = () => side(b.dataset.st));
    ({ pops: tabPops, teste: tabTeste, camadas: tabCamadas, buscar: tabBuscar, codigos: () => { U.$('#mrTab').innerHTML = codesHTML(); bindCodes(); } })[sideTab]();
  }

  /* ---------- POPs: todos os POPs da rede (KMZ + cadastrados), seleção e cadastro ---------- */
  function allPops() {
    const d = M.rede.data, al = store.state.settings.popAliases || [];
    const codeOf = (n) => (al.find(a => a.pop === n) || {}).codigo || '';
    const kmz = d.pops.map(p => ({ nome: p.name, codigo: codeOf(p.name), estado: p.estado, pt: p.pt, origem: 'KMZ', obs: p.obs }));
    const cad = (store.state.settings.popsRede || []).filter(p => !d.pops.some(x => x.name === p.nome)).map(p => ({ nome: p.nome, codigo: p.codigo || codeOf(p.nome), estado: p.estado, pt: [p.lat, p.lng], origem: 'Cadastrado', id: p.id, em: p.em, por: p.por, obs: p.obs }));
    return kmz.concat(cad).sort((a, b) => (a.codigo || 'zzz' + a.nome).localeCompare(b.codigo || 'zzz' + b.nome, 'pt-BR'));
  }
  const popKey = (p) => p.origem + '|' + p.nome;
  function tabPops() {
    const T = M.tool; T.popSel = T.popSel || []; T.popQ = T.popQ || ''; T.popEst = T.popEst || '';
    const all = allPops(), q = FC.bb.norm(T.popQ);
    const list = all.filter(p => (!q || FC.bb.norm(p.nome + ' ' + p.codigo).includes(q)) && (!T.popEst || (T.popEst === 'impl' ? !projetado(p.estado) : projetado(p.estado))));
    const sel = new Set(T.popSel), nKmz = all.filter(p => p.origem === 'KMZ').length;
    U.$('#mrTab').innerHTML = `<div class="mr-pop-head"><b>${all.length} POPs</b> <span class="tiny muted">${nKmz} do KMZ${all.length - nKmz ? ` · ${all.length - nKmz} cadastrados no sistema` : ''}</span></div>
      <div class="form-grid" style="grid-template-columns:1fr 130px"><input id="ppQ" type="search" placeholder="Buscar POP ou código" value="${U.esc(T.popQ)}"><select id="ppE"><option value="">Todos</option><option value="impl" ${T.popEst === 'impl' ? 'selected' : ''}>Implantados</option><option value="proj" ${T.popEst === 'proj' ? 'selected' : ''}>Em projeto</option></select></div>
      <div class="btn-row"><label class="check small"><input type="checkbox" id="ppAll" ${list.length && list.every(p => sel.has(popKey(p))) ? 'checked' : ''}> Selecionar todos (${list.length})</label>${store.can('config.tecnica') ? `<button class="btn sm primary" id="ppNew">${ui.icon('plus')}Novo POP</button>` : ''}</div>
      <div class="mr-pop-list">${list.map(p => `<div class="mr-pop-row ${sel.has(popKey(p)) ? 'on' : ''}"><input type="checkbox" data-pk="${U.esc(popKey(p))}" ${sel.has(popKey(p)) ? 'checked' : ''} aria-label="Selecionar ${U.esc(p.nome)}"><button class="mr-pop-go" data-pgo="${U.esc(popKey(p))}">${p.codigo ? `<span class="tag">${U.esc(p.codigo)}</span>` : ''}<span>${U.esc(short(p.nome))}</span><span class="tiny ${projetado(p.estado) ? 'warn-text' : 'muted'}">${U.esc(p.estado || '')}${p.origem === 'Cadastrado' ? ' · cadastrado' : ''}</span></button>${p.origem === 'Cadastrado' && store.can('config.tecnica') ? `<button class="btn sm ghost" data-pdel="${U.esc(p.id)}" title="Excluir POP cadastrado" aria-label="Excluir ${U.esc(p.nome)}">${ui.icon('trash')}</button>` : ''}</div>`).join('') || '<p class="muted small">Nenhum POP encontrado.</p>'}</div>
      ${sel.size ? `<div class="btn-row"><button class="btn sm" id="ppFit">${ui.icon('map')}Ver ${sel.size} selecionado(s) no mapa</button><button class="btn sm ghost" id="ppClr">Limpar seleção</button></div>` : ''}`;
    const $ = (id) => U.$('#' + id);
    $('ppQ').oninput = U.debounce(() => { T.popQ = $('ppQ').value; tabPops(); const i = $('ppQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 200);
    $('ppE').onchange = () => { T.popEst = $('ppE').value; tabPops(); };
    $('ppAll').onchange = () => { const ks = list.map(popKey); T.popSel = $('ppAll').checked ? [...new Set(T.popSel.concat(ks))] : T.popSel.filter(k => !ks.includes(k)); drawPopSel(true); tabPops(); };
    U.$$('[data-pk]').forEach(c => c.onchange = () => { const k = c.dataset.pk; T.popSel = c.checked ? [...new Set(T.popSel.concat(k))] : T.popSel.filter(x => x !== k); drawPopSel(false); tabPops(); });
    U.$$('[data-pgo]').forEach(b => b.onclick = () => { const p = all.find(x => popKey(x) === b.dataset.pgo); if (!p) return; M.map.setView(p.pt, Math.max(M.map.getZoom(), 16)); flash(L.circleMarker(p.pt, { radius: 18, color: '#ffd23f', weight: 4, fill: false })); });
    U.$$('[data-pdel]').forEach(b => b.onclick = async () => { const p = (store.state.settings.popsRede || []).find(x => x.id === b.dataset.pdel); if (!p || !(await ui.confirm('Excluir POP', `Excluir o POP cadastrado ${p.nome}?`, 'Excluir', true))) return; store.setSettings('popsRede', store.state.settings.popsRede.filter(x => x.id !== p.id), 'POP excluído: ' + p.nome); FC.rerender(); });
    const nw = $('ppNew'); nw && (nw.onclick = novoPop);
    const fit = $('ppFit'); fit && (fit.onclick = () => drawPopSel(true));
    const clr = $('ppClr'); clr && (clr.onclick = () => { T.popSel = []; drawPopSel(false); tabPops(); });
  }
  /** Destaque dos POPs selecionados no mapa */
  function drawPopSel(fit) {
    (M.popHL || []).forEach(l => M.map.removeLayer(l)); M.popHL = [];
    const sel = new Set(M.tool.popSel || []), ps = allPops().filter(p => sel.has(popKey(p)));
    ps.forEach(p => M.popHL.push(L.circleMarker(p.pt, { radius: 14, color: '#ffd23f', weight: 4, fill: false, interactive: false }).addTo(M.map)));
    if (fit && ps.length) ps.length === 1 ? M.map.setView(ps[0].pt, 16) : M.map.fitBounds(L.latLngBounds(ps.map(p => p.pt)).pad(.15));
  }
  /** Novo POP: clique no mapa para posicionar */
  function novoPop() {
    if (!store.require('config.tecnica')) return;
    ui.toast('Clique no mapa onde fica o novo POP.', 'info', 5000);
    U.$('#mrMap').classList.add('mr-picking');
    M.map.once('click', (e) => {
      U.$('#mrMap').classList.remove('mr-picking');
      const la = +e.latlng.lat.toFixed(6), lo = +e.latlng.lng.toFixed(6);
      ui.modal({ title: 'Novo POP', body: `<form class="form-grid" id="npf">${ui.field('Nome do POP', ui.input('nome', '', 'required placeholder="ex.: POP-ALVORADA"'))}${ui.field('Código', ui.input('codigo', '', 'placeholder="ex.: ALV" style="text-transform:uppercase"'), 'Usado nos testes OTDR')}
        ${ui.field('Situação', ui.select('estado', ['Implantado', 'Implantada e certificada', 'Em projeto'], 'Implantado'))}${ui.field('Latitude', ui.input('lat', la, 'type="number" step="0.000001"'))}${ui.field('Longitude', ui.input('lng', lo, 'type="number" step="0.000001"'))}${ui.field('Observação', '<textarea name="obs"></textarea>', '', 'full')}</form>`,
        actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Cadastrar POP', cls: 'primary', icon: 'check', onClick: (b) => {
          const f = ui.formData(U.$('#npf', b)); const nome = f.nome.trim(), codigo = f.codigo.trim().toUpperCase().replace(/^POP-?/, '');
          if (!nome) { ui.toast('Informe o nome do POP.', 'err'); return false; }
          if (allPops().some(p => FC.bb.norm(p.nome) === FC.bb.norm(nome))) { ui.toast('Já existe um POP com esse nome.', 'err'); return false; }
          const pop = { id: U.uid('pop_'), nome, codigo, estado: f.estado, lat: U.parseNum(f.lat), lng: U.parseNum(f.lng), obs: f.obs, por: store.user().nome, em: U.now() };
          store.setSettings('popsRede', [...(store.state.settings.popsRede || []), pop], 'POP cadastrado: ' + nome);
          if (codigo) store.setSettings('popAliases', [...(store.state.settings.popAliases || []).filter(a => FC.bb.norm(a.codigo) !== FC.bb.norm(codigo)), { codigo, pop: nome }], 'Código do POP ' + codigo);
          M.tool.popSel = [...(M.tool.popSel || []), 'Cadastrado|' + nome];
          ui.toast('POP cadastrado e adicionado à lista.', 'ok'); FC.rerender();
        } }] });
    });
  }

  function tabCamadas() {
    const L_ = M.layers, map = M.map; M.boxOn = M.boxOn || {};
    const cnt = (g) => g.getLayers().length;
    const grupos = FO_COLORS.map(([, col, lab]) => [col, lab]).concat(L_.cabos['Sem capacidade'] ? [[SEM_FO, 'Sem capacidade']] : []);
    const nCab = (g) => g.getLayers().filter(l => l.options.interactive !== false).length;
    U.$('#mrTab').innerHTML = `<h4>Cabos por capacidade</h4>${grupos.map(([col, lab]) => `<label class="check"><input type="checkbox" data-lc="${lab}" ${map.hasLayer(L_.cabos[lab]) ? 'checked' : ''}><span class="mr-sw" style="background:${col};${col === '#ffffff' ? 'outline:1px solid #3a3a3a' : ''}"></span>${lab} <span class="muted tiny">(${nCab(L_.cabos[lab])})</span></label>`).join('')}
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

  /* ---------- Teste OTDR no mapa: rota em destaque, atenuações por trecho entre caixas ---------- */
  const LV = { reprovado: '#d7372b', atencao: '#c98a00', ok: '#0f9d6b', excelente: '#0f9d6b' };
  function tabTeste() {
    const T = M.tool, pops = M.rede.data.pops.map(p => p.name).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const ms = store.state.measurements.slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const r = T.routes[T.ri], R = M.R;
    U.$('#mrTab').innerHTML = `
      ${ui.field('Teste OTDR', `<select id="taM"><option value="">— escolha o teste —</option>${ms.map(x => { const l = store.get('links', x.linkId) || {}; return `<option value="${x.id}" ${x.id === T.mid ? 'selected' : ''}>${U.esc(l.nome || '?')} · ${U.date(x.data)} · ${U.esc(x.fileName || x.source)}</option>`; }).join('')}</select>`)}
      <details ${!T.a || !T.b || !r ? 'open' : ''}><summary class="small">POPs e rota${T.a && T.b ? `: ${U.esc(M.codeOf[T.a] || short(T.a))} → ${U.esc(M.codeOf[T.b] || short(T.b))}` : ''}</summary>
        <div class="form-grid" style="grid-template-columns:1fr 1fr">${ui.field('Origem (onde o OTDR estava)', `<select id="taA"><option value="">—</option>${pops.map(p => `<option ${p === T.a ? 'selected' : ''}>${U.esc(p)}</option>`).join('')}</select>`)}${ui.field('Destino', `<select id="taB"><option value="">—</option>${pops.map(p => `<option ${p === T.b ? 'selected' : ''}>${U.esc(p)}</option>`).join('')}</select>`)}</div>
        <div class="btn-row"><button class="btn sm" id="taSwap">⇄ Inverter</button><button class="btn sm primary" id="taRoute" ${T.a && T.b ? '' : 'disabled'}>Traçar rota</button></div>
        ${T.routes.length > 1 ? `<div class="mr-routes">${T.routes.map((x, i) => `<label class="check small"><input type="radio" name="taR" value="${i}" ${i === T.ri ? 'checked' : ''}> Rota ${i + 1}: ${U.m(x.len, 0)} · ${x.det.caixas.length} caixas${i === T.best ? ' <span class="badge ok">mais próxima do teste</span>' : ''}</label>`).join('')}</div>` : ''}
        ${r ? ui.field('Relação fibra ÷ traçado desenhado', ui.input('taF', R ? R.f.toFixed(3) : '', 'type="number" step="0.001" min="1" max="2"'), R ? R.fHint : '') : ''}
      </details>
      ${R ? `<div class="kv mr-kv"><div><span class="k">Rota</span><span class="v">${U.m(R.r.len, 0)} desenhados</span></div><div><span class="k">Fibra (OTDR)</span><span class="v">${R.L ? U.m(R.L, 0) : '—'}</span></div><div><span class="k">Caixas</span><span class="v">${R.lances.length - 1}</span></div><div><span class="k">Trechos com atenção</span><span class="v">${R.lances.filter(x => x.pior >= 2).length}</span></div></div>
        <p class="note small">${ui.icon('map')}<span>Clique em um <b>cabo da rota</b> no mapa para ver as atenuações daquele trecho entre caixas.</span></p>
        <label class="check small"><input type="checkbox" id="taAll" ${T.showAll ? 'checked' : ''}> Mostrar todas as atenuações da rota</label>
        <div id="taLance"></div><div id="taSel"></div>
        <h4>Trechos entre caixas</h4><div class="mr-lances">${R.lances.map(x => `<button class="mr-lance ${T.lance === x.i ? 'on' : ''}" data-lance="${x.i}"><span>${x.i + 1}. ${U.esc(short(x.from.nome))} → ${U.esc(short(x.to.nome))}</span><span class="tiny muted">${U.m(x.fib0, 0)}–${U.m(x.fib1, 0)}</span>${x.evs.length ? `<span class="mr-dot ${x.pior >= 3 ? 'bad' : x.pior >= 2 ? 'warn' : ''}">${x.evs.length}</span>` : ''}</button>`).join('')}</div>
        <div class="btn-row"><button class="btn sm" id="taFit">${ui.icon('map')}Ver rota inteira</button></div>` : (T.mid && !r ? '<p class="small muted">Confira a origem e o destino e clique em Traçar rota.</p>' : '<p class="small muted">Escolha um teste: a rota inteira aparece em destaque no mapa.</p>')}`;
    const $ = (id) => U.$('#' + id);
    $('taM').onchange = () => {
      T.mid = $('taM').value; T.routes = []; T.lance = null; T.fator = ''; T.sel = []; M.R = null; clearHL();
      const mm = store.get('measurements', T.mid);
      if (mm) { const l = store.get('links', mm.linkId) || {}; T.a = popByCode(l.popA) || T.a; T.b = popByCode(l.popB) || T.b; if (mm.direcaoInversa) [T.a, T.b] = [T.b, T.a]; }
      if (T.mid && T.a && T.b) traceRoute(); else tabTeste();
    };
    $('taA').onchange = () => { T.a = $('taA').value; T.routes = []; M.R = null; clearHL(); tabTeste(); };
    $('taB').onchange = () => { T.b = $('taB').value; T.routes = []; M.R = null; clearHL(); tabTeste(); };
    $('taSwap').onclick = () => { [T.a, T.b] = [T.b, T.a]; T.routes = []; M.R = null; if (T.a && T.b) traceRoute(); else tabTeste(); };
    $('taRoute').onclick = traceRoute;
    U.$$('[name=taR]').forEach(x => x.onchange = () => { T.ri = +x.value; T.fator = ''; T.lance = null; build(); });
    const ff = $('taF'); ff && (ff.onchange = () => { T.fator = ff.value; build(true); });
    const all = $('taAll'); all && (all.onchange = () => { T.showAll = all.checked; drawEvents(); });
    U.$$('[data-lance]').forEach(b => b.onclick = () => selectLance(+b.dataset.lance, true));
    const fit = $('taFit'); fit && (fit.onclick = () => M.map.fitBounds(L.latLngBounds(M.R.r.det.coords).pad(.1)));
    if (R && T.lance != null) lanceDetail();
    if (R) selPanel();
  }

  function traceRoute() {
    const T = M.tool, g = graph();
    const A = FC.bb.findPop(g, T.a), B = FC.bb.findPop(g, T.b);
    if (!A || !B) { tabTeste(); return ui.toast('POP não encontrado na rede.', 'err'); }
    let ps = FC.bb.yen(g, A.id, B.id, 6, { noTransitPop: true });
    if (!ps.length) ps = FC.bb.yen(g, A.id, B.id, 4, { noTransitPop: false });
    if (!ps.length) { T.routes = []; M.R = null; tabTeste(); return ui.toast('Não há caminho de cabos entre esses POPs no KMZ.', 'warn', 6000); }
    T.routes = ps.map(p => Object.assign(p, { det: FC.bb.details(g, p) }));
    const m = T.mid ? store.get('measurements', T.mid) : null, L0 = m ? C.otdrNet(m) : null, f0 = +(store.state.settings.rede || {}).fator || 1.2;
    T.best = 0;
    if (L0) { let be = Infinity; T.routes.forEach((x, i) => { const er = Math.abs(x.len * f0 - L0); if (er < be) { be = er; T.best = i; } }); }
    T.ri = T.best; T.fator = ''; T.lance = null;
    build();
  }

  /** Monta os trechos entre caixas da rota e distribui os eventos do teste em cada um */
  function build(keepView) {
    const T = M.tool, r = T.routes[T.ri]; if (!r) return tabTeste();
    const m = T.mid ? store.get('measurements', T.mid) : null;
    const L0 = m ? C.otdrNet(m) : null, k = L0 ? L0 / r.len : null, f0 = +(store.state.settings.rede || {}).fator || 1.2;
    const f = U.parseNum(T.fator) || (k && k >= 1 && k <= 1.6 ? k : f0);
    const fHint = T.fator ? 'Valor ajustado manualmente.' : k && k >= 1 && k <= 1.6 ? `Calculado pelo teste: fibra ${U.m(L0, 0)} ÷ traçado ${U.m(r.len, 0)}.` : k && k < 1 ? '<span class="warn-text">O teste termina antes do fim da rota (possível rompimento): relação padrão.</span>' : 'Relação padrão (reservas, subidas e curvas).';
    const launch = m ? (+m.launchM || 0) : 0;
    const an = m ? C.analyze(m, store.get('trechos', m.trechoId)) : null;
    const sev = { excelente: 0, ok: 1, atencao: 2, reprovado: 3 };
    const evs = an ? an.events.filter(e => e.distM > 1).map(e => Object.assign({}, e, { x: Math.max(0, (e.distM - launch) / f) })) : [];
    const nodes = [{ nome: T.a, distKmzM: 0, pop: true }].concat(r.det.caixas, [{ nome: T.b, distKmzM: r.len, pop: true }]);
    const lances = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const from = nodes[i], to = nodes[i + 1], last = i === nodes.length - 2;
      const ev = evs.filter(e => e.x >= from.distKmzM && (e.x < to.distKmzM || (last && e.x >= to.distKmzM)));
      lances.push({ i, from, to, x0: from.distKmzM, x1: to.distKmzM, fib0: from.distKmzM * f + launch, fib1: to.distKmzM * f + launch, coords: slice(r.det.coords, from.distKmzM, to.distKmzM), evs: ev, pior: ev.reduce((a, e) => Math.max(a, e.end ? 1 : sev[e.level] || 0), 0), cabos: r.det.cabos.filter(c => c.inicioM < to.distKmzM && c.inicioM + c.len > from.distKmzM) });
    }
    M.R = { r, m, f, fHint, launch, L: L0, evs, lances, an };
    drawTest(keepView); tabTeste();
  }

  function drawTest(keepView) {
    clearHL(); const R = M.R, map = M.map;
    // rota inteira em destaque (contorno + linha)
    M.hl.items.push(L.polyline(R.r.det.coords, { color: '#ffffff', weight: 13, opacity: .95, interactive: false }).addTo(map));
    M.hl.items.push(L.polyline(R.r.det.coords, { color: '#01a09c', weight: 7, opacity: 1, interactive: false }).addTo(map));
    // trechos entre caixas: clicáveis (atenuações aparecem só ao clicar)
    R.lances.forEach(x => {
      const pl = L.polyline(x.coords, { color: '#ffd23f', weight: 18, opacity: 0.01 });
      pl.on('mouseover', () => { if (M.tool.lance !== x.i) pl.setStyle({ opacity: .45 }); });
      pl.on('mouseout', () => { if (M.tool.lance !== x.i) pl.setStyle({ opacity: 0.01 }); });
      pl.bindTooltip(`${U.esc(short(x.from.nome))} → ${U.esc(short(x.to.nome))} · clique para ver as atenuações`, { sticky: true, className: 'mr-tip' });
      pl.on('click', () => selectLance(x.i));
      x.layer = pl; M.hl.items.push(pl.addTo(map));
    });
    // caixas da rota numeradas
    R.lances.forEach((x, i) => { if (i === 0) return; const b = x.from, pt = b.lat != null ? [b.lat, b.lng] : pointAt(R.r.det.coords, b.distKmzM).pt;
      const mk = L.marker(pt, { icon: L.divIcon({ className: 'mr-num', html: `<span>${i}</span>`, iconSize: [20, 20] }) }).bindTooltip(`${i}. ${U.esc(short(b.nome))} · ${U.m(b.distKmzM * R.f + R.launch, 0)} de fibra`, { direction: 'top', className: 'mr-tip' });
      if (b.id != null) mk.bindPopup(() => nodePopup(b.id), { maxWidth: 320 });
      M.hl.items.push(mk.addTo(map)); });
    const g = graph();
    [[R.r.det.coords[0], M.tool.a, 'A'], [R.r.det.coords[R.r.det.coords.length - 1], M.tool.b, 'B']].forEach(([pt, n, l]) => { const nd = FC.bb.findPop(g, n); const mk = L.marker(pt, { icon: L.divIcon({ className: 'mr-num mr-popend', html: `<span>${l}</span>`, iconSize: [26, 26] }) }).bindTooltip(U.esc(n), { direction: 'top' }); if (nd) mk.bindPopup(() => nodePopup(nd.id, true), { maxWidth: 320 }); M.hl.items.push(mk.addTo(map)); });
    nodesToFront();
    drawEvents();
    if (!keepView) map.fitBounds(L.latLngBounds(R.r.det.coords).pad(.1));
  }

  /** Caixas e POPs sempre acima da rota, para continuarem clicáveis */
  function nodesToFront() { const L_ = M.layers; Object.values(L_.caixas).forEach(g => g.eachLayer(l => l.bringToFront())); L_.pops.eachLayer(l => l.bringToFront()); }
  /** Marcadores de atenuação: só do trecho clicado (ou todos, se marcado) */
  function drawEvents() {
    const R = M.R; if (!R) return;
    (M.hl.evs || []).forEach(l => M.map.removeLayer(l)); M.hl.evs = [];
    const sel = new Set(M.tool.sel);
    const base = M.tool.showAll ? R.evs : (M.tool.lance != null ? R.lances[M.tool.lance].evs : []);
    const show = base.concat(R.evs.filter(e => sel.has(e.n) && !base.includes(e)));
    show.forEach(e => {
      const p = pointAt(R.r.det.coords, e.x).pt, col = e.end ? '#111' : LV[e.level] || '#2a6fb5', on = sel.has(e.n);
      const mk = L.circleMarker(p, { radius: e.level === 'reprovado' || e.end ? 10 : 8, color: on ? '#fe6218' : '#fff', weight: on ? 5 : 3, fillColor: col, fillOpacity: 1, className: e.level === 'reprovado' ? 'mr-pulse' : '' })
        .bindTooltip(`Ev. ${e.n} · ${U.m(e.distM, 0)} · ${U.db(e.loss, 3)}`, { permanent: true, direction: 'right', className: 'mr-pop mr-evt', offset: [10, 0] })
        .bindPopup(`<b>Evento ${e.n}</b> · ${U.esc(e.tipo)}<br>${U.m(e.distM, 1)} no OTDR · ${U.db(e.loss, 3)}${e.reflectance ? ' · refl. ' + U.db(e.reflectance, 1) : ''}<br>${ui.badge(e.end ? 'info' : e.level, e.end ? 'Fim de fibra' : undefined)}${e.note ? '<br><i>' + U.esc(e.note) + '</i>' : ''}<br><span class="tiny">${p[0].toFixed(6)}, ${p[1].toFixed(6)}</span><div class="mr-pp-btns"><button class="btn sm ${on ? '' : 'orange'}" data-evsel="${e.n}">${on ? 'Remover do KMZ' : '+ Incluir no KMZ'}</button><button class="btn sm" data-copy="${p[0].toFixed(6)}, ${p[1].toFixed(6)}">Copiar</button><a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${p[0].toFixed(6)},${p[1].toFixed(6)}">Google Maps</a></div>`);
      M.hl.evs.push(mk.addTo(M.map));
    });
  }

  function selectLance(i, zoom) {
    const R = M.R, T = M.tool; if (!R) return;
    if (T.lance != null && R.lances[T.lance] && R.lances[T.lance].layer) R.lances[T.lance].layer.setStyle({ opacity: 0.01, color: '#ffd23f' });
    T.lance = i; const x = R.lances[i];
    x.layer.setStyle({ color: x.pior >= 3 ? '#d7372b' : x.pior >= 2 ? '#fe6218' : '#ffd23f', opacity: .8 });
    drawEvents();
    U.$$('.mr-lance').forEach(b => b.classList.toggle('on', +b.dataset.lance === i));
    lanceDetail();
    if (zoom) M.map.fitBounds(L.latLngBounds(x.coords).pad(.5));
    const det = U.$('#taLance'); det && det.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function lanceDetail() {
    const R = M.R, x = R.lances[M.tool.lance], box = U.$('#taLance'); if (!box || !x) return;
    const near = (e) => { const a = (e.x - x.x0) * R.f, b = (x.x1 - e.x) * R.f; return a <= 25 ? `na caixa ${short(x.from.nome)}` : b <= 25 ? `na caixa ${short(x.to.nome)}` : `${U.m(a, 0)} após ${short(x.from.nome)}`; };
    box.innerHTML = `<div class="mr-lance-det"><b>Trecho ${x.i + 1}: ${U.esc(short(x.from.nome))} → ${U.esc(short(x.to.nome))}</b>
      <p class="tiny muted">${U.m(x.x1 - x.x0, 0)} desenhados (~${U.m((x.x1 - x.x0) * R.f, 0)} de fibra) · OTDR de ${U.m(x.fib0, 0)} a ${U.m(x.fib1, 0)} · ${x.cabos.map(c => U.esc(c.nome) + ' (' + (c.fo || '?') + 'FO)').join(', ')}</p>
      ${x.evs.length ? `<div class="table-scroll"><table class="tbl"><thead><tr><th><input type="checkbox" id="taSelAll" title="Selecionar todos deste trecho" aria-label="Selecionar todos os eventos deste trecho" ${x.evs.every(e => M.tool.sel.includes(e.n)) ? 'checked' : ''}></th><th>Evento</th><th class="num">OTDR · perda</th><th>Onde</th></tr></thead><tbody>${x.evs.map(e => `<tr class="${e.level === 'reprovado' ? 'row-bad' : e.level === 'atencao' ? 'row-warn' : ''}"><td><input type="checkbox" data-sel="${e.n}" aria-label="Selecionar evento ${e.n}" ${M.tool.sel.includes(e.n) ? 'checked' : ''}></td><td><b>${e.n}</b><br>${ui.badge(e.end ? 'info' : e.level, e.end ? 'Fim' : { excelente: 'Excelente', ok: 'OK', atencao: 'Atenção', reprovado: 'Reprovado' }[e.level])}</td><td class="num">${U.m(e.distM, 0)}<br>${U.db(e.loss, 3)}${e.reflectance ? `<br><span class="tiny muted">refl. ${U.db(e.reflectance, 1)}</span>` : ''}</td><td class="tiny">${U.esc(near(e))}</td></tr>`).join('')}</tbody></table></div>` : `<p class="small ok-text">Nenhuma atenuação registrada neste trecho.</p>`}
      <div class="btn-row"><button class="btn sm" id="taZoomL">${ui.icon('map')}Aproximar</button><button class="btn sm orange" id="taKmz">${ui.icon('download')}Exportar KMZ deste trecho</button></div></div>`;
    U.$('#taZoomL').onclick = () => M.map.fitBounds(L.latLngBounds(x.coords).pad(.5));
    U.$('#taKmz').onclick = () => exportKMZ({ lances: [x], evs: x.evs });
    U.$$('[data-sel]', box).forEach(c => c.onchange = () => toggleSel(+c.dataset.sel, c.checked));
    const all = U.$('#taSelAll', box); all && (all.onchange = () => { x.evs.forEach(e => toggleSel(e.n, all.checked, true)); refreshSel(); });
  }

  /* ---------- Seleção de eventos para um KMZ único ---------- */
  function toggleSel(n, on, silent) {
    const T = M.tool, has = T.sel.includes(n), want = on == null ? !has : on;
    if (want && !has) T.sel.push(n); if (!want && has) T.sel = T.sel.filter(v => v !== n);
    if (!silent) refreshSel();
  }
  function refreshSel() { drawEvents(); if (M.tool.lance != null) lanceDetail(); selPanel(); }
  const lanceOf = (e) => M.R.lances.find(x => x.evs.includes(e));
  function selPanel() {
    const R = M.R, box = U.$('#taSel'); if (!R || !box) return;
    const evs = R.evs.filter(e => M.tool.sel.includes(e.n)).sort((a, b) => a.distM - b.distM);
    const ruins = R.evs.filter(e => e.level === 'reprovado' || e.level === 'atencao');
    box.innerHTML = `<div class="mr-sel"><b>Eventos selecionados para o KMZ (${evs.length})</b>
      ${evs.length ? `<div class="mr-sel-list">${evs.map(e => { const x = lanceOf(e); return `<span class="mr-chip ${e.level}"><b>Ev. ${e.n}</b> ${U.m(e.distM, 0)} · ${U.db(e.loss, 2)}<span class="tiny muted"> · trecho ${x ? x.i + 1 : '?'}</span><button data-unsel="${e.n}" title="Remover" aria-label="Remover evento ${e.n}">×</button></span>`; }).join('')}</div>`
        : '<p class="tiny muted">Marque os eventos na lista do trecho (caixa de seleção) ou no ponto do mapa (“+ Incluir no KMZ”). Dá para juntar eventos de trechos diferentes.</p>'}
      <div class="btn-row">${ruins.length ? `<button class="btn sm" id="taSelBad">${ruins.length === 1 ? 'Selecionar o evento com atenção/reprovado' : `Selecionar os ${ruins.length} com atenção/reprovados`}</button>` : ''}${evs.length ? `<button class="btn sm ghost" id="taSelClr">Limpar</button><button class="btn sm orange" id="taSelKmz">${ui.icon('download')}${evs.length === 1 ? 'Exportar KMZ do evento selecionado' : `Exportar KMZ dos ${evs.length} selecionados`}</button>` : ''}</div></div>`;
    U.$$('[data-unsel]', box).forEach(b => b.onclick = () => toggleSel(+b.dataset.unsel, false));
    const bad = U.$('#taSelBad', box); bad && (bad.onclick = () => { ruins.forEach(e => toggleSel(e.n, true, true)); refreshSel(); });
    const clr = U.$('#taSelClr', box); clr && (clr.onclick = () => { M.tool.sel = []; refreshSel(); });
    const kz = U.$('#taSelKmz', box); kz && (kz.onclick = () => { const ls = [...new Set(evs.map(lanceOf).filter(Boolean))].sort((a, b) => a.i - b.i); exportKMZ({ lances: ls, evs, multi: true }); });
  }

  /** Ponto na distância x (m) ao longo da polilinha */
  function pointAt(coords, x) {
    let acc = 0;
    for (let i = 1; i < coords.length; i++) {
      const s = FC.bb.hav(coords[i - 1], coords[i]);
      if (acc + s >= x) { const t = s ? (x - acc) / s : 0; return { pt: [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t], i }; }
      acc += s;
    }
    return { pt: coords[coords.length - 1], i: coords.length - 1, alem: true };
  }
  function slice(coords, x0, x1) { const a = pointAt(coords, x0), b = pointAt(coords, x1); return [a.pt, ...coords.slice(a.i, b.i), b.pt]; }
  const short = (n) => String(n || '').replace(/^POP\s*[-–]?\s*/i, '').replace(/\s*\(CLICKIP[^)]*\)/i, '').trim();
  function clearHL() { if (M.hl && M.map) [...(M.hl.items || []), ...(M.hl.evs || [])].forEach(l => M.map.removeLayer(l)); M.hl = { items: [], evs: [] }; }

  /* ---------- KMZ: um trecho entre caixas, ou vários eventos selecionados (com os trechos deles) ---------- */
  async function exportKMZ({ lances, evs, multi }) {
    const R = M.R; if (!R || !lances.length) return;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const ll = (p) => `${p[1].toFixed(7)},${p[0].toFixed(7)},0`;
    const l = R.m ? store.get('links', R.m.linkId) || {} : {};
    const x0 = lances[0];
    const titulo = multi ? `${evs.length} evento(s) selecionado(s) · ${short(M.tool.a)} → ${short(M.tool.b)}` : `Trecho ${short(x0.from.nome)} → ${short(x0.to.nome)}`;
    const cab = [R.m ? `Teste: ${l.nome || ''} · ${U.dt(R.m.data)} · ${R.m.fileName || ''}` : '', `Rota: ${M.tool.a} → ${M.tool.b}`, multi ? `Eventos: ${evs.map(e => e.n).join(', ')} · ${lances.length} trecho(s) entre caixas` : '', `Relação fibra ÷ traçado: ${U.num(R.f, 3)}${R.launch ? ` · bobina de lançamento ${R.launch} m` : ''}`, `Rede: ${M.rede.arquivo}`].filter(Boolean);
    const boxPt = (b) => b.lat != null ? [b.lat, b.lng] : pointAt(R.r.det.coords, b.distKmzM).pt;
    const descL = (x) => `Trecho ${x.i + 1}: ${x.from.nome} → ${x.to.nome} · ${U.num(x.x1 - x.x0, 0)} m desenhados (~${U.num((x.x1 - x.x0) * R.f, 0)} m de fibra) · OTDR ${U.num(x.fib0, 0)}–${U.num(x.fib1, 0)} m\nCabos: ${x.cabos.map(c => c.nome + ' — ' + c.tipo).join('; ')}`;
    const linhas = lances.map(x => `<Placemark><name>${esc(`Trecho ${x.i + 1}: ${short(x.from.nome)} → ${short(x.to.nome)}`)}</name><styleUrl>#seg</styleUrl><description>${esc(descL(x))}</description><LineString><tessellate>1</tessellate><coordinates>${x.coords.map(ll).join(' ')}</coordinates></LineString></Placemark>`).join('\n');
    const caixas = []; lances.forEach(x => [x.from, x.to].forEach(b => { if (!caixas.some(c => c.nome === b.nome)) caixas.push(b); }));
    const cx = caixas.map(b => `<Placemark><name>${esc(b.nome)}</name><styleUrl>#cx</styleUrl><description>${esc(`${b.tipo ? b.tipo + ' · ' : ''}${U.num(b.distKmzM * R.f + R.launch, 0)} m de fibra no OTDR`)}</description><Point><coordinates>${ll(boxPt(b))}</coordinates></Point></Placemark>`).join('\n');
    const evPm = evs.map(e => { const p = pointAt(R.r.det.coords, e.x).pt, x = lanceOf(e); const d = [`${e.tipo} · ${U.num(e.distM, 1)} m no OTDR`, `Perda ${U.num(e.loss, 3)} dB${e.reflectance ? ' · refletância ' + U.num(e.reflectance, 1) + ' dB' : ''}`, e.end ? 'Fim de fibra' : (C.resultLabel[e.level] || ''), e.note || '', x ? `Trecho ${x.i + 1}: entre ${x.from.nome} e ${x.to.nome}` : '', `${p[0].toFixed(6)}, ${p[1].toFixed(6)}`].filter(Boolean);
      return `<Placemark><name>${esc(`Evento ${e.n} · ${U.num(e.loss, 2)} dB`)}</name><styleUrl>#${e.level === 'reprovado' || e.end ? 'evr' : e.level === 'atencao' ? 'eva' : 'evo'}</styleUrl><description><![CDATA[${d.map(esc).join('<br>')}<br><a href="https://www.google.com/maps?q=${p[0].toFixed(6)},${p[1].toFixed(6)}">Abrir no Google Maps</a>]]></description><Point><coordinates>${ll(p)}</coordinates></Point></Placemark>`; }).join('\n');
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(titulo)}</name><description>${esc(cab.join('\n'))}</description>
<Style id="seg"><LineStyle><color>ff2b37d7</color><width>6</width></LineStyle></Style>
<Style id="evr"><IconStyle><color>ff2b37d7</color><scale>1.3</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/caution.png</href></Icon></IconStyle></Style>
<Style id="eva"><IconStyle><color>ff008ac9</color><scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/caution.png</href></Icon></IconStyle></Style>
<Style id="evo"><IconStyle><color>ff6b9d0f</color><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>
<Style id="cx"><IconStyle><color>ffaa6a00</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-circle.png</href></Icon></IconStyle></Style>
<Folder><name>Eventos (${evs.length})</name>
${evPm}
</Folder><Folder><name>Trechos entre caixas (${lances.length})</name>
${linhas}
</Folder><Folder><name>Caixas e POPs (${caixas.length})</name>
${cx}
</Folder></Document></kml>`;
    const zip = new JSZip(); zip.file('doc.kml', kml);
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz' });
    const base = multi ? `eventos-${evs.map(e => e.n).join('-')}-${short(M.tool.a)}-${short(M.tool.b)}` : `trecho-${short(x0.from.nome)}-${short(x0.to.nome)}`;
    const nome = base.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase().slice(0, 90) + '.kmz';
    U.download(blob, nome);
    store.audit('exportou', 'rede', null, `${nome}: ${evs.length} evento(s), ${lances.length} trecho(s)`);
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
  .leaflet-tooltip.mr-ev{background:#d7372b;color:#fff}.leaflet-tooltip.mr-evt{background:rgba(255,255,255,.92);color:#13283b;font-weight:600}
  .leaflet-tooltip.mr-tip{font:12px var(--font-body);background:var(--surface);color:var(--fg);border:1px solid var(--line);border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.2);padding:4px 8px}
  .mr-pp{font:13px var(--font-body);display:grid;gap:4px}.mr-pp-kv{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:12px;margin:4px 0}.mr-pp-kv span{color:var(--fg-3)}.mr-pp-btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.mr-pp-btns .btn{min-height:28px;padding:0 9px;font-size:12px}
  .mr-pp-link{display:block;font-size:12px;padding:3px 0;border-bottom:1px dashed var(--line);color:var(--accent);text-decoration:none}
  .mr-btns a{font-size:16px;line-height:32px;cursor:pointer}
  .mr-legend{background:var(--surface);color:var(--fg);border-radius:8px;box-shadow:0 1px 5px rgba(0,0,0,.3);padding:6px 9px;display:grid;grid-template-columns:repeat(2,auto);gap:2px 10px;font:11px var(--font-body)}.mr-legend span{display:flex;align-items:center;gap:5px}.mr-legend i{width:16px;height:4px;border-radius:2px;display:inline-block}.mr-legend i.dot{width:10px;height:10px;border-radius:50%}
  .mr-num span{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#fff;color:#002947;border:2px solid #002947;font:700 10px var(--font-mono);box-shadow:0 1px 3px rgba(0,0,0,.35)}.mr-popend span{width:26px;height:26px;background:#fe6218;color:#fff;border-color:#fff;font-size:12px}
  .mr-kv{grid-template-columns:repeat(2,minmax(0,1fr))}.mr-lances{display:grid;gap:4px}.mr-lance{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;text-align:left;border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:8px;padding:7px 9px;cursor:pointer;font:500 12px var(--font-body)}.mr-lance:hover{border-color:var(--accent)}.mr-lance.on{border-color:var(--orange);background:var(--accent-soft)}
  .mr-dot{min-width:20px;height:20px;border-radius:10px;display:grid;place-items:center;font:700 11px var(--font-mono);background:var(--mute-bg);color:var(--fg-2)}.mr-dot.warn{background:var(--warn);color:#fff}.mr-dot.bad{background:var(--bad);color:#fff}
  .mr-lance-det{border:2px solid var(--orange);border-radius:10px;padding:10px;display:grid;gap:6px}.mr-lance-det .tbl{font-size:12px}.mr-lance-det .tbl td,.mr-lance-det .tbl th{padding:6px 7px}
  .mr-pop-head{display:flex;gap:8px;align-items:baseline}.mr-pop-list{display:grid;gap:3px;max-height:44vh;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:4px}
  .mr-pop-row{display:grid;grid-template-columns:auto 1fr auto;gap:6px;align-items:center;padding:3px 6px;border-radius:6px}.mr-pop-row.on{background:var(--accent-soft)}
  .mr-pop-go{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;text-align:left;border:0;background:none;color:var(--fg);cursor:pointer;font:500 12.5px var(--font-body);padding:4px 0}.mr-pop-go .tiny{grid-column:1/-1}.mr-pop-go:hover span:nth-child(2){color:var(--accent)}
  .mr-picking{cursor:crosshair}.mr-picking .leaflet-interactive{cursor:crosshair}
  .mr-sel{border:1px dashed var(--line-2);border-radius:10px;padding:10px;display:grid;gap:8px;margin-top:8px;background:var(--surface-2)}.mr-sel-list{display:flex;flex-wrap:wrap;gap:6px}
  .mr-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 4px 3px 9px;border-radius:14px;background:var(--surface);border:1px solid var(--line);font-size:12px}.mr-chip.reprovado{border-color:var(--bad)}.mr-chip.atencao{border-color:var(--warn)}
  .mr-chip button{border:0;background:var(--mute-bg);color:var(--fg-2);width:20px;height:20px;border-radius:50%;cursor:pointer;font-size:14px;line-height:1}
  .mr-grid:fullscreen{background:var(--bg);padding:10px}.mr-grid:fullscreen .mr-map,.mr-grid:fullscreen .mr-side{height:calc(100vh - 20px);max-height:none}.mr-pulse{animation:mrp 1.2s ease-in-out infinite}@keyframes mrp{50%{stroke-width:9;stroke-opacity:.4}}
  .leaflet-control-layers{background:var(--surface);color:var(--fg);border-radius:8px;box-shadow:0 1px 5px rgba(0,0,0,.35);padding:6px 10px;font-size:12px}.leaflet-control-layers label{display:flex;gap:6px;align-items:center}.leaflet-control-layers-toggle{display:none}.leaflet-control-scale-line{background:rgba(255,255,255,.8);border:2px solid #555;border-top:0;padding:0 4px;font-size:11px;color:#333}
  body.field .mr-map{height:62vh}
  @media (max-width:920px){.mr-grid{grid-template-columns:minmax(0,1fr)}.mr-map{height:60vh}.mr-side{max-height:none}}
  @media (prefers-reduced-motion:reduce){.mr-pulse{animation:none}}`;
  document.head.appendChild(st);

  FC.mapaRede = { loadSaved, parseFile, setRede, state: M, build, selectLance, exportKMZ, toggleSel };
  FC.registerModule({ id: 'mapa', order: 20, title: 'Mapa da rede', icon: 'map', group: 'tools', field: true, render });
})(window.FC = window.FC || {});
