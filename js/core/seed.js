/* ClickIP FiberControl — dados de DEMONSTRAÇÃO (todos marcados demo:true e removíveis em Configurações) */
(function (FC) {
  'use strict';
  const U = FC.util;

  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const hav = (a, b) => { const R = 6371000, r = Math.PI / 180; const dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  FC.geo = { hav, pathLen: (pts) => pts.slice(1).reduce((s, p, i) => s + hav(pts[i], p), 0) };

  const POPS = {
    'POP-CTB-CENTRO': [-25.4296, -49.2713], 'POP-CTB-BATEL': [-25.4420, -49.2890], 'POP-CTB-PORTAO': [-25.4760, -49.2930], 'POP-CTB-CIC': [-25.4960, -49.3480],
    'POP-PGO-CENTRO': [-25.0950, -50.1619], 'POP-PGO-UVARANAS': [-25.0890, -50.1180], 'POP-CRB-CENTRO': [-24.9520, -50.0980],
    'POP-LDA-CENTRO': [-23.3045, -51.1696], 'POP-LDA-GLEBA': [-23.3330, -51.1350]
  };

  FC.seedDemo = (adminId) => {
    const st = FC.store.state, r = rng(4731);
    const users = [
      ['Carla Menezes', 'carla.menezes@clickip.demo', 'engenheiro'], ['Juliana Prado', 'juliana.prado@clickip.demo', 'supervisor'],
      ['Rafael Souza', 'rafael.souza@clickip.demo', 'tecnico'], ['Diego Lima', 'diego.lima@clickip.demo', 'tecnico'], ['Marcos Vieira', 'marcos.vieira@clickip.demo', 'visualizador']
    ].map(([nome, email, role]) => ({ id: U.uid('usr_'), nome, email, role, ativo: true, demo: true, createdAt: U.now() }));
    st.users.push(...users);
    const tecs = users.filter(u => u.role === 'tecnico').map(u => u.nome);

    const links = [
      ['POP-CTB-CENTRO', 'POP-CTB-BATEL', 'Anel Metropolitano CTB', 'Curitiba', 'CB-CTB-001', 'CFOA-SM-AS80 48F', 48, ['Aéreo', 'Aéreo', 'Subterrâneo']],
      ['POP-CTB-BATEL', 'POP-CTB-PORTAO', 'Anel Metropolitano CTB', 'Curitiba', 'CB-CTB-002', 'CFOA-SM-AS80 48F', 48, ['Aéreo', 'Misto', 'Aéreo']],
      ['POP-CTB-PORTAO', 'POP-CTB-CIC', 'Anel Metropolitano CTB', 'Curitiba', 'CB-CTB-003', 'CFOA-SM-DD 48F', 48, ['Subterrâneo', 'Subterrâneo', 'Aéreo', 'Aéreo']],
      ['POP-PGO-CENTRO', 'POP-PGO-UVARANAS', 'Backbone Campos Gerais', 'Campos Gerais', 'CB-PGO-010', 'CFOA-SM-AS120 48F', 48, ['Aéreo', 'Aéreo']],
      ['POP-PGO-UVARANAS', 'POP-CRB-CENTRO', 'Backbone Campos Gerais', 'Campos Gerais', 'CB-PGO-011', 'CFOA-SM-AS120 36F', 36, ['Aéreo', 'Aéreo', 'Aéreo']],
      ['POP-LDA-CENTRO', 'POP-LDA-GLEBA', 'Expansão Norte', 'Norte', 'CB-LDA-020', 'CFOA-SM-AS80 24F', 24, ['Aéreo', 'Misto']]
    ];
    const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
    links.forEach(([a, b, projeto, regiao, caboId, tipoCabo, fo, tipos], li) => {
      const link = { id: U.uid('lnk_'), nome: `${a} x ${b}`, popA: a, popB: b, caboId, tipoCabo, fibras: fo, projeto, regiao, responsavel: li % 2 ? 'Carla Menezes' : 'Juliana Prado', criadoEm: `2026-0${4 + (li % 3)}-1${li}T10:00:00.000Z`, obs: '', demo: true, origem: 'Demonstração' };
      st.links.push(link);
      const A = POPS[a], B = POPS[b], n = tipos.length;
      let prev = A;
      tipos.forEach((tipo, k) => {
        const end = k === n - 1 ? B : [A[0] + (B[0] - A[0]) * (k + 1) / n + (r() - .5) * .004, A[1] + (B[1] - A[1]) * (k + 1) / n + (r() - .5) * .004];
        const pts = [prev];
        for (let j = 1; j < 6; j++) pts.push([prev[0] + (end[0] - prev[0]) * j / 6 + (r() - .5) * .0025, prev[1] + (end[1] - prev[1]) * j / 6 + (r() - .5) * .0025]);
        pts.push(end); prev = end;
        const oz = Math.round(FC.geo.pathLen(pts));
        let cabo = fo, conectado = null;
        if (li === 2 && k === 3) { cabo = 24; }
        if (li === 4 && k === 2) { conectado = 12; }
        if (li === 1 && k === 1) { conectado = 24; }
        const t = {
          id: U.uid('tr_'), linkId: link.id, ordem: k + 1, nome: `T${String(k + 1).padStart(2, '0')}`, tipo, ozmapM: oz, caboFO: cabo, caboConectadoFO: conectado,
          fibrasRestantes: [14, 22, 6, 0, 3, 30, 18, 9, 2, 26, 12, 4, 20, 8, 16, 1, 24][(li * 4 + k) % 17], emendas: 2 + Math.floor(r() * 4), conectores: 2,
          caixa: `CEO-${caboId.split('-')[1]}-${String(li * 10 + k + 1).padStart(3, '0')}`, coords: pts, wavelength: 1550, demo: true, obs: ''
        };
        if (conectado) t.entronqueLocal = t.caixa + ' (derivação)';
        st.trechos.push(t);

        // medições (algumas pendentes)
        if ((li + k) % 5 === 4) return;
        const ratio = tipo === 'Subterrâneo' ? 1.025 + r() * .02 : tipo === 'Misto' ? 1.035 + r() * .025 : 1.04 + r() * .03;
        const L = Math.round(oz * ((li === 4 && k === 1) ? 1.142 : (li === 1 && k === 2) ? 1.088 : ratio));
        const mk = (date, extraLoss, extraEvent) => {
          const evs = [{ n: 1, distM: 0, loss: 0.21, reflectance: -52.3, kind: 'refletivo', end: false, slope: 0 }];
          let d = 0, idx = 2;
          for (let s = 0; s < t.emendas; s++) { d += L / (t.emendas + 1) * (0.8 + r() * .4); evs.push({ n: idx++, distM: Math.round(d), loss: +(0.02 + r() * .09).toFixed(3), reflectance: 0, kind: 'nao-refletivo', end: false, slope: 0.21 }); }
          if (extraEvent) { evs.push({ n: idx++, distM: Math.round(L * .63), loss: extraEvent, reflectance: 0, kind: 'nao-refletivo', end: false, slope: 0.21 }); evs.sort((x, y) => x.distM - y.distM); evs.forEach((e, i) => e.n = i + 1); idx = evs.length + 1; }
          evs.push({ n: idx, distM: L, loss: 0, reflectance: -14.2, kind: 'refletivo', end: true, slope: 0.21 });
          const total = +(L / 1000 * (0.205 + r() * .02) + evs.reduce((s, e) => s + (e.end || e.n === 1 ? 0 : e.loss), 0) + 0.25 + extraLoss).toFixed(3);
          return { id: U.uid('med_'), trechoId: t.id, linkId: link.id, data: date, importedAt: date, responsavel: tecs[(li + k) % tecs.length], source: 'DEMO', fileName: `${caboId}_${t.nome}_1550.sor`, wavelength: 1550, lengthM: L, launchM: 0, receiveM: 0, totalLoss: total, totalLossOrigin: 'arquivo', orl: +(31 + r() * 9).toFixed(2), ior: 1.4682, pulseNs: 100, events: evs, extracted: ['Demonstração'], demo: true };
        };
        const mo = months[(li + k) % 6];
        const m1 = mk(`${mo}-${String(5 + k * 3).padStart(2, '0')}T14:20:00.000Z`, 0, null);
        st.measurements.push(m1);
        if ((li === 0 && k === 1) || (li === 3 && k === 0)) {
          const m2 = mk(`2026-10-2${k}T09:10:00.000Z`, li === 0 ? 0.82 : 0.12, li === 0 ? 0.78 : null);
          m2.obs = li === 0 ? 'Remedição após rompimento por queda de árvore; nova fusão registrada.' : 'Remedição preventiva';
          st.measurements.push(m2);
          st.maintenance.push({ id: U.uid('man_'), trechoId: t.id, linkId: link.id, data: m2.data, tipo: li === 0 ? 'Rompimento' : 'Inspeção', descricao: li === 0 ? 'Cabo rompido por queda de árvore. Emenda de 48 fibras em nova CEO.' : 'Limpeza de conectores no DIO do POP.', responsavel: m2.responsavel, fusoes: li === 0 ? 48 : 0, demo: true, createdAt: m2.data });
        }
        // certificações
        const cmpOk = L / oz < 1.06;
        if (cmpOk && (li + k) % 3 === 0 && !(li === 0 && k === 1)) {
          t.certificacao = { status: 'certificado', data: `${mo}-2${k}T16:00:00.000Z`, aprovador: 'Carla Menezes', obs: 'Certificado conforme parâmetros do projeto.', assinaturaHash: 'demo', medicaoId: m1.id };
        }
      });
    });
    st.meta.demo = true;
    const now = Date.now();
    [['importou', 'measurements', 'Lote de 4 testes OTDR (demo)', 'Rafael Souza'], ['certificou', 'trechos', 'POP-CTB-CENTRO x POP-CTB-BATEL / T01', 'Carla Menezes'], ['editou', 'settings', 'Tolerância aérea 6%', 'Carla Menezes'], ['criou', 'links', 'POP-LDA-CENTRO x POP-LDA-GLEBA', 'Juliana Prado'], ['importou', 'measurements', 'CB-PGO-010_T01_1550.sor (demo)', 'Diego Lima']]
      .forEach(([acao, entidade, detalhe, user], i) => st.audit.push({ id: U.uid('aud_'), at: new Date(now - (i + 1) * 3600e3 * 7).toISOString(), user, acao, entidade, detalhe, demo: true }));
    FC.store.save();
  };

  FC.removeDemo = async () => {
    const st = FC.store.state;
    ['links', 'trechos', 'measurements', 'maintenance', 'audit', 'attachments'].forEach(c => st[c] = st[c].filter(x => !x.demo));
    st.users = st.users.filter(u => !u.demo);
    st.meta.demo = false;
    FC.store.audit('excluiu', 'demo', null, 'Dados de demonstração removidos');
    FC.store.save();
  };
})(window.FC = window.FC || {});
