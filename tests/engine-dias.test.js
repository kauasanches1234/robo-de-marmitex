/* Treino do robô como CLIENTE HUMANO — disponibilidade por dia da semana.
   Conversas reais: "tem carne hoje?", "rola feijoada?", "que dia tem feijoada?".
   hoje é passado no ctx (determinístico). Feijoada = quarta(3) e sábado(6). */
import { responder, estadoInicial } from '../supabase/functions/_shared/engine.js';

let pass = 0, fail = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + nome); cond ? pass++ : fail++; };

const cardapio = [
  { nome: 'Marmita de Frango', tipo: 'marmita', etiqueta: 'P+M+G', precos: { P: 16, M: 18, G: 22 }, palavras: 'frango', dias: [0, 1, 2, 3, 4, 5, 6] },
  { nome: 'Marmita de Carne', tipo: 'marmita', etiqueta: 'G', precos: { G: 20 }, palavras: 'carne, bife', dias: [0, 1, 2, 3, 4, 5, 6] },
  { nome: 'Feijoada', tipo: 'marmita', etiqueta: '', preco: 25, palavras: 'feijoada, feijão', dias: [3, 6] },
  { nome: 'Coca-Cola', tipo: 'bebida', etiqueta: 'lata', precos: { lata: 7 }, palavras: 'coca, refri', dias: [0, 1, 2, 3, 4, 5, 6] },
];
const config = { nome: 'Sabor Caseiro', horario: '11h–22h', pixKey: 'pix@x.com', tempoEntrega: '40 min', taxaEntrega: 5 };
const conversa = hoje => { let e = estadoInicial(); return { diz(t) { const r = responder(t, e, { cardapio, config, hoje }); e = r.estado; this.u = r.respostas.join('\n'); return this.u; }, get estado() { return e; } }; };

// ── hoje = SEGUNDA (1): feijoada NÃO tem ──
let seg = conversa(1);
check('"tem carne hoje?" na segunda → sim', /Temos sim!.*Marmita de Carne/s.test(seg.diz('tem carne hoje?')));
check('confirma e pede tamanho? carne é G único → anota', /1× Marmita de Carne \(G\)/.test(seg.diz('sim')));

let seg2 = conversa(1);
check('"rola feijoada?" na segunda → não, informa dias', /Hoje não tem \*Feijoada\*[\s\S]*quarta e sábado/.test(seg2.diz('rola feijoada?')));
check('nada anotado (feijoada fora do dia)', seg2.estado.cart.length === 0);

let seg3 = conversa(1);
check('"que dia tem feijoada?" lista os dias', /Feijoada[\s\S]*quarta e sábado/.test(seg3.diz('que dia tem feijoada?')));

let seg4 = conversa(1);
check('"feijoada é servida quando?" também responde os dias', /quarta e sábado/.test(seg4.diz('a feijoada vocês servem quando?')));

// cardápio de segunda não lista feijoada
let seg5 = conversa(1);
check('cardápio de segunda não tem feijoada', !/Feijoada/.test(seg5.diz('cardapio')));
check('cardápio de segunda tem frango e carne', /Frango[\s\S]*Carne/.test(seg5.u));

// ── hoje = QUARTA (3): feijoada TEM ──
let qua = conversa(3);
check('"tem feijoada hoje?" na quarta → sim', /Temos sim!.*Feijoada/s.test(qua.diz('tem feijoada hoje?')));
check('confirma → anota feijoada (preço único 25)', /1× Feijoada.*R\$ 25,00/.test(qua.diz('isso')));

let qua2 = conversa(3);
check('cardápio de quarta lista feijoada', /Feijoada/.test(qua2.diz('cardapio')));

// pedir direto feijoada na quarta funciona
let qua3 = conversa(3);
check('"quero feijoada" na quarta anota', /1× Feijoada/.test(qua3.diz('quero uma feijoada')));

// pedir feijoada direto na segunda NÃO anota (fora do dia)
let seg6 = conversa(1);
seg6.diz('quero uma feijoada');
check('"quero feijoada" na segunda não anota', seg6.estado.cart.length === 0);

// "tem X?" com item inexistente cai no fluxo normal (não quebra)
let seg7 = conversa(1);
const r7 = seg7.diz('tem estrogonofe?');
check('item inexistente não quebra', typeof r7 === 'string' && r7.length > 0);

// não confundir pedido com pergunta: "quero carne" anota (não é disponibilidade)
let seg8 = conversa(1);
check('"quero carne" é pedido, não pergunta', /1× Marmita de Carne/.test(seg8.diz('quero carne')));

console.log(`\nRESULTADO: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
