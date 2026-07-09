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
create policy own_restaurant on restaurants
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy own_menu on menu_items for all
  using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()));

create policy own_customers on customers for all
  using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()));

create policy own_orders on orders for all
  using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()));

create policy own_conversations on conversations for all
  using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()));

create policy own_messages on messages for all
  using (conversation_id in (
    select c.id from conversations c
    join restaurants r on r.id = c.restaurant_id
    where r.owner_id = auth.uid()));
