-- Rode este script uma vez no Supabase: painel do projeto -> SQL Editor -> New query -> colar -> Run

create table if not exists producao (
  id bigint generated always as identity primary key,
  cod text,
  descr text,
  qtde numeric,
  fluxo_prod text,
  descr_fluxo text,
  etapa text,
  qtde_fin numeric,
  pct_conclusao numeric,
  status text,
  cliente text,
  obs text,
  synced_at timestamptz default now()
);

-- Ativa Row Level Security (protege a tabela) e libera SOMENTE leitura pública.
-- Escrita só é possível com a chave "service_role", que fica guardada em segredo
-- no GitHub Actions e nunca é exposta no navegador.
alter table producao enable row level security;

drop policy if exists "Leitura publica" on producao;
create policy "Leitura publica"
  on producao for select
  using (true);

-- Habilita o Realtime (o painel recebe atualização instantânea quando a tabela muda)
alter publication supabase_realtime add table producao;

-- Historico diario do % de conclusao geral, usado no grafico de projecao do painel.
-- Uma linha por dia (chave unica em "data") -- cada sincronizacao do dia atualiza a
-- mesma linha em vez de criar uma nova.
create table if not exists producao_historico (
  id bigint generated always as identity primary key,
  data date not null unique,
  qtde_total numeric,
  qtde_fin_total numeric,
  pct_conclusao numeric,
  registrado_em timestamptz default now()
);

alter table producao_historico enable row level security;

drop policy if exists "Leitura publica" on producao_historico;
create policy "Leitura publica"
  on producao_historico for select
  using (true);

alter publication supabase_realtime add table producao_historico;
