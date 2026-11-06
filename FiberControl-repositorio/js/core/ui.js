/* ClickIP FiberControl — componentes de interface: ícones, roteador, modal, toast, tabelas, gráficos */
(function (FC) {
  'use strict';
  const U = FC.util;
  const ui = FC.ui = {};

  /* ---------- Ícones (traço 1.75, 24px) ---------- */
  const P = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    link: '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.3 11 16.7 7M7.3 13l9.4 4"/>',
    otdr: '<path d="M3 5v14h18"/><path d="M5 8l3 1 2 4 1-2 3 1.5 2 0.5 3 6"/>',
    compare: '<path d="M8 3v18M16 3v18"/><path d="M3 8h5M16 8h5M3 16h5M16 16h5"/>',
    fiber: '<path d="M3 12c3-6 6-6 9 0s6 6 9 0"/><path d="M3 7c3-4 6-4 9 0M12 17c3 4 6 4 9 0"/>',
    junction: '<path d="M3 12h7l4-6h7M10 12l4 6h7"/><circle cx="10" cy="12" r="1.8"/>',
    cert: '<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    report: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
    drive: '<path d="M8 3h8l6 10-4 7H6l-4-7z"/><path d="M8 3l6 10h8M2 13h12l-4 7"/>',
    team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.5c2.5.2 4 1.8 4.5 4.5"/>',
    school: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.3-1.3a4 4 0 0 1-5-5L13 2z"/><path d="M3 21l6-6"/>',
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>',
    audit: '<path d="M4 4h12l4 4v12H4z"/><circle cx="11" cy="13" r="3"/><path d="M13.2 15.2 16 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    field: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    file: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h2M20 14v2"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
    sync: '<path d="M20 12a8 8 0 0 1-14 5.3L4 15M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M4 20v-5h5M20 4v5h-5"/>',
    wifi: '<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
    wifiOff: '<path d="M3 3l18 18M8.5 15.5a5 5 0 0 1 7 0M5 12a10 10 0 0 1 4.5-2.6M2 8.5A15 15 0 0 1 8 5M14.5 9.3A10 10 0 0 1 19 12M16 5.5a15 15 0 0 1 6 3"/><circle cx="12" cy="19" r="1"/>',
    logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
    sign: '<path d="M3 17c3-1 4-8 6-8s0 7 2 7 3-4 4-4 1 3 3 3h3"/><path d="M3 21h18"/>',
    play: '<path d="M7 4v16l13-8z"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11v6M8 15h2M12 15h2M8 18.5h2M12 18.5h2"/>',
    layers: '<path d="M12 3 2 8l10 5 10-5z"/><path d="M2 13l10 5 10-5"/>',
    star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.4 6.5 20.4l1-6.3L3 9.7l6.2-.9z"/>',
    folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
    camera: '<path d="M4 7h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>'
  };
  ui.icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.file}</svg>`;

  /* ---------- Toast ---------- */
  ui.toast = (msg, type = 'info', ms = 4200) => {
    let box = U.$('#toasts'); if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast ' + type; el.setAttribute('role', 'status');
    el.innerHTML = ui.icon(type === 'ok' ? 'check' : type === 'err' || type === 'warn' ? 'alert' : 'bell') + `<span>${U.esc(msg)}</span>`;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
  };

  /* ---------- Modal ---------- */
  ui.modal = ({ title, body, actions = [], wide = false, onOpen, onClose }) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${U.esc(title)}">
      <header><h3>${U.esc(title)}</h3><button class="icon-btn" data-close aria-label="Fechar">${ui.icon('x')}</button></header>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<footer>${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-act="${i}">${a.icon ? ui.icon(a.icon) : ''}${U.esc(a.label)}</button>`).join('')}</footer>` : ''}
    </div>`;
    const close = () => { wrap.remove(); onClose && onClose(); };
    wrap.addEventListener('click', async (e) => {
      if (e.target === wrap || e.target.closest('[data-close]')) return close();
      const b = e.target.closest('[data-act]');
      if (b) { const a = actions[+b.dataset.act]; const r = a.onClick ? await a.onClick(wrap.querySelector('.modal-body'), close) : null; if (r !== false && !a.keep) close(); }
    });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape' && document.body.contains(wrap)) { close(); document.removeEventListener('keydown', esc); } });
    U.$('#modals').appendChild(wrap);
    onOpen && onOpen(wrap.querySelector('.modal-body'), close);
    const f = wrap.querySelector('input,select,textarea'); f && setTimeout(() => f.focus(), 30);
    return { el: wrap, close };
  };
  /** Confirmação dentro da página (confirm() nativo não é confiável em todos os ambientes) */
  ui.confirm = (title, text, okLabel = 'Confirmar', danger = false) => new Promise(res => {
    let done = false;
    ui.modal({ title, body: `<p>${U.esc(text)}</p>`, actions: [{ label: 'Cancelar', cls: 'ghost', onClick: () => { done = true; res(false); } }, { label: okLabel, cls: danger ? 'danger' : 'primary', onClick: () => { done = true; res(true); } }], onClose: () => { if (!done) res(false); } });
  });

  /* ---------- Badges ---------- */
  const BADGE = {
    verde: ['ok', 'Dentro da tolerância'], amarelo: ['warn', 'Atenção'], vermelho: ['bad', 'Fora da tolerância'], 'sem-dados': ['mute', 'Sem dados'],
    pendente: ['mute', 'Pendente'], medido: ['info', 'Medido'], divergente: ['bad', 'Divergente'], certificado: ['ok', 'Certificado'],
    excelente: ['ok', 'Excelente'], ok: ['ok', 'Dentro dos parâmetros'], atencao: ['warn', 'Atenção'], reprovado: ['bad', 'Reprovado'], insuficiente: ['mute', 'Dados insuficientes'], acima: ['bad', 'Acima do orçamento']
  };
  ui.badge = (k, label) => { const b = BADGE[k] || ['mute', k]; return `<span class="badge ${b[0]}">${U.esc(label || b[1])}</span>`; };
  ui.capBadge = (k) => ({ verde: ui.badge('verde', 'Adequada'), amarelo: ui.badge('amarelo', 'Baixa'), vermelho: ui.badge('vermelho', 'Esgotada'), 'sem-dados': ui.badge('sem-dados') }[k]);
  ui.demo = (o) => o && o.demo ? '<span class="tag-demo" title="Registro de demonstração">DEMO</span>' : '';

  /* ---------- Tabela com ordenação e paginação ---------- */
  ui.table = (el, { columns, rows, empty = 'Nenhum registro.', pageSize = 25, rowClass, onRow, sortKey, sortDir = 'desc', id }) => {
    const st = { key: sortKey, dir: sortDir, page: 0 };
    const render = () => {
      let data = [...rows];
      const col = columns.find(c => c.key === st.key);
      if (col) { const v = col.sort || (r => r[col.key]); data.sort((a, b) => { const x = v(a), y = v(b); const r = (x == null) - (y == null) || (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })); return st.dir === 'asc' ? r : -r; }); }
      const pages = Math.max(1, Math.ceil(data.length / pageSize));
      st.page = Math.min(st.page, pages - 1);
      const slice = data.slice(st.page * pageSize, st.page * pageSize + pageSize);
      el.innerHTML = `<div class="table-scroll"><table class="tbl" ${id ? `id="${id}"` : ''}><thead><tr>${columns.map(c => `<th class="${c.num ? 'num' : ''} ${c.sortable === false ? '' : 'sortable'}" data-k="${c.key}" ${c.key === st.key ? `aria-sort="${st.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}>${U.esc(c.label)}${c.key === st.key ? (st.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
        <tbody>${slice.length ? slice.map((r, i) => `<tr data-i="${st.page * pageSize + i}" class="${rowClass ? rowClass(r) : ''} ${onRow ? 'clickable' : ''}">${columns.map(c => `<td class="${c.num ? 'num' : ''}" data-label="${U.esc(c.label)}">${c.render ? c.render(r) : U.esc(r[c.key])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}" class="empty">${U.esc(empty)}</td></tr>`}</tbody></table></div>
        ${pages > 1 ? `<div class="pager"><button class="btn sm ghost" data-pg="-1" ${st.page ? '' : 'disabled'}>Anterior</button><span>${st.page + 1} / ${pages} · ${data.length} registros</span><button class="btn sm ghost" data-pg="1" ${st.page < pages - 1 ? '' : 'disabled'}>Próxima</button></div>` : ''}`;
      el._data = data;
    };
    el.onclick = (e) => {
      const th = e.target.closest('th.sortable'); if (th) { st.dir = st.key === th.dataset.k && st.dir === 'desc' ? 'asc' : 'desc'; st.key = th.dataset.k; return render(); }
      const pg = e.target.closest('[data-pg]'); if (pg) { st.page += +pg.dataset.pg; return render(); }
      if (e.target.closest('button,a,input,select,label')) return;
      const tr = e.target.closest('tr[data-i]'); if (tr && onRow) onRow(el._data[+tr.dataset.i]);
    };
    render();
    return { render };
  };

  /* ---------- Gráficos (Chart.js) com cores dos tokens ---------- */
  const charts = new Map();
  ui.css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  ui.chart = (canvas, config) => {
    if (!window.Chart) { canvas.parentElement.innerHTML = '<p class="muted small">Gráfico indisponível: biblioteca Chart.js não carregou (verifique a internet).</p>'; return null; }
    if (charts.has(canvas)) charts.get(canvas).destroy();
    const fg = ui.css('--fg-2'), grid = ui.css('--line');
    Chart.defaults.font.family = ui.css('--font-body') || 'sans-serif';
    Chart.defaults.color = fg;
    const c = new Chart(canvas, U.clone ? deepMerge({
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
        plugins: { legend: { labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, color: fg } }, tooltip: { backgroundColor: ui.css('--ink'), titleColor: ui.css('--bg'), bodyColor: ui.css('--bg') } },
        scales: config.type === 'doughnut' || config.type === 'pie' ? {} : { x: { grid: { color: grid }, ticks: { color: fg } }, y: { grid: { color: grid }, ticks: { color: fg } } }
      }
    }, config) : config);
    charts.set(canvas, c);
    return c;
  };
  function deepMerge(a, b) { const o = Array.isArray(a) ? [...a] : Object.assign({}, a); Object.keys(b || {}).forEach(k => { o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !(b[k] instanceof HTMLElement) ? deepMerge(a[k], b[k]) : b[k]; }); return o; }
  ui.palette = () => ({ ok: ui.css('--ok'), warn: ui.css('--warn'), bad: ui.css('--bad'), teal: ui.css('--teal'), orange: ui.css('--orange'), navy: ui.css('--accent-ink'), mute: ui.css('--fg-3'), line: ui.css('--line') });

  /** Gráfico de traço OTDR: usa o traço real quando existe; senão, diagrama esquemático a partir dos eventos (identificado) */
  ui.traceChart = (canvas, { trace, events = [], lengthM, onPick }) => {
    const pal = ui.palette();
    let pts, schematic = false;
    if (trace && trace.length) pts = trace.map(p => ({ x: p[0], y: p[1] }));
    else if (events.length) {
      schematic = true; pts = []; let y = 0, prev = 0;
      events.forEach((e, i) => {
        const x = e.distM / 1000; const slope = e.slope || 0.21;
        if (i) { y -= slope * (x - prev); pts.push({ x, y }); }
        if (e.end) { pts.push({ x, y }); pts.push({ x: x + 0.0001, y: y - 6 }); }
        else { y -= Math.max(0, e.loss || 0); pts.push({ x: x + 0.0001, y }); }
        prev = x;
      });
    } else return null;
    // limita o eixo a ~20% além do fim de fibra (o ruído depois do fim não tem informação útil)
    if (!schematic && lengthM) { const lim = lengthM / 1000 * 1.2 + 0.05; pts = pts.filter(p => p.x <= lim); }
    const yAt = (km) => { let best = pts[0]; for (const p of pts) { if (Math.abs(p.x - km) < Math.abs(best.x - km)) best = p; } return best.y; };
    const evPts = events.map(e => ({ x: e.distM / 1000, y: yAt(e.distM / 1000), e }));
    const colorFor = (e) => e.level === 'reprovado' ? pal.bad : e.level === 'atencao' ? pal.warn : e.end ? pal.orange : pal.teal;
    return ui.chart(canvas, {
      type: 'scatter',
      data: { datasets: [
        { label: schematic ? 'Diagrama esquemático (eventos)' : 'Traço OTDR', data: pts, showLine: true, pointRadius: 0, borderWidth: 1.4, borderColor: pal.navy, fill: false, tension: 0, order: 2 },
        { label: 'Eventos', data: evPts, pointRadius: 6, pointHoverRadius: 9, pointBackgroundColor: evPts.map(p => colorFor(p.e)), pointBorderColor: ui.css('--surface'), pointBorderWidth: 2, showLine: false, order: 1 }
      ] },
      options: {
        parsing: false,
        plugins: { legend: { display: true }, tooltip: { callbacks: { label: (c) => c.datasetIndex === 1 ? `Evento ${c.raw.e.n}: ${U.num(c.raw.x, 3)} km · ${U.db(c.raw.e.loss, 3)}${c.raw.e.reflectance ? ' · ' + U.db(c.raw.e.reflectance, 1) : ''}` : `${U.num(c.raw.x, 3)} km · ${U.num(c.raw.y, 2)} dB` } } },
        scales: { x: { type: 'linear', title: { display: true, text: 'Distância (km)' }, min: 0 }, y: { title: { display: true, text: schematic ? 'Nível relativo (dB)' : 'dB' } } },
        onClick: (evt, els) => { const el = els.find(e => e.datasetIndex === 1); if (el && onPick) onPick(evPts[el.index].e); }
      }
    });
  };

  /* ---------- Formulários ---------- */
  ui.field = (label, input, hint = '', cls = '') => `<label class="field ${cls}"><span class="lbl">${U.esc(label)}</span>${input}${hint ? `<small class="hint">${hint}</small>` : ''}</label>`;
  ui.input = (id, val, attrs = '') => `<input id="${id}" name="${id}" value="${U.esc(val == null ? '' : val)}" ${attrs}>`;
  ui.select = (id, opts, val, attrs = '') => `<select id="${id}" name="${id}" ${attrs}>${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${U.esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${U.esc(l)}</option>`; }).join('')}</select>`;
  ui.formData = (root) => { const o = {}; U.$$('input,select,textarea', root).forEach(i => { if (!i.name) return; o[i.name] = i.type === 'checkbox' ? i.checked : i.value; }); return o; };

  /* ---------- Arquivo: seletor programático ---------- */
  ui.pickFiles = ({ accept = '', multiple = false, directory = false } = {}) => new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple;
    if (directory) { i.webkitdirectory = true; i.multiple = true; }
    i.onchange = () => res(Array.from(i.files || [])); i.click();
  });

  /** Zona de soltar arquivos */
  ui.dropzone = (el, onFiles) => {
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('drag'); onFiles(Array.from(e.dataTransfer.files)); });
  };

  /* ---------- Visualizador de anexos ---------- */
  ui.openAttachment = async (att, download = false) => {
    if (!FC.store.require('anexo.baixar')) return;
    const blob = await FC.store.getFile(att);
    if (!blob) return ui.toast('Arquivo não encontrado neste aparelho' + (FC.store.mode === 'local' ? ' (anexos ficam no navegador onde foram enviados).' : '.'), 'err');
    FC.store.audit(download ? 'baixou' : 'visualizou', 'attachments', att.id, att.nome);
    if (download) return U.download(blob, att.nome);
    const url = URL.createObjectURL(blob); const e = U.ext(att.nome);
    let body;
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(e)) body = `<img src="${url}" alt="${U.esc(att.nome)}" class="viewer-img">`;
    else if (e === 'pdf') body = `<div class="pdf-pages" id="pdfv"><p class="muted">Renderizando PDF…</p></div>`;
    else if (e === 'sor' || e === 'msor') body = `<div id="sorv"><p class="muted">Lendo arquivo SOR…</p></div>`;
    else if (e === 'kmz' || e === 'kml') body = `<div id="kmzv"><p class="muted">Lendo geometria…</p></div>`;
    else body = `<p>Pré-visualização não disponível para .${U.esc(e)}. Use “Baixar”.</p>`;
    ui.modal({
      title: att.nome, wide: true, body: `<div class="viewer">${body}</div><p class="muted small">${U.bytes(att.tamanho || blob.size)} · enviado por ${U.esc(att.createdBy || '—')} em ${U.dt(att.createdAt)} · SHA-256 ${U.esc((att.hash || '').slice(0, 16))}…</p>`,
      actions: [{ label: 'Baixar', icon: 'download', cls: 'primary', keep: true, onClick: () => U.download(blob, att.nome) }],
      onOpen: async (b) => {
        if (e === 'pdf') {
          try {
            await U.loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
            const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
            const box = b.querySelector('#pdfv'); box.innerHTML = '';
            for (let p = 1; p <= Math.min(doc.numPages, 10); p++) { const pg = await doc.getPage(p); const vp = pg.getViewport({ scale: 1.4 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; box.appendChild(c); await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; }
          } catch (err) { b.querySelector('#pdfv').innerHTML = `<p class="muted">Não foi possível renderizar o PDF aqui (${U.esc(err.message)}). Use “Baixar”.</p>`; }
        }
        if (e === 'sor' || e === 'msor') {
          try {
            const r = (await FC.importers.readSOR(null, await blob.arrayBuffer()))[0];
            b.querySelector('#sorv').innerHTML = `<div class="chart-box tall"><canvas></canvas></div><p class="small">${U.esc(r.draft.equipamento || '')} · λ ${U.esc(r.draft.wavelength || '—')} nm · ${U.km(r.draft.lengthM)} · ${U.db(r.draft.totalLoss)}</p>`;
            ui.traceChart(b.querySelector('canvas'), { trace: r.trace, events: r.draft.events, lengthM: r.draft.lengthM });
          } catch (err) { b.querySelector('#sorv').innerHTML = `<p class="bad-text">Arquivo SOR inválido: ${U.esc(err.message)}</p>`; }
        }
        if (e === 'kmz' || e === 'kml') {
          try { const lines = await FC.geoio.readKMZ(blob, att.nome); b.querySelector('#kmzv').innerHTML = `<p>${lines.length} geometria(s): ${lines.map(l => U.esc(l.name) + ' (' + U.m(FC.geo.pathLen(l.coords), 0) + ')').join(', ')}</p><p class="muted small">Abra o módulo Mapa para visualizar sobre o traçado.</p>`; }
          catch (err) { b.querySelector('#kmzv').innerHTML = `<p class="bad-text">${U.esc(err.message)}</p>`; }
        }
      },
      onClose: () => URL.revokeObjectURL(url)
    });
  };

  /* ---------- KMZ/KML ---------- */
  FC.geoio = {
    async readKMZ(blob, name) {
      let xml;
      if (U.ext(name) === 'kmz') {
        if (!window.JSZip) throw new Error('Biblioteca JSZip não carregada.');
        const zip = await JSZip.loadAsync(blob); const f = Object.values(zip.files).find(f => /\.kml$/i.test(f.name));
        if (!f) throw new Error('KMZ sem arquivo KML interno.'); xml = await f.async('text');
      } else xml = await blob.text();
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const out = [];
      doc.querySelectorAll('Placemark').forEach(pm => {
        const nm = (pm.querySelector(':scope > name') || pm.querySelector('name') || {}).textContent || 'Sem nome';
        const desc = ((pm.querySelector('description') || {}).textContent || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const props = {}; pm.querySelectorAll('ExtendedData Data').forEach(d => { props[d.getAttribute('name')] = ((d.querySelector('value') || {}).textContent || '').trim(); });
        pm.querySelectorAll('ExtendedData SimpleData').forEach(d => { props[d.getAttribute('name')] = d.textContent.trim(); });
        const folder = pm.parentElement && pm.parentElement.tagName === 'Folder' ? ((pm.parentElement.querySelector(':scope > name') || {}).textContent || '').trim() : '';
        pm.querySelectorAll('LineString coordinates, Point coordinates').forEach(c => {
          const coords = c.textContent.trim().split(/\s+/).map(s => s.split(',').map(Number)).filter(a => a.length >= 2 && !isNaN(a[0])).map(a => [a[1], a[0]]);
          if (coords.length) out.push({ name: nm.trim(), coords, point: c.parentElement.tagName === 'Point', desc, props, folder });
        });
      });
      return out;
    }
  };
})(window.FC = window.FC || {});
