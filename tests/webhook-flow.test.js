/* Integração back — o caminho REAL do webhook, sem banco nem rede:
   linha do Postgres → mappers.js → engine.js → resposta.
   Reproduz exatamente o que supabase/functions/whatsapp-webhook/index.ts faz
   (rowToItem/rowToConfig + responder). Se o formato do banco e o cérebro
   deixarem de conversar, este teste quebra. Fixa hoje = SEGUNDA (1). */
import { responder, estadoInicial } from '../supabase/functions/_shared/engine.js';
import { rowToItem, rowToConfig } from '../supabase/functions/_shared/mappers.js';

let pass = 0, fail = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + nome); cond ? pass++ : fail++; };

// linhas como o supabase-js devolve: snake_case, precos jsonb (objeto),
// dias int[], e campos que podem vir null (defensividade real do banco).
const menuRows = [
  { id: 'uuid-1', restaurant_id: 'r1', nome: 'Marmita de Frango', tipo: 'marmita', etiqueta: 'P+M+Família', precos: { P: 16, M: 18, 'Família': 30 }, preco: 0, palavras: 'frango', dias: [0, 1, 2, 3, 4, 5, 6], ativo: true, ordem: 0 },
  { id: 'uuid-2', restaurant_id: 'r1', nome: 'Feijoada', tipo: 'marmita', etiqueta: '', precos: {}, preco: 25, palavras: 'feijoada, feijao', dias: [3, 6], ativo: true, ordem: 1 },
  { id: 'uuid-3', restaurant_id: 'r1', nome: 'Coca-Cola', tipo: 'bebida', etiqueta: 'lata', precos: { lata: 7 }, preco: 0, palavras: 'coca, refri', dias: null, ativo: true, ordem: 2 },
];
const restRow = { id: 'r1', nome: 'Sabor Caseiro', horario: '11h–22h', pix_key: 'pix@x.com', tempo_entrega: '35 min', taxa_entrega: 5, entrega_gratis: false, config_extra: null };

// mapeamento IDÊNTICO ao do webhook (index.ts)
const cardapio = menuRows.map(rowToItem);
const config = rowToConfig(restRow);

check('rowToConfig traduz snake_case → camelCase', config.pixKey === 'pix@x.com' && config.tempoEntrega === '35 min' && config.taxaEntrega === 5);
check('rowToItem preserva variedade e precos jsonb', cardapio[0].precos['Família'] === 30 && cardapio[0].etiqueta === 'P+M+Família');
check('rowToItem: dias null → todos os dias', JSON.stringify(cardapio[2].dias) === JSON.stringify([0, 1, 2, 3, 4, 5, 6]));

// helper de conversa igual ao webhook: estado persistido volta a cada mensagem
const HOJE = 1; // segunda — feijoada (qua/sáb) NÃO tem
function conversa() {
  let e = estadoInicial();
  return {
    diz(t) { const r = responder(t, e, { cardapio, config, hoje: HOJE }); e = r.estado; this.u = r.respostas.join('\n'); return this.u; },
    get estado() { return e; },
  };
}

// 1) cardápio do dia não traz feijoada (fora do dia), traz frango e coca
let c = conversa();
const menu = c.diz('cardapio');
check('cardápio da segunda tem frango e coca', /Frango/.test(menu) && /Coca-Cola/.test(menu));
check('cardápio da segunda NÃO tem feijoada (dias [3,6])', !/Feijoada/.test(menu));
check('cardápio mostra a variedade Família com preço', /Família R\$ 30,00/.test(menu));

// 2) disponibilidade por dia — "rola feijoada?" na segunda
let c2 = conversa();
check('"rola feijoada?" na segunda → não, com os dias', /Hoje não tem \*Feijoada\*[\s\S]*quarta e sábado/.test(c2.diz('rola feijoada?')));
check('feijoada fora do dia não anota nada', c2.estado.cart.length === 0);

// 3) fluxo completo: pede frango (Família) → endereço → pagamento → concluído
let f = conversa();
f.diz('oi');
check('pedir frango pergunta o tamanho (inclui Família)', /tem os tamanhos[\s\S]*Família R\$ 30,00/.test(f.diz('quero uma marmita de frango')));
f.diz('família');
check('anotou o frango Família a R$ 30,00', f.estado.cart.length === 1 && f.estado.cart[0].preco === 30 && f.estado.cart[0].etiqueta === 'Família');
f.diz('finalizar');
check('após finalizar pede endereço', /endere[çc]o/i.test(f.u) && f.estado.step === 'endereco');
f.diz('Rua das Flores, 123, Centro');
check('endereço aceito → pergunta pagamento', /pagar/i.test(f.u) && f.estado.step === 'pagamento');
const fim = f.diz('pix');
check('paga no Pix → conclui com a chave e o total', /Chave Pix: \*pix@x\.com\*/.test(fim) && f.estado.step === 'concluido');
check('total = 30 (item) + 5 (entrega) = R$ 35,00', /R\$ 35,00/.test(fim));

// 4) estado é serializável (o webhook grava em jsonb) — sem funções/ciclos
let ok = true; try { JSON.parse(JSON.stringify(f.estado)); } catch { ok = false; }
check('estado do robô é JSON-serializável (grava em conversations.estado)', ok);

console.log(`\nRESULTADO: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
