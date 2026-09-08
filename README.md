# Painel de Controle de Produção — online, atualizado sozinho

Este projeto deixa o painel de BI online, com um link fixo, atualizado automaticamente
a partir do Excel no SharePoint — sem exigir login de quem só vai visualizar, e sem
mudar nada no trabalho de quem edita a planilha todo dia.

## Como funciona (resumo)

```
Excel no SharePoint
        │  (a cada 10 min, um robô no GitHub Actions lê os dados)
        ▼
  Supabase (banco de dados na nuvem, guarda a cópia mais recente)
        │  (o painel "escuta" o Supabase e atualiza a tela na hora)
        ▼
  Painel hospedado no Vercel  →  link fixo, ex: seu-painel.vercel.app
```

## O que já vem pronto nesta pasta

- `public/index.html` — o painel (KPIs, gráficos, tabela de itens críticos).
- `scripts/sync-sharepoint-to-supabase.js` — o "robô" que lê o Excel e grava no Supabase.
- `.github/workflows/sync.yml` — agenda esse robô para rodar a cada 10 minutos, de graça, no GitHub.
- `supabase/schema.sql` — cria a tabela certa no Supabase, já com permissão de só-leitura pública.

## O que falta fazer (contas e chaves — é normal precisar disso uma vez)

Você **não precisa entender os detalhes técnicos**. Abra esta pasta no Claude Code
(no seu computador) e cole o prompt lá embaixo — ele vai te guiar por cada etapa,
pedindo login quando for necessário.

Etapas que vão acontecer (o Claude Code conduz cada uma):

1. **Criar conta/projeto no Supabase** (grátis) e rodar `supabase/schema.sql` nele.
2. **Registrar um "app" no Microsoft Entra ID (Azure AD)** — passo único de TI, sem
   criar login para ninguém, só uma credencial de sistema (client secret) que fica
   guardada em segredo no GitHub.
3. **Criar um repositório no GitHub** e subir este projeto.
4. **Guardar as chaves como "Secrets"** no GitHub (nunca aparecem no código).
5. **Conectar o repositório ao Vercel** — gera o link público do painel.
6. **Preencher a URL e a chave pública do Supabase** dentro de `public/index.html`
   (são valores seguros de expor, protegidos por uma política de somente-leitura).

## Prompt pronto para colar no Claude Code

Copie o bloco abaixo inteiro e cole no Claude Code, dentro desta pasta:

```
Estou nesta pasta de projeto (painel de controle de produção). Preciso que você me
ajude a colocá-la online, me guiando passo a passo, já que não sou técnico. Faça isto,
na ordem, confirmando comigo antes de cada etapa que exigir login ou criação de conta:

1. Leia o README.md e entenda a arquitetura (SharePoint -> GitHub Actions -> Supabase -> Vercel).
2. Me ajude a criar um projeto gratuito no Supabase (supabase.com) e rodar o arquivo
   supabase/schema.sql nele via SQL Editor. Depois, me peça a "Project URL" e a "anon public key"
   do projeto, e preencha SUPABASE_URL_DEFAULT e SUPABASE_ANON_KEY_DEFAULT no topo do bloco
   "Config: Supabase" dentro de public/index.html.
3. Me explique, em português simples, exatamente o que pedir para o time de TI registrar no
   Microsoft Entra ID (Azure AD): um app registration com permissão de APLICAÇÃO (não delegada)
   "Files.Read.All" ou "Sites.Read.All" no Microsoft Graph, com consentimento de administrador,
   e um client secret gerado para esse app. Preciso do Tenant ID, Client ID e Client Secret no final.
4. Me ajude a criar um repositório no GitHub (posso usar `gh` se estiver instalado, ou me guie
   pela interface web) e a subir este projeto para lá com git.
5. Me ajude a cadastrar estes GitHub Secrets no repositório (Settings > Secrets and variables >
   Actions): AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, SHAREPOINT_FILE_LINK,
   SHAREPOINT_SHEET_NAME, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (a service_role key eu pego
   no painel do Supabase, em Project Settings > API).
6. Rode manualmente o workflow do GitHub Actions (aba Actions > Sincronizar SharePoint ->
   Supabase > Run workflow) e confirme comigo se a tabela "producao" no Supabase recebeu os dados.
7. Me ajude a conectar este repositório GitHub a um novo projeto no Vercel (vercel.com), apontando
   a pasta "public" como diretório de publicação estático, e me entregue o link final do painel.
8. No final, me dê um resumo do que foi criado, onde ficam as credenciais, e como eu faria para
   trocar o intervalo de sincronização (hoje 10 minutos) se eu quiser.

Vá com calma, uma etapa de cada vez, e me avise sempre que eu precisar clicar em algo em um
site (Supabase, Azure, GitHub ou Vercel) porque isso exige login manual meu.
```

## Perguntas que provavelmente vão surgir

**"Preciso pagar alguma coisa?"**
Não, para este volume de dados: GitHub Actions, Supabase e Vercel têm planos gratuitos
que cobrem folgadamente este uso.

**"Isso muda alguma coisa para quem edita a planilha hoje?"**
Não. O robô só *lê* o arquivo. Ninguém precisa mudar de ferramenta nem de rotina.

**"E se o robô falhar num ciclo?"**
Ele simplesmente tenta de novo no próximo ciclo (10 min depois). O painel mantém os
últimos dados válidos na tela até a próxima sincronização funcionar.

**"Isso é seguro?"**
A credencial que acessa o SharePoint (client secret) fica só dentro do GitHub Secrets —
nunca aparece no código nem no navegador de quem vê o painel. Quem vê o painel só enxerga
dados já lidos, através de uma chave pública "somente leitura" do Supabase.
