// Mapeadores front ↔ Supabase — funções PURAS (sem DOM, sem rede, sem banco).
// Traduzem entre o formato do painel (DB.restaurant, DB.clientes…) e as linhas
// das tabelas do Postgres (ver supabase/migrations/20260708_init.sql).
// Fronteira ÚNICA de tradução: quem fala com o banco — painel OU webhook —
// NUNCA remonta campos à mão (DRY). Fica ao lado do engine.js porque é parte do
// mesmo "cérebro compartilhado": roda igual em Deno (webhook), Node (testes) e,
// no futuro, no navegador (via <script type="module">). ESM, sem etapa de build.
//
// Regras de ouro:
//  • snake_case no banco, camelCase no front.
//  • nunca inventar dado: campo ausente vira default explícito e documentado.
//  • ida-e-volta preserva o significado (testado em tests/mappers.test.js).

export const DIAS_TODOS = [0, 1, 2, 3, 4, 5, 6];

// ── helpers de coerção (defensivos: linha do banco pode vir com null) ──
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const str = (v, d = '') => (v == null ? d : String(v));
const bool = (v) => v === true || v === 'true' || v === 1;
const dias = (v) => {
  if (!Array.isArray(v) || !v.length) return DIAS_TODOS.slice();
  const out = v.map((x) => parseInt(x, 10)).filter((x) => x >= 0 && x <= 6);
  return out.length ? out : DIAS_TODOS.slice();
};
// precos: jsonb (objeto) do Supabase, ou objeto no front, ou string por segurança
const precos = (v) => {
  if (v && typeof v === 'object') {
    const o = {};
    for (const k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = num(v[k]);
    return o;
  }
  if (typeof v === 'string' && v.trim()) { try { return precos(JSON.parse(v)); } catch { return {}; } }
  return {};
};

// ───────────────────────── restaurante / config ─────────────────────────
// front (DB.restaurant) → linha da tabela `restaurants`.
// `mapa` e `peculiaridades` são só do painel → vão em config_extra (jsonb).
export function configToRow(r) {
  r = r || {};
  return {
    nome: str(r.nome, 'Meu Restaurante'),
    horario: str(r.horario),
    pix_key: str(r.pixKey),
    tempo_entrega: str(r.tempoEntrega, '40 min'),
    taxa_entrega: num(r.taxaEntrega, 0),
    entrega_gratis: bool(r.entregaGratis),
    config_extra: { mapa: r.mapa || null, peculiaridades: r.peculiaridades || [] },
  };
}
// linha de `restaurants` → front (sem o cardápio, que vem à parte).
export function rowToConfig(row) {
  row = row || {};
  const extra = (row.config_extra && typeof row.config_extra === 'object') ? row.config_extra : {};
  return {
    nome: str(row.nome, 'Meu Restaurante'),
    horario: str(row.horario),
    pixKey: str(row.pix_key),
    tempoEntrega: str(row.tempo_entrega, '40 min'),
    taxaEntrega: num(row.taxa_entrega, 0),
    entregaGratis: bool(row.entrega_gratis),
    mapa: extra.mapa || null,
    peculiaridades: Array.isArray(extra.peculiaridades) ? extra.peculiaridades : [],
  };
}

// ───────────────────────────── cardápio ─────────────────────────────────
// item do front → linha de `menu_items`. `ordem` preserva a ordem do array.
export function itemToRow(it, restaurantId, ordem) {
  it = it || {};
  const row = {
    restaurant_id: restaurantId,
    nome: str(it.nome),
    tipo: str(it.tipo, 'marmita'),
    etiqueta: str(it.etiqueta),
    precos: precos(it.precos),
    preco: num(it.preco, 0),
    palavras: str(it.palavras),
    dias: dias(it.dias),
    ativo: it.ativo === undefined ? true : bool(it.ativo),
    ordem: parseInt(ordem, 10) || 0,
  };
  // só manda id se for uuid do banco (front usa id numérico local — omite)
  if (typeof it.id === 'string' && it.id.indexOf('-') > 0) row.id = it.id;
  return row;
}
// linha de `menu_items` → item (formato consumido pelo engine e pelo painel).
export function rowToItem(row) {
  row = row || {};
  return {
    id: row.id,
    nome: str(row.nome),
    tipo: str(row.tipo, 'marmita'),
    etiqueta: str(row.etiqueta),
    precos: precos(row.precos),
    preco: num(row.preco, 0),
    palavras: str(row.palavras),
    dias: dias(row.dias),
    ativo: row.ativo === undefined ? true : bool(row.ativo),
  };
}
export const cardapioToRows = (cardapio, restaurantId) =>
  (cardapio || []).map((it, i) => itemToRow(it, restaurantId, i));
// ordena por `ordem` (o banco não garante ordem) antes de virar array do front.
export const rowsToCardapio = (rows) =>
  (rows || []).slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map(rowToItem);

// ───────────────────────────── clientes ─────────────────────────────────
// contato do front → linha de `customers`. `ini`/`whatsapp` são só de UI.
export function customerToRow(cli, restaurantId) {
  cli = cli || {};
  return {
    restaurant_id: restaurantId,
    wa_id: str(cli.phone),
    nome: str(cli.nome),
    pedidos_count: parseInt(cli.pedidos, 10) || 0,
    gasto_total: num(cli.gasto, 0),
  };
}
// linha de `customers` → contato do front (recalcula as iniciais).
export function rowToCustomer(row) {
  row = row || {};
  const nome = str(row.nome);
  const ini = nome.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return {
    id: row.id,
    nome,
    ini,
    phone: str(row.wa_id),
    whatsapp: true,
    pedidos: parseInt(row.pedidos_count, 10) || 0,
    gasto: num(row.gasto_total, 0),
  };
}
