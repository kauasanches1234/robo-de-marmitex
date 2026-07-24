-- Fase 2 — escala: NÃO guardar transcrição de conversas, só logs compactos.
-- Com muitos restaurantes, salvar cada mensagem (cliente+bot) explode a tabela.
-- Em vez disso:
--   • dedupe da Meta vira uma coluna leve na própria conversa (last_wam_id) —
--     não cresce (1 valor por cliente, sobrescrito);
--   • a tabela de mensagens é removida (nada de transcrição);
--   • os eventos que importam (pedido fechado, erro, atendente assumiu) vão
--     para event_logs — 1 linha por evento, não por mensagem.

-- dedupe leve (substitui o papel de messages.wam_id)
alter table conversations add column if not exists last_wam_id text;

-- fim das transcrições
drop table if exists messages cascade;

-- logs compactos de eventos do atendimento
create table if not exists event_logs (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  tipo           text not null,                 -- 'pedido' | 'erro' | 'humano' | 'sistema'
  descricao      text,
  valor          numeric(10,2),
  meta           jsonb default '{}'::jsonb,
  created_at     timestamptz default now()
);
create index if not exists idx_eventlogs_restaurant on event_logs(restaurant_id, created_at desc);

alter table event_logs drop constraint if exists event_logs_tipo_chk;
alter table event_logs add  constraint event_logs_tipo_chk check (tipo in ('pedido', 'erro', 'humano', 'sistema'));

alter table event_logs enable row level security;
drop policy if exists own_eventlogs on event_logs;
create policy own_eventlogs on event_logs for all
  using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from restaurants where owner_id = auth.uid()));

-- higiene: conversas antigas e sem pedido em aberto podem ser apagadas
-- (o estado do robô é transitório). Chame periodicamente (cron do Supabase).
create or replace function limpar_conversas_antigas(horas int default 24) returns int
  language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with del as (
    delete from conversations where last_at < now() - make_interval(hours => horas) returning 1
  ) select count(*) into n from del;
  return n;
end $$;
