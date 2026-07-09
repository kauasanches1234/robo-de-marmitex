/* Motor puro — variedades personalizadas (Família, Kids…) além de P/M/G/lata.
   Uma marmita com etiqueta "P+M+Família" e preço próprio da variedade. O robô
   deve listar a variedade no cardápio, perguntar o tamanho e anotar pelo nome
   da variedade (ex.: "família"). Mesmo cérebro do webhook do WhatsApp. */
import { responder, estadoInicial } from '../supabase/functions/_shared/engine.js';

let pass = 0, fail = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + nome); cond ? pass++ : fail++; };

const cardapio = [
  { nome: 'Marmita de Frango', tipo: 'marmita', etiqueta: 'P+M+Família', precos: { P: 16, M: 18, 'Família': 30 }, palavras: 'frango', dias: [0, 1, 2, 3, 4, 5, 6] },
  { nome: 'Coca-Cola', tipo: 'bebida', etiqueta: 'lata+2L', precos: { lata: 7, '2L': 12 }, palavras: 'coca, refri', dias: [0, 1, 2, 3, 4, 5, 6] },
];
const config = { nome: 'Sabor Caseiro', horario: '11h–22h', pixKey: 'pix@x.com', tempoEntrega: '40 min', taxaEntrega: 5 };
const conversa = () => { let e = estadoInicial(); return { diz(t) { const r = responder(t, e, { cardapio, config, hoje: 1 }); e = r.estado; this.u = r.respostas.join('\n'); return this.u; }, get estado() { return e; } }; };

// cardápio lista a variedade com seu preço próprio
let a = conversa();
const menu = a.diz('cardapio');
check('cardápio mostra a variedade Família com preço', /Família R\$ 30,00/.test(menu));
check('cardápio mostra P e M também', /P R\$ 16,00[\s\S]*M R\$ 18,00/.test(menu));

// pedir o frango pergunta o tamanho (inclui a variedade)
let b = conversa();
check('pedir frango pergunta o tamanho', /tem os tamanhos[\s\S]*Família R\$ 30,00[\s\S]*qual/.test(b.diz('quero uma marmita de frango')));
check('escolher "família" anota com o preço da variedade', /1× Marmita de Frango \(Família\)[\s\S]*R\$ 30,00/.test(b.diz('família')));
check('cart tem etiqueta Família e preço 30', b.estado.cart.length === 1 && b.estado.cart[0].etiqueta === 'Família' && b.estado.cart[0].preco === 30);

// escolher um tamanho fixo (M) ainda funciona
let c = conversa();
c.diz('quero frango');
check('escolher M anota o preço de M (18)', /1× Marmita de Frango \(M\)[\s\S]*R\$ 18,00/.test(c.diz('quero o M')));
check('cart M preço 18', c.estado.cart[0].etiqueta === 'M' && c.estado.cart[0].preco === 18);

// variedade em bebida (2L) — mesma mecânica
let d = conversa();
d.diz('quero uma coca');
check('bebida com variedade 2L pergunta o tamanho', /tem os tamanhos[\s\S]*2L R\$ 12,00/.test(d.u));
check('escolher 2L anota preço 12', /Coca-Cola \(2L\)[\s\S]*R\$ 12,00/.test(d.diz('a de 2L')) && d.estado.cart[0].preco === 12);

// "tem família?" não é um item — não deve quebrar nem inventar
let e2 = conversa();
const r = e2.diz('tem família hoje?');
check('"tem família?" não quebra (variedade não é item)', typeof r === 'string' && r.length > 0);

console.log(`\nRESULTADO: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
