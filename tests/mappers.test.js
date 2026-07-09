/* Camada de integração front↔back — mapeadores puros (js/mappers.js).
   Garante que a tradução painel ↔ Supabase é fiel nos dois sentidos (ida-e-volta)
   e resistente a dados ausentes/sujos vindos do banco. Roda no Node, sem banco. */
import * as M from '../supabase/functions/_shared/mappers.js';

let pass = 0, fail = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + nome); cond ? pass++ : fail++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ───────────────────────── config / restaurante ─────────────────────────
const cfg = { nome: 'Sabor Caseiro', horario: '11h–22h', pixKey: 'pix@x.com', tempoEntrega: '40 min', taxaEntrega: 5, entregaGratis: false, mapa: { lat: -23.5, lng: -46.6, zonas: [] }, peculiaridades: ['sem vegano'] };
const cfgRow = M.configToRow(cfg);
check('config→row usa snake_case (pix_key/taxa_entrega)', cfgRow.pix_key === 'pix@x.com' && cfgRow.taxa_entrega === 5);
check('config→row guarda mapa/peculiaridades em config_extra', cfgRow.config_extra.mapa.lat === -23.5 && cfgRow.config_extra.peculiaridades[0] === 'sem vegano');
const cfgBack = M.rowToConfig(cfgRow);
check('config ida-e-volta preserva os campos', cfgBack.nome === cfg.nome && cfgBack.pixKey === cfg.pixKey && cfgBack.taxaEntrega === 5 && cfgBack.entregaGratis === false);
check('config ida-e-volta preserva mapa e peculiaridades', eq(cfgBack.mapa, cfg.mapa) && eq(cfgBack.peculiaridades, cfg.peculiaridades));

// row do banco com nulos não quebra e cai em defaults
const cfgNulo = M.rowToConfig({ nome: null, taxa_entrega: null, entrega_gratis: null, config_extra: null });
check('row nulo → defaults seguros', cfgNulo.nome === 'Meu Restaurante' && cfgNulo.taxaEntrega === 0 && cfgNulo.entregaGratis === false && cfgNulo.tempoEntrega === '40 min');
check('row nulo → mapa null e peculiaridades []', cfgNulo.mapa === null && eq(cfgNulo.peculiaridades, []));

// entrega grátis booleana vinda como 'true'/1 do banco
check('entrega_gratis aceita 1/"true"', M.rowToConfig({ entrega_gratis: 1 }).entregaGratis === true && M.rowToConfig({ entrega_gratis: 'true' }).entregaGratis === true);

// ───────────────────────────── cardápio ─────────────────────────────────
const cardapio = [
  { id: 1, nome: 'Marmita de Frango', tipo: 'marmita', etiqueta: 'P+M+Família', precos: { P: 16, M: 18, 'Família': 30 }, palavras: 'frango', dias: [0, 1, 2, 3, 4, 5, 6] },
  { id: 2, nome: 'Feijoada', tipo: 'marmita', etiqueta: '', preco: 25, precos: {}, palavras: 'feijoada', dias: [3, 6] },
  { id: 3, nome: 'Coca-Cola', tipo: 'bebida', etiqueta: 'lata+2L', precos: { lata: 7, '2L': 12 }, palavras: 'coca, refri' },
];
const rows = M.cardapioToRows(cardapio, 'rest-uuid-1');
check('cardapio→rows carimba restaurant_id', rows.every(r => r.restaurant_id === 'rest-uuid-1'));
check('cardapio→rows preserva ordem (index)', rows[0].ordem === 0 && rows[1].ordem === 1 && rows[2].ordem === 2);
check('cardapio→rows mantém variedade Família no precos', rows[0].precos['Família'] === 30 && rows[0].etiqueta === 'P+M+Família');
check('cardapio→rows preserva dias da feijoada', eq(rows[1].dias, [3, 6]));
check('cardapio→rows: item sem dias vira todos os dias', eq(rows[2].dias, [0, 1, 2, 3, 4, 5, 6]));
check('cardapio→rows: id numérico local NÃO vai pro banco', rows.every(r => r.id === undefined));
check('cardapio→rows: ativo default true', rows.every(r => r.ativo === true));

// rows do banco (fora de ordem) → cardápio ordenado
const rowsDb = [
  { id: 'a', nome: 'B', tipo: 'marmita', etiqueta: 'M', precos: { M: 18 }, dias: [1, 2], ativo: true, ordem: 2 },
  { id: 'b', nome: 'A', tipo: 'marmita', etiqueta: 'G', precos: { G: 20 }, dias: null, ativo: true, ordem: 1 },
];
const card = M.rowsToCardapio(rowsDb);
check('rows→cardapio ordena por `ordem`', card[0].nome === 'A' && card[1].nome === 'B');
check('rows→cardapio: dias null vira todos os dias', eq(card[0].dias, [0, 1, 2, 3, 4, 5, 6]));
check('rows→cardapio: preserva uuid do banco', card[0].id === 'b');

// precos vindo como STRING (jsonb serializado) não quebra
check('precos como string JSON é parseado', M.rowToItem({ nome: 'X', precos: '{"G":20}' }).precos.G === 20);
check('precos inválido vira {}', eq(M.rowToItem({ nome: 'X', precos: 'lixo' }).precos, {}));

// ida-e-volta do item preserva o essencial (id numérico é local, ignorado)
const it0 = cardapio[0];
const back = M.rowToItem(M.itemToRow(it0, 'r', 0));
check('item ida-e-volta preserva nome/etiqueta/precos/dias/tipo', back.nome === it0.nome && back.etiqueta === it0.etiqueta && eq(back.precos, it0.precos) && eq(back.dias, it0.dias) && back.tipo === it0.tipo);

// ───────────────────────────── clientes ─────────────────────────────────
const cli = { id: 99, nome: 'João Silva', ini: 'JS', phone: '5512999', whatsapp: true, pedidos: 3, gasto: 120.5 };
const cliRow = M.customerToRow(cli, 'rest-uuid-1');
check('cliente→row usa wa_id/pedidos_count/gasto_total', cliRow.wa_id === '5512999' && cliRow.pedidos_count === 3 && cliRow.gasto_total === 120.5);
check('cliente→row carimba restaurant_id', cliRow.restaurant_id === 'rest-uuid-1');
const cliBack = M.rowToCustomer({ id: 'c-uuid', nome: 'João Silva', wa_id: '5512999', pedidos_count: 3, gasto_total: 120.5 });
check('row→cliente recalcula iniciais', cliBack.ini === 'JS');
check('row→cliente preserva phone/pedidos/gasto', cliBack.phone === '5512999' && cliBack.pedidos === 3 && cliBack.gasto === 120.5);
check('row→cliente com nome vazio não quebra as iniciais', M.rowToCustomer({ nome: null, wa_id: '5512' }).ini === '');

console.log(`\nRESULTADO: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
