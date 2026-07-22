-- ============================================================================
-- Robô de Marmitex — SETUP COMPLETO do banco (rodar tudo de uma vez).
-- Cole ESTE arquivo inteiro no SQL Editor do Supabase e clique em Run.
-- É a junção das migrações em supabase/migrations/*.sql (mesma coisa, num
-- arquivo só). Idempotente: pode rodar de novo sem erro nem perda de dados.
-- ============================================================================

-- Robô de Marmitex — schema inicial (Fase 2, multi-restaurante).
-- Segurança por linha (RLS): cada dono só enxerga o próprio restaurante;
-- o webhook usa a service_role (que ignora RLS) para ler/escrever no atendimento.

create extension if not exists pgcrypto;

-- ───────────────────────── restaurantes (tenants) ─────────────────────────
create table if not exists restaurants (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid references auth.users(id) on delete set null,
  nome                  text not null default 'Meu Restaurante',
  horario               text default '11h–15h e 18h–22h',
  pix_key               text,
  tempo_entrega         text default '40 min',
  taxa_entrega          numeric(10,2) default 5,
  entrega_gratis        boolean default false,
  wa_phone_number_id    text unique,           -- liga a mensagem recebida ao restaurante
  wa_waba_id            text,
  created_at            timestamptz default now()
);

-- ───────────────────────────── cardápio ───────────────────────────────────
create table if not exists menu_items (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  nome           text not null,
  tipo           text not null default 'marmita',   -- 'marmita' | 'bebida'
  etiqueta       text default '',                   -- "P+M+G" / "lata+600+2L"
  precos         jsonb default '{}'::jsonb,         -- {"P":16,"M":18,"G":22}
  preco          numeric(10,2) default 0,           -- fallback (sem etiquetas)
  palavras       text default '',
  dias           int[] default '{0,1,2,3,4,5,6}',   -- dias servidos (0=Dom … 6=Sáb)
  ativo          boolean default true,
  ordem          int default 0
);
create index if not exists idx_menu_restaurant on menu_items(restaurant_id);

-- ───────────────────────────── clientes ───────────────────────────────────
create table if not exists customers (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  wa_id          text not null,                     -- telefone E.164 (ex.: 5512...)
  nome           text,
  pedidos_count  int default 0,
  gasto_total    numeric(10,2) default 0,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique(restaurant_id, wa_id)
);

-- ────────────────── conversas (estado do robô, por cliente) ────────────────
create table if not exists conversations (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  wa_id          text not null,
  estado         jsonb default '{}'::jsonb,         -- máquina de estados do engine.js
  humano         boolean default false,             -- atendente assumiu → robô calado
  last_at        timestamptz default now(),
  unique(restaurant_id, wa_id)
);

-- ─────────────────────────── mensagens (log) ──────────────────────────────
create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade,
  quem             text not null,                   -- 'cliente' | 'bot' | 'atendente'
  texto            text,
  wam_id           text,                            -- id da mensagem na Meta (dedupe)
  created_at       timestamptz default now()
);
create index if not exists idx_msg_conversation on messages(conversation_id);
create unique index if not exists idx_msg_wamid on messages(wam_id) where wam_id is not null;

-- ───────────────────────────── pedidos ────────────────────────────────────
create table if not exists orders (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  customer_id    uuid references customers(id) on delete set null,
  itens          jsonb not null default '[]'::jsonb,
  endereco       text,
  pagamento      text,
  status         text default 'novo',               -- novo|preparo|entrega|concluido|cancelado
  total          numeric(10,2) default 0,
  created_at     timestamptz default now()
);
create index if not exists idx_orders_restaurant on orders(restaurant_id);

-- ─────────────────────────────── RLS ──────────────────────────────────────
alter table restaurants   enable row level security;
alter table menu_items    enable row level security;
alter table customers     enable row level security;
alter table conversations enable row level security;
alter table messages      enable row level security;
alter table orders        enable row level security;

-- o dono (autenticado) só acessa o que é do próprio restaurante.
-- a service_role (webhook/back) ignora RLS automaticamente.
-- drop-if-exists antes de create: a migração pode rodar de novo sem erro
-- (Postgres não tem `create policy if not exists`).
drop policy if exists own_restaurant on restaurants;
create policy own_restaurant on restaurants
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists own_menu on menu_items;
create policy own_menu on menu_items for all
  using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()));

drop policy if exists own_customers on customers;
create policy own_customers on customers for all
  using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()));

drop policy if exists own_orders on orders;
create policy own_orders on orders for all
  using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()));

drop policy if exists own_conversations on conversations;
create policy own_conversations on conversations for all
  using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()));

drop policy if exists own_messages on messages;
create policy own_messages on messages for all
  using (conversation_id in (
    select c.id from conversations c
    join restaurants r on r.id = c.restaurant_id
    where r.owner_id = auth.uid()));

-- Fase 2 — integração front↔back.
-- O painel tem dados que ainda não existiam como coluna: o mapa de entrega
-- (áreas/zonas/lat/lng) e as "peculiaridades" do restaurante. Em vez de criar
-- uma coluna por campo de UI (que muda com frequência), guardamos esse bloco
-- flexível como jsonb. O mapeador (js/mappers.js) lê/escreve em config_extra.
alter table restaurants
  add column if not exists config_extra jsonb not null default '{}'::jsonb;

comment on column restaurants.config_extra is
  'Config só de painel (jsonb): { mapa, peculiaridades }. Ver js/mappers.js.';

-- Fase 2 — integridade de dados (banco "tudo certinho").
-- Regras que o app assume mas o banco não garantia: valores válidos nas colunas
-- tipo enum-like e atualização automática de updated_at. Constraints idempotentes
-- (drop if exists + add) para a migração poder rodar de novo sem erro.

-- tipo do item só pode ser 'marmita' ou 'bebida'
alter table menu_items drop constraint if exists menu_items_tipo_chk;
alter table menu_items add  constraint menu_items_tipo_chk check (tipo in ('marmita', 'bebida'));

-- status do pedido é um conjunto fechado (evita "novo "/"NOVO"/typo no back)
alter table orders drop constraint if exists orders_status_chk;
alter table orders add  constraint orders_status_chk
  check (status in ('novo', 'preparo', 'entrega', 'concluido', 'cancelado'));

-- autor da mensagem: cliente, robô ou atendente
alter table messages drop constraint if exists messages_quem_chk;
alter table messages add  constraint messages_quem_chk check (quem in ('cliente', 'bot', 'atendente'));

-- taxa/gasto nunca negativos (dados sujos não entram)
alter table restaurants drop constraint if exists restaurants_taxa_nonneg_chk;
alter table restaurants add  constraint restaurants_taxa_nonneg_chk check (taxa_entrega >= 0);
alter table customers   drop constraint if exists customers_gasto_nonneg_chk;
alter table customers   add  constraint customers_gasto_nonneg_chk check (gasto_total >= 0 and pedidos_count >= 0);
alter table orders      drop constraint if exists orders_total_nonneg_chk;
alter table orders      add  constraint orders_total_nonneg_chk check (total >= 0);

-- updated_at do cliente atualiza sozinho (o back não precisa lembrar de setar)
create or replace function touch_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists customers_touch_updated on customers;
create trigger customers_touch_updated
  before update on customers
  for each row execute function touch_updated_at();
