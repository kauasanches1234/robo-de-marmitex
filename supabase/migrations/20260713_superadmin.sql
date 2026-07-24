-- Fase 2 — acesso do DONO DO ROBÔ (super-admin do SaaS).
-- Cada dono de restaurante só vê o próprio (RLS já garante). Mas VOCÊ, dono do
-- sistema, precisa ver todos os restaurantes no painel do Criador.
-- Solução simples e declarativa: uma policy extra que libera o super-admin pelo
-- e-mail do login (o Supabase expõe em auth.jwt()->>'email'). Nada de tabela de
-- papéis nem código — só uma regra no banco.
--
-- Trocar o e-mail aqui = trocar quem é o dono do sistema.
create or replace function eh_superadmin() returns boolean
  language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'kauapratt17@gmail.com'
$$;

-- super-admin enxerga (e ajusta) todos os restaurantes
drop policy if exists superadmin_restaurants on restaurants;
create policy superadmin_restaurants on restaurants for all
  using (eh_superadmin()) with check (eh_superadmin());

-- e os pedidos/logs de todos (para acompanhar o uso), somente leitura
drop policy if exists superadmin_orders on orders;
create policy superadmin_orders on orders for select using (eh_superadmin());
drop policy if exists superadmin_eventlogs on event_logs;
create policy superadmin_eventlogs on event_logs for select using (eh_superadmin());
