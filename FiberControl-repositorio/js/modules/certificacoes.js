/* Módulo 7 — Certificações (requisitos técnicos + aprovação com assinatura eletrônica) */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, C = FC.calc, store = FC.store;
  let groupBy = 'projeto';

  function render(el, params) {
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Qualidade</span><h1>Certificações</h1><p class="muted small">Um trecho só pode ser certificado quando os requisitos técnicos configurados forem atendidos e a aprovação for registrada.</p></div>
      <div class="acts"><button class="btn" id="req">${ui.icon('gear')}Requisitos</button><button class="btn" id="rc">${ui.icon('report')}Relatório de certificação</button></div></div>
      <section class="panel"><header><h3>Percentual de certificação</h3><div class="seg">${[['projeto', 'Por projeto'], ['enlace', 'Por enlace'], ['regiao', 'Por região']].map(([k, l]) => `<button class="${groupBy === k ? 'on' : ''}" data-g="${k}">${l}</button>`).join('')}</div></header><div class="grid g2"><div class="chart-box"><canvas id="cg"></canvas></div><div id="cgt"></div></div></section>
      <section class="panel">${FC.filt.html('ce')}<div class="filters">${ui.field('Status', ui.select('cst', [['', 'Todos'], ['pendente', 'Pendente'], ['medido', 'Medido'], ['divergente', 'Divergente'], ['certificado', 'Certificado']], ''))}</div></section>
      <section class="panel" id="ctb"></section>`;
    U.$$('[data-g]', el).forEach(b => b.onclick = () => { groupBy = b.dataset.g; FC.rerender(); });
    U.$('#req').onclick = () => FC.go('configuracoes', { tab: 'tecnico' });
    U.$('#rc').onclick = () => FC.go('relatorios', { tipo: 'certificacao' });
    FC.filt.bind(el, 'ce', (r) => r ? FC.rerender() : draw());
    U.$('#cst').onchange = () => draw();
    // painel por grupo
    const groups = U.groupBy(store.state.trechos, t => { const l = store.get('links', t.linkId) || {}; return groupBy === 'enlace' ? l.nome : groupBy === 'regiao' ? (l.regiao || 'Sem região') : l.projeto; });
    const rows = Object.entries(groups).map(([k, ts]) => { const s = ts.map(C.trechoStatus); return { k, n: ts.length, cert: s.filter(x => x === 'certificado').length, med: s.filter(x => x === 'medido').length, div: s.filter(x => x === 'divergente').length, pend: s.filter(x => x === 'pendente').length }; }).sort((a, b) => b.cert / b.n - a.cert / a.n);
    const p = ui.palette();
    ui.chart(U.$('#cg'), { type: 'bar', data: { labels: rows.map(r => r.k), datasets: [{ label: 'Certificado', data: rows.map(r => r.cert), backgroundColor: p.ok }, { label: 'Medido', data: rows.map(r => r.med), backgroundColor: p.teal }, { label: 'Divergente', data: rows.map(r => r.div), backgroundColor: p.bad }, { label: 'Pendente', data: rows.map(r => r.pend), backgroundColor: p.line }] }, options: { indexAxis: 'y', scales: { x: { stacked: true, ticks: { precision: 0 } }, y: { stacked: true } } } });
    U.$('#cgt').innerHTML = `<div class="table-scroll"><table class="tbl"><thead><tr><th>${{ projeto: 'Projeto', enlace: 'Enlace', regiao: 'Região' }[groupBy]}</th><th class="num">Trechos</th><th>Certificação</th></tr></thead><tbody>${rows.map(r => `<tr><td>${U.esc(r.k)}</td><td class="num">${r.n}</td><td style="min-width:140px"><span class="small">${r.cert}/${r.n} · ${U.num(r.cert / r.n * 100, 1)}%</span><div class="meter"><i style="width:${r.cert / r.n * 100}%"></i></div></td></tr>`).join('')}</tbody></table></div>`;

    const draw = () => {
      const st = U.$('#cst').value;
      const rows2 = FC.filt.trechos().map(t => ({ t, l: store.get('links', t.linkId), s: C.trechoStatus(t), m: C.latest(t.id), r: C.certRequirements(t) })).filter(x => !st || x.s === st);
      ui.table(U.$('#ctb'), {
        rows: rows2, sortKey: 's', sortDir: 'asc',
        rowClass: x => x.s === 'certificado' ? 'row-ok' : x.s === 'divergente' ? 'row-bad' : '',
        columns: [
          { key: 'l', label: 'Enlace / trecho', sort: x => x.l.nome + x.t.nome, render: x => `${U.esc(x.l.nome)} / <b>${U.esc(x.t.nome)}</b>${ui.demo(x.t)}` },
          { key: 's', label: 'Status', sort: x => ['divergente', 'medido', 'pendente', 'certificado'].indexOf(x.s), render: x => ui.badge(x.s) },
          { key: 'dm', label: 'Data da medição', sort: x => x.m && x.m.data, render: x => x.m ? U.date(x.m.data) : '—' },
          { key: 'resp', label: 'Responsável', render: x => U.esc(x.m ? x.m.responsavel : '—') },
          { key: 'arq', label: 'Arquivo OTDR', render: x => x.m && x.m.attachmentId ? `<button class="chip-file" data-att="${x.m.attachmentId}">${ui.icon('otdr')}<span>${U.esc(x.m.fileName)}</span></button>` : `<span class="muted small">${U.esc(x.m ? x.m.fileName || 'manual' : '—')}</span>` },
          { key: 'res', label: 'Resultado', render: x => x.m ? ui.badge(C.analyze(x.m, x.t).result) : '—' },
          { key: 'req', label: 'Requisitos', sort: x => x.r.reqs.filter(r => r.ok).length, render: x => `<span class="small ${x.r.ok ? 'ok-text' : 'warn-text'}">${x.r.reqs.filter(r => r.ok).length}/${x.r.reqs.length} atendidos</span>` },
          { key: 'cert', label: 'Certificação', render: x => x.t.certificacao && x.t.certificacao.status === 'certificado' ? `<span class="small">${U.date(x.t.certificacao.data)}<br>por ${U.esc(x.t.certificacao.aprovador)}</span>` : '—' },
          { key: 'a', label: '', sortable: false, render: x => `<button class="btn sm ${x.s === 'certificado' ? 'ghost' : x.r.ok ? 'primary' : ''}" data-c="${x.t.id}">${x.s === 'certificado' ? 'Detalhes' : 'Certificar'}</button>` }
        ]
      });
      U.$$('[data-c]', el).forEach(b => b.onclick = (e) => { e.stopPropagation(); certModal(store.get('trechos', b.dataset.c)); });
      FC.bindAttChips(U.$('#ctb'));
    };
    draw();
    if (params.trechoId) { const t = store.get('trechos', params.trechoId); t && setTimeout(() => certModal(t), 60); }
  }

  function certModal(t) {
    const l = store.get('links', t.linkId), m = C.latest(t.id), r = C.certRequirements(t), cert = t.certificacao;
    const isCert = cert && cert.status === 'certificado';
    const S = store.state.settings.certification;
    const canApprove = store.can('certificacao.aprovar');
    const a = m ? C.analyze(m, t) : null;
    ui.modal({
      title: (isCert ? 'Certificação — ' : 'Certificar — ') + l.nome + ' / ' + t.nome, wide: true,
      body: `<div class="kv"><div><span class="k">Data da medição</span><span class="v">${m ? U.dt(m.data) : '—'}</span></div><div><span class="k">Responsável</span><span class="v">${U.esc(m ? m.responsavel : '—')}</span></div><div><span class="k">Arquivo OTDR</span><span class="v">${U.esc(m ? m.fileName || 'manual' : '—')}</span></div><div><span class="k">Resultado da análise</span><span class="v">${a ? ui.badge(a.result) : '—'}</span></div></div>
      <h4>Requisitos técnicos</h4><ul class="list-plain" style="list-style:none;padding:0">${r.reqs.map(q => `<li>${q.ok ? `<span class="ok-text">${ui.icon('check')}</span>` : `<span class="bad-text">${ui.icon('x')}</span>`} ${U.esc(q.k)}${q.detail ? ` <span class="tiny muted">(${U.esc(q.detail)})</span>` : ''}</li>`).join('')}</ul>
      ${isCert ? `<div class="note ok">${ui.icon('cert')}<div>Certificado em <b>${U.dt(cert.data)}</b> por <b>${U.esc(cert.aprovador)}</b>.<br>Observações: ${U.esc(cert.obs || '—')}<br><span class="tiny">Hash da assinatura (SHA-256): ${U.esc(cert.assinaturaHash || '')}</span></div></div>${cert.assinatura ? `<img src="${cert.assinatura}" alt="Assinatura" style="max-width:320px;background:#fff;border:1px solid var(--line);border-radius:8px">` : ''}`
      : !r.ok ? `<div class="note bad">${ui.icon('alert')}<div>A certificação está bloqueada até todos os requisitos serem atendidos.</div></div>`
      : !canApprove ? `<div class="note warn">${ui.icon('alert')}<div>Seu perfil não aprova certificações. Solicite a um Supervisor, Engenheiro ou Administrador.</div></div>`
      : `<form class="form-grid" id="cf">${ui.field('Responsável pela aprovação', ui.input('aprov', store.user().nome, 'readonly'))}${ui.field('Data da certificação', ui.input('dc', U.dt(U.now()), 'readonly'), 'Automática')}${ui.field('Observações', '<textarea name="obs"></textarea>', '', 'full')}
        ${S.requireSignature ? `<div class="field full"><span class="lbl">Assinatura eletrônica</span><canvas id="sig" width="560" height="150" style="width:100%;max-width:560px;height:150px;background:#fff;border:1px dashed var(--line-2);border-radius:8px;touch-action:none"></canvas><div class="btn-row"><button type="button" class="btn sm ghost" id="sigc">Limpar assinatura</button></div><small class="hint">Assinatura eletrônica simples com registro de autoria, data e hash SHA-256 do conteúdo certificado (não substitui certificado ICP-Brasil).</small></div>` : ''}
        <label class="check full"><input type="checkbox" name="decl" required> Declaro que revisei a medição e assumo a responsabilidade técnica por esta certificação.</label></form>`}`,
      actions: isCert ? (store.can('fator.aprovar') ? [{ label: 'Revogar certificação', cls: 'danger', onClick: async () => { if (await ui.confirm('Revogar certificação', 'O trecho voltará ao status calculado. A revogação fica na auditoria.', 'Revogar', true)) { t.certificacao = Object.assign({}, cert, { status: 'revogado', revogadoPor: store.user().nome, revogadoEm: U.now() }); store.upsert('trechos', t, 'Certificação revogada ' + t.nome); store.audit('revogou', 'trechos', t.id, `Certificação de ${l.nome} / ${t.nome}`); FC.rerender(); } } }, { label: 'Relatório', icon: 'report', onClick: () => FC.reports.linkPDF(l) }] : [{ label: 'Relatório', icon: 'report', onClick: () => FC.reports.linkPDF(l) }])
        : (r.ok && canApprove ? [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Registrar certificação', cls: 'primary', icon: 'cert', onClick: async (b) => {
          const f = ui.formData(U.$('#cf', b));
          if (!f.decl) { ui.toast('Confirme a declaração de responsabilidade.', 'err'); return false; }
          const cv = U.$('#sig', b); let sig = null;
          if (S.requireSignature) { if (!cv._drawn) { ui.toast('Assine no quadro para registrar a aprovação.', 'err'); return false; } sig = cv.toDataURL('image/png'); }
          const payload = JSON.stringify({ trecho: t.id, medicao: m && m.id, arquivo: m && m.fileHash, otdr: C.otdrNet(m), perda: m && m.totalLoss, aprovador: store.user().id, data: U.now() });
          t.certificacao = { status: 'certificado', data: U.now(), aprovador: store.user().nome, aprovadorId: store.user().id, obs: f.obs, medicaoId: m && m.id, resultado: a && a.result, assinatura: sig, assinaturaHash: await U.sha256(payload + (sig || '')), payload };
          store.upsert('trechos', t, 'Certificação ' + t.nome); store.audit('certificou', 'trechos', t.id, `${l.nome} / ${t.nome}`);
          ui.toast('Trecho certificado e assinatura registrada.', 'ok'); FC.rerender();
        } }] : [{ label: 'Fechar', cls: 'ghost' }]),
      onOpen: (b) => {
        const cv = U.$('#sig', b); if (!cv) return;
        const ctx = cv.getContext('2d'); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#002947';
        let draw = false;
        const pos = (e) => { const rc = cv.getBoundingClientRect(); return [(e.clientX - rc.left) * cv.width / rc.width, (e.clientY - rc.top) * cv.height / rc.height]; };
        cv.onpointerdown = (e) => { draw = true; cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); };
        cv.onpointermove = (e) => { if (!draw) return; ctx.lineTo(...pos(e)); ctx.stroke(); cv._drawn = true; };
        cv.onpointerup = () => { draw = false; };
        U.$('#sigc', b).onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); cv._drawn = false; };
      }
    });
  }
  FC.certModal = certModal;

  FC.registerModule({ id: 'certificacoes', order: 7, title: 'Certificações', icon: 'cert', group: 'main', field: false, count: true, render });
})(window.FC = window.FC || {});
