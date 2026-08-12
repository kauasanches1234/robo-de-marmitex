-- Fase 2 — controle de acesso (cobrança manual, mensal).
-- Não há gateway de pagamento: o dono do sistema recebe por fora (Pix) e
-- libera +30 dias no painel. O robô bloqueia sozinho quando a data vence.
alter table restaurants add column if not exists liberado_ate date;
alter table restaurants add column if not exists bloqueado boolean not null default false;

-- SEGURANÇA: o dono do restaurante pode editar o PRÓPRIO restaurante (RLS
-- own_restaurant), o que incluiria estas colunas — ou seja, ele poderia se
-- auto-liberar e usar de graça. Este gatilho garante que só o dono do sistema
-- (super-admin) muda acesso. O webhook (service_role) segue livre.
create or replace function protege_acesso() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if (new.liberado_ate is distinct from old.liberado_ate
      or new.bloqueado is distinct from old.bloqueado)
     and not eh_superadmin()
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Somente o dono do sistema pode alterar o acesso';
  end if;
  return new;
end $$;

drop trigger if exists restaurants_protege_acesso on restaurants;
create trigger restaurants_protege_acesso
  before update on restaurants
  for each row execute function protege_acesso();
