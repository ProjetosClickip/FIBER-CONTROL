/* Módulo 1 — Dashboard */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, C = FC.calc;

  /** Filtros globais reutilizáveis (POP, região, projeto, responsável, período) */
  FC.filt = {
    state: { pop: '', regiao: '', projeto: '', resp: '', de: '', ate: '' },
    html(prefix = 'f') {
      const st = FC.store.state, s = this.state;
      const pops = U.uniq(st.links.flatMap(l => [l.popA, l.popB]));
      const resp = U.uniq([...st.links.map(l => l.responsavel), ...st.measurements.map(m => m.responsavel)]);
      return `<div class="filters" id="${prefix}Filters">
        ${ui.field('POP', ui.select(prefix + 'pop', [['', 'Todos'], ...pops], s.pop))}
        ${ui.field('Região', ui.select(prefix + 'regiao', [['', 'Todas'], ...U.uniq(st.links.map(l => l.regiao))], s.regiao))}
        ${ui.field('Projeto', ui.select(prefix + 'projeto', [['', 'Todos'], ...U.uniq(st.links.map(l => l.projeto))], s.projeto), '', 'wide')}
        ${ui.field('Responsável', ui.select(prefix + 'resp', [['', 'Todos'], ...resp], s.resp))}
        ${ui.field('De', ui.input(prefix + 'de', s.de, 'type="date"'))}
        ${ui.field('Até', ui.input(prefix + 'ate', s.ate, 'type="date"'))}
        <button class="btn ghost sm" data-clear>Limpar</button></div>`;
    },
    bind(root, prefix, onChange) {
      const box = U.$('#' + prefix + 'Filters', root);
      box.addEventListener('change', (e) => { const k = e.target.id.slice(prefix.length); if (k in this.state) { this.state[k] = e.target.value; onChange(); } });
      box.querySelector('[data-clear]').onclick = () => { Object.keys(this.state).forEach(k => this.state[k] = ''); onChange(true); };
    },
    links() { const s = this.state; return FC.store.state.links.filter(l => (!s.pop || l.popA === s.pop || l.popB === s.pop) && (!s.regiao || l.regiao === s.regiao) && (!s.projeto || l.projeto === s.projeto) && (!s.resp || l.responsavel === s.resp || FC.store.state.measurements.some(m => m.linkId === l.id && m.responsavel === s.resp))); },
    inPeriod(iso) { const s = this.state; if (!iso) return !s.de && !s.ate; const d = iso.slice(0, 10); return (!s.de || d >= s.de) && (!s.ate || d <= s.ate); },
    trechos() { const ids = new Set(this.links().map(l => l.id)); return FC.store.state.trechos.filter(t => ids.has(t.linkId)); },
    measurements() { const ids = new Set(this.links().map(l => l.id)); const s = this.state; return FC.store.state.measurements.filter(m => ids.has(m.linkId) && this.inPeriod(m.data) && (!s.resp || m.responsavel === s.resp)); }
  };

  function render(el, params) {
    if (params.projeto) FC.filt.state.projeto = params.projeto;
    const st = FC.store.state;
    el.innerHTML = `
      <div class="page-head"><div class="t"><span class="eyebrow">Visão geral</span><h1>Painel de enlaces</h1><p class="muted small">Indicadores recalculados a partir das medições e dos parâmetros configurados.</p></div>
      <div class="acts"><button class="btn primary" data-go="otdr">${ui.icon('upload')}Importar teste OTDR</button><button class="btn" data-go="enlaces">${ui.icon('plus')}Novo enlace</button></div></div>
      ${st.meta.demo ? `<div class="note warn">${ui.icon('alert')}<div>Você está vendo <b>dados de demonstração</b> (selo DEMO). Remova-os em Configurações › Dados quando começar a usar com seus testes.</div></div>` : ''}
      <section class="panel">${FC.filt.html('d')}</section>
      <section class="kpis" id="kpis"></section>
      <section class="grid g2">
        <div class="panel"><header><h3>Certificação dos trechos</h3><span class="sub">Certificados × pendentes</span></header><div class="chart-box"><canvas id="cCert"></canvas></div></div>
        <div class="panel"><header><h3>Divergência OTDR × OZmap por projeto</h3><span class="sub">Classificação pela tolerância</span></header><div class="chart-box"><canvas id="cDiv"></canvas></div></div>
        <div class="panel"><header><h3>Distribuição de perdas ópticas</h3><span class="sub">Perda total medida (última medição)</span></header><div class="chart-box"><canvas id="cLoss"></canvas></div></div>
        <div class="panel"><header><h3>Evolução das medições</h3><span class="sub">Medições registradas por mês</span></header><div class="chart-box"><canvas id="cMes"></canvas></div></div>
      </section>
      <section class="grid g2">
        <div class="panel"><header><h3>Pontos de atenção</h3><button class="btn sm ghost" data-go="comparativo">Ver ranking</button></header><div id="attn"></div></div>
        <div class="panel"><header><h3>Últimas atividades</h3><button class="btn sm ghost" data-go="auditoria">Auditoria completa</button></header><ul class="activity" id="acts"></ul></div>
      </section>`;
    U.$$('[data-go]', el).forEach(b => b.onclick = () => FC.go(b.dataset.go));
    FC.filt.bind(el, 'd', (reset) => reset ? FC.rerender() : fill());
    fill();

    function fill() {
      const links = FC.filt.links(), trechos = FC.filt.trechos(), meas = FC.filt.measurements();
      const statuses = trechos.map(t => C.trechoStatus(t));
      const count = (s) => statuses.filter(x => x === s).length;
      const analyzed = trechos.filter(t => C.latest(t.id)).length;
      const cert = count('certificado');
      const cmp = trechos.map(t => ({ t, c: C.compare(t) }));
      const div = cmp.filter(x => x.c.status === 'vermelho').length;
      const bud = trechos.filter(t => C.budget(t).status === 'acima').length;
      const cap = trechos.filter(t => ['amarelo', 'vermelho'].includes(C.capacity(t).status)).length;
      const entr = C.entronques().filter(e => links.includes(e.link)).length;
      const mk = new Date().toISOString().slice(0, 7);
      const mes = meas.filter(m => (m.data || '').startsWith(mk)).length;
      const pct = trechos.length ? cert / trechos.length * 100 : 0;
      const K = (v, l, s, cls, go) => `<div class="kpi ${cls}" ${go ? `data-go="${go}" role="button" tabindex="0"` : ''}><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
      U.$('#kpis').innerHTML = [
        K(links.length, 'Enlaces cadastrados', `${trechos.length} trechos`, 'accent', 'enlaces'),
        K(analyzed, 'Trechos analisados', `${trechos.length - analyzed} sem medição`, '', 'otdr'),
        K(cert, 'Trechos certificados', `${count('medido')} aguardando aprovação`, 'ok', 'certificacoes'),
        K(U.num(pct, 1) + '%', 'Certificação', `<span class="meter"><i style="width:${pct}%"></i></span>`, 'ok', 'certificacoes'),
        K(div, 'Com divergência', 'Fora da tolerância OZmap', div ? 'bad' : '', 'comparativo'),
        K(bud, 'Perda acima do orçamento', 'Medido > previsto + tolerância', bud ? 'bad' : '', 'otdr'),
        K(cap, 'Poucas fibras livres', `Mínimo configurado: ${FC.store.state.settings.fibers.min}`, cap ? 'warn' : '', 'fibras'),
        K(entr, 'Entronques', 'Conexões com cabos menores', entr ? 'warn' : '', 'entronques'),
        K(mes, 'Medições no mês', new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), '', 'historico')
      ].join('');
      U.$$('#kpis [data-go]').forEach(k => { k.onclick = () => FC.go(k.dataset.go); k.onkeydown = (e) => e.key === 'Enter' && FC.go(k.dataset.go); });

      const p = ui.palette();
      ui.chart(U.$('#cCert'), { type: 'doughnut', data: { labels: ['Certificado', 'Medido', 'Divergente', 'Pendente'], datasets: [{ data: [cert, count('medido'), count('divergente'), count('pendente')], backgroundColor: [p.ok, p.teal, p.bad, p.mute], borderColor: ui.css('--surface'), borderWidth: 2 }] }, options: { cutout: '64%', plugins: { legend: { position: 'right' } } } });
      const projs = U.uniq(links.map(l => l.projeto));
      const by = (s) => projs.map(pj => cmp.filter(x => x.c.status === s && (FC.store.get('links', x.t.linkId) || {}).projeto === pj).length);
      ui.chart(U.$('#cDiv'), { type: 'bar', data: { labels: projs, datasets: [{ label: 'Verde', data: by('verde'), backgroundColor: p.ok }, { label: 'Amarelo', data: by('amarelo'), backgroundColor: p.warn }, { label: 'Vermelho', data: by('vermelho'), backgroundColor: p.bad }, { label: 'Sem medição', data: by('sem-dados'), backgroundColor: p.line }] }, options: { indexAxis: 'y', scales: { x: { stacked: true, ticks: { precision: 0 } }, y: { stacked: true } } } });
      const buckets = [[0, 1], [1, 2], [2, 3], [3, 5], [5, 10], [10, Infinity]];
      const losses = trechos.map(t => C.latest(t.id)).filter(m => m && m.totalLoss != null).map(m => m.totalLoss);
      ui.chart(U.$('#cLoss'), { type: 'bar', data: { labels: buckets.map(([a, b]) => b === Infinity ? `> ${a} dB` : `${a}–${b} dB`), datasets: [{ label: 'Trechos', data: buckets.map(([a, b]) => losses.filter(x => x >= a && x < b).length), backgroundColor: p.teal, borderRadius: 4 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { ticks: { precision: 0 } } } } });
      const months = []; const d = new Date(); d.setDate(1);
      for (let i = 11; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); months.push(x.toISOString().slice(0, 7)); }
      ui.chart(U.$('#cMes'), { type: 'line', data: { labels: months.map(U.monthLabel), datasets: [{ label: 'Medições', data: months.map(k => meas.filter(m => (m.data || '').startsWith(k)).length), borderColor: p.orange, backgroundColor: p.orange + '22', fill: true, tension: .3, pointRadius: 3 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });

      const attn = [];
      cmp.filter(x => x.c.status === 'vermelho').sort((a, b) => Math.abs(b.c.diffPct) - Math.abs(a.c.diffPct)).slice(0, 4).forEach(x => attn.push(['bad', `${FC.store.get('links', x.t.linkId).nome} / ${x.t.nome}`, `Diferença ${U.pct(x.c.diffPct)} (${U.m(x.c.diffM, 0)})`, () => FC.go('comparativo', { trechoId: x.t.id })]));
      trechos.filter(t => C.capacity(t).status === 'vermelho').slice(0, 3).forEach(t => attn.push(['bad', `${FC.store.get('links', t.linkId).nome} / ${t.nome}`, 'Capacidade esgotada', () => FC.go('fibras')]));
      trechos.filter(t => C.budget(t).status === 'acima').slice(0, 3).forEach(t => attn.push(['warn', `${FC.store.get('links', t.linkId).nome} / ${t.nome}`, 'Perda acima do orçamento', () => FC.go('otdr', { trechoId: t.id })]));
      U.$('#attn').innerHTML = attn.length ? `<div class="table-scroll"><table class="tbl"><tbody>${attn.map((a, i) => `<tr class="clickable row-${a[0]}" data-a="${i}"><td>${U.esc(a[1])}</td><td>${ui.badge(a[0] === 'bad' ? 'vermelho' : 'amarelo', a[2])}</td></tr>`).join('')}</tbody></table></div>` : `<div class="note ok">${ui.icon('check')}<div>Nenhum ponto crítico com os filtros atuais.</div></div>`;
      U.$$('#attn [data-a]').forEach(r => r.onclick = () => attn[+r.dataset.a][3]());

      const acts = FC.store.state.audit.slice(0, 8);
      U.$('#acts').innerHTML = acts.length ? acts.map(a => `<li>${FC.avatar({ nome: a.user })}<div><b>${U.esc(a.user)}</b> ${U.esc(a.acao)} <span class="muted">${U.esc(entityLabel(a.entidade))}</span>${ui.demo(a)}<br><span class="small">${U.esc(a.detalhe || '')}</span><br><span class="tiny muted">${U.dt(a.at)}</span></div></li>`).join('') : '<li class="muted">Sem atividades.</li>';
    }
  }
  const entityLabel = (e) => ({ links: 'enlace', trechos: 'trecho', measurements: 'medição', attachments: 'anexo', settings: 'configuração', users: 'usuário', session: 'sessão', maintenance: 'manutenção', demo: 'dados demo', versions: 'versão de traçado' }[e] || e);
  FC.entityLabel = entityLabel;

  FC.registerModule({ id: 'dashboard', order: 1, title: 'Dashboard', icon: 'dashboard', group: 'main', field: true, render });
})(window.FC = window.FC || {});
