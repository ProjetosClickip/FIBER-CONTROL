/* Diagrama de caixas (OZmap) × eventos OTDR
 * Importa as caixas/CEOs que serão mexidas (KMZ/KML, XLSX/CSV ou PDF do OZmap), posiciona cada uma
 * ao longo do traçado e calcula em que distância ela deve aparecer no OTDR, casando com os eventos medidos.
 */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, C = FC.calc, store = FC.store, I = FC.importers;
  const B = FC.boxes = {};
  B.ACOES = ['Inspecionar', 'Fusão', 'Abertura / sangria', 'Reparo', 'Troca de caixa', 'Remanejamento', 'Nenhuma'];
  B.STATUS = ['Pendente', 'Em execução', 'Concluída'];
  const BOX_RE = /\b(CEO|CTO|CTOE|CE|CX|CAIXA|EMENDA|RESERVA|DIO|POP|PTO|ARMARIO|ARMÁRIO|TERMINAL)\b[-_ .]?[\w.\-/]*/i;
  B.tipoDe = (nome) => { const m = String(nome || '').match(/\b(CEO|CTOE?|CE|CX|CAIXA|EMENDA|RESERVA|DIO|POP|TERMINAL)/i); if (!m) return 'Caixa'; const k = m[1].toUpperCase(); return { CEO: 'CEO (emenda)', CE: 'Caixa de emenda', EMENDA: 'Caixa de emenda', CTO: 'CTO', CTOE: 'CTO', CX: 'Caixa', CAIXA: 'Caixa', RESERVA: 'Reserva técnica', DIO: 'DIO', POP: 'POP', TERMINAL: 'Terminal' }[k] || 'Caixa'; };

  /* ---------- Geometria: posição de um ponto ao longo do traçado ---------- */
  B.along = (route, pt) => {
    const lat0 = route[0][0] * Math.PI / 180;
    const P = (c) => [(c[1]) * Math.cos(lat0) * 111320, c[0] * 110540];
    const q = P(pt); let cum = 0, best = { off: Infinity, along: 0 };
    for (let i = 1; i < route.length; i++) {
      const a = P(route[i - 1]), b = P(route[i]); const seg = FC.geo.hav(route[i - 1], route[i]);
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)) : 0;
      const off = Math.hypot(a[0] + t * dx - q[0], a[1] + t * dy - q[1]);
      if (off < best.off) best = { off, along: cum + t * seg };
      cum += seg;
    }
    best.total = cum; return best;
  };

  /* ---------- Casamento caixas × eventos ---------- */
  B.match = (t, m) => {
    const S = store.state.settings.boxes, link = store.get('links', t.linkId) || {};
    const caixas = (t.caixas || []).filter(c => c.distM != null).sort((a, b) => a.distM - b.distM);
    const oz = +t.ozmapM || (t.coords && t.coords.length > 1 ? FC.geo.pathLen(t.coords) : null) || (caixas.length ? caixas[caixas.length - 1].distM : null);
    const L = C.otdrNet(m);
    let factor = 1, factorSrc = 'Sem fator (1,000)';
    if (L && oz) { factor = L / oz; factorSrc = 'Medido neste trecho (OTDR ÷ OZmap)'; }
    else if (store.state.settings.correction.approved[t.tipo]) { factor = store.state.settings.correction.approved[t.tipo].factor; factorSrc = 'Fator aprovado para ' + t.tipo; }
    const fromB = m && m.direcaoInversa != null ? m.direcaoInversa : !!(m && link.popB && (m.direction || '').toString().toUpperCase().startsWith(String(link.popB).toUpperCase()));
    const evs = m ? (m.events || []).filter(e => !e.end && e.distM > 1) : [];
    const tol = (d) => Math.max(+S.matchM, d * +S.matchPct / 100);
    const used = new Set();
    const rows = (t.caixas || []).map(c => {
      if (c.distM == null) return { c, ozD: null, expD: null, ev: null, status: 'sem-posicao' };
      const ozD = fromB && oz ? oz - c.distM : c.distM;
      const expD = ozD * factor + (+((m || {}).launchM) || 0);
      let ev = null, bd = Infinity;
      evs.forEach(e => { const d = Math.abs(e.distM - expD); if (d < bd && d <= tol(expD)) { bd = d; ev = e; } });
      if (ev) used.add(ev.n);
      return { c, ozD, expD, ev, diff: ev ? ev.distM - expD : null, status: !m ? 'sem-medicao' : ev ? 'casada' : (/passagem|reserva|poste/i.test(c.tipo || '') ? 'passagem' : 'sem-evento') };
    }).sort((a, b) => (a.ozD == null) - (b.ozD == null) || (a.ozD || 0) - (b.ozD || 0));
    const orphans = evs.filter(e => !used.has(e.n));
    return { rows, orphans, factor, factorSrc, oz, L, fromB, m };
  };
  B.statusBadge = (s) => ({ casada: ui.badge('verde', 'Evento encontrado'), 'sem-evento': ui.badge('amarelo', 'Sem evento no OTDR'), passagem: ui.badge('info', 'Passagem / reserva'), 'sem-posicao': ui.badge('sem-dados', 'Sem posição'), 'sem-medicao': ui.badge('sem-dados', 'Sem medição') }[s]);

  /* ---------- Leitura dos arquivos do OZmap ---------- */
  async function parseFile(file, t) {
    const e = U.ext(file.name), out = { caixas: [], lines: [], notes: [], fonte: '' };
    if (e === 'kmz' || e === 'kml') {
      const g = await FC.geoio.readKMZ(file, file.name);
      out.lines = g.filter(x => !x.point && x.coords.length > 1).map(x => ({ name: x.name, coords: x.coords, len: FC.geo.pathLen(x.coords) })).sort((a, b) => b.len - a.len);
      out.points = g.filter(x => x.point).map(x => ({ nome: x.name, lat: x.coords[0][0], lng: x.coords[0][1], tipo: x.props.tipo || x.props.Tipo || x.props.type || B.tipoDe(x.name + ' ' + x.folder), acao: x.props.acao || x.props['ação'] || x.props.servico || '', obs: x.desc.slice(0, 200) }));
      out.fonte = 'KMZ/KML do OZmap';
    } else if (['xlsx', 'xls', 'csv'].includes(e)) {
      const sheets = await I.readSheet(file); const sh = sheets[0];
      const mp = I.guessColumns(sh.headers, { nome: [/^caixa|^nome|identifica|^ceo|^cto|^elemento/], tipo: [/^tipo/], lat: [/^lat/], lng: [/^lon|^lng/], dist: [/dist|acumulad|metragem|^km$|posi/], acao: [/a[cç][aã]o|interven|servi[cç]o|atividade/], obs: [/obs/] });
      if (!mp.nome) throw new Error('Não encontrei a coluna com o nome da caixa (ex.: "Caixa", "Nome", "Identificação").');
      out.points = sh.rows.filter(r => String(r[mp.nome]).trim()).map(r => ({ nome: String(r[mp.nome]).trim(), tipo: mp.tipo ? String(r[mp.tipo]) : B.tipoDe(r[mp.nome]), lat: mp.lat ? U.parseNum(r[mp.lat]) : null, lng: mp.lng ? U.parseNum(r[mp.lng]) : null, distM: mp.dist ? I.toMeters(r[mp.dist], mp.dist) : null, acao: mp.acao ? String(r[mp.acao]) : '', obs: mp.obs ? String(r[mp.obs]) : '' }));
      out.fonte = 'Planilha do OZmap (' + sh.name + ')';
      out.notes.push('Colunas usadas: ' + Object.entries(mp).map(([k, v]) => k + ' = "' + v + '"').join(', '));
    } else if (e === 'pdf') {
      const rows = await I.pdfRows(await U.readAsArrayBuffer(file));
      out.points = [];
      rows.forEach(r => {
        const m = r.text.match(BOX_RE); if (!m) return;
        const d = r.text.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(km|m)\b/i);
        if (!out.points.some(p => p.nome === m[0].trim())) out.points.push({ nome: m[0].trim(), tipo: B.tipoDe(m[0]), distM: d ? U.parseNum(d[1]) * (/km/i.test(d[2]) ? 1000 : 1) : null, acao: '', obs: '' });
      });
      out.fonte = 'PDF do diagrama OZmap';
      out.notes.push('PDF: as caixas são reconhecidas pelo nome (CEO, CTO, CE, CX…). Distâncias só são lidas quando aparecem na mesma linha; confira a lista.');
    } else throw new Error('Formato não suportado. Use KMZ/KML, XLSX/CSV ou PDF exportados do OZmap.');
    if (!out.points.length) throw new Error('Nenhuma caixa encontrada no arquivo.');
    return out;
  }

  /** Converte pontos em caixas posicionadas no traçado do trecho */
  function place(points, route, ozmapM) {
    const S = store.state.settings.boxes; let fora = 0;
    const len = route ? FC.geo.pathLen(route) : null;
    const scale = len && ozmapM ? ozmapM / len : 1; // alinha a geometria à distância oficial do OZmap
    const caixas = [];
    points.forEach(p => {
      let distM = p.distM != null ? p.distM : null, off = null;
      if (distM == null && route && p.lat != null && p.lng != null) { const a = B.along(route, [p.lat, p.lng]); off = a.off; if (a.off > +S.maxOffRouteM) { fora++; return; } distM = a.along * scale; }
      caixas.push({ id: U.uid('cx'), nome: p.nome, tipo: p.tipo || B.tipoDe(p.nome), distM: distM != null ? +distM.toFixed(1) : null, offM: off != null ? +off.toFixed(1) : null, lat: p.lat, lng: p.lng, acao: p.acao && B.ACOES.find(a => U.norm(a).startsWith(U.norm(p.acao).slice(0, 4))) || (p.acao ? p.acao : 'Inspecionar'), status: 'Pendente', obs: p.obs || '' });
    });
    return { caixas, fora };
  }

  B.importFlow = async (trechoId) => {
    if (!store.require('enlace.editar')) return;
    const [file] = await ui.pickFiles({ accept: '.kmz,.kml,.xlsx,.xls,.csv,.pdf' }); if (!file) return;
    let parsed; try { parsed = await parseFile(file); } catch (e) { return ui.toast('Diagrama de caixas: ' + e.message, 'err', 8000); }
    const ts = store.state.trechos;
    ui.modal({
      title: 'Importar diagrama de caixas — ' + file.name, wide: true,
      body: `<div class="note">${ui.icon('map')}<div><b>${U.esc(parsed.fonte)}</b>: ${parsed.points.length} caixa(s)${parsed.lines.length ? ` e ${parsed.lines.length} traçado(s)` : ''} encontrados.${parsed.notes.map(n => '<br><span class="small">' + U.esc(n) + '</span>').join('')}</div></div>
        <form class="form-grid" id="bxf">
          ${ui.field('Trecho', `<select name="trechoId" id="bxT">${ts.map(t => `<option value="${t.id}" ${t.id === trechoId ? 'selected' : ''}>${U.esc((store.get('links', t.linkId) || {}).nome)} / ${U.esc(t.nome)}</option>`).join('')}</select>`, '', 'full')}
          ${parsed.lines.length ? ui.field('Traçado usado para posicionar', `<select name="line" id="bxL"><option value="-1">Traçado já cadastrado no trecho</option>${parsed.lines.map((l, i) => `<option value="${i}">${U.esc(l.name)} (${U.m(l.len, 0)})</option>`).join('')}</select>`, 'Linhas do KMZ', 'full') : ''}
          <label class="check full"><input type="checkbox" name="replace" checked> Substituir as caixas já cadastradas neste trecho</label>
          ${parsed.lines.length ? '<label class="check full"><input type="checkbox" name="saveRoute" checked> Gravar o traçado do KMZ no trecho (quando o trecho ainda não tem geometria)</label>' : ''}
        </form><div id="bxPrev"></div>`,
      onOpen: (b) => {
        const prev = () => {
          const t = store.get('trechos', U.$('#bxT', b).value); const li = U.$('#bxL', b) ? +U.$('#bxL', b).value : -1;
          const route = li >= 0 ? parsed.lines[li].coords : t.coords && t.coords.length > 1 ? t.coords : (parsed.lines[0] && parsed.lines[0].coords);
          const r = place(parsed.points, route, +t.ozmapM || (route ? FC.geo.pathLen(route) : null));
          b._placed = r; b._route = route;
          const semPos = r.caixas.filter(c => c.distM == null).length;
          U.$('#bxPrev', b).innerHTML = `${r.fora ? `<div class="note warn">${ui.icon('alert')}<div>${r.fora} ponto(s) a mais de ${store.state.settings.boxes.maxOffRouteM} m do traçado foram ignorados (pertencem a outro trecho).</div></div>` : ''}${semPos ? `<div class="note warn">${ui.icon('alert')}<div>${semPos} caixa(s) sem posição: ${route ? 'faltam coordenadas ou distância' : 'o trecho não tem traçado; importe o KMZ ou informe a distância acumulada'}. Você poderá digitar a distância depois.</div></div>` : ''}
            <div class="table-scroll"><table class="tbl"><thead><tr><th>Caixa</th><th>Tipo</th><th class="num">Distância no traçado</th><th class="num">Afastamento</th><th>Ação</th></tr></thead><tbody>${r.caixas.sort((x, y) => (x.distM == null) - (y.distM == null) || x.distM - y.distM).map(c => `<tr><td><b>${U.esc(c.nome)}</b></td><td>${U.esc(c.tipo)}</td><td class="num">${U.m(c.distM, 0)}</td><td class="num">${c.offM != null ? U.m(c.offM, 0) : '—'}</td><td>${U.esc(c.acao)}</td></tr>`).join('')}</tbody></table></div>`;
        };
        U.$('#bxT', b).onchange = prev; const l = U.$('#bxL', b); l && (l.onchange = prev); prev();
      },
      actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Importar caixas', cls: 'primary', icon: 'check', onClick: async (b) => {
        const f = ui.formData(U.$('#bxf', b)); const t = store.get('trechos', f.trechoId); const r = b._placed;
        if (f.saveRoute && b._route && !(t.coords && t.coords.length > 1)) { t.coords = b._route; if (!t.ozmapM) t.ozmapM = Math.round(FC.geo.pathLen(b._route)); FC.snapshotLink(store.get('links', t.linkId), 'Traçado importado do diagrama ' + file.name); }
        t.caixas = f.replace ? r.caixas : [...(t.caixas || []), ...r.caixas];
        t.caixasFonte = { arquivo: file.name, fonte: parsed.fonte, em: U.now(), por: store.user().nome };
        store.upsert('trechos', t, `Diagrama de caixas (${r.caixas.length}) importado de ${file.name} para ${t.nome}`);
        try { await store.putFile(file, { trechoId: t.id, linkId: t.linkId, categoria: 'Diagrama de caixas (OZmap)' }); } catch (e) { /* anexo é opcional */ }
        ui.toast(r.caixas.length + ' caixa(s) importadas e comparadas com o OTDR.', 'ok');
        FC.go('comparativo', { tab: 'caixas', trechoId: t.id });
      } }]
    });
  };

  /* ---------- Diagrama SVG: traçado OZmap (em cima) × fibra medida (embaixo) ---------- */
  B.diagram = (t, r) => {
    const link = store.get('links', t.linkId) || {};
    const W = 1100, x0 = 70, x1 = W - 40, maxD = Math.max(r.oz || 0, r.L || 0, ...r.rows.map(x => Math.max(x.ozD || 0, x.expD || 0)), 1);
    const X = (d) => x0 + (x1 - x0) * d / maxD;
    const yT = 92, yB = 200;
    const rowsP = r.rows.filter(x => x.ozD != null);
    let s = `<svg viewBox="0 0 ${W} 260" class="bxsvg" role="img" aria-label="Diagrama de caixas e eventos">`;
    s += `<text x="10" y="${yT + 4}" class="lbl">OZmap</text><text x="10" y="${yB + 4}" class="lbl">OTDR</text>`;
    s += `<line x1="${X(0)}" y1="${yT}" x2="${X(r.oz || maxD)}" y2="${yT}" class="route"/><line x1="${X(0)}" y1="${yB}" x2="${X(r.L || maxD)}" y2="${yB}" class="fiber"/>`;
    s += `<text x="${X(0)}" y="22" class="pop">${U.esc(r.fromB ? link.popB || 'B' : link.popA || 'A')}</text><text x="${X(r.oz || maxD)}" y="22" text-anchor="end" class="pop">${U.esc(r.fromB ? link.popA || 'A' : link.popB || 'B')}</text>`;
    rowsP.forEach((x, i) => {
      const cx = X(x.ozD), ex = X(x.expD);
      if (x.ev) s += `<line x1="${cx}" y1="${yT + 8}" x2="${X(x.ev.distM)}" y2="${yB - 8}" class="link ok"/>`;
      else s += `<line x1="${cx}" y1="${yT + 8}" x2="${ex}" y2="${yB - 8}" class="link miss"/>`;
      s += `<g class="bx ${x.status}" data-bx="${x.c.id}" tabindex="0"><rect x="${cx - 7}" y="${yT - 7}" width="14" height="14" rx="3"/><text x="${cx}" y="${yT - 13 - (i % 2) * 12}" text-anchor="middle">${U.esc(x.c.nome.length > 16 ? x.c.nome.slice(0, 15) + '…' : x.c.nome)}</text></g>`;
    });
    let lastLbl = -1e9;
    (r.m ? r.m.events : []).forEach(e => {
      const ex = X(e.distM); const orphan = r.orphans.some(o => o.n === e.n);
      s += e.end ? `<rect x="${ex - 2}" y="${yB - 14}" width="4" height="28" class="ev end"/>` : e.kind && e.kind.startsWith('refletivo') ? `<path d="M${ex} ${yB - 10} L${ex + 8} ${yB + 7} L${ex - 8} ${yB + 7}Z" class="ev conn ${orphan ? 'orphan' : ''}"/>` : `<circle cx="${ex}" cy="${yB}" r="6" class="ev splice ${orphan ? 'orphan' : ''}"/>`;
      if (ex - lastLbl > 48) { s += `<text x="${ex}" y="${yB + 26}" text-anchor="middle" class="evt">${U.num(e.distM, 0)} m</text>`; lastLbl = ex; }
    });
    s += `<text x="${x1}" y="250" text-anchor="end" class="tick">escala: 0 a ${U.num(maxD, 0)} m</text></svg>`;
    return s;
  };

  B.render = (box, params) => {
    const ts = store.state.trechos;
    const sel = params.trechoId || (ts.find(t => (t.caixas || []).length) || ts[0] || {}).id;
    box.innerHTML = `<section class="panel"><div class="filters">${ui.field('Trecho', `<select id="bxs">${ts.map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${U.esc((store.get('links', t.linkId) || {}).nome)} / ${U.esc(t.nome)}${(t.caixas || []).length ? ' · ' + t.caixas.length + ' caixas' : ''}</option>`).join('')}</select>`, '', 'wide')}
      <div class="btn-row"><button class="btn primary" id="bxImp">${ui.icon('upload')}Importar diagrama de caixas (OZmap)</button><button class="btn" id="bxAdd">${ui.icon('plus')}Adicionar caixa</button><button class="btn" id="bxX">${ui.icon('download')}Lista para campo (XLSX)</button><button class="btn" id="bxP">${ui.icon('download')}PDF</button></div></div>
      <p class="small muted">Aceita KMZ/KML (caixas como pontos e o cabo como linha), planilha XLSX/CSV (nome, tipo, latitude/longitude ou distância acumulada, ação) ou PDF do diagrama exportados do OZmap.</p></section><div id="bxBody"></div>`;
    U.$('#bxs', box).onchange = (e) => FC.go('comparativo', { tab: 'caixas', trechoId: e.target.value });
    U.$('#bxImp', box).onclick = () => B.importFlow(sel);
    const t = store.get('trechos', sel);
    if (!t) { U.$('#bxBody', box).innerHTML = '<section class="panel"><p class="muted">Cadastre um trecho primeiro.</p></section>'; return; }
    const m = C.latest(t.id); const r = B.match(t, m); const link = store.get('links', t.linkId);
    const exportRows = () => r.rows.map(x => ({ Caixa: x.c.nome, Tipo: x.c.tipo, 'Distância OZmap (m)': x.ozD != null ? +x.ozD.toFixed(1) : '', 'Esperado no OTDR (m)': x.expD != null ? +x.expD.toFixed(1) : '', 'Evento OTDR (m)': x.ev ? +x.ev.distM.toFixed(1) : '', 'Diferença (m)': x.diff != null ? +x.diff.toFixed(1) : '', 'Perda no evento (dB)': x.ev ? x.ev.loss : '', Ação: x.c.acao, Status: x.c.status, Observação: x.c.obs }));
    U.$('#bxX', box).onclick = () => FC.reports.exportRows(exportRows(), 'caixas-' + U.norm(link.nome + '-' + t.nome).replace(/[^a-z0-9]+/g, '-'), 'xlsx', 'Caixas a mexer');
    U.$('#bxP', box).onclick = () => FC.reports.exportRows(exportRows(), 'caixas-' + U.norm(link.nome + '-' + t.nome).replace(/[^a-z0-9]+/g, '-'), 'pdf', `Caixas a mexer — ${link.nome} / ${t.nome}`);
    U.$('#bxAdd', box).onclick = () => boxForm(t);
    const n = (s) => r.rows.filter(x => x.status === s).length;
    const body = U.$('#bxBody', box);
    if (!(t.caixas || []).length) { body.innerHTML = `<section class="panel"><div class="dz" id="bxDz">${ui.icon('map')}<b>Nenhuma caixa cadastrada neste trecho</b><span class="small muted">Importe o diagrama de caixas exportado do OZmap para saber em que distância cada caixa deve aparecer no OTDR.</span><button class="btn primary" id="bxImp2">Importar diagrama</button></div></section>`; U.$('#bxImp2').onclick = () => B.importFlow(sel); return; }
    body.innerHTML = `<section class="kpis"><div class="kpi accent"><span class="l">Caixas no trecho</span><span class="v">${r.rows.length}</span><span class="s">${U.esc((t.caixasFonte || {}).arquivo || '')}</span></div><div class="kpi ok"><span class="l">Com evento no OTDR</span><span class="v">${n('casada')}</span></div><div class="kpi warn"><span class="l">Sem evento</span><span class="v">${n('sem-evento')}</span><span class="s">emenda esperada não aparece</span></div><div class="kpi bad"><span class="l">Eventos sem caixa</span><span class="v">${r.orphans.length}</span><span class="s">fora do diagrama do OZmap</span></div><div class="kpi"><span class="l">A mexer</span><span class="v">${(t.caixas || []).filter(c => c.acao !== 'Nenhuma' && c.status !== 'Concluída').length}</span><span class="s">pendentes ou em execução</span></div></section>
      <section class="panel"><header><div><h3>Diagrama OZmap × OTDR</h3><span class="sub">${m ? `Medição de ${U.dt(m.data)} · fator ${U.num(r.factor, 4)} (${U.esc(r.factorSrc)})` : 'Sem medição: mostrando apenas as posições do OZmap'}</span></div>
        ${m ? `<label class="check small"><input type="checkbox" id="bxDir" ${r.fromB ? 'checked' : ''}> Medição feita a partir de ${U.esc(link.popB || 'B')} (sentido inverso)</label>` : ''}</header>
        <div class="table-scroll" style="border:0"><div style="min-width:900px">${B.diagram(t, r)}</div></div>
        <div class="btn-row small"><span class="badge ok">Caixa com evento</span><span class="badge warn">Caixa sem evento</span><span class="badge info">Passagem / reserva</span><span class="badge bad">Evento sem caixa</span></div></section>
      <section class="panel"><header><h3>Caixas que serão mexidas</h3><span class="sub">Tolerância de casamento: ${store.state.settings.boxes.matchM} m ou ${store.state.settings.boxes.matchPct}% da distância</span></header><div id="bxTbl"></div></section>
      ${r.orphans.length ? `<section class="panel"><header><h3>Eventos do OTDR sem caixa no diagrama</h3><span class="sub">Podem ser emendas não cadastradas no OZmap, curvaturas ou danos</span></header><div class="table-scroll"><table class="tbl"><thead><tr><th>Evento</th><th class="num">Distância OTDR</th><th class="num">Equivale no traçado</th><th class="num">Perda</th><th>Tipo</th></tr></thead><tbody>${r.orphans.map(e => `<tr class="row-bad"><td>${e.n}</td><td class="num">${U.m(e.distM, 1)}</td><td class="num">${U.m(r.fromB && r.oz ? r.oz - e.distM / r.factor : e.distM / r.factor, 0)}</td><td class="num">${U.db(e.loss, 3)}</td><td>${U.esc(e.kind || '')}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
    ui.table(U.$('#bxTbl', body), { rows: r.rows, sortKey: 'oz', sortDir: 'asc', pageSize: 100, rowClass: x => x.status === 'sem-evento' ? 'row-warn' : x.status === 'casada' ? 'row-ok' : '', columns: [
      { key: 'nome', label: 'Caixa', sort: x => x.c.nome, render: x => `<b>${U.esc(x.c.nome)}</b><br><span class="tiny muted">${U.esc(x.c.tipo)}</span>` },
      { key: 'oz', label: 'Distância OZmap', num: true, sort: x => x.ozD, render: x => `<input type="number" step="0.1" data-bxd="${x.c.id}" value="${x.c.distM == null ? '' : x.c.distM}" style="width:96px;text-align:right" aria-label="Distância no traçado">` },
      { key: 'exp', label: 'Esperado no OTDR', num: true, sort: x => x.expD, render: x => `<b>${U.m(x.expD, 0)}</b>` },
      { key: 'ev', label: 'Evento OTDR', num: true, sort: x => x.ev ? x.ev.distM : null, render: x => x.ev ? `nº ${x.ev.n} · ${U.m(x.ev.distM, 1)}` : '—' },
      { key: 'diff', label: 'Diferença', num: true, sort: x => x.diff, render: x => x.diff != null ? (x.diff > 0 ? '+' : '') + U.m(x.diff, 1) : '—' },
      { key: 'loss', label: 'Perda', num: true, sort: x => x.ev ? x.ev.loss : null, render: x => x.ev ? U.db(x.ev.loss, 3) : '—' },
      { key: 'st', label: 'Situação', sort: x => x.status, render: x => B.statusBadge(x.status) },
      { key: 'acao', label: 'Ação', sortable: false, render: x => `<select data-bxa="${x.c.id}" aria-label="Ação" style="min-width:150px">${B.ACOES.map(a => `<option ${a === x.c.acao ? 'selected' : ''}>${a}</option>`).join('')}${B.ACOES.includes(x.c.acao) ? '' : `<option selected>${U.esc(x.c.acao)}</option>`}</select>` },
      { key: 'status', label: 'Execução', sortable: false, render: x => `<select data-bxs="${x.c.id}" aria-label="Execução" style="min-width:120px">${B.STATUS.map(a => `<option ${a === x.c.status ? 'selected' : ''}>${a}</option>`).join('')}</select>` },
      { key: 'del', label: '', sortable: false, render: x => `<button class="btn sm ghost" data-bxdel="${x.c.id}" title="Remover">${ui.icon('trash')}</button>` }
    ] });
    const save = (msg) => { store.upsert('trechos', t, msg); };
    const bind = () => {
      U.$$('[data-bxd]', body).forEach(i => { i.onclick = e => e.stopPropagation(); i.onchange = () => { const c = t.caixas.find(c => c.id === i.dataset.bxd); c.distM = i.value === '' ? null : U.parseNum(i.value); save(`Distância da caixa ${c.nome}: ${c.distM} m`); FC.rerender(); }; });
      U.$$('[data-bxa]', body).forEach(i => i.onchange = () => { const c = t.caixas.find(c => c.id === i.dataset.bxa); c.acao = i.value; save(`Ação da caixa ${c.nome}: ${c.acao}`); });
      U.$$('[data-bxs]', body).forEach(i => i.onchange = () => { const c = t.caixas.find(c => c.id === i.dataset.bxs); c.status = i.value; c.statusEm = U.now(); c.statusPor = store.user().nome; save(`Execução da caixa ${c.nome}: ${c.status}`); });
      U.$$('[data-bxdel]', body).forEach(bt => bt.onclick = async () => { const c = t.caixas.find(c => c.id === bt.dataset.bxdel); if (await ui.confirm('Remover caixa', `Remover ${c.nome} deste trecho?`, 'Remover', true)) { t.caixas = t.caixas.filter(x => x !== c); save('Caixa removida: ' + c.nome); FC.rerender(); } });
    };
    bind(); U.$('#bxTbl', body).addEventListener('click', () => setTimeout(bind, 0));
    const dir = U.$('#bxDir', body); dir && (dir.onchange = () => { m.direcaoInversa = dir.checked; store.upsert('measurements', m, 'Sentido da medição: a partir de ' + (dir.checked ? link.popB : link.popA)); FC.rerender(); });
    U.$$('[data-bx]', body).forEach(g => g.onclick = () => { const inp = U.$(`[data-bxd="${g.dataset.bx}"]`, body); if (inp) { const tr = inp.closest('tr'); U.$$('#bxTbl tr', body).forEach(x => x.style.outline = ''); tr.style.outline = '2px solid var(--orange)'; tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); } });
  };

  function boxForm(t) {
    if (!store.require('enlace.editar')) return;
    ui.modal({ title: 'Adicionar caixa — ' + t.nome, body: `<form class="form-grid" id="bf1">${ui.field('Nome da caixa', ui.input('nome', '', 'required placeholder="CEO-001"'))}${ui.field('Tipo', ui.input('tipo', 'CEO (emenda)'))}${ui.field('Distância no traçado OZmap (m)', ui.input('distM', '', 'type="number" step="0.1" min="0"'), 'A partir do POP de origem')}${ui.field('Ação', ui.select('acao', B.ACOES, 'Inspecionar'))}${ui.field('Observação', '<textarea name="obs"></textarea>', '', 'full')}</form>`,
      actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Adicionar', cls: 'primary', onClick: (b) => { const f = ui.formData(U.$('#bf1', b)); if (!f.nome.trim()) { ui.toast('Informe o nome.', 'err'); return false; } t.caixas = [...(t.caixas || []), { id: U.uid('cx'), nome: f.nome.trim(), tipo: f.tipo, distM: f.distM === '' ? null : +f.distM, acao: f.acao, status: 'Pendente', obs: f.obs }]; store.upsert('trechos', t, 'Caixa adicionada: ' + f.nome); FC.rerender(); } }] });
  }

  /* estilo do diagrama (usa os tokens do tema) */
  const st = document.createElement('style');
  st.textContent = `.bxsvg{width:100%;height:auto;display:block;font-family:var(--font-body)}.bxsvg .lbl{font:600 12px var(--font-body);fill:var(--fg-2)}.bxsvg .pop{font:700 13px var(--font-display);fill:var(--ink)}.bxsvg .route{stroke:var(--info);stroke-width:4;stroke-dasharray:10 6}.bxsvg .fiber{stroke:var(--accent-ink);stroke-width:4}
  .bxsvg .bx rect{fill:var(--warn);stroke:var(--surface);stroke-width:2}.bxsvg .bx.casada rect{fill:var(--ok)}.bxsvg .bx.passagem rect{fill:var(--info)}.bxsvg .bx text{font-size:10.5px;fill:var(--fg)}.bxsvg .bx{cursor:pointer}.bxsvg .bx:hover rect{stroke:var(--orange);stroke-width:3}
  .bxsvg .link{stroke-width:1.4}.bxsvg .link.ok{stroke:var(--ok)}.bxsvg .link.miss{stroke:var(--warn);stroke-dasharray:4 4}.bxsvg .ev{fill:var(--teal);stroke:var(--surface);stroke-width:2}.bxsvg .ev.orphan{fill:var(--bad)}.bxsvg .ev.end{fill:var(--orange)}.bxsvg .evt,.bxsvg .tick{font-size:10px;fill:var(--fg-3)}`;
  document.head.appendChild(st);
})(window.FC = window.FC || {});
