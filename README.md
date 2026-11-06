# Projetos ClickIP FiberControl

Plataforma web para gerenciamento, análise e certificação de enlaces de fibra óptica, integrando testes OTDR (ex.: Viavi SmartOTDR, arquivos Telcordia SR-4731 `.SOR`) e o traçado do OZmap.

## Como abrir

O sistema é HTML + JavaScript puro, sem etapa de build. Sirva a pasta por HTTP, porque `file://` bloqueia parte das APIs do navegador:

```bash
cd clickip-fibercontrol && python3 -m http.server 8080
```

Depois acesse `http://localhost:8080`. Para publicar, envie a pasta inteira para qualquer hospedagem estática (Netlify, Vercel, Supabase Storage, servidor interno).

No primeiro acesso você cria o usuário Administrador. Também pode clicar em **Explorar com dados de demonstração**, que entra com `demo@clickip.demo` / `clickip`. Os dados de demonstração aparecem com o selo **DEMO** e são removidos em *Configurações › Dados*.

## Arquitetura

```
index.html                 estrutura + bibliotecas (versões fixas)
css/app.css                design system (cores da logo, claro/escuro, modo campo)
assets/                    logo clara/escura e ícone
js/core/
  util.js                  utilidades, SHA-256, IndexedDB
  config.js                parâmetros padrão (todos editáveis), perfis, permissões, status das funções
  sor-parser.js            leitor binário SR-4731 v1/v2 (UMD: navegador, Node e Deno)
  store.js                 estado, persistência local/Supabase, auditoria, fila offline
  calc.js                  cálculos: comparativo, link budget, análise OTDR, fator de correção, capacidade, entronques, certificação, histórico
  importers.js             SOR, PDF (pdf.js), CSV/XLSX (SheetJS), imagem (OCR Tesseract), identificação automática do enlace
  ui.js / reports.js       componentes, gráficos, PDF/XLSX
  seed.js                  dados de demonstração
js/app.js                  login, menu, roteador, busca, notificações
js/modules/*.js            um arquivo por módulo; cada módulo chama FC.registerModule({...})
supabase/schema.sql        tabelas, RLS por perfil, bucket de anexos
backend/supabase/functions drive (OAuth 2.0 Google Drive) e otdr-parse (SOR no servidor)
```

Para adicionar um módulo novo, crie `js/modules/novo.js` com `FC.registerModule({ id, order, title, icon, group, field, render })` e inclua o `<script>` no `index.html`. O menu, o roteador e o modo campo passam a reconhecê-lo sem outras mudanças.

## O que é real e o que depende de backend

| Funcionalidade | Situação |
|---|---|
| Leitura `.SOR` (SR-4731 v1/v2): eventos, perdas, refletância, ORL, traço | Real, no navegador. Validada com arquivos de HP E6000A e Noyes M200 |
| PDF de relatório OTDR | Texto real extraído com pdf.js; os campos reconhecidos precisam ser confirmados pelo técnico |
| PNG/JPG | OCR experimental (Tesseract.js); exige internet |
| CSV/XLSX (resultados e planilha OZmap com `48FO (RESTANTE)`) | Real, com mapeamento de colunas |
| Cálculos, relatórios PDF/XLSX, QR Code, mapa/KMZ, checklist, auditoria | Real, no navegador |
| Persistência | Navegador (localStorage + IndexedDB) ou Supabase quando configurado |
| Google Drive | Requer a Edge Function `drive`; o navegador nunca recebe credenciais do Google |

Quando um dado não existe no arquivo (por exemplo, ORL ausente), o sistema mostra isso e pede o preenchimento manual. Sem dados suficientes, o teste não é classificado.

## Conectar o Supabase

Siga o passo a passo em **[SUPABASE.md](SUPABASE.md)**. Em resumo: rode o `supabase/schema.sql`, hospede a pasta e use *Configurações › Integrações › Migrar para o Supabase (assistente)*. O assistente envia os registros e os arquivos anexos sem apagar os dados do navegador.

## Google Drive (OAuth 2.0 no servidor)

```bash
cp js/core/sor-parser.js backend/supabase/functions/otdr-parse/
```

```bash
supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... STATE_SECRET=$(openssl rand -hex 32)
```

```bash
supabase functions deploy drive --no-verify-jwt
```

```bash
supabase functions deploy otdr-parse
```

`drive` usa `--no-verify-jwt` porque o callback do Google chega sem JWT; as outras rotas validam o usuário e o perfil internamente. No Google Cloud Console, cadastre o redirect `https://<projeto>.supabase.co/functions/v1/drive/callback`. Depois informe `https://<projeto>.supabase.co/functions/v1/drive` em *Configurações › Integrações*.

## Níveis de acesso

Administrador, Engenheiro, Supervisor, Técnico de campo e Visualizador. A matriz fica em *Configurações › Permissões* e é aplicada na interface. No Supabase, as políticas RLS e os gatilhos de `schema.sql` aplicam as mesmas regras: só Supervisor ou acima certifica, medições não podem ser apagadas e a auditoria é somente inserção.
