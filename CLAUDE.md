# Painel de Controle de Produção (BI) — Contexto para quem assume o projeto

> Este arquivo é lido automaticamente pelo Claude Code sempre que você abrir esta pasta
> e pedir ajuda. Ele existe para que qualquer pessoa — mesmo sem saber programar — consiga
> abrir o Claude Code aqui, explicar o que quer mudar, e ele já entenda o projeto inteiro
> sem precisar reexplicar tudo do zero.

## O que é este projeto, em uma frase

Um painel de BI (gráficos, KPIs, projeção de conclusão) que mostra o andamento da produção
em tempo real, alimentado automaticamente por uma planilha Excel que o PCP já usa no dia a dia
— ninguém precisa mudar a rotina de trabalho nem editar nada manualmente para o painel atualizar.

## Como os dados fluem (arquitetura)

```
Arquivo .xlsx na pasta "CENA-PROD" do Google Drive
        │  (a cada 15 min, um script automático lê o arquivo mais recente)
        ▼
Google Apps Script  (scripts/google-apps-script.gs)
        │  converte o .xlsx para Google Sheets temporário, lê a aba "Plan Prod",
        │  grava tudo no Supabase e apaga a planilha temporária
        ▼
Supabase (Postgres na nuvem)  →  tabelas: producao, producao_historico
        │  o painel "escuta" o Supabase via Realtime e atualiza a tela na hora
        ▼
public/index.html  →  hospedado no Vercel, link público fixo
```

**Importante — o `README.md` desta pasta está desatualizado.** Ele descreve uma versão
antiga da sincronização (GitHub Actions + Azure AD lendo um Excel vinculado no SharePoint).
Essa abordagem foi abandonada. A sincronização real hoje é via **Google Apps Script**, lendo
um `.xlsx` solto (não vinculado) numa pasta do Google Drive chamada `CENA-PROD` — veja
`scripts/google-apps-script.gs` e `.env.example`. Não confie no fluxo descrito no README sem
checar o `.gs` primeiro.

## Estrutura da pasta

| Caminho | O que é |
|---|---|
| `public/index.html` | O painel inteiro — HTML + CSS + JS num arquivo só. É o que o Vercel publica. |
| `scripts/google-apps-script.gs` | O "robô" de sincronização. Roda **fora deste repositório**, dentro do Google Apps Script (script.google.com), não no Vercel/GitHub. Precisa ser colado manualmente lá (instruções no topo do próprio arquivo). |
| `supabase/schema.sql` | Script SQL para criar as tabelas `producao` e `producao_historico` no Supabase (rodar uma vez, via SQL Editor do Supabase). |
| `.env.example` | Só documentação — explica que as credenciais reais da sincronização ficam em *Project Settings > Script Properties* dentro do próprio Google Apps Script, não num `.env` neste repo. |
| `README.md` | Guia de onboarding original, com um prompt pronto para colar no Claude Code. **Parcialmente desatualizado** (ver acima). |
| `public/pecas-imagens/` | Fotos das peças (.jpg), copiadas de `../../webapp/comercial-imagens` (projeto CRM, pasta irmã). Usadas no modal que abre ao clicar numa linha da tabela "Relação de peças prontas". |

Não há `node_modules`, build step, framework ou bundler. É tudo estático.

## O painel (`public/index.html`)

Um único arquivo com três partes:
1. **HTML/CSS** — layout dos KPIs, gráficos (Chart.js, via CDN) e tabela de itens.
2. **Dados de demonstração** (`DEMO_DATA`, `DEMO_HISTORICO`, perto do topo do `<script>`) —
   usados quando não há Supabase configurado, para a página nunca aparecer vazia.
3. **Lógica** (funções principais, todas em `public/index.html`):
   - `computeMetrics(data, targetEtapas)` — calcula todos os KPIs e agrupamentos a partir
     das linhas cruas vindas do Supabase/planilha.
   - `renderProjecao(...)` / `calcularTendenciaLinear_(...)` — projeção de quando a
     produção deve terminar, com base na tendência do histórico diário (`producao_historico`).
   - `render(data)` — redesenha a tela inteira (KPIs, gráficos, tabela) sempre que os dados mudam.
   - `connectLive(url, key, fallbackIntervalSec)` — conecta no Supabase, carrega os dados,
     assina Realtime (atualização instantânea) e também faz polling de segurança a cada
     60s caso o Realtime falhe.
   - `init()` (fim do arquivo) — decide a fonte de dados ao abrir a página, nesta ordem de
     prioridade: parâmetros `?supaUrl=&supaKey=` na URL → constantes `SUPABASE_URL_DEFAULT` /
     `SUPABASE_ANON_KEY_DEFAULT` já preenchidas no arquivo → dados de demonstração.

**Colunas que vêm da planilha** (aba `Plan Prod`, cabeçalho identificado pela coluna `DESCR`):
`COD`, `DESCR`, `QTDE`, `FLUXO PROD`, `DESCR FLUXO`, `ETAPA`, `QTDE FIN`, `% CONCLUSÃO`,
`STATUS`, `CLIENTE`, `OBS`. Cada linha é uma peça/item em uma etapa do fluxo de produção.

**Etapas conhecidas** (`STAGE_ORDER` no código): `SERR, PINT MET, PROD, IMPRE 3D, USIN ISO,
PREP ART, PINT ART`. **Etapas finais** (`FINAL_ETAPAS`, onde um item conta como "concluído"):
`PROD, PINT ART`. Se o PCP criar uma etapa nova na planilha, ela aparece no painel automaticamente,
mas só conta como "finalizada" se for adicionada também a `FINAL_ETAPAS` no código.

## Onde ficam as credenciais

