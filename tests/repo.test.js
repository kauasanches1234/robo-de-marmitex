/* Camada painel↔banco (js/repo.js) com um cliente supabase-js FALSO em memória.
   Valida mapeamento, isolamento por restaurant_id, salvar=apaga+insere, leitura
   de clientes e propagação de erro — tudo sem rede nem banco. */
import { createRepo } from '../js/repo.js';

let pass = 0, fail = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + nome); cond ? pass++ : fail++; };

// ── cliente supabase-js falso: mesma API encadeada, store em memória ──
function makeSb(store, opts = {}) {
  const log = [];
  function from(table) {
    const st = { table, op: 'select', filters: [], single: false, rows: null, obj: null };
    const match = r => st.filters.every(([c, v]) => r[c] === v);
    const run = () => {
      log.push({ table, op: st.op, filters: st.filters.map(f => f[0]) });
      if (opts.errorOn === table) return { data: null, error: { message: 'boom ' + table } };
      if (st.op === 'select') {
        const data = (store[table] || []).filter(match);
        return st.single ? { data: data[0] || null, error: data[0] ? null : { message: 'no rows' } } : { data, error: null };
      }
      if (st.op === 'insert') { store[table] = (store[table] || []).concat(st.rows); return { data: st.rows, error: null }; }
      if (st.op === 'update') { (store[table] || []).forEach(r => { if (match(r)) Object.assign(r, st.obj); }); return { data: null, error: null }; }
      if (st.op === 'delete') { store[table] = (store[table] || []).filter(r => !match(r)); return { data: null, error: null }; }
    };
    const b = {
      select() { st.op = 'select'; return b; },
      insert(r) { st.op = 'insert'; st.rows = r; return b; },
      update(o) { st.op = 'update'; st.obj = o; return b; },
      delete() { st.op = 'delete'; return b; },
      eq(c, v) { st.filters.push([c, v]); return b; },
      order() { return b; },
      single() { st.single = true; return b; },
      then(res, rej) { try { res(run()); } catch (e) { rej(e); } },
    };
    return b;
  }
  return { from, _log: log, _store: store };
}

const RID = 'rest-1';

// ── config: carregar (row→front) e salvar (front→row) ──
{
  const store = { restaurants: [{ id: RID, nome: 'Sabor', pix_key: 'pix@x', taxa_entrega: 7, entrega_gratis: false, config_extra: { mapa: { lat: -23 }, peculiaridades: ['x'] } }] };
  const sb = makeSb(store);
  const repo = createRepo(sb, RID);
  const cfg = await repo.carregarConfig();
  check('carregarConfig traduz para camelCase', cfg.pixKey === 'pix@x' && cfg.taxaEntrega === 7 && cfg.mapa.lat === -23);
  await repo.salvarConfig({ nome: 'Novo', pixKey: 'pix2', taxaEntrega: 9, entregaGratis: true, mapa: null, peculiaridades: [] });
  check('salvarConfig grava em snake_case', store.restaurants[0].pix_key === 'pix2' && Number(store.restaurants[0].taxa_entrega) === 9 && store.restaurants[0].entrega_gratis === true);
}

// ── cardápio: salvar (apaga+insere) e recarregar (round-trip) ──
{
  const store = { menu_items: [{ id: 'old', restaurant_id: RID, nome: 'Antigo', ordem: 0, precos: {}, dias: [1] }] };
  const sb = makeSb(store);
  const repo = createRepo(sb, RID);
  const cardapio = [
    { nome: 'Frango', tipo: 'marmita', etiqueta: 'P+M+Família', precos: { P: 16, M: 18, 'Família': 30 }, palavras: 'frango', dias: [0, 1, 2, 3, 4, 5, 6] },
    { nome: 'Feijoada', tipo: 'marmita', etiqueta: '', preco: 25, precos: {}, palavras: 'feijoada', dias: [3, 6] },
  ];
  await repo.salvarCardapio(cardapio);
  const ops = sb._log.filter(l => l.table === 'menu_items').map(l => l.op);
  check('salvarCardapio apaga ANTES de inserir', ops.indexOf('delete') >= 0 && ops.indexOf('delete') < ops.indexOf('insert'));
  check('o item antigo foi substituído', !store.menu_items.some(r => r.nome === 'Antigo'));
  const volta = await repo.carregarCardapio();
  check('carregarCardapio devolve o que foi salvo (ordem preservada)', volta.length === 2 && volta[0].nome === 'Frango' && volta[1].nome === 'Feijoada');
  check('variedade Família sobrevive ao round-trip', volta[0].precos['Família'] === 30 && volta[0].etiqueta === 'P+M+Família');
  check('dias da feijoada preservados', JSON.stringify(volta[1].dias) === JSON.stringify([3, 6]));
}

// ── isolamento: só vê o cardápio do próprio restaurante ──
{
  const store = { menu_items: [
    { id: 'a', restaurant_id: RID, nome: 'Meu', ordem: 0, precos: {}, dias: [1] },
    { id: 'b', restaurant_id: 'outro', nome: 'Alheio', ordem: 0, precos: {}, dias: [1] },
  ] };
  const repo = createRepo(makeSb(store), RID);
  const cs = await repo.carregarCardapio();
  check('carregarCardapio filtra por restaurant_id', cs.length === 1 && cs[0].nome === 'Meu');
}

// ── clientes: row→front (iniciais recalculadas) ──
{
  const store = { customers: [{ id: 'c1', restaurant_id: RID, nome: 'João Silva', wa_id: '5511', pedidos_count: 2, gasto_total: 50 }] };
  const repo = createRepo(makeSb(store), RID);
  const cl = await repo.listarClientes();
  check('listarClientes mapeia e recalcula iniciais', cl.length === 1 && cl[0].ini === 'JS' && cl[0].phone === '5511' && cl[0].pedidos === 2);
}

// ── erro do banco vira exceção (o painel trata) ──
{
  const repo = createRepo(makeSb({}, { errorOn: 'restaurants' }), RID);
  let lancou = false;
  try { await repo.carregarConfig(); } catch { lancou = true; }
  check('erro do supabase propaga como exceção', lancou);
}

// ── guardas de construção ──
check('createRepo exige cliente', (() => { try { createRepo(null, RID); return false; } catch { return true; } })());
check('createRepo exige restaurantId', (() => { try { createRepo({}, null); return false; } catch { return true; } })());

console.log(`\nRESULTADO: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
