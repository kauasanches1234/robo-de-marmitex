// Mapeadores front ↔ Supabase — funções PURAS (sem DOM, sem rede, sem banco).
// Traduzem entre o formato usado no painel (DB.restaurant, DB.clientes…) e as
// linhas das tabelas do Postgres (ver supabase/migrations/20260708_init.sql).
// São a fronteira única de tradução: quem fala com o banco NUNCA remonta campos
// à mão (DRY). Rodam igual no navegador (window.Mappers) e no Node (require),
// via UMD — o site é estático (GitHub Pages), sem etapa de build.
//
// Regras de ouro:
//  • snake_case no banco, camelCase no front.
//  • nunca inventar dado: campo ausente vira default explícito e documentado.
//  • ida-e-volta preserva o significado (testado em tests/mappers.test.js).
(function (root) {
  'use strict';

  var DIAS_TODOS = [0, 1, 2, 3, 4, 5, 6];

  // ── helpers de coerção (defensivos: entrada do banco pode vir null) ──
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : (d || 0); }
  function str(v, d) { return (v == null) ? (d || '') : String(v); }
  function bool(v) { return v === true || v === 'true' || v === 1; }
  function dias(v) {
    if (!Array.isArray(v) || !v.length) return DIAS_TODOS.slice();
    var out = v.map(function (x) { return parseInt(x, 10); })
               .filter(function (x) { return x >= 0 && x <= 6; });
    return out.length ? out : DIAS_TODOS.slice();
  }
  // precos vem como jsonb (objeto) do Supabase, ou já objeto no front; string por segurança
  function precos(v) {
    if (v && typeof v === 'object') { var o = {}; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = num(v[k]); return o; }
    if (typeof v === 'string' && v.trim()) { try { return precos(JSON.parse(v)); } catch (e) { return {}; } }
    return {};
  }

  // ───────────────────────── restaurante / config ─────────────────────────
  // front (DB.restaurant) → linha da tabela `restaurants`.
  // OBS: `mapa` e `peculiaridades` são só do front (sem coluna no schema atual);
  // vão como jsonb em `config_extra` para não perder dado — a migração que cria
  // essa coluna está documentada em docs/FASE2-INTEGRACAO.md (gap conhecido).
  function configToRow(r) {
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
  // linha da tabela `restaurants` → front (DB.restaurant), sem o cardápio (vem à parte).
  function rowToConfig(row) {
    row = row || {};
    var extra = (row.config_extra && typeof row.config_extra === 'object') ? row.config_extra : {};
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
  function itemToRow(it, restaurantId, ordem) {
    it = it || {};
    var row = {
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
    // só manda id se for um uuid do banco (front usa id numérico local — omite)
    if (typeof it.id === 'string' && it.id.indexOf('-') > 0) row.id = it.id;
    return row;
  }
  // linha de `menu_items` → item do front.
  function rowToItem(row) {
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
  function cardapioToRows(cardapio, restaurantId) {
    return (cardapio || []).map(function (it, i) { return itemToRow(it, restaurantId, i); });
  }
  // ordena por `ordem` antes de virar array do front (o banco não garante ordem).
  function rowsToCardapio(rows) {
    return (rows || []).slice()
      .sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); })
      .map(rowToItem);
  }

  // ───────────────────────────── clientes ─────────────────────────────────
  // contato do front → linha de `customers`. `ini`/`whatsapp` são só de UI.
  function customerToRow(cli, restaurantId) {
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
  function rowToCustomer(row) {
    row = row || {};
    var nome = str(row.nome);
    var ini = nome.split(/\s+/).filter(Boolean).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
    return {
      id: row.id,
      nome: nome,
      ini: ini,
      phone: str(row.wa_id),
      whatsapp: true,
      pedidos: parseInt(row.pedidos_count, 10) || 0,
      gasto: num(row.gasto_total, 0),
    };
  }

  var Mappers = {
    DIAS_TODOS: DIAS_TODOS,
    configToRow: configToRow, rowToConfig: rowToConfig,
    itemToRow: itemToRow, rowToItem: rowToItem,
    cardapioToRows: cardapioToRows, rowsToCardapio: rowsToCardapio,
    customerToRow: customerToRow, rowToCustomer: rowToCustomer,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Mappers;
  else root.Mappers = Mappers;
})(typeof self !== 'undefined' ? self : this);
