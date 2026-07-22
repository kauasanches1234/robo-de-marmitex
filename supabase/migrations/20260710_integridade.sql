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
