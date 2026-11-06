/* Módulo 12 — Sobre: Escola interativa do OTDR (visual educativo com personagens) */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui;
  let nivel = 'iniciante', mod = 0, quiz = null;

  /* ---------- Personagens (SVG) ---------- */
  const CHAR = {
    lia: { nome: 'Lia', papel: 'Técnica de campo', helmet: '#fe6218', shirt: '#01a09c', skin: '#c98e6b', hair: '#3b2416' },
    beto: { nome: 'Beto', papel: 'Engenheiro de redes', helmet: '#ffffff', shirt: '#002947', skin: '#8d5a3b', hair: '#1b1b1b' },
    pulso: { nome: 'Pulsinho', papel: 'Pulso de luz', light: true }
  };
  function person(k, mood = '') {
    const c = CHAR[k];
    if (c.light) return `<svg class="char pulse-char ${mood}" viewBox="0 0 120 140" aria-hidden="true"><defs><radialGradient id="pg" cx=".5" cy=".45"><stop offset="0" stop-color="#fffbe0"/><stop offset=".6" stop-color="#ffd23f"/><stop offset="1" stop-color="#fe6218"/></radialGradient></defs><g class="bob"><circle cx="60" cy="62" r="40" fill="url(#pg)"/><path d="M60 8v10M60 106v10M8 62h10M102 62h10M24 26l7 7M89 91l7 7M24 98l7-7M89 33l7-7" stroke="#ffb703" stroke-width="4" stroke-linecap="round"/><circle cx="47" cy="56" r="5" fill="#1d2b3a"/><circle cx="73" cy="56" r="5" fill="#1d2b3a"/><circle cx="49" cy="54" r="1.6" fill="#fff"/><circle cx="75" cy="54" r="1.6" fill="#fff"/><path d="M46 72q14 12 28 0" stroke="#1d2b3a" stroke-width="4" fill="none" stroke-linecap="round"/></g></svg>`;
    return `<svg class="char ${mood}" viewBox="0 0 120 170" aria-hidden="true"><g class="bob">
      <ellipse cx="60" cy="164" rx="34" ry="5" fill="rgba(0,0,0,.12)"/>
      <rect x="40" y="128" width="14" height="32" rx="6" fill="#2d3e50"/><rect x="66" y="128" width="14" height="32" rx="6" fill="#2d3e50"/>
      <path d="M30 92q30-14 60 0v44H30z" fill="${c.shirt}"/><rect x="30" y="112" width="60" height="6" fill="#ffd23f" opacity=".85"/>
      <g class="arm-wave"><rect x="86" y="92" width="12" height="38" rx="6" fill="${c.shirt}"/><circle cx="92" cy="132" r="7" fill="${c.skin}"/></g>
      <rect x="22" y="92" width="12" height="38" rx="6" fill="${c.shirt}"/><circle cx="28" cy="132" r="7" fill="${c.skin}"/>
      <circle cx="60" cy="62" r="27" fill="${c.skin}"/><path d="M34 58q2-22 26-24 24 2 26 24" fill="${c.hair}"/>
      <path d="M30 50q30-34 60 0z" fill="${c.helmet}" stroke="rgba(0,0,0,.15)"/><rect x="26" y="47" width="68" height="7" rx="3.5" fill="${c.helmet}" stroke="rgba(0,0,0,.15)"/>
      <circle cx="50" cy="64" r="3.6" fill="#1d2b3a"/><circle cx="70" cy="64" r="3.6" fill="#1d2b3a"/><path d="M50 76q10 8 20 0" stroke="#1d2b3a" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="44" cy="72" r="4" fill="#ff8a80" opacity=".35"/><circle cx="76" cy="72" r="4" fill="#ff8a80" opacity=".35"/></g></svg>`;
  }
  const say = (k, html, side = 'left') => `<div class="talk ${side}"><div class="who-c">${person(k)}<span class="nm">${CHAR[k].nome}<small>${CHAR[k].papel}</small></span></div><div class="bubble">${html}</div></div>`;
  const lvl = (b, a) => nivel === 'iniciante' ? b : a;

  /* ---------- Ilustrações ---------- */
  const otdrBox = (x = 10, y = 30) => `<g transform="translate(${x} ${y})"><rect width="110" height="80" rx="10" fill="#002947"/><rect x="10" y="10" width="62" height="42" rx="4" fill="#0e3a5c"/><path d="M14 22l8 2 4 10 3-4 8 3 30 12" stroke="#19bdb8" stroke-width="2" fill="none"/><circle cx="90" cy="20" r="6" fill="#fe6218"/><rect x="80" y="34" width="20" height="6" rx="3" fill="#01a09c"/><rect x="80" y="45" width="20" height="6" rx="3" fill="#01a09c"/><text x="14" y="70" fill="#9fc3d9" font-size="9" font-family="IBM Plex Mono, monospace">OTDR</text><rect x="106" y="34" width="10" height="12" rx="2" fill="#7d8c9a"/></g>`;
  const fiberScene = (events = true) => `<svg viewBox="0 0 700 160" class="scene" role="img" aria-label="OTDR enviando pulsos de luz pela fibra">${otdrBox(6, 40)}
    <path d="M122 80 H690" stroke="#c5d1db" stroke-width="14" stroke-linecap="round"/><path d="M122 80 H690" stroke="#ffd23f" stroke-width="3" stroke-dasharray="2 10" opacity=".55"/>
    ${events ? `<g><rect x="250" y="66" width="22" height="28" rx="4" fill="#01a09c"/><text x="261" y="120" text-anchor="middle" font-size="11" fill="currentColor">emenda</text></g><g><rect x="420" y="62" width="14" height="36" rx="2" fill="#fe6218"/><text x="427" y="120" text-anchor="middle" font-size="11" fill="currentColor">conector</text></g><g><path d="M560 80 q20 -40 40 0" stroke="#d7372b" stroke-width="5" fill="none"/><text x="580" y="120" text-anchor="middle" font-size="11" fill="currentColor">curva</text></g><text x="680" y="120" text-anchor="end" font-size="11" fill="currentColor">fim</text>` : ''}
    <circle class="photon" cx="130" cy="80" r="9" fill="#ffd23f"/><circle class="photon back" cx="680" cy="80" r="5" fill="#fe6218"/></svg>`;
  const ILLUS_TRACE = [
    { x: 40, y: 40, t: 'Conector de lançamento', d: 'Pico refletivo no início: luz refletida pelo conector do OTDR. Fica dentro da zona morta — por isso usamos bobina de lançamento.' },
    { x: 170, y: 86, t: 'Emenda por fusão', d: 'Degrau para baixo, sem pico: evento não refletivo. Boa fusão: tipicamente até 0,1 dB (siga o limite do projeto).' },
    { x: 300, y: 104, t: 'Conector intermediário', d: 'Pico + degrau: reflexão de Fresnel e perda de inserção. Refletância muito alta indica conector sujo ou danificado.' },
    { x: 420, y: 140, t: 'Macrocurvatura', d: 'Degrau não refletivo que fica maior em 1550/1625 nm do que em 1310 nm. Medir em dois comprimentos de onda ajuda a diferenciar de emenda.' },
    { x: 520, y: 152, t: 'Atenuação da fibra', d: 'Trecho reto e inclinado: inclinação = dB/km. Em monomodo, valores típicos ficam perto de 0,35 dB/km (1310) e 0,20 dB/km (1550).' },
    { x: 600, y: 120, t: 'Final de fibra', d: 'Pico final seguido de queda ao ruído. Pode ser o conector do POP de destino ou um rompimento — compare com a distância esperada.' }
  ];
  const traceSVG = () => `<svg viewBox="0 0 680 230" class="scene trace-svg" role="img" aria-label="Gráfico OTDR ilustrativo"><path d="M30 200 H660 M30 20 V200" stroke="currentColor" opacity=".35"/><text x="660" y="218" text-anchor="end" font-size="11" fill="currentColor">distância (km)</text><text x="34" y="16" font-size="11" fill="currentColor">dB</text>
    <path d="M32 60 L38 30 L44 62 L50 66 L170 80 L172 92 L300 98 L302 86 L306 110 L420 124 L422 140 L600 160 L602 112 L606 196 L660 199" stroke="#01a09c" stroke-width="2.5" fill="none" stroke-linejoin="round"/>
    ${ILLUS_TRACE.map((p, i) => `<g class="hot" data-hot="${i}" tabindex="0" role="button" aria-label="${p.t}"><circle cx="${p.x}" cy="${p.y}" r="13" fill="#fe6218" opacity=".18"/><circle cx="${p.x}" cy="${p.y}" r="6" fill="#fe6218"/><text x="${p.x}" y="${p.y - 16}" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">${i + 1}</text></g>`).join('')}</svg>`;
  const WAVES = [
    [1270, 'XGS-PON / 10G-EPON (subida)', 'Transmissão de subida (ONU → OLT) em redes PON de 10 Gbit/s. Aparece em OTDRs e filtros de sistemas específicos.', '#7b5cff'],
    [1310, 'Banda O', 'Maior atenuação (~0,33–0,35 dB/km), menos sensível a curvaturas e com dispersão cromática perto de zero. Boa para localizar emendas e conectores e para enlaces curtos. Também é a subida do GPON.', '#2a6fb5'],
    [1490, 'GPON (descida)', 'Descida (OLT → ONU) em GPON. Atenuação intermediária (~0,21–0,25 dB/km).', '#01a09c'],
    [1550, 'Banda C', 'Menor atenuação (~0,19–0,22 dB/km): ideal para longas distâncias. Mais sensível a macrocurvaturas — comparar com 1310 nm revela curvas.', '#0f9d6b'],
    [1577, 'XGS-PON (descida)', 'Descida em XGS-PON. Usado em sistemas e equipamentos específicos de PON 10G.', '#c98a00'],
    [1625, 'Banda L', 'Muito sensível a curvaturas. Usada em manutenção, inclusive em fibra ativa com filtros adequados.', '#fe6218'],
    [1650, 'Banda U', 'Monitoramento e testes com o serviço ativo (fibra acesa) em PON: fora das bandas de tráfego, com filtro de bloqueio no assinante.', '#d7372b']
  ];
  const EVENTS = [
    ['Emenda', 'Degrau não refletivo. A luz perde um pouco de energia na fusão.', 'splice'], ['Conector', 'Pico refletivo + perda. Limpe e inspecione antes de conectar!', 'conn'],
    ['Curva', 'Degrau não refletivo que cresce em 1550/1625 nm.', 'bend'], ['Reflexão', 'Pico causado por mudança de índice (vidro/ar): conectores, trincas, fim.', 'refl'],
    ['Atenuação', 'A inclinação do traço: perda distribuída ao longo da fibra (dB/km).', 'att'], ['Rompimento', 'Fim de fibra antes do esperado — compare com o OZmap!', 'break'], ['Final de fibra', 'Último evento: pico grande (ou queda direta) e depois só ruído.', 'end']
  ];
  const ERRORS = () => [
    ['Conector sujo', 'Refletância alta, perda maior e “fantasmas” no traço.', 'Inspecione com microscópio, limpe com caneta/lenço adequado e inspecione de novo antes de conectar.'],
    ['Má conexão', 'Traço ruidoso ou sem alcance; perda enorme no início.', 'Verifique encaixe, tipo de polimento (UPC × APC: nunca misture) e adaptador.'],
    ['Bobina de lançamento inadequada', 'Primeiro conector escondido na zona morta; não dá para medir o conector do POP.', 'Use bobina maior que a zona morta de atenuação para o pulso usado. Para medir o último conector, use bobina de recepção.'],
    ['Configuração incorreta', 'Pulso, alcance ou média inadequados: eventos somem ou o traço fica ruidoso.', lvl('Comece pelo modo automático e confira o resultado.', 'Pulso curto = mais resolução; pulso longo = mais alcance dinâmico. Aumente o tempo de média para reduzir ruído.')],
    ['Índice de refração inadequado', 'Distâncias erradas: o erro é proporcional (Δn/n).', 'Use o IOR do fabricante do cabo para o λ medido (ex.: ~1,467–1,468 em 1310/1550 nm). 0,1% de erro no IOR = 1 m a cada km.'],
    ['Zona morta', 'Eventos próximos “fundidos” em um só.', lvl('Depois de um pico forte o OTDR fica “cego” por alguns metros.', 'Zona morta de evento (distinguir dois refletivos) e de atenuação (medir perda do seguinte). Pulsos curtos reduzem ambas.')],
    ['Distância de medição incorreta', 'Alcance menor que a fibra: o fim não aparece; muito maior: resolução pior e mais tempo.', 'Ajuste o alcance para 1,5 a 2 vezes o comprimento esperado do enlace.']
  ];
  const QUIZ = {
    iniciante: [
      ['O que o OTDR mede?', ['A potência da fonte de luz', 'A luz que volta (retroespalhamento e reflexões) ao longo do tempo', 'A cor da fibra', 'A tensão elétrica do cabo'], 1, 'O OTDR envia pulsos e mede a luz que retorna; o tempo de retorno vira distância.'],
      ['Qual comprimento de onda tem menor atenuação em fibra monomodo?', ['1310 nm', '1550 nm', '850 nm', '1650 nm'], 1, 'Em 1550 nm a atenuação típica fica perto de 0,2 dB/km.'],
      ['Um pico no traço geralmente indica:', ['Emenda por fusão', 'Evento refletivo, como conector', 'Atenuação normal', 'Bateria fraca'], 1, 'Picos são reflexões de Fresnel: conectores, trincas, fim de fibra.'],
      ['Para que serve a bobina de lançamento?', ['Aumentar a potência', 'Tirar o primeiro conector da zona morta', 'Proteger contra chuva', 'Medir a temperatura'], 1, 'Com a bobina, o conector do POP fica fora da zona morta e pode ser avaliado.'],
      ['O que fazer antes de conectar o OTDR?', ['Nada', 'Inspecionar e limpar os conectores', 'Dobrar a fibra', 'Desligar o POP'], 1, 'Conector sujo é a causa mais comum de medição ruim.'],
      ['Se o fim de fibra aparece muito antes da distância do OZmap, pode ser:', ['Rompimento', 'Fibra mais comprida', 'Excesso de reserva', 'Normal sempre'], 0, 'Fim antecipado pode indicar rompimento; confirme com a distância esperada.'],
      ['Por que a distância do OTDR costuma ser maior que a do OZmap?', ['Erro do OTDR', 'Reservas, subidas, curvas e excesso de fibra no cabo', 'O OZmap mede em milhas', 'Por causa do conector'], 1, 'O OZmap mostra o traçado; a fibra real inclui sobras, subidas e o excesso da construção em hélice.']
    ],
    avancado: [
      ['Um erro de 0,2% no índice de refração gera, em 20 km, um erro de aproximadamente:', ['4 m', '40 m', '400 m', '0,4 m'], 1, 'Erro proporcional: 20 000 m × 0,002 = 40 m.'],
      ['Uma emenda mostra “ganho” de 0,08 dB num sentido. A melhor prática é:', ['Ignorar', 'Medir nos dois sentidos e usar a média', 'Refazer a fusão sempre', 'Trocar de λ'], 1, 'Ganho aparente vem da diferença de diâmetro de campo modal; a média bidirecional dá a perda real.'],
      ['Um evento com 0,05 dB em 1310 nm e 0,60 dB em 1550 nm sugere:', ['Conector sujo', 'Macrocurvatura', 'Fim de fibra', 'Emenda perfeita'], 1, 'Perda muito maior em λ longos é assinatura de curvatura.'],
      ['Aumentar a largura de pulso:', ['Aumenta a resolução', 'Aumenta a faixa dinâmica e a zona morta', 'Diminui o ruído sem custo', 'Não muda nada'], 1, 'Pulso longo = mais energia e alcance, porém zonas mortas maiores.'],
      ['Qual λ é mais usada para monitorar PON com serviço ativo?', ['1310 nm', '1490 nm', '1650 nm', '1550 nm'], 2, '1650 nm (banda U) fica fora das bandas de tráfego e é bloqueada por filtro.'],
      ['ORL baixo (ex.: 24 dB) indica:', ['Pouca reflexão total', 'Muita luz refletida de volta', 'Fibra curta', 'Emendas perfeitas'], 1, 'ORL é perda de retorno: quanto menor o número, mais reflexão.'],
      ['Para medir a perda do último conector do enlace você precisa de:', ['Bobina de recepção', 'Pulso de 20 µs', 'Fonte de luz visível', 'Índice 1,5'], 0, 'Sem bobina de recepção o último conector vira o fim de fibra e sua perda não é medida.'],
      ['Alcance (range) recomendado para um enlace de 12 km:', ['5 km', '20–25 km', '120 km', '1 km'], 1, 'Use 1,5 a 2× o comprimento esperado.']
    ]
  };

  const MODS = [
    ['O que é OTDR?', () => `${say('beto', lvl('<b>OTDR</b> é o “radar” da fibra óptica! Ele manda pulsinhos de luz e escuta o que volta. Pelo tempo que a luz leva para voltar, ele sabe <b>onde</b> está cada evento.', '<b>OTDR</b> (Optical Time Domain Reflectometer) injeta pulsos laser e mede, no domínio do tempo, o retroespalhamento de Rayleigh e as reflexões de Fresnel. Distância = (c × t) / (2 × n), com n = índice de grupo.'))}
      ${say('pulso', 'Eu sou o Pulsinho! Eu saio do OTDR, corro pela fibra e uma parte de mim sempre volta — por isso o equipamento “enxerga” a fibra inteira de uma ponta só.', 'right')}<div class="illus">${fiberScene(false)}</div>
      ${say('lia', lvl('Com o OTDR eu descubro <b>emendas, conectores, curvas e rompimentos</b> — e a distância de cada um!', 'Com um único acesso obtemos comprimento, atenuação por seção, perda e refletância por evento, ORL e o fim de fibra.'))}`],
    ['Como funciona a medição?', () => `<div class="illus">${fiberScene(true)}</div>${say('pulso', 'Olha eu passando! Em cada emenda perco um pouquinho de energia; no conector, parte de mim reflete de volta (é o pico no gráfico).', 'right')}
      ${say('lia', lvl('Passo a passo: 1) limpar e inspecionar o conector; 2) ligar a bobina de lançamento; 3) escolher o λ; 4) usar o modo automático ou ajustar pulso e alcance; 5) salvar o arquivo <b>.SOR</b> com o nome do trecho.', '1) Inspeção IEC 61300-3-35; 2) bobina de lançamento (e recepção para o último conector); 3) λ conforme o objetivo; 4) pulso, alcance (1,5–2× L), IOR do cabo, tempo de média; 5) medição bidirecional quando houver ganhos aparentes; 6) salvar .SOR com identificação padronizada.'))}
      ${say('beto', 'No FiberControl, ao importar o .SOR, o sistema lê a identificação do teste (cabo, locais A/B) e monta o enlace automaticamente.')}`],
    ['Comprimentos de onda', () => `${say('beto', 'A escolha do comprimento de onda <b>depende da aplicação, da tecnologia e do equipamento</b>. Toque em cada cor para saber mais.')}<div class="waves">${WAVES.map((w, i) => `<button class="wave" data-w="${i}" style="--c:${w[3]}"><b>${w[0]} nm</b><span>${w[1]}</span></button>`).join('')}</div><div id="wtxt" class="bubble solo">${WAVES[1][2]}</div>`],
    ['Identificação de eventos', () => `${say('lia', 'Cada evento tem um “jeitinho” no gráfico. Toque nos cartões!')}<div class="grid g-auto">${EVENTS.map((e, i) => `<button class="evcard" data-e="${i}">${evIcon(e[2])}<b>${e[0]}</b><span class="small">${e[1]}</span></button>`).join('')}</div>${say('beto', lvl('Dica: pico = refletivo (conector, trinca, fim). Degrau sem pico = não refletivo (emenda, curva).', 'Classificação SR-4731: código 0 = não refletivo, 1 = refletivo, 2 = refletivo saturado; segunda letra E = fim de fibra. Perdas negativas em emendas exigem média bidirecional.'), 'right')}`],
    ['Como interpretar o gráfico OTDR?', () => `${say('pulso', 'Este é o meu “diário de viagem”! Clique nos pontos laranja.', 'right')}<div class="illus">${traceSVG()}</div><div id="htxt" class="bubble solo"><b>Clique em um ponto numerado</b> para ver a explicação.</div>`],
    ['Erros comuns em campo', () => `${say('lia', 'Já errei muito isso aqui... aprenda com meus tropeços!')}<div class="grid g2">${ERRORS().map(e => `<div class="errcard"><b>${ui.icon('alert')} ${e[0]}</b><p class="small"><span class="muted">Sintoma:</span> ${e[1]}</p><p class="small"><span class="ok-text">Como evitar:</span> ${e[2]}</p></div>`).join('')}</div>`],
    ['OTDR × OZmap', () => `${say('beto', 'O <b>OZmap</b> mostra a distância do <b>traçado no mapa</b>. O <b>OTDR</b> mede a <b>fibra real</b>. Eles quase nunca são iguais!')}
      <div class="illus"><svg viewBox="0 0 700 170" class="scene"><path d="M30 120 L670 120" stroke="#2a6fb5" stroke-width="3" stroke-dasharray="8 6"/><text x="350" y="150" text-anchor="middle" font-size="12" fill="currentColor">Traçado OZmap (linha no mapa)</text>
      <path d="M30 70 L120 70 Q130 30 140 70 L240 70 q8 -40 16 0 q8 40 16 0 L360 70 L380 30 L400 70 L520 70 q10 -45 20 0 L670 70" stroke="#fe6218" stroke-width="4" fill="none"/><text x="350" y="22" text-anchor="middle" font-size="12" fill="currentColor">Cabo real: subidas em postes, reservas técnicas, curvas e desvios</text>
      <text x="130" y="96" font-size="10" text-anchor="middle" fill="currentColor">subida</text><text x="264" y="100" font-size="10" text-anchor="middle" fill="currentColor">reserva</text><text x="390" y="96" font-size="10" text-anchor="middle" fill="currentColor">desvio</text></svg></div>
      ${say('lia', lvl('Por isso a gente define uma <b>tolerância</b>: até alguns % de diferença é normal. Acima disso, vale revisar o traçado ou procurar reservas não cadastradas.', 'Além das sobras de campo, a fibra é mais longa que o cabo (excesso de fibra/EFL da construção em tubo loose). O FiberControl calcula o fator médio OTDR ÷ OZmap por tipo de trecho e só aplica após aprovação.'), 'right')}`],
    ['Quiz técnico', () => quizHTML()]
  ];
  function evIcon(k) {
    const p = { splice: 'M5 20 H30 V30 H60', conn: 'M5 20 H28 L32 4 L36 26 H60', bend: 'M5 18 H30 Q34 18 36 30 H60', refl: 'M5 22 H28 L32 2 L36 22 H60', att: 'M5 6 L60 30', break: 'M5 12 H36 L38 2 L40 34 H60', end: 'M5 10 H40 L42 2 L45 34 L60 35' }[k];
    return `<svg viewBox="0 0 65 38" class="evsvg"><path d="${p}" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linejoin="round"/></svg>`;
  }
  function quizHTML() {
    const Q = QUIZ[nivel];
    if (!quiz || quiz.nivel !== nivel) quiz = { nivel, i: 0, pts: 0, ans: null };
    if (quiz.i >= Q.length) {
      const pct = quiz.pts / Q.length * 100;
      try { const best = JSON.parse(localStorage.getItem('fc-quiz') || '{}'); best[nivel] = Math.max(best[nivel] || 0, quiz.pts); localStorage.setItem('fc-quiz', JSON.stringify(best)); } catch (e) { /* */ }
      return `${say(pct >= 70 ? 'lia' : 'beto', `<b>Fim do quiz!</b> Você acertou <b>${quiz.pts} de ${Q.length}</b> (${Math.round(pct)}%). ${pct >= 85 ? 'Excelente — pronto para a certificação de campo!' : pct >= 60 ? 'Bom resultado! Revise os módulos dos erros.' : 'Vamos revisar os módulos e tentar de novo?'}`)}<button class="btn primary" id="qre">Refazer quiz</button>`;
    }
    const [q, opts, ok, exp] = Q[quiz.i];
    return `<div class="quiz"><div class="steps"><span class="tag">Pergunta ${quiz.i + 1} de ${Q.length}</span><span class="tag">Pontos: ${quiz.pts}</span><span class="tag">${nivel === 'iniciante' ? 'Iniciante' : 'Avançado'}</span></div>
      ${say('beto', `<b>${q}</b>`)}<div class="qopts">${opts.map((o, i) => `<button class="qopt ${quiz.ans != null ? (i === ok ? 'right' : i === quiz.ans ? 'wrong' : '') : ''}" data-q="${i}" ${quiz.ans != null ? 'disabled' : ''}>${String.fromCharCode(65 + i)}) ${o}</button>`).join('')}</div>
      ${quiz.ans != null ? `${say(quiz.ans === ok ? 'lia' : 'pulso', `${quiz.ans === ok ? '<b>Acertou!</b> ' : '<b>Quase!</b> '}${exp}`, 'right')}<button class="btn primary" id="qnx">${quiz.i + 1 < Q.length ? 'Próxima pergunta' : 'Ver resultado'}</button>` : ''}</div>`;
  }

  function render(el) {
    el.innerHTML = `<style>${CSS}</style><div class="school">
      <header class="school-hero"><div><span class="eyebrow" style="color:#ffd23f">Sobre · Escola ClickIP</span><h1>Escola interativa do OTDR</h1><p>Aprenda a medir e interpretar enlaces com a Lia, o Beto e o Pulsinho.</p>
        <div class="seg" role="group" aria-label="Nível"><button class="${nivel === 'iniciante' ? 'on' : ''}" data-n="iniciante">Treinamento para iniciantes</button><button class="${nivel === 'avancado' ? 'on' : ''}" data-n="avancado">Profissionais avançados</button></div></div>
        <div class="hero-chars">${person('lia')}${person('pulso')}${person('beto')}</div></header>
      <nav class="mods">${MODS.map((m, i) => `<button class="${i === mod ? 'on' : ''}" data-m="${i}"><span>Módulo ${i + 1}</span>${m[0]}</button>`).join('')}</nav>
      <section class="lesson"><h2>Módulo ${mod + 1} — ${MODS[mod][0]}</h2><div id="lesson">${MODS[mod][1]()}</div>
        <div class="btn-row" style="justify-content:space-between"><button class="btn" id="prev" ${mod ? '' : 'disabled'}>← Anterior</button><button class="btn primary" id="next" ${mod < MODS.length - 1 ? '' : 'disabled'}>Próximo módulo →</button></div></section>
      <section class="about-sys panel"><header><h3>Sobre o ClickIP FiberControl</h3></header><p class="small">Plataforma da ClickIP para gerenciamento, análise e certificação de enlaces de fibra óptica, integrando testes OTDR (ex.: Viavi SmartOTDR, arquivos SR-4731 .SOR) e o traçado do OZmap. Versão 1.0.</p></section></div>`;
    U.$$('[data-n]', el).forEach(b => b.onclick = () => { nivel = b.dataset.n; quiz = null; render(el); });
    U.$$('[data-m]', el).forEach(b => b.onclick = () => { mod = +b.dataset.m; render(el); });
    U.$('#prev', el).onclick = () => { mod--; render(el); };
    U.$('#next', el).onclick = () => { mod++; render(el); };
    const L = U.$('#lesson', el);
    L.onclick = (e) => {
      const w = e.target.closest('[data-w]'); if (w) { U.$$('.wave', L).forEach(x => x.classList.remove('on')); w.classList.add('on'); const d = WAVES[+w.dataset.w]; U.$('#wtxt', L).innerHTML = `<b>${d[0]} nm — ${d[1]}</b><br>${d[2]}`; }
      const h = e.target.closest('[data-hot]'); if (h) { const d = ILLUS_TRACE[+h.dataset.hot]; U.$$('.hot', L).forEach(x => x.classList.remove('on')); h.classList.add('on'); U.$('#htxt', L).innerHTML = `<b>${+h.dataset.hot + 1}. ${d.t}</b><br>${d.d}`; }
      const ev = e.target.closest('[data-e]'); if (ev) { U.$$('.evcard', L).forEach(x => x.classList.remove('on')); ev.classList.add('on'); }
      const q = e.target.closest('[data-q]'); if (q && quiz.ans == null) { quiz.ans = +q.dataset.q; if (quiz.ans === QUIZ[nivel][quiz.i][2]) quiz.pts++; L.innerHTML = quizHTML(); }
      if (e.target.id === 'qnx') { quiz.i++; quiz.ans = null; L.innerHTML = quizHTML(); }
      if (e.target.id === 'qre') { quiz = null; L.innerHTML = quizHTML(); }
    };
    L.onkeydown = (e) => { if (e.key === 'Enter' && e.target.closest('[data-hot]')) e.target.closest('[data-hot]').dispatchEvent(new MouseEvent('click', { bubbles: true })); };
  }

  /* Identidade visual própria da escola (mais lúdica), ainda nas cores da marca */
  const CSS = `
  .school { --sch-bg: #fff8ec; --sch-ink: #1d2b3a; --sch-card: #ffffff; --sch-line: #f1dfc4; display: flex; flex-direction: column; gap: 16px; font-family: 'Nunito', var(--font-body) }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .school { --sch-bg: #1b1610; --sch-ink: #f3e9da; --sch-card: #241d15; --sch-line: #3c3022 } }
  :root[data-theme="dark"] .school { --sch-bg: #1b1610; --sch-ink: #f3e9da; --sch-card: #241d15; --sch-line: #3c3022 }
  .school h1, .school h2 { font-family: 'Baloo 2', var(--font-display); }
  .school-hero { background: linear-gradient(135deg, #002947 0%, #014a63 60%, #01a09c 100%); color: #eaf6f6; border-radius: 18px; padding: 22px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center; overflow: hidden }
  .school-hero h1 { color: #fff; font-size: 2rem } .school-hero p { margin: 6px 0 14px }
  .school-hero .seg button { font-family: inherit }
  .hero-chars { display: flex; align-items: flex-end; gap: 4px } .hero-chars .char { width: 92px; height: auto }
  .mods { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px }
  .mods button { flex: none; text-align: left; border: 2px solid var(--sch-line); background: var(--sch-card); color: var(--sch-ink); border-radius: 14px; padding: 9px 13px; cursor: pointer; font: 700 .86rem 'Nunito', var(--font-body); display: flex; flex-direction: column }
  .mods button span { font-size: .68rem; color: #c98a00; text-transform: uppercase; letter-spacing: .08em }
  .mods button.on { border-color: #fe6218; background: #fe6218; color: #fff } .mods button.on span { color: #ffe1cf }
  .lesson { background: var(--sch-bg); color: var(--sch-ink); border-radius: 18px; padding: 20px; display: flex; flex-direction: column; gap: 14px; border: 2px solid var(--sch-line) }
  .lesson h2 { color: var(--sch-ink) } .lesson #lesson { display: flex; flex-direction: column; gap: 14px }
  .talk { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 12px; align-items: end } .talk.right { grid-template-columns: minmax(0, 1fr) 96px } .talk.right .who-c { order: 2 }
  .who-c { display: flex; flex-direction: column; align-items: center } .who-c .char { width: 86px; height: auto } .who-c .nm { font-weight: 800; font-size: .8rem; text-align: center; line-height: 1.1 } .who-c .nm small { display: block; font-weight: 600; opacity: .65; font-size: .68rem }
  .bubble { background: var(--sch-card); border: 2px solid var(--sch-line); border-radius: 18px; padding: 13px 16px; position: relative; font-size: .95rem; line-height: 1.55; min-width: 0 }
  .talk.left .bubble { border-bottom-left-radius: 4px } .talk.right .bubble { border-bottom-right-radius: 4px }
  .bubble.solo { border-color: #01a09c }
  .illus { background: var(--sch-card); border: 2px solid var(--sch-line); border-radius: 16px; padding: 10px; overflow-x: auto; color: var(--sch-ink) }
  .scene { width: 100%; min-width: 520px; height: auto; display: block }
  .photon { animation: run 3.2s linear infinite } .photon.back { animation: back 3.2s linear infinite; opacity: .8 }
  @keyframes run { 0% { transform: translateX(0); opacity: 1 } 90% { opacity: 1 } 100% { transform: translateX(550px); opacity: 0 } }
  @keyframes back { 0%, 45% { transform: translateX(0); opacity: 0 } 50% { opacity: .9 } 100% { transform: translateX(-550px); opacity: 0 } }
  .bob { animation: bob 2.8s ease-in-out infinite; transform-origin: center bottom } @keyframes bob { 50% { transform: translateY(-3px) } }
  .arm-wave { animation: wave 2.4s ease-in-out infinite; transform-origin: 92px 96px } @keyframes wave { 0%, 60%, 100% { transform: rotate(0) } 70% { transform: rotate(-30deg) } 80% { transform: rotate(-10deg) } 90% { transform: rotate(-28deg) } }
  .pulse-char .bob { animation-duration: 1.6s }
  .waves { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px }
  .wave { border: 2px solid var(--c); background: var(--sch-card); color: var(--sch-ink); border-radius: 14px; padding: 10px; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 3px; font-family: inherit; box-shadow: inset 6px 0 0 var(--c) }
  .wave b { font-size: 1.05rem } .wave span { font-size: .76rem; opacity: .8 } .wave.on { background: var(--c); color: #fff }
  .evcard { border: 2px solid var(--sch-line); background: var(--sch-card); color: var(--sch-ink); border-radius: 14px; padding: 12px; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 6px; font-family: inherit; transition: transform .15s }
  .evcard:hover, .evcard.on { transform: translateY(-3px); border-color: #fe6218 } .evsvg { width: 100%; height: 44px; color: #01a09c }
  .errcard { background: var(--sch-card); border: 2px solid var(--sch-line); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 6px } .errcard b { display: flex; gap: 6px; align-items: center; color: #d7372b }
  .trace-svg .hot { cursor: pointer } .trace-svg .hot:hover circle:first-child, .trace-svg .hot.on circle:first-child { opacity: .5 }
  .qopts { display: grid; gap: 8px } .qopt { text-align: left; border: 2px solid var(--sch-line); background: var(--sch-card); color: var(--sch-ink); border-radius: 12px; padding: 12px 14px; font: 600 .95rem 'Nunito', var(--font-body); cursor: pointer }
  .qopt:hover:not(:disabled) { border-color: #01a09c } .qopt.right { border-color: #0f9d6b; background: #0f9d6b; color: #fff } .qopt.wrong { border-color: #d7372b; background: #d7372b; color: #fff }
  .quiz { display: flex; flex-direction: column; gap: 12px }
  @media (max-width: 700px) { .school-hero { grid-template-columns: 1fr } .hero-chars .char { width: 64px } .talk, .talk.right { grid-template-columns: 64px minmax(0, 1fr) } .talk.right .who-c { order: 0 } .who-c .char { width: 60px } }
  @media (prefers-reduced-motion: reduce) { .photon, .bob, .arm-wave { animation: none } }`;

  FC.registerModule({ id: 'sobre', order: 12, title: 'Sobre · Escola OTDR', icon: 'school', group: 'main', field: true, render });
})(window.FC = window.FC || {});
