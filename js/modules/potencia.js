/* Cálculo de potência óptica (ponto a ponto e PON)
 * Potência recebida = Tx − perdas (fibra + fusões + conectores + splitters + outras).
 * Folga = Rx − sensibilidade; aprovado quando folga ≥ margem de projeto e Rx ≤ saturação.
 * Todos os valores de transceptores e classes são TÍPICOS e editáveis: confirme no datasheet.
 */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, store = FC.store, C = FC.calc;

  // [nome, Tx mínimo dBm, sensibilidade dBm, saturação dBm, λ nm, alcance nominal km]
  const SFP = [
    ['SFP 1G LX (10 km)', -9.5, -20, -3, 1310, 10], ['SFP 1G EX (40 km)', -5, -23, -3, 1310, 40], ['SFP 1G ZX (80 km)', 0, -24, -3, 1550, 80],
    ['SFP 1G BiDi (20 km)', -9, -21, -3, 1310, 20], ['SFP+ 10G LR (10 km)', -8.2, -14.4, 0.5, 1310, 10], ['SFP+ 10G ER (40 km)', -4.7, -15.8, -1, 1550, 40],
    ['SFP+ 10G ZR (80 km)', 0, -24, -7, 1550, 80], ['SFP28 25G LR (10 km)', -7, -13.3, 2, 1310, 10], ['QSFP28 100G LR4 (10 km, por lane)', -4.3, -10.6, 4.5, 1310, 10]
  ];
  // [nome, Tx mínimo OLT dBm, sensibilidade ONU dBm, perda mín ODN, perda máx ODN, λ descida]
  const PON = [['GPON B+', 1.5, -27, 13, 28, 1490], ['GPON C+', 3, -30, 17, 32, 1490], ['XGS-PON N1', 2, -28, 14, 29, 1577], ['XGS-PON N2', 4, -28, 16, 31, 1577], ['XGS-PON E1', 6, -28, 18, 33, 1577]];
  const PLC = { '1x2': 3.7, '1x4': 7.3, '1x8': 10.5, '1x16': 13.7, '1x32': 17.1, '1x64': 20.5, '1x128': 24 };
  const FBT = { '5/95': [14, 0.3], '10/90': [10.5, 0.6], '15/85': [8.8, 0.8], '20/80': [7.4, 1.1], '25/75': [6.5, 1.4], '30/70': [5.6, 1.7], '35/65': [5, 2.1], '40/60': [4.4, 2.5], '45/55': [3.9, 3], '50/50': [3.5, 3.5] };

  const P = { modo: 'p2p', preset: 4, classe: 0, tx: -8.2, sens: -14.4, sat: 0.5, km: 10, lam: 1310, att: null, fus: 4, pFus: 0.1, con: 2, pCon: 0.3, outras: 0, margem: 3, spl: [], usarMedida: false, medida: null, eventos: null, origem: '', trechoId: '' };

  const attDe = (lam) => { const w = (store.state.settings.budget.wavelengths || {})[lam]; return w ? +w.att : ({ 1270: 0.4, 1310: 0.35, 1490: 0.28, 1550: 0.25, 1577: 0.25, 1625: 0.3 }[lam] || 0.35); };
  const splLoss = (s) => s.tipo === 'PLC' ? PLC[s.razao] : (FBT[s.razao] || [0, 0])[s.saida === 'maior' ? 1 : 0];

  function calcular() {
    const att = P.att != null ? P.att : attDe(P.lam);
    const itens = [[`Fibra ${U.num(P.km, 3)} km × ${U.num(att, 3)} dB/km (${P.lam} nm)`, P.km * att, 'fibra'], [`Fusões ${P.fus} × ${U.num(P.pFus, 2)} dB`, P.fus * P.pFus, 'fus'], [`Conectores (pares) ${P.con} × ${U.num(P.pCon, 2)} dB`, P.con * P.pCon, 'con']];
    P.spl.forEach(s => itens.push([`Splitter ${s.tipo} ${s.razao}${s.tipo === 'FBT' ? ' (saída ' + s.saida + ')' : ''} a ${U.num(s.km, 2)} km`, splLoss(s), 'spl']));
    if (P.outras) itens.push(['Outras perdas', +P.outras, 'out']);
    let total = U.sum(itens, i => i[1]);
    let base = 'calculada';
    if (P.usarMedida && P.medida != null) { total = P.medida + P.con * P.pCon + U.sum(P.spl, splLoss) + (+P.outras || 0); base = 'medida no OTDR (+ conectores, splitters e outras)'; }
    const rx = P.tx - total, folga = rx - P.sens, cls = P.modo === 'pon' ? PON[P.classe] : null;
    const alertas = [];
    if (cls && total > cls[4]) alertas.push(['bad', `Perda ${U.db(total)} acima do máximo da classe ${cls[0]} (${cls[4]} dB).`]);
    if (cls && total < cls[3]) alertas.push(['warn', `Perda ${U.db(total)} abaixo do mínimo da classe (${cls[3]} dB): risco de saturação, avaliar atenuador.`]);
    if (P.sat != null && rx > P.sat) alertas.push(['warn', `Potência recebida ${U.num(rx, 2)} dBm acima da saturação (${P.sat} dBm): usar atenuador de pelo menos ${U.num(Math.ceil((rx - P.sat + 1) * 2) / 2, 1)} dB.`]);
    if (folga < P.margem && folga >= 0) alertas.push(['warn', `Folga ${U.db(folga)} menor que a margem de projeto (${U.db(P.margem)}).`]);
    if (folga < 0) alertas.push(['bad', `Potência recebida abaixo da sensibilidade (${P.sens} dBm): o enlace não fecha.`]);
    const veredito = folga >= P.margem && !alertas.length ? 'ok' : (folga >= 0 && !alertas.some(a => a[0] === 'bad') ? 'atencao' : 'reprovado');
    const fixo = U.sum(itens.filter(i => i[2] !== 'fibra'), i => i[1]);
    const alcance = att > 0 ? Math.max(0, (P.tx - P.sens - P.margem - (P.usarMedida && P.medida != null ? total - P.km * att : fixo)) / att) : null;
    return { att, itens, total, base, rx, folga, alertas, veredito, alcance, cls };
  }

  /** Nível de potência ao longo do enlace (dBm × km): conector na saída, fibra, fusões distribuídas (ou nos eventos), splitters, conector na chegada */
  function perfil(r) {
    const pts = [], pCon = P.con * P.pCon, conA = P.con ? pCon / 2 : 0;
    let p = P.tx; pts.push({ x: 0, y: p });
    if (conA) { p -= conA; pts.push({ x: 0, y: p }); }
    const passos = [];
    const fusKm = P.eventos && P.eventos.length ? P.eventos.slice(0, P.fus) : Array.from({ length: P.fus }, (_, i) => P.km * (i + 1) / (P.fus + 1));
    fusKm.forEach(k => passos.push({ km: Math.min(k, P.km), loss: P.pFus, nome: 'fusão' }));
    P.spl.forEach(s => passos.push({ km: Math.min(+s.km || 0, P.km), loss: splLoss(s), nome: 'splitter ' + s.razao }));
    if (P.outras) passos.push({ km: P.km / 2, loss: +P.outras, nome: 'outras' });
    passos.sort((a, b) => a.km - b.km);
    let x = 0;
    const escala = P.usarMedida && P.medida != null && P.km ? (P.medida - P.fus * P.pFus) / (P.km * r.att) : 1; // ajusta a inclinação à perda medida
    passos.forEach(s => { p -= (s.km - x) * r.att * escala; pts.push({ x: s.km, y: p }); p -= s.loss; pts.push({ x: s.km, y: p, ev: s.nome }); x = s.km; });
    p -= (P.km - x) * r.att * escala; pts.push({ x: P.km, y: p });
    if (conA) { p -= pCon - conA; pts.push({ x: P.km, y: p }); }
    return pts;
  }

  function render(el, params) {
    const chave = (params.trechoId || '') + '|' + (params.measurementId || '');
    if (params.trechoId && P.param !== chave) carregarTrecho(params.trechoId, params.measurementId);
    P.param = chave;
    const ts = store.state.trechos.filter(t => C.latest(t.id) || t.ozmapM);
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Projeto</span><h1>Cálculo de potência</h1><p class="muted small">Orçamento de potência óptica do transmissor ao receptor. Valores de transceptores e classes são típicos: confirme no datasheet do módulo.</p></div>
      <div class="acts"><button class="btn" id="pwX">${ui.icon('download')}Exportar XLSX</button><button class="btn" id="pwCp">${ui.icon('file')}Copiar resumo</button></div></div>
      <section class="grid pw-grid">
        <div class="panel"><header><h3>Enlace</h3><div class="seg" role="group" aria-label="Tipo"><button class="${P.modo === 'p2p' ? 'on' : ''}" data-modo="p2p">Ponto a ponto</button><button class="${P.modo === 'pon' ? 'on' : ''}" data-modo="pon">PON</button></div></header>
          ${ui.field('Carregar de um trecho/teste', `<select id="pwT"><option value="">— digitar manualmente —</option>${ts.map(t => { const l = store.get('links', t.linkId) || {}, m = C.latest(t.id); return `<option value="${t.id}" ${P.trechoId === t.id ? 'selected' : ''}>${U.esc(l.nome || '?')} / ${U.esc(t.nome)}${m ? ' · OTDR ' + U.km(C.otdrNet(m), 2) : ' · OZmap ' + U.km(t.ozmapM, 2)}</option>`; }).join('')}</select>`, P.origem ? `<span class="auto">${U.esc(P.origem)}</span>` : '')}
          <div class="form-grid" id="pwF">
            ${P.modo === 'p2p' ? ui.field('Transceptor', ui.select('preset', SFP.map((s, i) => [i, s[0]]).concat([[-1, 'Personalizado']]), P.preset)) : ui.field('Classe óptica', ui.select('classe', PON.map((c, i) => [i, `${c[0]} (ODN ${c[3]}–${c[4]} dB)`]), P.classe))}
            ${ui.field('Potência Tx (dBm)', ui.input('tx', P.tx, 'type="number" step="0.1"'), 'Use o mínimo do datasheet (pior caso)')}
            ${ui.field('Sensibilidade Rx (dBm)', ui.input('sens', P.sens, 'type="number" step="0.1"'))}
            ${ui.field('Saturação Rx (dBm)', ui.input('sat', P.sat == null ? '' : P.sat, 'type="number" step="0.1"'), 'Potência máxima no receptor')}
            <div class="field full"><span class="lbl">Comprimento: <b id="pwKmL">${U.num(P.km, 3)} km</b></span><div class="pw-range"><input type="range" id="pwKmR" min="0" max="${Math.max(100, Math.ceil(P.km * 1.5))}" step="0.1" value="${P.km}" aria-label="Comprimento em km"><input id="km" name="km" type="number" step="0.001" min="0" value="${P.km}" style="width:110px" aria-label="Comprimento em km"></div></div>
            ${ui.field('Comprimento de onda', ui.select('lam', [1270, 1310, 1490, 1550, 1577, 1625].map(w => [w, w + ' nm']), P.lam))}
            ${ui.field('Atenuação da fibra (dB/km)', ui.input('att', P.att != null ? P.att : attDe(P.lam), 'type="number" step="0.001"'), 'Padrão do λ em Configurações')}
            ${ui.field('Fusões', ui.input('fus', P.fus, 'type="number" min="0"'))}${ui.field('Perda por fusão (dB)', ui.input('pFus', P.pFus, 'type="number" step="0.01"'))}
            ${ui.field('Conectores (pares)', ui.input('con', P.con, 'type="number" min="0"'))}${ui.field('Perda por conector (dB)', ui.input('pCon', P.pCon, 'type="number" step="0.01"'))}
            ${ui.field('Outras perdas (dB)', ui.input('outras', P.outras, 'type="number" step="0.1" min="0"'))}${ui.field('Margem de projeto (dB)', ui.input('margem', P.margem, 'type="number" step="0.5" min="0"'), 'Envelhecimento, reparos futuros')}
          </div>
          <h4>Splitters</h4><div id="pwS">${P.spl.map((s, i) => `<div class="pw-spl"><select data-st="${i}" aria-label="Tipo"><option ${s.tipo === 'PLC' ? 'selected' : ''}>PLC</option><option ${s.tipo === 'FBT' ? 'selected' : ''}>FBT</option></select>
            <select data-sr="${i}" aria-label="Razão">${Object.keys(s.tipo === 'PLC' ? PLC : FBT).map(k => `<option ${k === s.razao ? 'selected' : ''}>${k}</option>`).join('')}</select>
            ${s.tipo === 'FBT' ? `<select data-ss="${i}" aria-label="Saída"><option value="menor" ${s.saida === 'menor' ? 'selected' : ''}>saída menor</option><option value="maior" ${s.saida === 'maior' ? 'selected' : ''}>saída maior</option></select>` : ''}
            <label class="small">a <input data-sk="${i}" type="number" step="0.01" min="0" value="${s.km}" style="width:80px"> km</label><b class="small">${U.db(splLoss(s))}</b><button class="btn sm ghost" data-sdel="${i}" aria-label="Remover splitter">${ui.icon('trash')}</button></div>`).join('') || '<p class="tiny muted">Nenhum splitter.</p>'}</div>
          <button class="btn sm" id="pwSAdd">${ui.icon('plus')}Adicionar splitter</button>
          ${P.medida != null ? `<label class="check"><input type="checkbox" id="pwMed" ${P.usarMedida ? 'checked' : ''}> Usar a perda medida no OTDR (${U.db(P.medida, 3)}) no lugar da fibra + fusões</label>` : ''}
        </div>
        <div class="grid" style="align-content:start"><div class="panel" id="pwR"></div><div class="panel"><header><h3>Potência ao longo do enlace</h3><span class="sub">dBm × km</span></header><div class="chart-box tall"><canvas id="pwC"></canvas></div></div><div class="panel"><header><h3>Memória de cálculo</h3></header><div id="pwM"></div></div></div>
      </section>`;
    bind(el); atualizar();
  }

  function atualizar() {
    const r = calcular(), box = U.$('#pwR'); if (!box) return;
    const vlab = { ok: ['ok', 'APROVADO', 'O enlace atende com a margem exigida.'], atencao: ['atencao', 'ATENÇÃO', 'Funciona, mas verifique os pontos abaixo.'], reprovado: ['reprovado', 'REPROVADO', 'Revisar distância, transceptor, splitters ou classe.'] }[r.veredito];
    box.innerHTML = `<div class="result-hero ${vlab[0]}"><div class="ring ${vlab[0]}">${ui.icon(r.veredito === 'ok' ? 'check' : 'alert')}</div><div><div class="big">${vlab[1]}</div><p class="small">${vlab[2]}</p></div></div>
      <div class="kpis pw-kpis"><div class="kpi accent"><span class="l">Perda total</span><span class="v">${U.db(r.total)}</span><span class="s">${U.esc(r.base)}</span></div>
      <div class="kpi ${r.folga < 0 ? 'bad' : r.folga < P.margem ? 'warn' : 'ok'}"><span class="l">Potência recebida</span><span class="v">${U.num(r.rx, 2)} dBm</span><span class="s">Tx ${U.num(P.tx, 1)} − ${U.num(r.total, 2)} dB</span></div>
      <div class="kpi ${r.folga < 0 ? 'bad' : r.folga < P.margem ? 'warn' : 'ok'}"><span class="l">Folga sobre a sensibilidade</span><span class="v">${U.db(r.folga)}</span><span class="s">margem exigida ${U.db(P.margem)}</span></div>
      <div class="kpi"><span class="l">Alcance máximo estimado</span><span class="v">${r.alcance != null ? U.num(r.alcance, 1) + ' km' : '—'}</span><span class="s">com a margem de ${U.db(P.margem)}</span></div></div>
      ${r.cls ? `<div class="pw-bar"><span class="small">Perda na faixa da classe ${U.esc(r.cls[0])}: ${r.cls[3]}–${r.cls[4]} dB</span><div class="pw-track"><i style="left:${Math.min(100, r.cls[3] / 40 * 100)}%;width:${(r.cls[4] - r.cls[3]) / 40 * 100}%"></i><b style="left:${Math.min(100, r.total / 40 * 100)}%" title="${U.db(r.total)}"></b></div></div>` : ''}
      ${r.alertas.map(a => `<div class="note ${a[0] === 'bad' ? 'bad' : 'warn'}">${ui.icon('alert')}<div>${U.esc(a[1])}</div></div>`).join('')}
      <p class="tiny muted">Valores típicos de mercado; confirme Tx, sensibilidade e saturação no datasheet do transceptor e siga o padrão interno da operadora.</p>`;
    U.$('#pwM').innerHTML = `<div class="table-scroll"><table class="tbl"><tbody>${r.itens.map(i => `<tr><td>${U.esc(i[0])}</td><td class="num">${U.db(i[1], 3)}</td></tr>`).join('')}
      ${P.usarMedida && P.medida != null ? `<tr><td><i>Substituído pela perda medida no OTDR (fibra + fusões)</i></td><td class="num">${U.db(P.medida, 3)}</td></tr>` : ''}
      <tr><td><b>Perda total</b></td><td class="num"><b>${U.db(r.total, 3)}</b></td></tr><tr><td>Potência de transmissão</td><td class="num">${U.num(P.tx, 2)} dBm</td></tr><tr><td><b>Potência estimada na recepção</b></td><td class="num"><b>${U.num(r.rx, 2)} dBm</b></td></tr>
      <tr><td>Sensibilidade do receptor</td><td class="num">${U.num(P.sens, 2)} dBm</td></tr>${P.sat != null ? `<tr><td>Saturação do receptor</td><td class="num">${U.num(P.sat, 2)} dBm</td></tr>` : ''}<tr><td>Folga / margem exigida</td><td class="num">${U.db(r.folga)} / ${U.db(P.margem)}</td></tr></tbody></table></div>`;
    const pts = perfil(r), pal = ui.palette(), xmax = Math.max(P.km, 0.001);
    const lin = (y, cor, lab, dash) => ({ label: lab, data: [{ x: 0, y }, { x: xmax, y }], borderColor: cor, borderDash: dash, borderWidth: 1.5, pointRadius: 0, showLine: true, fill: false });
    const ds = [{ label: 'Potência (dBm)', data: pts, borderColor: pal.teal, backgroundColor: pal.teal + '22', borderWidth: 2.5, pointRadius: pts.map(p => p.ev ? 4 : 0), pointBackgroundColor: pal.orange, showLine: true, fill: false, stepped: false }, lin(P.sens, pal.bad, 'Sensibilidade', [6, 4]), lin(P.sens + P.margem, pal.warn, 'Sensibilidade + margem', [2, 4])];
    if (P.sat != null) ds.push(lin(P.sat, pal.mute, 'Saturação', [8, 3]));
    ui.chart(U.$('#pwC'), { type: 'scatter', data: { datasets: ds }, options: { parsing: false, animation: false, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${U.num(c.raw.y, 2)} dBm a ${U.num(c.raw.x, 2)} km${c.raw.ev ? ' (' + c.raw.ev + ')' : ''}` } } }, scales: { x: { type: 'linear', min: 0, max: xmax, title: { display: true, text: 'Distância (km)' } }, y: { title: { display: true, text: 'dBm' } } } } });
    P.ultimo = r;
  }

  function bind(el) {
    U.$$('[data-modo]', el).forEach(b => b.onclick = () => { if (P.modo === b.dataset.modo) return; P.modo = b.dataset.modo; P.spl = []; aplicarPreset(); FC.rerender(); });
    const f = U.$('#pwF', el);
    f.addEventListener('input', (e) => {
      const n = e.target.name || e.target.id; if (!n || ['preset', 'classe', 'lam'].includes(n)) return;
      const v = e.target.value === '' ? null : U.parseNum(e.target.value);
      if (n === 'pwKmR' || n === 'km') { P.km = v || 0; U.$('#km').value = P.km; U.$('#pwKmR').value = P.km; U.$('#pwKmL').textContent = U.num(P.km, 3) + ' km'; }
      else if (n === 'att') P.att = v; else if (n === 'sat') P.sat = v; else P[n] = v == null ? 0 : v;
      if (['tx', 'sens', 'sat'].includes(n) && P.modo === 'p2p') { P.preset = -1; const s = U.$('#preset'); if (s) s.value = -1; }
      atualizar();
    });
    f.addEventListener('change', (e) => {
      const n = e.target.name;
      if (n === 'preset') { P.preset = +e.target.value; aplicarPreset(); FC.rerender(); }
      if (n === 'classe') { P.classe = +e.target.value; aplicarPreset(); FC.rerender(); }
      if (n === 'lam') { P.lam = +e.target.value; P.att = null; FC.rerender(); }
    });
    U.$('#pwT', el).onchange = (e) => { if (e.target.value) carregarTrecho(e.target.value); else { P.trechoId = ''; P.origem = ''; P.medida = null; P.eventos = null; P.usarMedida = false; } FC.rerender(); };
    U.$('#pwSAdd', el).onclick = () => { P.spl.push({ tipo: 'PLC', razao: '1x8', saida: 'menor', km: +(P.km / 2).toFixed(2) }); FC.rerender(); };
    U.$$('[data-st]', el).forEach(s => s.onchange = () => { const x = P.spl[+s.dataset.st]; x.tipo = s.value; x.razao = s.value === 'PLC' ? '1x8' : '10/90'; FC.rerender(); });
    U.$$('[data-sr]', el).forEach(s => s.onchange = () => { P.spl[+s.dataset.sr].razao = s.value; FC.rerender(); });
    U.$$('[data-ss]', el).forEach(s => s.onchange = () => { P.spl[+s.dataset.ss].saida = s.value; FC.rerender(); });
    U.$$('[data-sk]', el).forEach(s => s.oninput = () => { P.spl[+s.dataset.sk].km = U.parseNum(s.value) || 0; atualizar(); });
    U.$$('[data-sdel]', el).forEach(b => b.onclick = () => { P.spl.splice(+b.dataset.sdel, 1); FC.rerender(); });
    const med = U.$('#pwMed', el); med && (med.onchange = () => { P.usarMedida = med.checked; atualizar(); });
    U.$('#pwX', el).onclick = () => { const r = P.ultimo; FC.reports.exportRows([...r.itens.map(i => ({ Item: i[0], Valor: +i[1].toFixed(3), Unidade: 'dB' })), { Item: 'Perda total', Valor: +r.total.toFixed(3), Unidade: 'dB' }, { Item: 'Potência Tx', Valor: P.tx, Unidade: 'dBm' }, { Item: 'Potência recebida', Valor: +r.rx.toFixed(2), Unidade: 'dBm' }, { Item: 'Sensibilidade', Valor: P.sens, Unidade: 'dBm' }, { Item: 'Folga', Valor: +r.folga.toFixed(2), Unidade: 'dB' }, { Item: 'Margem de projeto', Valor: P.margem, Unidade: 'dB' }, { Item: 'Resultado', Valor: { ok: 'APROVADO', atencao: 'ATENÇÃO', reprovado: 'REPROVADO' }[r.veredito], Unidade: '' }], 'calculo-de-potencia', 'xlsx', 'Cálculo de potência'); };
    U.$('#pwCp', el).onclick = () => { const r = P.ultimo, t = `Cálculo de potência${P.origem ? ' — ' + P.origem : ''}\nPerda total: ${U.num(r.total, 2)} dB | Tx ${U.num(P.tx, 1)} dBm | Rx ${U.num(r.rx, 2)} dBm | Sensibilidade ${U.num(P.sens, 1)} dBm | Folga ${U.num(r.folga, 2)} dB (margem ${U.num(P.margem, 1)} dB)\nResultado: ${{ ok: 'APROVADO', atencao: 'ATENÇÃO', reprovado: 'REPROVADO' }[r.veredito]}${r.alertas.length ? '\n' + r.alertas.map(a => '- ' + a[1]).join('\n') : ''}`; navigator.clipboard.writeText(t).then(() => ui.toast('Resumo copiado.', 'ok'), () => ui.modal({ title: 'Resumo', body: `<textarea readonly style="min-height:160px">${U.esc(t)}</textarea>` })); };
  }

  function aplicarPreset() {
    if (P.modo === 'p2p' && P.preset >= 0) { const s = SFP[P.preset]; Object.assign(P, { tx: s[1], sens: s[2], sat: s[3], lam: s[4], att: null }); }
    if (P.modo === 'pon') { const c = PON[P.classe]; Object.assign(P, { tx: c[1], sens: c[2], sat: -8, lam: c[5], att: null }); if (!P.spl.length) P.spl.push({ tipo: 'PLC', razao: '1x8', saida: 'menor', km: +(P.km * 0.6).toFixed(2) }, { tipo: 'PLC', razao: '1x8', saida: 'menor', km: +(P.km * 0.9).toFixed(2) }); }
  }

  function carregarTrecho(id, mid) {
    const t = store.get('trechos', id); if (!t) return;
    const l = store.get('links', t.linkId) || {}, m = mid ? store.get('measurements', mid) : C.latest(t.id);
    const L = m ? C.otdrNet(m) : null;
    P.trechoId = t.id; P.km = +(((L || t.ozmapM || 0) / 1000)).toFixed(3);
    P.fus = t.emendas != null ? +t.emendas : P.fus; P.con = t.conectores != null ? +t.conectores : P.con;
    if (m && m.wavelength && [1270, 1310, 1490, 1550, 1577, 1625].includes(Math.round(m.wavelength))) { P.lam = Math.round(m.wavelength); P.att = null; }
    P.medida = m && m.totalLoss != null ? +m.totalLoss : null; P.usarMedida = P.medida != null;
    P.eventos = m && m.events ? m.events.filter(e => !e.end && e.kind === 'nao-refletivo' && e.distM > 1).map(e => e.distM / 1000) : null;
    if (P.eventos && P.eventos.length) P.fus = P.eventos.length;
    P.origem = `${l.nome || ''} / ${t.nome}${m ? ' · teste de ' + U.date(m.data) : ' · distância OZmap'}`;
  }

  const st = document.createElement('style');
  st.textContent = `.pw-grid{grid-template-columns:minmax(0,1fr) minmax(0,1.15fr)}.pw-range{display:flex;gap:10px;align-items:center}.pw-range input[type=range]{flex:1;accent-color:var(--teal);min-height:auto;padding:0;border:0}
  .pw-spl{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--line)}.pw-spl select{width:auto}.pw-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .pw-bar{display:grid;gap:4px}.pw-track{position:relative;height:12px;background:var(--mute-bg);border-radius:6px}.pw-track i{position:absolute;top:0;bottom:0;background:var(--ok-bg);border:1px solid var(--ok);border-radius:6px}.pw-track b{position:absolute;top:-4px;width:4px;height:20px;background:var(--ink);border-radius:2px;transform:translateX(-2px)}
  @media (max-width:1100px){.pw-grid{grid-template-columns:minmax(0,1fr)}}`;
  document.head.appendChild(st);

  FC.potencia = { calcular, state: P, carregarTrecho };
  FC.registerModule({ id: 'potencia', order: 3.5, title: 'Cálculo de potência', icon: 'calc', group: 'main', field: true, render });
})(window.FC = window.FC || {});
