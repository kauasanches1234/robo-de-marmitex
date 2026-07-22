// Repositório do painel ↔ Supabase. Recebe um cliente supabase-js JÁ pronto
// (injetado) e o id do restaurante, e expõe operações de alto nível que o painel
// usa no lugar do localStorage. Toda tradução passa pelos mapeadores (DRY).
//
// Injeção de dependência de propósito: no navegador entra o cliente real; nos
// testes entra um cliente-falso (tests/repo.test.js) — então dá para validar a
// lógica sem rede nem banco. ESM: roda no Node (teste) e no navegador (module).
import {
  rowsToCardapio, cardapioToRows,
  rowToConfig, configToRow,
  rowToCustomer,
} from '../supabase/functions/_shared/mappers.js';

// desembrulha { data, error } do supabase-js: erro vira exceção (o painel trata).
function ok(res) {
  if (res && res.error) throw new Error(res.error.message || String(res.error));
  return res ? res.data : null;
}

export function createRepo(sb, restaurantId) {
  if (!sb) throw new Error('repo: cliente supabase ausente');
  if (!restaurantId) throw new Error('repo: restaurantId ausente');
  const rid = restaurantId;

  return {
    // ── cardápio ──
    async carregarCardapio() {
      const data = ok(await sb.from('menu_items').select('*').eq('restaurant_id', rid).order('ordem'));
      return rowsToCardapio(data || []);
    },
    // salvar = substituição completa (o painel edita o cardápio inteiro):
    // apaga os itens do restaurante e reinsere. menu_items não é referenciado por
    // FK (pedidos guardam um snapshot em jsonb), então é seguro e simples.
    async salvarCardapio(cardapio) {
      ok(await sb.from('menu_items').delete().eq('restaurant_id', rid));
      const rows = cardapioToRows(cardapio || [], rid);
      if (rows.length) ok(await sb.from('menu_items').insert(rows));
      return true;
    },

    // ── config do restaurante ──
    async carregarConfig() {
      const data = ok(await sb.from('restaurants').select('*').eq('id', rid).single());
      return rowToConfig(data);
    },
    async salvarConfig(cfg) {
      ok(await sb.from('restaurants').update(configToRow(cfg)).eq('id', rid));
      return true;
    },

    // ── clientes (leitura no painel) ──
    async listarClientes() {
      const data = ok(await sb.from('customers').select('*').eq('restaurant_id', rid).order('updated_at', { ascending: false }));
      return (data || []).map(rowToCustomer);
    },

    // ── pedidos (leitura para KPIs / aba Pedidos) ──
    async listarPedidos() {
      const data = ok(await sb.from('orders').select('*').eq('restaurant_id', rid).order('created_at', { ascending: false }));
      return data || [];
    },
  };
}
