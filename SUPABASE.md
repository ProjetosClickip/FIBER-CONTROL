# Passar o ClickIP FiberControl para o Supabase

Tempo estimado: 20 a 30 minutos. Você não perde nada: os dados do navegador continuam lá até você apagar.

## Por que hospedar

O link de visualização do Claude roda numa área isolada que bloqueia conexões externas. Por isso ele não consegue falar com o Supabase e também não baixa arquivos. Para usar o banco, o sistema precisa estar num endereço seu.

## 1. Criar o projeto e o banco

1. Em https://supabase.com, crie um projeto (região São Paulo).
2. Abra **SQL Editor › New query**, cole todo o arquivo `supabase/schema.sql` e clique em **Run**. Ele pode ser rodado de novo sem problema.
3. Em **Authentication › Sign In / Providers › Email**, desligue **Confirm email** para a equipe entrar sem esperar e-mail. Se preferir manter, cada pessoa confirma pelo link recebido.
4. Em **Project Settings › API**, copie a **Project URL** e a chave **anon public**. A `service_role` nunca vai no sistema.

## 2. Publicar no GitHub Pages

1. Descompacte o `clickip-fibercontrol.zip`.
2. No repositório (ex.: `Gilzin29/CLICK-IP`), clique em **Add file › Upload files**. Envie **o conteúdo** da pasta `clickip-fibercontrol`: o `index.html` precisa ficar na raiz do repositório, junto com `css/`, `js/`, `assets/`, `fc-config.js` e `.nojekyll`. Depois clique em **Commit changes**.
   - Arquivos que começam com ponto (`.nojekyll`) às vezes não aparecem no seletor. Se faltar, crie pelo GitHub: **Add file › Create new file**, com o nome `.nojekyll` e o conteúdo vazio.
3. No repositório, abra o arquivo **`fc-config.js`**, clique no lápis (Edit) e preencha:
   ```js
   window.FC_CONFIG = {
     supabaseUrl: 'https://SEU-PROJETO.supabase.co',
     supabaseAnonKey: 'SUA-CHAVE-ANON-PUBLIC',
     driveBackendUrl: ''
   };
   ```
   Faça o commit. A chave **anon** pode ficar no repositório público: ela foi feita para isso, e a proteção está nas regras do banco. **Nunca** coloque a `service_role` nem segredos do Google.
4. Em **Settings › Pages**, escolha **Source: Deploy from a branch**, **Branch: main** e pasta **/ (root)**, e clique em **Save**. Em 1 a 2 minutos o site sai em `https://gilzin29.github.io/CLICK-IP/`.
5. No Supabase, em **Authentication › URL Configuration**, coloque esse endereço em **Site URL**.

Toda alteração enviada ao repositório é publicada sozinha em 1 a 2 minutos. Se a página não mudar, recarregue com Ctrl+F5.

## 3. Primeiro acesso (você vira Administrador)

Abra o site. Ele já mostra "Conectado ao Supabase". Preencha **nome, e-mail e senha**, clique em **Criar conta** e depois em **Entrar**. A primeira conta do banco vira **Administrador** automaticamente.

## 4. Trazer os dados do link de visualização

1. No **link de visualização** do Claude: *Configurações › Dados*, deixe marcado **Incluir arquivos anexos** e clique em **Copiar backup**.
2. No **site do GitHub**: *Configurações › Dados › Colar backup*, cole e confirme. O sistema restaura e **envia tudo ao Supabase na hora**: enlaces, trechos, medições, manutenções e os PDF/SOR no Storage. Registros DEMO ficam de fora.

> Alternativa sem o `fc-config.js`: deixe o arquivo em branco e use *Configurações › Integrações › Migrar para o Supabase (assistente)*. Nesse caso cada pessoa precisa conectar o próprio navegador pela tela.

## 5. Equipe

Cada membro abre o endereço do site (`https://gilzin29.github.io/CLICK-IP/`), preenche nome, e-mail e senha e clica em **Criar conta**.

- **Membro já cadastrado na Equipe:** se o e-mail for o mesmo, ele assume automaticamente o perfil e o nível de acesso migrados.
- **Pessoa nova:** entra como **Visualizador**. O Administrador promove em *Equipe*.

## Regras aplicadas pelo banco

As permissões valem também fora do aplicativo, nas políticas RLS e nos gatilhos do `schema.sql`:

- Só Administrador muda níveis de acesso. Ninguém se autopromove.
- Só Supervisor, Engenheiro ou Administrador certificam.
- Medições não podem ser apagadas (histórico permanente). A auditoria é só inclusão.
- Parâmetros técnicos: Administrador e Engenheiro.
- Quem ainda não tem perfil não enxerga nenhum dado.

Esses cenários foram testados num PostgreSQL 16 que simula o ambiente do Supabase.

## Problemas comuns

| Mensagem | O que fazer |
|---|---|
| "as tabelas não existem" | Rode o `schema.sql` no SQL Editor |
| "Sem acesso ao endereço" | Confira a URL no `fc-config.js`; use o site do GitHub, não o link de visualização |
| Site em branco ou "404" no GitHub | O `index.html` precisa estar na raiz do repositório; confira *Settings › Pages* (branch `main`, pasta `/ (root)`) |
| Site abre em "Dados neste navegador" | O `fc-config.js` está vazio ou o GitHub ainda não publicou; aguarde 2 minutos e recarregue com Ctrl+F5 |
| "E-mail ainda não confirmado" | Clique no link do e-mail ou desligue *Confirm email* |
| Seu perfil não ficou Administrador | O banco já tinha outro admin: peça a ele para promover você e use **Reenviar dados deste navegador** |
