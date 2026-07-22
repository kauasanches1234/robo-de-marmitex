-- Fase 2 — onboarding automático.
-- Todo usuário que se cadastra (auth.users) É dono de um restaurante. Em vez de
-- pedir para rodar um INSERT na mão, um gatilho cria o restaurante ligado a ele
-- no momento do cadastro. Padrão oficial do Supabase (função SECURITY DEFINER
-- que roda com privilégio e por isso ignora a RLS ao inserir).
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.restaurants (owner_id, nome) values (new.id, 'Meu Restaurante');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
