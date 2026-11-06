/* Módulos 5 e 6 — Fibras e capacidade (coluna 48FO RESTANTE) e Detector de entronques */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, C = FC.calc, store = FC.store, I = FC.importers;

  /* ---------- Importação da planilha OZmap ---------- */
  async function importOZmap() {
    if (!store.require('enlace.editar')) return;
    const [f] = await ui.pickFiles({ accept: '.xlsx,.xls,.csv' }); if (!f) return;
    let sheets;
    try { sheets = await I.readSheet(f); } catch (e) { return ui.toast('Não foi possível ler a planilha: ' + e.message, 'err'); }
    if (!sheets.length) return ui.toast('Planilha vazia.', 'err');
    const col = store.state.settings.fibers.column;
    let si = 0;
    const fields = [['enlace', 'Enlace'], ['trecho', 'Trecho'], ['cabo', 'Identificação do cabo'], ['ozmap', 'Distância OZmap'], ['restante', col], ['capacidade', 'Capacidade do cabo (FO)'], ['conectado', 'Cabo conectado (FO)'], ['caixa', 'Caixa / local'], ['tipo', 'Tipo de trecho']];
    const body = () => { const sh = sheets[si]; const g = I.guessColumns(sh.headers, Object.assign({}, I.specOZmap, { restante: [new RegExp(U.norm(col).replace(/[()]/g, '.'))].concat(I.specOZmap.restante) })); return `
      ${sheets.length > 1 ? ui.field('Aba', ui.select('sheet', sheets.map((s, i) => [i, s.name + ' (' + s.rows.length + ' linhas)']), si)) : ''}
      <p class="small muted">${sh.rows.length} linhas · confira o mapeamento de colunas (sugerido automaticamente).</p>
      <div class="form-grid" id="mapf">${fields.map(([k, l]) => ui.field(l, ui.select('map_' + k, [['', '— ignorar —'], ...sh.headers], g[k] || ''))).join('')}</div>
      <label class="check"><input type="checkbox" name="criar" checked> Criar enlaces/trechos que não existirem</label>
      <div class="table-scroll"><table class="tbl"><thead><tr>${sh.headers.slice(0, 8).map(h => `<th>${U.esc(h)}</th>`).join('')}</tr></thead><tbody>${sh.rows.slice(0, 5).map(r => `<tr>${sh.headers.slice(0, 8).map(h => `<td class="small">${U.esc(r[h])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; };
    const md = ui.modal({ title: 'Importar planilha OZmap — ' + f.name, wide: true, body: body(),
      onOpen: (b) => { const s = U.$('#sheet', b); s && (s.onchange = () => { si = +s.value; b.innerHTML = body(); }); },
      actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Importar', cls: 'primary', icon: 'upload', onClick: (b) => {
        const fm = ui.formData(b); const sh = sheets[si]; const mp = {}; fields.forEach(([k]) => mp[k] = fm['map_' + k]);
        if (!mp.trecho && !mp.enlace) { ui.toast('Mapeie ao menos a coluna Enlace ou Trecho.', 'err'); return false; }
        let upd = 0, novo = 0, skip = 0; const u = store.user();
        sh.rows.forEach(r => {
          const en = mp.enlace ? String(r[mp.enlace]).trim() : '', tn = mp.trecho ? String(r[mp.trecho]).trim() : '', cb = mp.cabo ? String(r[mp.cabo]).trim() : '';
          if (!en && !tn) return skip++;
          let link = store.state.links.find(l => en && U.norm(l.nome) === U.norm(en)) || (cb ? store.state.links.find(l => l.caboId && U.norm(l.caboId) === U.norm(cb)) : null);
          if (!link) {
            if (!fm.criar || !en) return skip++;
            const pp = en.split(/\s+x\s+/i);
            link = { id: U.uid('lnk_'), nome: en, popA: pp[0] || '', popB: pp[1] || '', caboId: cb, tipoCabo: '', fibras: mp.capacidade ? U.parseNum(r[mp.capacidade]) : null, regiao: '', projeto: store.state.settings.defaultProject, responsavel: u.nome, criadoEm: U.now(), obs: 'Criado pela importação OZmap ' + f.name };
            const d = I.derive({ gen: { locationA: link.popA, locationB: link.popB, cableId: cb }, fileName: '' }); link.regiao = d.regiao; store.upsert('links', link, 'Enlace criado pela planilha OZmap'); novo++;
          }
          const ts = store.state.trechos.filter(t => t.linkId === link.id);
          let t = tn ? ts.find(x => U.norm(x.nome) === U.norm(tn)) : (ts.length === 1 ? ts[0] : null);
          if (!t) { if (!fm.criar) return skip++; t = { id: U.uid('tr_'), linkId: link.id, ordem: ts.length + 1, nome: tn || 'T' + String(ts.length + 1).padStart(2, '0'), tipo: 'Aéreo', conectores: 2, emendas: 0, wavelength: 1550, componentes: [] }; novo++; }
          const old = t.ozmapM;
          if (mp.ozmap && r[mp.ozmap] !== '') t.ozmapM = I.toMeters(r[mp.ozmap], mp.ozmap);
          if (mp.restante && r[mp.restante] !== '') t.fibrasRestantes = U.parseNum(r[mp.restante]);
          if (mp.capacidade && r[mp.capacidade] !== '') t.caboFO = U.parseNum(String(r[mp.capacidade]).replace(/fo/i, ''));
          if (mp.conectado && r[mp.conectado] !== '') t.caboConectadoFO = U.parseNum(String(r[mp.conectado]).replace(/fo/i, ''));
          if (mp.caixa && r[mp.caixa] !== '') t.caixa = String(r[mp.caixa]);
          if (mp.tipo && r[mp.tipo]) { const tp = store.state.settings.trechoTypes.find(x => U.norm(x) === U.norm(r[mp.tipo])); if (tp) t.tipo = tp; }
          if (old != null && old !== t.ozmapM) FC.snapshotLink(link, `Planilha OZmap ${f.name}: ${t.nome} ${old} → ${t.ozmapM} m`);
          store.upsert('trechos', t); upd++;
        });
        store.audit('importou', 'trechos', null, `Planilha OZmap ${f.name}: ${upd} trechos atualizados, ${novo} criados, ${skip} ignorados`);
        ui.toast(`Planilha importada: ${upd} trechos atualizados, ${novo} registros criados, ${skip} linhas ignoradas.`, 'ok', 7000);
        FC.rerender();
      } }] });
    void md;
  }
  FC.importOZmap = importOZmap;

  function renderFibras(el, params) {
    const S = store.state.settings.fibers;
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Capacidade</span><h1>Fibras e capacidade</h1><p class="muted small">Controle da coluna <b>${U.esc(S.column)}</b> importada do OZmap ou editada no trecho.</p></div>
      <div class="acts"><button class="btn primary" id="imp">${ui.icon('upload')}Importar planilha OZmap</button><button class="btn" id="xf">${ui.icon('download')}Exportar</button></div></div>
      <section class="panel"><div class="filters">${FC.filt.html('fb').replace('<div class="filters" id="fbFilters">', '<div class="filters" id="fbFilters" style="flex:1">')}
      ${ui.field('Mínimo de fibras livres', ui.input('fmin', S.min, `type="number" min="0" ${store.can('config.tecnica') ? '' : 'disabled'}`), 'Amarelo quando ≤ este valor')}</div></section>
      <section class="kpis" id="fk"></section>
      <section class="grid g2"><div class="panel span2" id="ft"></div></section>
      <section class="grid g2"><div class="panel"><header><h3>Uso por capacidade de cabo</h3></header><div class="chart-box"><canvas id="fc"></canvas></div></div>
      <div class="panel"><header><h3>Trechos sem cabo de ${S.reference}FO</h3><span class="sub">Cabo principal diferente da referência</span></header><div id="f48"></div></div></section>`;
    U.$('#imp').onclick = importOZmap;
    if (params.importar) setTimeout(importOZmap, 50);
    U.$('#fmin').onchange = (e) => { store.setSettings('fibers.min', +e.target.value, 'Mínimo de fibras livres'); draw(); };
    FC.filt.bind(el, 'fb', (r) => r ? FC.rerender() : draw());
    const draw = () => {
      const ts = FC.filt.trechos().map(t => ({ t, l: store.get('links', t.linkId), c: C.capacity(t) }));
      const n = (s) => ts.filter(x => x.c.status === s).length;
      U.$('#fk').innerHTML = `<div class="kpi ok"><span class="l">Capacidade adequada</span><span class="v">${n('verde')}</span></div><div class="kpi warn"><span class="l">Capacidade baixa</span><span class="v">${n('amarelo')}</span><span class="s">≤ ${S.min} fibras livres</span></div><div class="kpi bad"><span class="l">Capacidade esgotada</span><span class="v">${n('vermelho')}</span></div><div class="kpi"><span class="l">Sem informação</span><span class="v">${n('sem-dados')}</span></div><div class="kpi accent"><span class="l">Sem cabo ${S.reference}FO</span><span class="v">${ts.filter(x => x.c.semRef).length}</span></div><div class="kpi"><span class="l">Fibras livres (total)</span><span class="v">${U.sum(ts, x => x.c.rest || 0)}</span></div>`;
      ui.table(U.$('#ft'), {
        rows: ts, sortKey: 'rest', sortDir: 'asc', rowClass: x => x.c.status === 'vermelho' ? 'row-bad' : x.c.status === 'amarelo' ? 'row-warn' : '',
        columns: [
          { key: 'l', label: 'Enlace', sort: x => x.l.nome, render: x => U.esc(x.l.nome) + ui.demo(x.t) }, { key: 't', label: 'Trecho', sort: x => x.t.nome, render: x => `<b>${U.esc(x.t.nome)}</b>` },
          { key: 'cabo', label: 'Cabo', num: true, sort: x => x.t.caboFO, render: x => x.t.caboFO ? x.t.caboFO + 'FO' : '—' },
          { key: 'rest', label: S.column, num: true, sort: x => x.c.rest, render: x => `<input type="number" min="0" data-rest="${x.t.id}" value="${x.c.rest == null ? '' : x.c.rest}" style="width:84px;text-align:right" aria-label="Fibras restantes" ${store.can('enlace.editar') ? '' : 'disabled'}>` },
          { key: 'uso', label: 'Uso', sort: x => x.c.usoPct, render: x => x.c.usoPct == null ? '—' : `<div style="min-width:100px"><span class="small">${U.num(x.c.usoPct, 0)}%</span><div class="meter"><i style="width:${x.c.usoPct}%;background:${x.c.status === 'vermelho' ? 'var(--bad)' : x.c.status === 'amarelo' ? 'var(--warn)' : 'var(--ok)'}"></i></div></div>` },
          { key: 'st', label: 'Situação', sort: x => ['vermelho', 'amarelo', 'verde', 'sem-dados'].indexOf(x.c.status), render: x => ui.capBadge(x.c.status) + (x.c.status === 'vermelho' ? '<br><span class="tiny bad-text">Sem fibras disponíveis</span>' : x.c.status === 'amarelo' ? '<br><span class="tiny warn-text">Poucas fibras</span>' : '') }
        ]
      });
      U.$$('[data-rest]', el).forEach(i => { i.onclick = e => e.stopPropagation(); i.onchange = () => { const t = store.get('trechos', i.dataset.rest); const old = t.fibrasRestantes; t.fibrasRestantes = i.value === '' ? null : +i.value; store.upsert('trechos', t, `${S.column} de ${t.nome}: ${old} → ${t.fibrasRestantes}`); draw(); }; });
      const sem = ts.filter(x => x.c.semRef);
      U.$('#f48').innerHTML = sem.length ? `<ul class="list-plain">${sem.map(x => `<li>${U.esc(x.l.nome)} / <b>${U.esc(x.t.nome)}</b> — cabo ${x.t.caboFO}FO</li>`).join('')}</ul>` : `<div class="note ok">${ui.icon('check')}<div>Todos os trechos usam cabo de ${S.reference}FO.</div></div>`;
      const caps = U.uniq(ts.map(x => x.t.caboFO)).sort((a, b) => a - b), p = ui.palette();
      ui.chart(U.$('#fc'), { type: 'bar', data: { labels: caps.map(c => c + 'FO'), datasets: [{ label: 'Ocupadas', data: caps.map(c => U.sum(ts.filter(x => x.t.caboFO === c && x.c.rest != null), x => x.t.caboFO - x.c.rest)), backgroundColor: p.navy }, { label: 'Livres', data: caps.map(c => U.sum(ts.filter(x => x.t.caboFO === c), x => x.c.rest || 0)), backgroundColor: p.teal }] }, options: { scales: { x: { stacked: true }, y: { stacked: true } } } });
    };
    draw();
    U.$('#xf').onclick = () => FC.reports.capacityReport('xlsx');
  }

  function renderEntronques(el) {
    const S = store.state.settings.fibers;
    const list = C.entronques();
    const crit = list.filter(e => e.critico || e.conectado <= 12);
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Detector</span><h1>Entronques</h1><p class="muted small">Trechos que se conectam a cabos de menor capacidade — informados no cadastro ou detectados pela sequência dos trechos.</p></div></div>
      <section class="kpis">${S.capacities.map(c => `<div class="kpi"><span class="l">Conexões para ${c}FO</span><span class="v">${list.filter(e => e.conectado === c).length}</span></div>`).filter((x, i) => [12, 24, 36, 48].includes(S.capacities[i]) || list.some(e => e.conectado === S.capacities[i])).join('')}<div class="kpi warn"><span class="l">Pontos de atenção</span><span class="v">${crit.length}</span></div></section>
      <section class="panel"><header><h3>Painel de atenção</h3><span class="sub">Gargalos de capacidade nos entronques</span></header>
        ${crit.length ? `<div class="grid g-auto">${crit.map(e => `<div class="panel" style="gap:6px;border-color:${e.level === 'vermelho' ? 'var(--bad)' : 'var(--warn)'}"><span class="eyebrow">${U.esc(e.link.nome)}</span><b>${U.esc(e.t.nome)} · ${U.esc(e.local || 'local não informado')}</b><span>${e.principal}FO → <b>${e.conectado}FO</b> ${ui.capBadge(e.level)}</span><ul class="list-plain small">${e.gargalos.map(g => `<li>${U.esc(g)}</li>`).join('')}</ul><button class="btn sm" data-go="${e.t.id}">Abrir trecho</button></div>`).join('')}</div>` : `<div class="note ok">${ui.icon('check')}<div>Nenhum entronque crítico.</div></div>`}</section>
      <section class="panel" id="et"></section>`;
    ui.table(U.$('#et'), {
      rows: list, sortKey: 'rest', sortDir: 'asc', onRow: e => FC.go('enlaces', { trechoId: e.t.id }), empty: 'Nenhum entronque. Informe “Cabo conectado (FO)” no trecho ou importe da planilha OZmap.',
      rowClass: e => e.level === 'vermelho' ? 'row-bad' : e.level === 'amarelo' ? 'row-warn' : '',
      columns: [
        { key: 'id', label: 'Trecho', sort: e => e.link.nome + e.t.nome, render: e => `${U.esc(e.link.nome)} / <b>${U.esc(e.t.nome)}</b>${ui.demo(e.t)}` },
        { key: 'principal', label: 'Cabo principal', num: true, render: e => e.principal + 'FO' }, { key: 'conectado', label: 'Cabo conectado', num: true, render: e => `<b>${e.conectado}FO</b>` },
        { key: 'rest', label: 'Fibras restantes', num: true, render: e => e.rest == null ? '—' : e.rest },
        { key: 'local', label: 'Localização', render: e => U.esc(e.local || '—') }, { key: 'origem', label: 'Identificação', render: e => `<span class="tag">${U.esc(e.origem)}</span>` },
        { key: 'g', label: 'Possíveis gargalos', sortable: false, render: e => `<span class="small">${e.gargalos.map(U.esc).join('<br>')}</span>` }, { key: 'level', label: 'Situação', render: e => ui.capBadge(e.level) }
      ]
    });
    U.$$('[data-go]', el).forEach(b => b.onclick = () => FC.go('enlaces', { trechoId: b.dataset.go }));
  }

  FC.registerModule({ id: 'fibras', order: 5, title: 'Fibras e Capacidade', icon: 'fiber', group: 'main', field: true, render: renderFibras });
  FC.registerModule({ id: 'entronques', order: 6, title: 'Entronques', icon: 'junction', group: 'main', field: false, render: renderEntronques });
})(window.FC = window.FC || {});
