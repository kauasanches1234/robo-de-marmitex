/* Bateria do MOTOR puro (supabase/functions/_shared/engine.js) — roda em Node,
   sem navegador nem Supabase. Valida o cérebro compartilhado do backend. */
import { responder, estadoInicial } from '../supabase/functions/_shared/engine.js';

let pass = 0, fail = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + nome); cond ? pass++ : fail++; };

const cardapio = [
  { nome: 'Marmita de Frango', tipo: 'marmita', etiqueta: 'P+M+G', precos: { P: 16, M: 18, G: 22 }, palavras: 'frango, file de frango' },
  { nome: 'Marmita de Carne', tipo: 'marmita', etiqueta: 'G', precos: { G: 20 }, palavras: 'carne, bife' },
  { nome: 'Pepsi', tipo: 'bebida', etiqueta: 'lata', precos: { lata: 6 }, palavras: 'pepsi, refri' },
  { nome: 'Coca-Cola', tipo: 'bebida', etiqueta: 'lata', precos: { lata: 7 }, palavras: 'coca, refri' },
  { nome: 'Guaraná', tipo: 'bebida', etiqueta: 'lata', precos: { lata: 6 }, palavras: 'guarana, refri' },
];
const config = { nome: 'Sabor Caseiro', horario: '11h–22h', pixKey: 'pix@sabor.com', tempoEntrega: '40 min', taxaEntrega: 5, entregaGratis: false };
const ctx = { cardapio, config };

// helper: mantém estado entre mensagens, como o webhook fará
function conversa() {
  let e = estadoInicial();
  return { diz(t) { const r = responder(t, e, ctx); e = r.estado; this.ultima = r.respostas.join('\n'); this.todas = r.respostas; return this.ultima; }, get estado() { return e; } };
}

// ===== saudação e cardápio =====
let c = conversa();
check('saudação', /Sou o robô da \*Sabor Caseiro\*/.test(c.diz('oi')));
check('cardápio por seções + preço por tamanho', /\*Marmitas\*[\s\S]*Frango[\s\S]*P R\$ 16,00 · M R\$ 18,00 · G R\$ 22,00[\s\S]*\*Bebidas\*/.test(c.diz('1')));

// ===== pergunta o tamanho (não anota por dedução) =====
check('pede o tamanho do frango', /tem os tamanhos[\s\S]*qual você quer/.test(c.diz('quero uma marmita de frango')));
check('carrinho vazio antes de escolher tamanho', c.estado.cart.length === 0);
check('escolhe G e anota com preço certo', /1× Marmita de Frango \(G\) — R\$ 22,00/.test(c.diz('grande')));
check('sugere bebida uma vez', /Quer uma bebida/.test(c.ultima));

// ===== ambiguidade de bebida =====
check('"um refri" pergunta qual', /Pepsi[\s\S]*Coca-Cola[\s\S]*Guaraná[\s\S]*qual você prefere/.test(c.diz('um refri')));
check('resolve a bebida', /1× Guaraná/.test(c.diz('guarana')));

// ===== typo no nome =====
let c2 = conversa();
check('typo "frang" reconhece Frango (pede tamanho)', /Marmita de Frango[\s\S]*tamanhos/.test(c2.diz('quero uma marmita de frang')));

// ===== fluxo até o fim =====
let c3 = conversa();
c3.diz('uma marmita de carne');
check('carne (tamanho único) anota direto', /1× Marmita de Carne \(G\) — R\$ 20,00/.test(c3.ultima));
check('finalizar pede endereço', /endereço de entrega/.test(c3.diz('finalizar')));
check('endereço sem número recusado', /rua, número e bairro/.test(c3.diz('só a rua aqui')));
const okEnd = c3.diz('Rua Teste, 123, Centro');
check('endereço confirmado + pede pagamento', /Confirmando seu endereço[\s\S]*Rua Teste, 123, Centro[\s\S]*como prefere pagar/i.test(okEnd));
check('paga em dinheiro fecha', /Pedido confirmado[\s\S]*Dinheiro/.test(c3.diz('2')));

// ===== consultas e sociais =====
let c4 = conversa();
check('horário', /11h–22h/.test(c4.diz('que horas abre?')));
check('agradecimento', /Imagina/.test(c4.diz('obrigado')));
check('cancelar sem itens', /não tem itens/.test(c4.diz('cancelar o pedido')));

// ===== cancelamento com itens =====
let c5 = conversa();
c5.diz('uma marmita de carne');
check('cancela pedido inteiro', /cancelei/.test(c5.diz('quero cancelar o pedido')) && c5.estado.cart.length === 0);

// ===== atendente e reclamação =====
let c6 = conversa();
check('pede atendente', /atendente/.test(c6.diz('quero falar com um atendente')) && c6.estado.humano === true);
let c7 = conversa();
check('reclamação sem pedido → humano', /encaminhando/.test(c7.diz('que absurdo, isso é péssimo')) && c7.estado.humano === true);

// ===== fallback varia e nunca dispara em rajada =====
let c8 = conversa();
const f1 = c8.diz('qual a capital da frança?');
const f2 = c8.diz('me conta uma piada');
check('fallback não repete a mesma frase', f1 !== f2);
check('3º fallback oferece atendente', /atendente/.test(c8.diz('asdkjhaskd')));

// ===== pureza: não muta o estado passado =====
const base = estadoInicial();
const snap = JSON.stringify(base);
responder('uma marmita de carne', base, ctx);
check('função é pura (não muta o estado recebido)', JSON.stringify(base) === snap);

// ===== anti-loop: no máximo 5 respostas por mensagem =====
check('nunca devolve mais de 5 respostas', responder('finalizar', { step: 'pagamento', cart: [], endereco: 'x', pagamento: null }, ctx).respostas.length <= 5);

// ===== cardápio vazio no dia (motor não quebra) =====
check('cardápio vazio → avisa e oferece atendente', /não temos itens no cardápio/.test(responder('cardapio', estadoInicial(), { cardapio: [], config }).respostas.join('\n')));

// ===== entrada gigante não quebra nem estoura =====
const r = responder('a'.repeat(5000), estadoInicial(), ctx);
check('entrada gigante é tratada sem erro', Array.isArray(r.respostas) && r.respostas.length >= 1);

console.log(`\nRESULTADO: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
