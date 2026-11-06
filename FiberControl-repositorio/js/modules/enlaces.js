/* Módulo 2 — Enlaces, trechos, anexos, QR Code e versões de traçado */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, C = FC.calc, store = FC.store;

  /* ---------- Helpers compartilhados ---------- */
  FC.linkTotals = (l) => {
    const ts = store.state.trechos.filter(t => t.linkId === l.id);
    const oz = ts.length ? U.sum(ts, t => t.ozmapM) : (+l.ozmapM || null);
    const st = ts.map(C.trechoStatus);
    return { ts, oz, cert: st.filter(s => s === 'certificado').length, div: st.filter(s => s === 'divergente').length, pct: ts.length ? st.filter(s => s === 'certificado').length / ts.length * 100 : 0 };
  };
  FC.attChips = (trechoId, linkId) => {
    const atts = store.state.attachments.filter(a => trechoId ? a.trechoId === trechoId : (a.linkId === linkId && !a.trechoId));
    return `<div class="chips">${atts.map(a => `<button class="chip-file" data-att="${a.id}" title="${U.esc(a.nome)} (${U.esc(a.categoria || '')})">${ui.icon(U.ext(a.nome) === 'sor' ? 'otdr' : ['jpg', 'jpeg', 'png'].includes(U.ext(a.nome)) ? 'camera' : U.ext(a.nome) === 'kmz' ? 'map' : 'file')}<span>${U.esc(a.nome)}</span></button>`).join('')}</div>`;
  };
  FC.bindAttChips = (root) => U.$$('[data-att]', root).forEach(b => b.onclick = (e) => { e.stopPropagation(); const a = store.get('attachments', b.dataset.att); a && FC.attachmentMenu(a); });
  FC.attachmentMenu = (a) => ui.modal({
    title: a.nome, body: `<div class="kv"><div><span class="k">Categoria</span><span class="v">${U.esc(a.categoria || '—')}</span></div><div><span class="k">Tamanho</span><span class="v">${U.bytes(a.tamanho || 0)}</span></div><div><span class="k">Enviado por</span><span class="v">${U.esc(a.createdBy || '—')}</span></div><div><span class="k">Data</span><span class="v">${U.dt(a.createdAt)}</span></div></div>`,
    actions: [
      ...(store.can('anexo.excluir') ? [{ label: 'Excluir', cls: 'danger', icon: 'trash', onClick: async () => { if (await ui.confirm('Excluir anexo', `Excluir ${a.nome}? A ação fica registrada na auditoria.`, 'Excluir', true)) { await U.idb.del('files', a.id); store.remove('attachments', a.id, 'Anexo ' + a.nome); FC.rerender(); } } }] : []),
      { label: 'Baixar', icon: 'download', onClick: () => ui.openAttachment(a, true) },
      { label: 'Visualizar', icon: 'eye', cls: 'primary', onClick: () => ui.openAttachment(a) }
    ]
  });
  const CATS = ['Relatório OTDR (PDF)', 'Arquivo SOR', 'KMZ', 'Fotografia de campo', 'Documento complementar'];
  FC.attachFlow = async (trecho, link) => {
    if (!store.require('anexo.enviar')) return;
    const files = await ui.pickFiles({ multiple: true, accept: '.pdf,.sor,.msor,.kmz,.kml,.jpg,.jpeg,.png,.webp,.doc,.docx,.xlsx,.csv,.txt' });
    if (!files.length) return;
    for (const f of files) {
      const e = U.ext(f.name);
      const categoria = e === 'pdf' ? CATS[0] : (e === 'sor' || e === 'msor') ? CATS[1] : (e === 'kmz' || e === 'kml') ? CATS[2] : ['jpg', 'jpeg', 'png', 'webp'].includes(e) ? CATS[3] : CATS[4];
      const att = await store.putFile(f, { trechoId: trecho ? trecho.id : null, linkId: link.id, categoria });
      if (categoria === 'KMZ' && trecho) {
        try { const g = await FC.geoio.readKMZ(f, f.name); const line = g.find(x => !x.point && x.coords.length > 1); if (line) { snapshot(link, 'Antes de importar KMZ ' + f.name); trecho.coords = line.coords; trecho.kmzM = Math.round(FC.geo.pathLen(line.coords)); store.upsert('trechos', trecho, `Traçado importado do KMZ (${U.m(trecho.kmzM, 0)})`); ui.toast(`Traçado do KMZ aplicado ao trecho (${U.m(trecho.kmzM, 0)}).`, 'ok'); } } catch (err) { ui.toast('KMZ anexado, mas a geometria não foi lida: ' + err.message, 'warn'); }
      }
      void att;
    }
    ui.toast(files.length + ' anexo(s) enviado(s).', 'ok');
    FC.rerender();
  };

  /* ---------- Versões de traçado ---------- */
  function snapshot(link, motivo) {
    const ts = store.state.trechos.filter(t => t.linkId === link.id).map(t => ({ id: t.id, nome: t.nome, tipo: t.tipo, ozmapM: t.ozmapM, coords: t.coords || null }));
    const n = store.state.versions.filter(v => v.linkId === link.id).length + 1;
    store.upsert('versions', { id: U.uid('ver_'), linkId: link.id, numero: n, at: U.now(), por: (store.user() || {}).nome, motivo, trechos: ts }, `Versão ${n} do traçado de ${link.nome}`);
  }
  FC.snapshotLink = snapshot;

  /* ---------- QR Code ---------- */
  FC.qr = (title, hash) => {
    const url = location.href.split('#')[0] + '#' + hash;
    let svg = '<p class="muted">Gerador de QR Code indisponível (biblioteca não carregou).</p>';
    if (window.qrcode) { const q = qrcode(0, 'M'); q.addData(url); q.make(); svg = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }
    ui.modal({ title: 'QR Code — ' + title, body: `<div style="max-width:280px;margin:0 auto;background:#fff;padding:10px;border-radius:8px">${svg}</div><p class="small muted" style="overflow-wrap:anywhere">${U.esc(url)}</p><p class="small">Cole a etiqueta na caixa/CEO: ao escanear, o cadastro abre direto no trecho.</p>`,
      actions: [{ label: 'Copiar link', icon: 'link', keep: true, onClick: () => navigator.clipboard.writeText(url).then(() => ui.toast('Link copiado.', 'ok'), () => ui.toast('Copie manualmente o link exibido.', 'warn')) },
        { label: 'Baixar SVG', icon: 'download', cls: 'primary', keep: true, onClick: () => window.qrcode && U.download(new Blob([svg], { type: 'image/svg+xml' }), 'qrcode-' + U.norm(title).replace(/[^a-z0-9]+/g, '-') + '.svg') }] });
  };

  /* ---------- Formulário do enlace ---------- */
  function linkForm(link) {
    if (!store.require('enlace.editar')) return;
    const isNew = !link; const u = store.user();
    link = link || { id: U.uid('lnk_'), responsavel: u.nome, criadoEm: U.now(), projeto: store.state.settings.defaultProject };
    const autoTag = (k) => link.origem && link.origem[k] ? `<span class="auto">automático · ${U.esc(link.origem[k])}</span>` : '';
    ui.modal({
      title: isNew ? 'Novo enlace' : 'Editar enlace', wide: true,
      body: `${isNew ? `<div class="note">${ui.icon('otdr')}<div>Os campos de identificação são preenchidos <b>automaticamente a partir do teste</b>. Selecione o arquivo (.SOR, PDF) do OTDR ou preencha manualmente.<br><button class="btn sm primary" id="fromTest" style="margin-top:8px">${ui.icon('upload')}Preencher a partir de um teste</button></div></div>` : ''}
      <form class="form-grid" id="lfm">
        ${ui.field('Nome do enlace', ui.input('nome', link.nome, 'required'), autoTag('nome'), 'full')}
        ${ui.field('POP de origem', ui.input('popA', link.popA), autoTag('popA'))}
        ${ui.field('POP de destino', ui.input('popB', link.popB), autoTag('popB'))}
        ${ui.field('Identificação do cabo', ui.input('caboId', link.caboId), autoTag('caboId'))}
        ${ui.field('Tipo de cabo', ui.input('tipoCabo', link.tipoCabo), autoTag('tipoCabo'))}
        ${ui.field('Quantidade de fibras', ui.input('fibras', link.fibras, 'type="number" min="1" max="432"'), autoTag('fibras'))}
        ${ui.field('Distância OZmap (m)', ui.input('ozmapM', link.ozmapM, 'type="number" step="0.1" min="0"'), 'Usada quando o enlace não tem trechos; com trechos, é a soma deles.')}
        ${ui.field('Região', ui.input('regiao', link.regiao, 'list="dl-reg"'), autoTag('regiao'))}
        ${ui.field('Projeto', ui.input('projeto', link.projeto, 'list="dl-proj"'), autoTag('projeto'))}
        ${ui.field('Responsável técnico', ui.input('responsavel', link.responsavel, 'readonly'), 'Definido pelo login')}
        ${ui.field('Data de cadastro', ui.input('criadoEm', U.dt(link.criadoEm), 'readonly'), 'Automática')}
        ${store.state.settings.tolerance.allowPerLink ? ui.field('Tolerância individual (%)', ui.input('tolMax', link.tolCustom ? link.tolCustom.max : '', 'type="number" step="0.1" placeholder="Usar global/tipo"'), 'Vazio = regra global ou por tipo') + ui.field('Faixa de atenção individual (%)', ui.input('tolAtt', link.tolCustom ? link.tolCustom.attention : '', 'type="number" step="0.1"')) : ''}
        ${ui.field('Observações', `<textarea id="obs" name="obs">${U.esc(link.obs || '')}</textarea>`, '', 'full')}
      </form>
      <datalist id="dl-reg">${U.uniq(store.state.links.map(l => l.regiao)).map(r => `<option value="${U.esc(r)}">`).join('')}</datalist>
      <datalist id="dl-proj">${U.uniq(store.state.links.map(l => l.projeto)).map(r => `<option value="${U.esc(r)}">`).join('')}</datalist>`,
      actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: isNew ? 'Cadastrar enlace' : 'Salvar', cls: 'primary', icon: 'check', onClick: (b) => {
        const f = ui.formData(U.$('#lfm', b));
        if (!f.nome.trim()) { ui.toast('Informe o nome do enlace.', 'err'); return false; }
        Object.assign(link, { nome: f.nome.trim(), popA: f.popA.trim(), popB: f.popB.trim(), caboId: f.caboId.trim(), tipoCabo: f.tipoCabo.trim(), fibras: f.fibras ? +f.fibras : null, ozmapM: f.ozmapM ? +f.ozmapM : null, regiao: f.regiao.trim(), projeto: f.projeto.trim() || store.state.settings.defaultProject, obs: f.obs });
        if (f.tolMax !== undefined) link.tolCustom = f.tolMax !== '' ? { max: +f.tolMax, attention: f.tolAtt !== '' ? +f.tolAtt : store.state.settings.tolerance.attention } : null;
        store.upsert('links', link, (isNew ? 'Cadastro' : 'Edição') + ' do enlace ' + link.nome);
        ui.toast(isNew ? 'Enlace cadastrado.' : 'Enlace atualizado.', 'ok');
        FC.go('enlaces', { linkId: link.id });
      } }],
      onOpen: (b) => {
        const btn = U.$('#fromTest', b);
        btn && (btn.onclick = async () => {
          const [f] = await ui.pickFiles({ accept: '.sor,.msor,.pdf' }); if (!f) return;
          try {
            const k = FC.importers.kindOf(f.name);
            const r = k === 'SOR' ? (await FC.importers.readSOR(f))[0] : (await FC.importers.readPDF(f))[0];
            const d = FC.importers.derive({ gen: r.draft.gen || {}, fileName: f.name, relPath: f.webkitRelativePath || '', text: r.text || '' });
            link.origem = d.origem;
            ['nome', 'popA', 'popB', 'caboId', 'tipoCabo', 'fibras', 'regiao', 'projeto'].forEach(k2 => { const i = U.$('#' + k2, b); if (i && d[k2] != null && d[k2] !== '') { i.value = d[k2]; const lab = i.closest('.field'); let a = lab.querySelector('.auto'); if (!a) { a = document.createElement('span'); a.className = 'auto'; lab.appendChild(a); } a.textContent = 'automático · ' + d.origem[k2]; } });
            ui.toast('Campos preenchidos a partir de ' + f.name + '. Confira antes de salvar.', 'ok');
          } catch (err) { ui.toast('Não foi possível ler o teste: ' + err.message, 'err'); }
        });
      }
    });
  }
  FC.linkForm = linkForm;

  /* ---------- Formulário do trecho ---------- */
  function trechoForm(link, t) {
    if (!store.require('enlace.editar')) return;
    const isNew = !t;
    const ts = store.state.trechos.filter(x => x.linkId === link.id);
    t = t || { id: U.uid('tr_'), linkId: link.id, ordem: ts.length + 1, nome: 'T' + String(ts.length + 1).padStart(2, '0'), tipo: 'Aéreo', caboFO: link.fibras || 48, conectores: 2, emendas: 0, wavelength: 1550, componentes: [] };
    const S = store.state.settings;
    ui.modal({
      title: (isNew ? 'Novo trecho — ' : 'Editar trecho — ') + link.nome, wide: true,
      body: `<form class="form-grid" id="tfm">
        ${ui.field('Identificação do trecho', ui.input('nome', t.nome, 'required'))}
        ${ui.field('Ordem no enlace', ui.input('ordem', t.ordem, 'type="number" min="1"'))}
        ${ui.field('Tipo de trecho', ui.select('tipo', S.trechoTypes, t.tipo))}
        ${ui.field('Distância OZmap (m)', ui.input('ozmapM', t.ozmapM, 'type="number" step="0.1" min="0"'), t.kmzM ? 'KMZ: ' + U.m(t.kmzM, 0) : '')}
        ${ui.field('Cabo principal (FO)', ui.select('caboFO', S.fibers.capacities, t.caboFO))}
        ${ui.field('Cabo conectado (FO)', ui.select('caboConectadoFO', [['', 'Nenhum'], ...S.fibers.capacities], t.caboConectadoFO || ''), 'Preencha quando houver entronque/derivação')}
        ${ui.field(S.fibers.column, ui.input('fibrasRestantes', t.fibrasRestantes, 'type="number" min="0"'), 'Fibras livres')}
        ${ui.field('Emendas', ui.input('emendas', t.emendas, 'type="number" min="0"'))}
        ${ui.field('Conectores', ui.input('conectores', t.conectores, 'type="number" min="0"'))}
        ${ui.field('λ de referência (nm)', ui.select('wavelength', Object.keys(S.budget.wavelengths), t.wavelength))}
        ${ui.field('Perdas adicionais (dB)', ui.input('perdaAdicional', t.perdaAdicional, 'type="number" step="0.01" min="0"'))}
        ${ui.field('Caixa / CEO', ui.input('caixa', t.caixa))}
        ${ui.field('Local do entronque', ui.input('entronqueLocal', t.entronqueLocal))}
        <div class="field full"><span class="lbl">Componentes ópticos no trecho</span><div class="chips">${S.budget.components.map(c => `<label class="check tag"><input type="checkbox" name="cmp_${c.id}" ${(t.componentes || []).includes(c.id) ? 'checked' : ''}> ${U.esc(c.nome)} (${U.db(c.perda)})</label>`).join('') || '<span class="muted small">Cadastre componentes em Configurações › Parâmetros de perda</span>'}</div></div>
        ${ui.field('Observações', `<textarea name="obs">${U.esc(t.obs || '')}</textarea>`, '', 'full')}
      </form>`,
      actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Salvar trecho', cls: 'primary', icon: 'check', onClick: (b) => {
        const f = ui.formData(U.$('#tfm', b));
        const geoChanged = !isNew && (+f.ozmapM !== +t.ozmapM);
        if (geoChanged) snapshot(link, `Alteração da distância OZmap de ${t.nome}: ${t.ozmapM} → ${f.ozmapM} m`);
        Object.assign(t, { nome: f.nome.trim(), ordem: +f.ordem || 1, tipo: f.tipo, ozmapM: f.ozmapM === '' ? null : +f.ozmapM, caboFO: +f.caboFO, caboConectadoFO: f.caboConectadoFO ? +f.caboConectadoFO : null, fibrasRestantes: f.fibrasRestantes === '' ? null : +f.fibrasRestantes, emendas: +f.emendas || 0, conectores: +f.conectores || 0, wavelength: +f.wavelength, perdaAdicional: +f.perdaAdicional || 0, caixa: f.caixa, entronqueLocal: f.entronqueLocal, obs: f.obs, componentes: S.budget.components.filter(c => f['cmp_' + c.id]).map(c => c.id) });
        store.upsert('trechos', t, `${isNew ? 'Cadastro' : 'Edição'} do trecho ${t.nome} (${link.nome})`);
        if (isNew && store.state.versions.filter(v => v.linkId === link.id).length === 0) snapshot(link, 'Versão inicial');
        ui.toast('Trecho salvo. Comparativos recalculados.', 'ok'); FC.rerender();
      } }]
    });
  }
  FC.trechoForm = trechoForm;

  /* ---------- Importar teste → enlace + trecho + medição preenchidos automaticamente ---------- */
  FC.importTest = async (presetLink, files, opts = {}) => {
    if (!store.require('medicao.importar')) return;
    files = files || await ui.pickFiles({ accept: '.pdf,.sor,.msor,.csor', multiple: true });
    if (!files.length) return;
    if (files.length > 1) { FC.go('otdr', { tab: 'lote' }); setTimeout(() => FC.batchAdd(files), 60); return ui.toast(files.length + ' testes enviados para a Importação em lote.', 'info'); }
    const file = files[0], kind = FC.importers.kindOf(file.name);
    if (kind !== 'SOR' && kind !== 'PDF') { if (opts.fallback) return opts.fallback(file); return ui.toast('Envie o PDF do relatório, .SOR ou .CSOR.', 'err'); }
    ui.toast('Lendo ' + file.name + '…', 'info', 2000);
    let res, buf, hash;
    try {
      buf = await U.readAsArrayBuffer(file); hash = await U.sha256(buf);
      res = (kind === 'SOR' ? await FC.importers.readSOR(file, buf) : await FC.importers.readPDF(file, buf))[0];
    } catch (e) { return ui.toast('Não foi possível ler o teste: ' + e.message, 'err', 7000); }
    const d = res.draft, der = FC.importers.derive({ gen: d.gen || {}, fileName: file.name, relPath: file.webkitRelativePath || '', text: res.text || '' });
    const presetT = opts.trechoId ? store.get('trechos', opts.trechoId) : null;
    let match = presetT ? { link: store.get('links', presetT.linkId), trecho: presetT } : presetLink ? { link: presetLink, trecho: null } : FC.matchTarget(der);
    // Enlace aberto na tela mas o teste é de outros POPs: não força a associação
    let conflito = null;
    if (match.link && !FC.samePops(match.link, der)) { conflito = match.link; match = FC.matchTarget(der); }
    const L0 = match.link;
    if (L0 && !match.trecho && der.trechoNome) match.trecho = store.state.trechos.find(t => t.linkId === L0.id && U.norm(t.nome) === U.norm(der.trechoNome)) || null;
    const T0 = match.trecho;
    const dup = store.state.measurements.find(m => m.fileHash === hash);
    const u = store.user(), now = U.now();
    // Os dados do TESTE sempre prevalecem; o cadastro só completa o que o teste não informa
    const has = (x) => x != null && x !== '';
    const v = (k) => has(der[k]) && !(k === 'regiao' && !der.regiao) ? der[k] : (L0 && has(L0[k]) ? L0[k] : '');
    const tag = (k) => has(der[k]) && der.origem[k] && !/Não encontrado|Padrão/.test(der.origem[k]) ? `<span class="auto">automático · ${U.esc(der.origem[k])}</span>` : (L0 && has(L0[k]) ? '<span class="muted">do cadastro do enlace</span>' : '<span class="warn-text">não consta no teste — preencher</span>');
    const S = store.state.settings;
    const linkOpts = () => `<option value="">+ Novo enlace: ${U.esc(der.nome)}</option>` + store.state.links.map(l => `<option value="${l.id}" ${L0 && L0.id === l.id ? 'selected' : ''}>${U.esc(l.nome)}${FC.samePops(l, der) ? '' : ' (POPs diferentes do teste)'}</option>`).join('');
    const trechoOpts = (lid, sel) => '<option value="">+ Novo trecho</option>' + (lid ? store.state.trechos.filter(t => t.linkId === lid).map(t => `<option value="${t.id}" ${sel && sel.id === t.id ? 'selected' : ''}>${U.esc(t.nome)}</option>`).join('') : '');
    ui.modal({
      title: 'Importar teste — ' + der.nome, wide: true,
      body: `${dup ? `<div class="note warn">${ui.icon('alert')}<div><b>Este arquivo já foi importado</b> em ${U.dt(dup.importedAt)} por ${U.esc(dup.responsavel)}. Salvar criará um registro repetido.</div></div>` : ''}
      ${conflito ? `<div class="note warn">${ui.icon('alert')}<div>O teste é de <b>${U.esc(der.popA)} → ${U.esc(der.popB)}</b>, diferente do enlace aberto (${U.esc(conflito.nome)}). Ele ${L0 ? 'foi associado ao enlace com os mesmos POPs' : 'será cadastrado como um enlace novo'}.</div></div>` : ''}
      <div class="note ok">${ui.icon('check')}<div><b>${U.esc(res.format || res.kind)}</b> · lido: ${res.extracted.map(U.esc).join(', ')}${res.missing.length ? `<br><span class="warn-text">Não consta no arquivo: ${res.missing.map(U.esc).join(', ')}</span>` : ''}</div></div>
      <div class="form-grid">${ui.field('Gravar em', `<select id="itLink">${linkOpts()}</select>`, '<span id="itLinkHint"></span>', 'full')}</div>
      <h4>Enlace</h4><form class="form-grid" id="itf">
        ${ui.field('Nome do enlace', ui.input('nome', v('nome'), 'required'), tag('nome'), 'full')}
        ${ui.field('POP de origem', ui.input('popA', v('popA')), tag('popA'))}
        ${ui.field('POP de destino', ui.input('popB', v('popB')), tag('popB'))}
        ${ui.field('Identificação do cabo', ui.input('caboId', v('caboId')), tag('caboId'))}
        ${ui.field('Tipo de cabo', ui.input('tipoCabo', v('tipoCabo')), tag('tipoCabo'))}
        ${ui.field('Quantidade de fibras', ui.input('fibras', v('fibras'), 'type="number" min="1"'), tag('fibras'))}
        ${ui.field('Região', ui.input('regiao', v('regiao'), 'list="dl-reg2"'), tag('regiao'))}
        ${ui.field('Projeto', ui.input('projeto', v('projeto')), tag('projeto'))}
        ${ui.field('Responsável técnico', ui.input('resp', L0 ? L0.responsavel : u.nome, 'readonly'), 'Definido pelo login')}
        ${ui.field('Data de cadastro', ui.input('cad', U.dt(L0 ? L0.criadoEm : now), 'readonly'), 'Automática')}
        ${ui.field('Observações deste teste', `<textarea name="obs">${U.esc(der.obs || '')}</textarea>`, has(der.obs) ? tag('obs') + ' <span class="muted">· salvas na medição</span>' : 'Salvas na medição', 'full')}
      </form>
      <h4>Trecho</h4><form class="form-grid" id="itt">
        ${ui.field('Trecho', `<select name="trechoId" id="itTr">${trechoOpts(L0 && L0.id, T0)}</select>`)}
        ${ui.field('Nome do novo trecho', ui.input('tnome', der.trechoNome || 'T01'), tag('trechoNome'))}
        ${ui.field('Tipo de trecho', ui.select('ttipo', S.trechoTypes, T0 ? T0.tipo : 'Aéreo'))}
        ${ui.field('Distância OZmap (m)', ui.input('ozmapM', T0 ? T0.ozmapM : '', 'type="number" step="0.1" min="0"'), 'Do traçado no OZmap (não vem no teste)')}
        ${ui.field('Bobina de lançamento (m)', ui.input('launchM', 0, 'type="number" step="any" min="0"'), 'Descontada da distância do OTDR')}
      </form>
      <h4>Medição lida do teste</h4><div class="kv">${[
        ['Fibra', d.gen && d.gen.fiberId], ['OS', d.gen && d.gen.os], ['Técnico OTDR', d.operadorOTDR || (d.gen && d.gen.operator)], ['Data da medição', d.data ? U.dt(d.data) : null],
        ['Comprimento de onda', d.wavelength ? d.wavelength + ' nm' : null], ['Fim da fibra', d.lengthM != null ? U.m(d.lengthM, 2) : null], ['Perda total', d.totalLoss != null ? U.db(d.totalLoss, 3) : null], ['ORL', d.orl ? U.db(d.orl) : null],
        ['Perda média', d.avgAtt ? U.num(d.avgAtt, 3) + ' dB/km' : null], ['IOR', d.ior], ['Eventos', (d.events || []).length], ['Equipamento', d.equipamento]
      ].map(([k, x]) => `<div><span class="k">${k}</span><span class="v">${x == null || x === '' ? '<span class="muted">—</span>' : U.esc(x)}</span></div>`).join('')}</div>
      <datalist id="dl-reg2">${U.uniq(store.state.links.map(l => l.regiao)).map(r => `<option value="${U.esc(r)}">`).join('')}</datalist>`,
      onOpen: (b) => {
        const sel = U.$('#itLink', b), hint = U.$('#itLinkHint', b);
        const upd = () => {
          const l = sel.value ? store.get('links', sel.value) : null;
          U.$('#itTr', b).innerHTML = trechoOpts(l && l.id, l && L0 && l.id === L0.id ? T0 : (l ? store.state.trechos.find(t => t.linkId === l.id && U.norm(t.nome) === U.norm(der.trechoNome)) : null));
          hint.innerHTML = !l ? '<span class="auto">Será criado um enlace novo com os dados do teste</span>' : FC.samePops(l, der) ? '<span class="auto">Mesmo POP de origem e destino do teste: a medição entra no histórico deste enlace</span>' : '<span class="warn-text">Atenção: os POPs deste enlace são diferentes dos POPs do teste</span>';
        };
        sel.onchange = upd; upd();
      },
      actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Salvar', cls: 'primary', icon: 'check', onClick: async (b) => {
        const f = ui.formData(U.$('#itf', b)), t = ui.formData(U.$('#itt', b));
        if (!f.nome.trim()) { ui.toast('Informe o nome do enlace.', 'err'); return false; }
        const L = U.$('#itLink', b).value ? store.get('links', U.$('#itLink', b).value) : null;
        const link = L || { id: U.uid('lnk_'), responsavel: u.nome, criadoEm: now, criadoPorTeste: file.name };
        Object.assign(link, { nome: f.nome.trim(), popA: f.popA.trim(), popB: f.popB.trim(), caboId: f.caboId.trim(), tipoCabo: f.tipoCabo.trim(), fibras: f.fibras ? +f.fibras : null, regiao: f.regiao.trim(), projeto: f.projeto.trim() || S.defaultProject, origem: Object.assign({}, link.origem || {}, der.origem) });
        if (!L) link.obs = '';
        store.upsert('links', link, (L ? 'Enlace atualizado pelo teste ' : 'Enlace cadastrado a partir do teste ') + file.name);
        let tr = t.trechoId ? store.get('trechos', t.trechoId) : null;
        if (!tr) {
          const n = store.state.trechos.filter(x => x.linkId === link.id).length;
          tr = { id: U.uid('tr_'), linkId: link.id, ordem: n + 1, nome: t.tnome.trim() || 'T' + String(n + 1).padStart(2, '0'), tipo: t.ttipo, caboFO: link.fibras || null, emendas: (d.events || []).filter(e => e.kind === 'nao-refletivo').length, conectores: (d.events || []).filter(e => e.kind === 'refletivo').length, wavelength: d.wavelength || 1550, componentes: [], fibraTeste: d.gen && d.gen.fiberId };
        }
        tr.tipo = t.ttipo; if (t.ozmapM !== '') tr.ozmapM = +t.ozmapM;
        store.upsert('trechos', tr, `Trecho ${tr.nome} (${link.nome}) a partir do teste`);
        const m = await FC.saveMeasurement({ res, derived: der, buf, file, fileName: file.name, hash, linkId: link.id, trechoId: tr.id, manual: { launchM: U.parseNum(t.launchM) || 0, data: d.data || now, obs: f.obs } });
        ui.toast(`${L ? 'Medição adicionada' : 'Enlace, trecho e medição cadastrados'}: ${link.nome} / ${tr.nome}.`, 'ok', 6000);
        if (opts.after === 'otdr') FC.go('otdr', { measurementId: m.id, tab: 'individual' });
        else if (opts.after === 'comparativo') FC.go('comparativo', { tab: (tr.caixas || []).length ? 'caixas' : 'comparativo', trechoId: tr.id });
        else FC.go('enlaces', { linkId: link.id });
      } }]
    });
  };

  /* ---------- Lista ---------- */
  function renderList(el) {
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Cadastro</span><h1>Enlaces</h1><p class="muted small">Cada enlace reúne seus trechos, medições, anexos e certificações.</p></div>
      <div class="acts"><button class="btn orange" id="impTest">${ui.icon('otdr')}Importar teste</button><button class="btn" id="impOz">${ui.icon('upload')}Importar planilha OZmap</button><button class="btn primary" id="newL">${ui.icon('plus')}Novo enlace</button></div></div>
      <section class="dz" id="ldz">${ui.icon('otdr')}<b>Arraste aqui o teste do OTDR (PDF do SmartOTDR, .SOR ou .CSOR)</b><span class="small muted">Origem e Extremidade viram os POPs; cabo, fibras, OS, técnico, distância, perda, ORL e eventos são preenchidos automaticamente.</span></section>
      <section class="panel">${FC.filt.html('e')}</section>
      <section class="panel" id="lt"></section>`;
    U.$('#newL').onclick = () => linkForm();
    U.$('#impTest').onclick = () => FC.importTest();
    ui.dropzone(U.$('#ldz'), (fs) => FC.importTest(null, fs));
    U.$('#impOz').onclick = () => FC.go('fibras', { importar: true });
    FC.filt.bind(el, 'e', (r) => r ? FC.rerender() : draw());
    const draw = () => {
      const rows = FC.filt.links().map(l => Object.assign({ l }, FC.linkTotals(l)));
      ui.table(U.$('#lt'), {
        rows, sortKey: 'nome', sortDir: 'asc', onRow: (r) => FC.go('enlaces', { linkId: r.l.id }), empty: 'Nenhum enlace. Cadastre um enlace ou importe um teste OTDR.',
        rowClass: r => r.div ? 'row-bad' : r.pct === 100 && r.ts.length ? 'row-ok' : '',
        columns: [
          { key: 'nome', label: 'Enlace', sort: r => r.l.nome, render: r => `<b>${U.esc(r.l.nome)}</b>${ui.demo(r.l)}<br><span class="small muted">${U.esc(r.l.caboId || '')} · ${U.esc(r.l.tipoCabo || '')}</span>` },
          { key: 'projeto', label: 'Projeto', sort: r => r.l.projeto, render: r => U.esc(r.l.projeto) },
          { key: 'regiao', label: 'Região', sort: r => r.l.regiao, render: r => U.esc(r.l.regiao || '—') },
          { key: 'fo', label: 'FO', num: true, sort: r => r.l.fibras, render: r => U.esc(r.l.fibras || '—') },
          { key: 'n', label: 'Trechos', num: true, sort: r => r.ts.length, render: r => r.ts.length },
          { key: 'oz', label: 'OZmap', num: true, sort: r => r.oz, render: r => U.km(r.oz) },
          { key: 'pct', label: 'Certificação', sort: r => r.pct, render: r => `<div style="min-width:110px"><span class="small">${r.cert}/${r.ts.length} · ${U.num(r.pct, 0)}%</span><div class="meter"><i style="width:${r.pct}%"></i></div></div>` },
          { key: 'div', label: 'Divergentes', num: true, sort: r => r.div, render: r => r.div ? ui.badge('vermelho', r.div) : '0' },
          { key: 'resp', label: 'Responsável', sort: r => r.l.responsavel, render: r => U.esc(r.l.responsavel || '—') }
        ]
      });
    };
    draw();
  }

  /* ---------- Detalhe ---------- */
  function renderDetail(el, link, focusTrecho) {
    const tot = FC.linkTotals(link);
    const ts = tot.ts.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    el.innerHTML = `<div class="page-head"><div class="t"><button class="btn sm ghost" id="back" style="width:max-content">← Enlaces</button><span class="eyebrow">${U.esc(link.projeto)} · ${U.esc(link.regiao || 'sem região')}</span><h1>${U.esc(link.nome)}${ui.demo(link)}</h1></div>
      <div class="acts"><button class="btn" id="qrL">${ui.icon('qr')}QR Code</button><button class="btn" id="repL">${ui.icon('report')}Relatório</button><button class="btn" id="verL">${ui.icon('layers')}Versões do traçado</button><button class="btn" id="edL">${ui.icon('edit')}Editar</button>${store.can('enlace.excluir') ? `<button class="btn ghost" id="delL">${ui.icon('trash')}</button>` : ''}</div></div>
      <section class="panel"><div class="kv">
        <div><span class="k">POP A → POP B</span><span class="v">${U.esc(link.popA || '—')} → ${U.esc(link.popB || '—')}</span></div>
        <div><span class="k">Cabo</span><span class="v">${U.esc(link.caboId || '—')}</span></div><div><span class="k">Tipo de cabo</span><span class="v">${U.esc(link.tipoCabo || '—')}</span></div>
        <div><span class="k">Fibras</span><span class="v">${U.esc(link.fibras || '—')} FO</span></div><div><span class="k">Distância OZmap</span><span class="v num">${U.km(tot.oz)}</span></div>
        <div><span class="k">Certificação</span><span class="v">${tot.cert}/${ts.length} (${U.num(tot.pct, 0)}%)</span></div>
        <div><span class="k">Responsável técnico</span><span class="v">${U.esc(link.responsavel || '—')}</span></div><div><span class="k">Cadastro</span><span class="v">${U.dt(link.criadoEm || link.createdAt)}</span></div>
        <div><span class="k">Tolerância</span><span class="v">${link.tolCustom ? 'Individual ' + link.tolCustom.max + '%' : 'Global / por tipo'}</span></div>
      </div>${link.obs ? `<p class="small"><b>Observações:</b> ${U.esc(link.obs)}</p>` : ''}
      <div><span class="eyebrow">Anexos do enlace</span> ${FC.attChips(null, link.id)} <button class="btn sm ghost" id="attL">${ui.icon('upload')}Anexar</button></div></section>
      <section class="panel"><header><h3>Trechos</h3><div class="btn-row"><button class="btn sm" id="impT">${ui.icon('otdr')}Importar teste</button><button class="btn sm primary" id="newT">${ui.icon('plus')}Novo trecho</button></div></header><div id="tt"></div></section>`;
    U.$('#back').onclick = () => FC.go('enlaces');
    U.$('#edL').onclick = () => linkForm(link);
    U.$('#newT').onclick = () => trechoForm(link);
    U.$('#impT').onclick = () => FC.importTest(link);
    U.$('#attL').onclick = () => FC.attachFlow(null, link);
    U.$('#qrL').onclick = () => FC.qr(link.nome, 'lnk-' + link.id.slice(4));
    U.$('#repL').onclick = () => FC.go('relatorios', { tipo: 'individual', linkId: link.id });
    U.$('#verL').onclick = () => versionsModal(link);
    const del = U.$('#delL');
    del && (del.onclick = async () => {
      if (!(await ui.confirm('Excluir enlace', `Excluir ${link.nome} e seus ${ts.length} trechos? As medições permanecem no histórico de auditoria.`, 'Excluir', true))) return;
      ts.forEach(t => store.remove('trechos', t.id));
      store.remove('links', link.id, 'Exclusão do enlace ' + link.nome); FC.go('enlaces');
    });
    ui.table(U.$('#tt'), {
      rows: ts, sortKey: 'ordem', sortDir: 'asc', empty: 'Nenhum trecho. Clique em “Novo trecho” ou importe um teste.',
      rowClass: t => ({ divergente: 'row-bad', certificado: 'row-ok', medido: '' }[C.trechoStatus(t)] || '') + (t.id === focusTrecho ? ' focus' : ''),
      columns: [
        { key: 'ordem', label: '#', num: true, render: t => t.ordem },
        { key: 'nome', label: 'Trecho', render: t => `<b>${U.esc(t.nome)}</b>${ui.demo(t)}<br><span class="small muted">${U.esc(t.tipo || '')} · ${U.esc(t.caixa || '')}</span>` },
        { key: 'ozmapM', label: 'OZmap', num: true, render: t => U.m(t.ozmapM, 0) },
        { key: 'otdr', label: 'OTDR', num: true, sort: t => C.otdrNet(C.latest(t.id)), render: t => U.m(C.otdrNet(C.latest(t.id)), 1) },
        { key: 'dif', label: 'Diferença', num: true, sort: t => C.compare(t).diffPct, render: t => { const c = C.compare(t); return c.status === 'sem-dados' ? '—' : `<span class="${c.status === 'vermelho' ? 'bad-text' : c.status === 'amarelo' ? 'warn-text' : 'ok-text'}">${U.pct(c.diffPct)}</span><br><span class="small muted">${U.m(c.diffM, 0)}</span>`; } },
        { key: 'perda', label: 'Perda', num: true, sort: t => (C.latest(t.id) || {}).totalLoss, render: t => { const b = C.budget(t); return b.measured == null ? '—' : `${U.db(b.measured)}<br><span class="small muted">prev. ${b.pred ? U.db(b.pred.total) : '—'}</span>`; } },
        { key: 'cap', label: 'Fibras livres', sort: t => t.fibrasRestantes, render: t => { const c = C.capacity(t); return `${c.rest == null ? '—' : c.rest + '/' + (t.caboFO || '?')} ${ui.capBadge(c.status)}`; } },
        { key: 'status', label: 'Status', sort: t => C.trechoStatus(t), render: t => ui.badge(C.trechoStatus(t)) },
        { key: 'anexos', label: 'Anexos', sortable: false, render: t => FC.attChips(t.id) },
        { key: 'acts', label: '', sortable: false, render: t => `<div class="btn-row" style="flex-wrap:nowrap"><button class="btn sm ghost" data-a="edit" data-t="${t.id}" title="Editar">${ui.icon('edit')}</button><button class="btn sm ghost" data-a="att" data-t="${t.id}" title="Anexar">${ui.icon('upload')}</button><button class="btn sm ghost" data-a="otdr" data-t="${t.id}" title="Ver análise">${ui.icon('otdr')}</button><button class="btn sm ghost" data-a="qr" data-t="${t.id}" title="QR Code">${ui.icon('qr')}</button><button class="btn sm ghost" data-a="ck" data-t="${t.id}" title="Checklist">${ui.icon('list')}</button></div>` }
      ]
    });
    const bindRow = () => {
      FC.bindAttChips(U.$('#tt'));
      U.$$('#tt [data-a]').forEach(b => b.onclick = (e) => {
        e.stopPropagation(); const t = store.get('trechos', b.dataset.t);
        ({ edit: () => trechoForm(link, t), att: () => FC.attachFlow(t, link), otdr: () => FC.go('otdr', { trechoId: t.id }), qr: () => FC.qr(link.nome + ' / ' + t.nome, 'tr-' + t.id.slice(3)), ck: () => FC.go('checklist', { trechoId: t.id }) })[b.dataset.a]();
      });
    };
    bindRow(); U.$('#tt').addEventListener('click', () => setTimeout(bindRow, 0));
    if (focusTrecho) { const t = store.get('trechos', focusTrecho); if (t) setTimeout(() => ui.toast('Trecho ' + t.nome + ' selecionado.', 'info', 2500), 100); }
  }

  /* ---------- Versões / comparação de traçados ---------- */
  function versionsModal(link) {
    const vs = store.state.versions.filter(v => v.linkId === link.id).sort((a, b) => a.numero - b.numero);
    const current = { numero: 'Atual', at: U.now(), por: '—', motivo: 'Situação atual', trechos: store.state.trechos.filter(t => t.linkId === link.id).map(t => ({ id: t.id, nome: t.nome, ozmapM: t.ozmapM, coords: t.coords })) };
    const all = [...vs, current];
    const opts = all.map((v, i) => [i, `v${v.numero} · ${U.date(v.at)} · ${v.motivo}`]);
    ui.modal({
      title: 'Versões do traçado — ' + link.nome, wide: true,
      body: vs.length ? `<div class="filters">${ui.field('Versão A', ui.select('va', opts, Math.max(0, all.length - 2)), '', 'wide')}${ui.field('Versão B', ui.select('vb', opts, all.length - 1), '', 'wide')}<button class="btn sm" id="snap">${ui.icon('layers')}Salvar versão agora</button></div><div id="vdiff"></div>` : `<p>Nenhuma versão registrada ainda. As versões são criadas automaticamente quando a distância OZmap ou o traçado (KMZ) de um trecho mudam.</p><button class="btn primary" id="snap">${ui.icon('layers')}Salvar versão atual</button>`,
      onOpen: (b) => {
        U.$('#snap', b).onclick = () => { snapshot(link, 'Versão manual'); ui.toast('Versão registrada.', 'ok'); b.closest('.modal-wrap').remove(); versionsModal(link); };
        const draw = () => {
          const A = all[+U.$('#va', b).value], B = all[+U.$('#vb', b).value];
          const ids = U.uniq([...A.trechos, ...B.trechos].map(t => t.id));
          const rows = ids.map(id => { const a = A.trechos.find(t => t.id === id), c = B.trechos.find(t => t.id === id); return { nome: (c || a).nome, a: a ? a.ozmapM : null, b: c ? c.ozmapM : null, st: !a ? 'Novo' : !c ? 'Removido' : a.ozmapM !== c.ozmapM ? 'Alterado' : JSON.stringify(a.coords) !== JSON.stringify(c.coords) ? 'Geometria alterada' : 'Igual' }; });
          const svg = drawPaths(A.trechos, B.trechos);
          U.$('#vdiff', b).innerHTML = `<div class="grid g2"><div class="table-scroll"><table class="tbl"><thead><tr><th>Trecho</th><th class="num">Versão A</th><th class="num">Versão B</th><th class="num">Δ</th><th>Situação</th></tr></thead><tbody>${rows.map(r => `<tr><td>${U.esc(r.nome)}</td><td class="num">${U.m(r.a, 0)}</td><td class="num">${U.m(r.b, 0)}</td><td class="num">${r.a != null && r.b != null ? U.m(r.b - r.a, 0) : '—'}</td><td>${r.st === 'Igual' ? ui.badge('verde', 'Igual') : ui.badge('amarelo', r.st)}</td></tr>`).join('')}</tbody></table></div><div>${svg}<p class="small muted"><span style="color:var(--fg-3)">━</span> Versão A &nbsp; <span style="color:var(--orange)">━</span> Versão B</p></div></div>`;
        };
        if (vs.length) { U.$('#va', b).onchange = draw; U.$('#vb', b).onchange = draw; draw(); }
      }
    });
  }
  function drawPaths(A, B) {
    const pts = [...A, ...B].flatMap(t => t.coords || []);
    if (!pts.length) return '<p class="muted small">Sem geometria nos trechos (importe um KMZ para comparar o desenho).</p>';
    const la = pts.map(p => p[0]), lo = pts.map(p => p[1]);
    const minLa = Math.min(...la), maxLa = Math.max(...la), minLo = Math.min(...lo), maxLo = Math.max(...lo);
    const W = 400, H = 260, pad = 14, sx = (W - 2 * pad) / ((maxLo - minLo) || 1e-6), sy = (H - 2 * pad) / ((maxLa - minLa) || 1e-6), s = Math.min(sx, sy);
    const path = (c) => c.map((p, i) => (i ? 'L' : 'M') + (pad + (p[1] - minLo) * s).toFixed(1) + ' ' + (H - pad - (p[0] - minLa) * s).toFixed(1)).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:100%;background:var(--surface-2);border-radius:8px">${A.filter(t => t.coords).map(t => `<path d="${path(t.coords)}" fill="none" stroke="var(--fg-3)" stroke-width="5" stroke-linecap="round" opacity=".5"/>`).join('')}${B.filter(t => t.coords).map(t => `<path d="${path(t.coords)}" fill="none" stroke="var(--orange)" stroke-width="2"/>`).join('')}</svg>`;
  }

  function render(el, params) {
    if (params.trechoId) { const t = store.get('trechos', params.trechoId); if (t) return renderDetail(el, store.get('links', t.linkId), t.id); }
    if (params.linkId) { const l = store.get('links', params.linkId); if (l) return renderDetail(el, l, null); }
    renderList(el);
  }
  FC.registerModule({ id: 'enlaces', order: 2, title: 'Enlaces', icon: 'link', group: 'main', field: true, render });
})(window.FC = window.FC || {});
