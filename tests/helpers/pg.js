// Helper de teste do banco: sobe um Postgres real embutido (pglite, em memória)
// e aplica as MIGRAÇÕES REAIS de supabase/migrations/*.sql, em ordem.
//
// Por que um stub de `auth`: as migrações referenciam auth.users e auth.uid()
// (coisas do Supabase que não existem num Postgres puro). Recriamos o mínimo:
//  • schema auth + tabela auth.users
//  • auth.uid() lê um "claim" de teste (current_setting('test.uid'))
//  • role `authenticated` (não-superusuário) para a RLS valer de verdade
// Assim dá pra testar as políticas de segurança como em produção.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const MIGR_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations');

// stub do Supabase Auth — o suficiente para as migrações e a RLS rodarem
const AUTH_STUB = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
-- auth.uid()/auth.jwt(): em produção vêm do JWT; no teste lêem settings nossos.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('email', nullif(current_setting('test.email', true), ''))
$$;
-- role que o Supabase usa para o usuário logado (a RLS se aplica a ela).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;
`;

/** Cria um banco novo com o stub de auth + todas as migrações aplicadas. */
export async function novoBanco() {
  const db = new PGlite({ extensions: { pgcrypto } }); // pgcrypto p/ o `create extension` da migração
  await db.exec(AUTH_STUB);
  for (const sql of migracoes()) await db.exec(sql);
  // a role logada precisa de privilégio de tabela (a RLS é quem filtra as linhas)
  // e de acesso ao schema auth (auth.uid()/auth.jwt()), como no Supabase real.
  await db.exec("grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated;");
  await db.exec("grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;");
  return db;
}

/** Lê as migrações em ordem de nome (mesma ordem que o Supabase aplica). */
export function migracoes() {
  return readdirSync(MIGR_DIR).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => readFileSync(join(MIGR_DIR, f), 'utf8'));
}

/** Executa `fn` como o usuário `uid` (role authenticated + claims de teste).
 *  `email` opcional alimenta auth.jwt()->>'email' (para testar super-admin). */
export async function comoUsuario(db, uid, fn, email = '') {
  await db.exec('set role authenticated');
  await db.query('select set_config($1, $2, false)', ['test.uid', uid || '']);
  await db.query('select set_config($1, $2, false)', ['test.email', email]);
  try { return await fn(); }
  finally { await db.exec('reset role'); await db.query('select set_config($1, $2, false)', ['test.uid', '']); await db.query('select set_config($1, $2, false)', ['test.email', '']); }
}
