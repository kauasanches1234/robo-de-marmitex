/* Banco "tudo certinho" — roda as MIGRAÇÕES REAIS num Postgres de verdade
   (pglite, em memória) e verifica estrutura, defaults, constraints, cascata e,
   principalmente, a RLS (isolamento entre restaurantes). Sem mocks de SQL. */
import { novoBanco, migracoes, comoUsuario } from './helpers/pg.js';

let pass = 0, fail = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + nome); cond ? pass++ : fail++; };
async function deveFalhar(nome, fn) { try { await fn(); check(nome, false); } catch { check(nome, true); } }

const db = await novoBanco();

// ── migrações aplicam e são idempotentes (rodar 2x não quebra) ──
check('migrações aplicaram sem erro', true); // novoBanco() lançaria se falhasse
try { for (const sql of migracoes()) await db.exec(sql); check('migrações são idempotentes (2ª passada ok)', true); }
catch (e) { check('migrações são idempotentes (2ª passada ok)', false); console.log('  ↳', e.message); }

// ── tabelas esperadas existem ──
const tabs = (await db.query(`select table_name from information_schema.tables where table_schema='public'`)).rows.map((r) => r.table_name);
check('todas as tabelas existem', ['restaurants', 'menu_items', 'customers', 'conversations', 'messages', 'orders'].every((t) => tabs.includes(t)));

// ── defaults do schema (dias, precos, config_extra, taxa) ──
const u1 = (await db.query('insert into auth.users default values returning id')).rows[0].id;
const u2 = (await db.query('insert into auth.users default values returning id')).rows[0].id;
const r1 = (await db.query('insert into restaurants (owner_id, nome) values ($1,$2) returning *', [u1, 'R1'])).rows[0];
const r2 = (await db.query('insert into restaurants (owner_id, nome) values ($1,$2) returning *', [u2, 'R2'])).rows[0];
check('restaurants.taxa_entrega default 5', Number(r1.taxa_entrega) === 5);
check('restaurants.config_extra default {}', r1.config_extra && typeof r1.config_extra === 'object');

const it1 = (await db.query('insert into menu_items (restaurant_id, nome) values ($1,$2) returning *', [r1.id, 'Frango'])).rows[0];
check('menu_items.dias default = todos os dias', JSON.stringify(it1.dias) === JSON.stringify([0, 1, 2, 3, 4, 5, 6]));
check('menu_items.precos default {}', it1.precos && typeof it1.precos === 'object');
check('menu_items.ativo default true', it1.ativo === true);

// ── CHECK constraints (integridade) ──
await deveFalhar('tipo inválido é rejeitado', () => db.query("insert into menu_items (restaurant_id, nome, tipo) values ($1,'X','sobremesa')", [r1.id]));
await deveFalhar('status de pedido inválido é rejeitado', () => db.query("insert into orders (restaurant_id, status) values ($1,'entregue_ontem')", [r1.id]));
await deveFalhar('quem inválido em messages é rejeitado', async () => {
  const c = (await db.query('insert into conversations (restaurant_id, wa_id) values ($1,$2) returning id', [r1.id, '551'])).rows[0];
  await db.query("insert into messages (conversation_id, quem, texto) values ($1,'gerente','oi')", [c.id]);
});
await deveFalhar('taxa negativa é rejeitada', () => db.query('insert into restaurants (owner_id, nome, taxa_entrega) values ($1,$2,$3)', [u1, 'Neg', -1]));

// ── unicidade ──
await deveFalhar('customers únicos por (restaurant_id, wa_id)', async () => {
  await db.query('insert into customers (restaurant_id, wa_id) values ($1,$2)', [r1.id, '5599']);
  await db.query('insert into customers (restaurant_id, wa_id) values ($1,$2)', [r1.id, '5599']);
});
check('mesmo wa_id em OUTRO restaurante é permitido', (await db.query('insert into customers (restaurant_id, wa_id) values ($1,$2) returning id', [r2.id, '5599'])).rows.length === 1);
await deveFalhar('wa_phone_number_id é único global', async () => {
  await db.query('update restaurants set wa_phone_number_id=$1 where id=$2', ['PN1', r1.id]);
  await db.query('update restaurants set wa_phone_number_id=$1 where id=$2', ['PN1', r2.id]);
});

// ── cascata: apagar restaurante apaga o cardápio ──
const rTmp = (await db.query('insert into restaurants (owner_id, nome) values ($1,$2) returning id', [u1, 'Tmp'])).rows[0];
await db.query('insert into menu_items (restaurant_id, nome) values ($1,$2)', [rTmp.id, 'X']);
await db.query('delete from restaurants where id=$1', [rTmp.id]);
check('delete de restaurante cascateia no cardápio', (await db.query('select count(*)::int n from menu_items where restaurant_id=$1', [rTmp.id])).rows[0].n === 0);

// ── updated_at atualiza sozinho no update de customers ──
const cli = (await db.query('insert into customers (restaurant_id, wa_id, nome) values ($1,$2,$3) returning id, updated_at', [r1.id, '5540', 'A'])).rows[0];
await new Promise((res) => setTimeout(res, 5));
const cli2 = (await db.query("update customers set nome='B' where id=$1 returning updated_at", [cli.id])).rows[0];
check('trigger touch_updated_at mexe no updated_at', new Date(cli2.updated_at) > new Date(cli.updated_at));

// ── RLS: dono só enxerga o próprio restaurante ──
check('RLS ligada em todas as tabelas', (await db.query(`select bool_and(relrowsecurity) b from pg_class where relname in ('restaurants','menu_items','customers','conversations','messages','orders')`)).rows[0].b === true);

await comoUsuario(db, u1, async () => {
  const rs = (await db.query('select nome from restaurants')).rows;
  // u1 pode ter o "Meu Restaurante" (auto do trigger) + o R1; nunca o R2 do outro.
  check('u1 vê o próprio R1 e NÃO vê o R2 (isolamento)', rs.some(r => r.nome === 'R1') && !rs.some(r => r.nome === 'R2'));
  const mi = (await db.query('select count(*)::int n from menu_items')).rows[0].n;
  check('u1 vê só o cardápio do próprio restaurante', mi === (await db.query('select count(*)::int n from menu_items where restaurant_id=$1', [r1.id])).rows[0].n);
});
await deveFalhar('u1 NÃO consegue inserir item no restaurante do u2 (with check)', () =>
  comoUsuario(db, u1, () => db.query('insert into menu_items (restaurant_id, nome) values ($1,$2)', [r2.id, 'Invasor'])));
await comoUsuario(db, u2, async () => {
  const rs = (await db.query('select nome from restaurants')).rows;
  check('u2 vê o próprio R2 e NÃO vê o R1 (isolamento)', rs.some(r => r.nome === 'R2') && !rs.some(r => r.nome === 'R1'));
});

// ── onboarding: novo usuário ganha 1 restaurante automaticamente ──
const u3 = (await db.query('insert into auth.users default values returning id')).rows[0].id;
const rs3 = (await db.query('select id, nome from restaurants where owner_id=$1', [u3])).rows;
check('novo usuário cria 1 restaurante automaticamente (trigger)', rs3.length === 1 && rs3[0].nome === 'Meu Restaurante');
await comoUsuario(db, u3, async () => {
  check('e o dono novo enxerga esse restaurante pela RLS', (await db.query('select count(*)::int n from restaurants')).rows[0].n === 1);
});

console.log(`\nRESULTADO: ${pass} pass, ${fail} fail`);
await db.close();
process.exit(fail ? 1 : 0);