- **Sincronização (Google Apps Script → Supabase):** dentro do próprio projeto Apps Script,
  em *Project Settings > Script Properties* (ou direto nas constantes `SUPABASE_URL` /
  `SUPABASE_SERVICE_ROLE_KEY` no topo do `.gs`, se ainda não migrado para Script Properties).
  Essa é a chave `service_role` — tem permissão de escrita total e **nunca** deve ir para
  dentro de `public/index.html` nem para o repositório Git.
- **Painel (leitura pública):** `SUPABASE_URL_DEFAULT` e `SUPABASE_ANON_KEY_DEFAULT` dentro de
  `public/index.html`. É a chave `anon` — pública por design, protegida por Row Level Security
  (RLS) que só permite `SELECT` (ver `supabase/schema.sql`). Pode aparecer no código sem risco.
- **ID da pasta do Drive (`CENA-PROD`)** e **nome da aba (`Plan Prod`)** estão fixos como
  constantes no topo do `.gs`.

## Como fazer mudanças comuns

- **Mudar um texto, cor, KPI ou gráfico do painel:** editar `public/index.html` diretamente —
  é só HTML/CSS/JS. Para testar localmente, basta abrir o arquivo no navegador (ele cai
  automaticamente no modo "dados de exemplo") ou servir a pasta com qualquer servidor
  estático (`npx serve public`, por exemplo) para evitar restrições de `file://`.
- **Publicar a mudança:** commit + push para o `origin` (GitHub) — o Vercel está conectado
  ao repositório e faz deploy automático a cada push na branch principal.
- **Mudar colunas da planilha ou como são lidas:** editar `lerPlanilha_()` em
  `scripts/google-apps-script.gs`, depois colar o arquivo atualizado de novo no editor do
  Apps Script (script.google.com) — mudanças aqui no repositório **não sincronizam sozinhas**
  com o Apps Script, é copiar e colar manualmente.
- **Mudar o intervalo de sincronização (hoje 15 min):** função `criarGatilho()` no `.gs`,
  rodar essa função de novo no editor do Apps Script depois de mudar o valor.
- **Adicionar/alterar tabelas no Supabase:** editar `supabase/schema.sql` e rodar a parte
  nova no SQL Editor do Supabase (o script é idempotente — pode rodar o arquivo inteiro de novo
  sem duplicar nada).

## Ligação com o catálogo comercial (imagens das peças)

A tabela "Relação de peças prontas" abre um modal com a foto da peça ao clicar na linha.
Essa foto vem do projeto **CRM** (`../../webapp`, pasta irmã), não deste projeto — o ponto
mais confuso disso tudo é que **o `COD` numérico da planilha de produção (ex: `13`, `127`)
não é o mesmo código do catálogo comercial** (que usa prefixo, ex: `ARV-013`, `PER-004`).
A ligação real está na coluna **"Item ATA"** da aba `BASE_PRODUTOS` da planilha mestre
`Gerador de orçamentos/app/public/comercial-sheet/01_ CENA TECHART - CADASTRO DE PRODUTOS -
2026.xlsx` (pasta irmã, fora deste repositório) — é esse número que bate com o `COD` da
produção, não o "Código" com prefixo.

- O retrato estático dessa ligação (`COD` → `{codigo, imagem, nome}`) está embutido direto em
  `public/index.html` como `const PECA_IMAGEM_MAP = {...}` (não é um `fetch` de `.json` —
  abrir o arquivo direto como `file://` bloqueia `fetch`/`XHR` de arquivo local por CORS,
  então embutir o objeto deixa o modal funcionando mesmo sem servidor estático). Foi gerado
  uma vez lendo essa planilha com `openpyxl` e cruzando com os arquivos existentes em
  `public/pecas-imagens/` (cópia de `../../webapp/comercial-imagens`). Não há automação — se
  a planilha mestre do comercial ganhar peças novas, copiar as imagens novas pra
  `public/pecas-imagens/`, reler a coluna "Item ATA" e regerar/colar o objeto
  `PECA_IMAGEM_MAP` de novo no `index.html`.
- Itens com `COD = N/A` na planilha de produção (peças sem código cadastrado) nunca vão ter
  entrada nesse mapa — o modal mostra "sem imagem cadastrada" pra esses casos, o que é
  esperado, não bug.

## Hospedagem / contas envolvidas

- **Repositório:** GitHub — `Pdrosales/painel-controle-producao`.
- **Deploy do painel:** Vercel, publicando a pasta `public/` como site estático, conectado
  ao mesmo repositório GitHub (deploy automático a cada push).
- **Banco de dados:** Supabase (projeto separado do CRM — veja `../../webapp/CLAUDE.md`,
  são dois projetos Supabase diferentes, não confundir as chaves).
- **Sincronização:** Google Apps Script (projeto avulso em script.google.com, associado à
  conta Google que tem acesso à pasta `CENA-PROD` no Drive) + um gatilho de tempo (`criarGatilho`)
  rodando a cada 15 minutos.

## Coisas que podem confundir quem está chegando agora

- O painel tem um modo "dados de exemplo" (`btnDemo` / `DEMO_DATA`) que entra em ação se as
  constantes de Supabase estiverem vazias ou a conexão falhar — isso é propositado (nunca
  mostrar tela vazia), não é um bug.
- O histórico diário (`producao_historico`) é gravado **uma linha por (dia, etapa)**, com
  upsert — ou seja, só existe uma leitura por dia por etapa, mesmo que a sincronização rode
  várias vezes naquele dia. Isso é o que alimenta o gráfico de projeção.
- "Peças" vs. "itens": o painel distingue quantidade real de peças (`qtde`, contada uma vez
  por item) de contagem de processos/etapas — uma mesma peça pode aparecer em múltiplas etapas
  do fluxo antes de estar pronta. Ver comentário ao lado de `kpiTotalPecas` no HTML.
