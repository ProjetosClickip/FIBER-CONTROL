/* ClickIP FiberControl — configuração padrão, perfis de acesso e registro de módulos */
(function (FC) {
  'use strict';

  /** Todos os valores técnicos abaixo são PADRÕES EDITÁVEIS em Configurações (nenhum é fixo). */
  FC.defaults = {
    theme: 'auto',
    fieldMode: false,
    tolerance: {
      max: 5,            // % de diferença máxima OTDR × OZmap (VERMELHO acima disso)
      attention: 2,      // largura da faixa AMARELA abaixo do máximo (ex.: 3% a 5%)
      byType: {          // tolerância específica por tipo de trecho
        'Aéreo': { max: 6, attention: 2 },
        'Subterrâneo': { max: 4, attention: 1.5 },
        'Misto': { max: 5, attention: 2 }
      },
      allowPerLink: true // permite tolerância individual por enlace
    },
    budget: {
      wavelengths: {
        1310: { att: 0.35 }, 1490: { att: 0.25 }, 1550: { att: 0.22 }, 1625: { att: 0.25 }, 1650: { att: 0.30 }, 1270: { att: 0.40 }, 1577: { att: 0.22 }
      },
      splice: 0.10, connector: 0.50,
      components: [
        { id: 'c1', nome: 'Splitter 1:2', perda: 3.7, ativo: false },
        { id: 'c2', nome: 'Splitter 1:8', perda: 10.5, ativo: false },
        { id: 'c3', nome: 'Atenuador fixo 5 dB', perda: 5.0, ativo: false }
      ],
      toleranceDb: 0.5,   // medido pode exceder o previsto até este valor (ATENÇÃO); acima = REPROVADO
      systemBudget: 25,   // orçamento do sistema óptico (Tx - sensibilidade Rx), dB
      safetyMargin: 3     // margem de segurança, dB
    },
    otdr: {
      splice: { excelente: 0.05, ok: 0.15, atencao: 0.30 },
      connector: { excelente: 0.30, ok: 0.50, atencao: 0.75 },
      reflectance: { ok: -45, atencao: -35 },  // conectores; acima (menos negativo) = pior
      orl: { ok: 30, atencao: 27 },            // dB; abaixo = pior
      gainWarn: -0.05,                         // "ganho" aparente < -0,05 dB => sugerir medição bidirecional
      endBeforeOzmapPct: 10                    // fim de fibra 10% antes do OZmap => possível rompimento
    },
    fibers: { min: 6, column: '48FO (RESTANTE)', capacities: [6, 12, 24, 36, 48, 72, 96, 144], reference: 48 },
    certification: {
      requireMeasurement: true, requireAttachment: true, requireComparisonOk: true, allowAttention: true,
      requireBudgetOk: true, requireChecklist: false, requireSignature: true
    },
    history: { lossWorsenDb: 0.5, eventMatchM: 25 },
    boxes: { matchM: 60, matchPct: 2, maxOffRouteM: 150 },
    // Códigos dos POPs usados nos testes OTDR (lista enviada pela ClickIP em 10/11/2026) → nome do POP no KMZ do OZmap
    popAliases: [
      { codigo: 'SEA', pop: 'POP-SANTA_ETELVINA' },
      { codigo: 'VM2', pop: 'POP-VIVER_MELHOR2' },
      { codigo: 'VM3', pop: 'POP-VIVER_MELHOR3' },
      { codigo: 'TTS', pop: 'POP-TORQUATO' },
      { codigo: 'MOS', pop: 'POP-MONTE_DAS_OLIVEIRAS' },
      { codigo: 'NCE', pop: 'POP NOVA CIDADE' },
      { codigo: 'DT2', pop: 'POP DISTRITO 2 -  DT2' },
      { codigo: 'GVA', pop: 'POP-GRANDE_VITORIA' },
      { codigo: 'TRA', pop: 'POP-TARUMÃ' },
      { codigo: 'JTA', pop: 'POP-JORGE_TEIXEIRA' },
      { codigo: 'RDE', pop: 'POP - RIACHO DOCE' },
      { codigo: 'CDS', pop: 'POP CIDADE DE DEUS (CDS)' },
      { codigo: 'JPO', pop: 'POP-JOAO_PAULO' },
      { codigo: 'NAO', pop: 'POP-NOVO_ALEIXO' },
      { codigo: 'SJ2', pop: 'POP SÃO JOSE - 2', obs: 'Inlink' },
      { codigo: 'SJ1', pop: 'POP-SAO_JOSE - 1' },
      { codigo: 'CAO', pop: 'POP-COLONIA_ANTONIO_ALEIXO' },
      { codigo: 'AMS', pop: 'POP ARMANDO MENDES NOVO' },
      { codigo: 'CPA', pop: '', obs: 'A confirmar' },
      { codigo: 'RDV', pop: 'POP -RODOVIÁRIA' },
      { codigo: 'FLR', pop: 'POP FLORES - FLR' },
      { codigo: 'EMA', pop: 'POP ELIZA MIRANDA' },
      { codigo: 'VBI', pop: 'POP VILA BURITI' },
      { codigo: 'MZO', pop: 'POP-MAUAZINHO' },
      { codigo: 'CTO', pop: 'POP- CENTRO NOVO' },
      { codigo: 'ADS', pop: 'POP-ADRIANÓPOLIS' },
      { codigo: 'COR', pop: 'POP-COROADO' },
      { codigo: 'RIZ', pop: 'POP-RAIZ - RIZ' },
      { codigo: 'MLE', pop: 'POP MORRO DA LIBERDADE (MLE)' },
      { codigo: 'DC1', pop: 'DATA CENTER CLICKIP - SALA TELECOM 01', obs: 'Inferido (não estava na lista)' },
      { codigo: 'DC2', pop: 'DATA CENTER CLICKIP - SALA TELECOM 02', obs: 'Inferido (não estava na lista)' }
    ],
    popsRede: [],            // POPs cadastrados no sistema (além dos do KMZ)
    rede: { fator: 1.2 },    // relação fibra ÷ traçado desenhado (padrão), usada só para posicionar eventos no mapa
    notifications: { divergencia: true, certificacao: true, capacidade: true, piora: true, browser: false },
    regionRules: [
      { pattern: 'CTB|CWB|CURITIBA', regiao: 'Curitiba' },
      { pattern: 'PGO|PONTA', regiao: 'Campos Gerais' },
      { pattern: 'LDA|LONDRINA', regiao: 'Norte' }
    ],
    defaultProject: 'Sem projeto',
    drive: { backendUrl: '', folderId: '', folderName: '' },
    supabase: { url: '', anonKey: '' },
    trechoTypes: ['Aéreo', 'Subterrâneo', 'Misto']
  };

  /** Níveis de acesso e permissões (aplicadas na interface e espelhadas nas políticas RLS do Supabase) */
  FC.roles = {
    admin: { label: 'Administrador', level: 5 },
    engenheiro: { label: 'Engenheiro', level: 4 },
    supervisor: { label: 'Supervisor', level: 3 },
    tecnico: { label: 'Técnico de campo', level: 2 },
    visualizador: { label: 'Visualizador', level: 1 }
  };
  FC.permissions = {
    'enlace.editar': ['admin', 'engenheiro', 'supervisor', 'tecnico'],
    'enlace.excluir': ['admin'],
    'medicao.excluir': ['admin'],
    'medicao.importar': ['admin', 'engenheiro', 'supervisor', 'tecnico'],
    'anexo.enviar': ['admin', 'engenheiro', 'supervisor', 'tecnico'],
    'anexo.baixar': ['admin', 'engenheiro', 'supervisor', 'tecnico', 'visualizador'],
    'anexo.excluir': ['admin', 'engenheiro'],
    'certificacao.aprovar': ['admin', 'engenheiro', 'supervisor'],
    'config.tecnica': ['admin', 'engenheiro'],
    'equipe.gerenciar': ['admin'],
    'relatorio.gerar': ['admin', 'engenheiro', 'supervisor', 'tecnico', 'visualizador'],
    'drive.usar': ['admin', 'engenheiro', 'supervisor'],
    'auditoria.ver': ['admin', 'engenheiro', 'supervisor']
  };
  /** Permissões que só o Administrador pode ter (não podem ser repassadas na matriz) */
  FC.adminOnly = ['enlace.excluir', 'medicao.excluir', 'equipe.gerenciar'];
  FC.permissionLabels = {
    'enlace.editar': 'Cadastrar/editar enlaces e trechos', 'enlace.excluir': 'Excluir enlaces medidos (só Administrador)', 'medicao.excluir': 'Excluir medições (só Administrador)',
    'medicao.importar': 'Importar medições OTDR', 'anexo.enviar': 'Enviar anexos', 'anexo.baixar': 'Abrir/baixar anexos',
    'anexo.excluir': 'Excluir anexos', 'certificacao.aprovar': 'Aprovar certificações',
    'config.tecnica': 'Alterar parâmetros técnicos', 'equipe.gerenciar': 'Gerenciar equipe e permissões',
    'relatorio.gerar': 'Gerar relatórios', 'drive.usar': 'Usar integração Google Drive', 'auditoria.ver': 'Ver auditoria'
  };

  /**
   * Status de cada funcionalidade — separa claramente o que é demonstrativo,
   * o que funciona localmente e o que depende do banco/backend.
   *  local    = funciona 100% no navegador (dados no navegador)
   *  supabase = persiste no Supabase quando conectado (senão, local)
   *  backend  = exige backend (Edge Function) configurado
   *  demo     = dados/fluxo demonstrativos
   */
  FC.featureStatus = [
    ['Leitura de arquivos .SOR (SR-4731 v1/v2)', 'local', 'Leitura binária real no navegador; o mesmo módulo roda no backend.'],
    ['Leitura de PDF de relatório OTDR', 'local', 'Extrai o texto real com pdf.js e reconhece campos; o técnico confirma.'],
    ['Leitura de CSV/XLSX (OTDR e OZmap)', 'local', 'SheetJS com mapeamento de colunas.'],
    ['Leitura de imagem PNG/JPG (OCR)', 'local', 'Experimental: Tesseract.js; requer internet para baixar o idioma.'],
    ['Cálculos (comparativo, orçamento, potência, capacidade)', 'local', 'Recalculados a cada alteração.'],
    ['Cadastro, histórico, certificação, auditoria', 'supabase', 'Navegador por padrão; Supabase quando configurado.'],
    ['Anexos (PDF, SOR, KMZ, fotos)', 'supabase', 'IndexedDB local; Supabase Storage quando configurado.'],
    ['Autenticação', 'supabase', 'Perfis locais (demonstração) ou Supabase Auth.'],
    ['Google Drive', 'backend', 'OAuth 2.0 via Edge Function; nenhum segredo no navegador.'],
    ['Processamento OTDR no servidor', 'backend', 'Edge Function otdr-parse (mesmo parser).'],
    ['Mapa com fundo cartográfico', 'local', 'Leaflet + OpenStreetMap (requer internet); KMZ lido localmente.'],
    ['Dados de exemplo', 'demo', 'Marcados com o selo DEMO; remova em Configurações.']
  ];

  /** Registro de módulos: novos módulos só precisam chamar FC.registerModule */
  FC.modules = [];
  FC.registerModule = (m) => { FC.modules.push(m); FC.modules.sort((a, b) => a.order - b.order); };
})(window.FC = window.FC || {});
