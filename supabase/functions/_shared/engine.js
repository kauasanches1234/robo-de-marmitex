// Motor de conversa do Robô de Marmitex — PURO (sem DOM, sem rede, sem banco).
// Roda igual em Deno (webhook do WhatsApp) e Node (testes). É a semente do
// cérebro único: no futuro o index.html também passará a importar este módulo,
// eliminando a duplicação entre front e back. Regras seguem a Skill (A01–A20).
//
// Uso:
//   import { responder, estadoInicial } from './engine.js';
//   const r = responder(texto, estado, { cardapio, config });
//   // r.respostas: string[] (mensagens do robô, sintaxe WhatsApp: *negrito*)
//   // r.estado: novo estado a persistir (JSON serializável)

export const estadoInicial = () => ({ step: 'menu', cart: [], endereco: null, pagamento: null, suggested: false, nEntendi: 0 });

const brl = n => (Math.round((+n || 0) * 100) / 100).toFixed(2).replace('.', ',');
const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const etqsOf = it => String((it && it.etiqueta) || '').split('+').map(s => s.trim()).filter(Boolean);
const precoDe = (it, etq) => {
  const p = it && it.precos && etq ? it.precos[etq] : null;
  return (p != null && p !== '') ? +p : (+(it && it.preco) || 0);
};
const isBebida = it => (it.tipo || 'marmita') === 'bebida';

// distância de edição (typo-tolerante) — igual ao front
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n];
}
const kwsOf = it => (it.palavras || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

// termos que identificam UM único produto (descarta genéricos como "marmita")
function termosDistintivos(cardapio) {
  const freq = {};
  for (const it of cardapio) { const seen = new Set(); for (const t of [...kwsOf(it), ...norm(it.nome).split(/\s+/)].filter(x => x.length >= 4)) if (!seen.has(t)) { seen.add(t); freq[t] = (freq[t] || 0) + 1; } }
  return freq;
}

// devolve TODOS os produtos plausíveis (>1 = ambíguo → perguntar). Skill A01/A04.
function candidatos(chunk, cardapio) {
  const c = norm(chunk), hits = [];
  for (const it of cardapio) {
    let ok = it.nome && c.includes(norm(it.nome));
    if (!ok) for (const k of kwsOf(it)) { if (new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(c)) { ok = true; break; } }
    if (ok) hits.push(it);
  }
  if (hits.length) return hits;
  const freq = termosDistintivos(cardapio), tokens = c.split(/\s+/).filter(w => w.length >= 4);
  let best = [], bestD = 99;
  for (const it of cardapio) {
    const terms = [...kwsOf(it), ...norm(it.nome).split(/\s+/)].filter(t => t.length >= 4 && freq[t] === 1);
    let d0 = 99; for (const t of terms) for (const w of tokens) { const d = lev(w, t), thr = t.length >= 5 ? 2 : 1; if (d <= thr && d < d0) d0 = d; }
    if (d0 < bestD) { bestD = d0; best = [it]; } else if (d0 < 99 && d0 === bestD) best.push(it);
  }
  return best;
}

const NUM = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5 };
function parseQty(c) { const m = norm(c).replace(/\b\d{3,4}\b/g, ' ').match(/\b(\d{1,2})\b/); if (m) return Math.max(1, +m[1]); for (const w in NUM) if (new RegExp('\\b' + w + '\\b').test(norm(c))) return NUM[w]; return 1; }

const RE_SAUDACAO = /^\s*(oi+|ol[aa]+|opa+|eai|bom dia|boa (tarde|noite)|tudo bem|hey|ola)\b/;
const opcoes = () => '*1* — Ver cardápio\n*2* — Fazer pedido\n*3* — Falar com atendente';

function menuTxt(cardapio) {
  const linha = i => { const s = etqsOf(i); if (s.length > 1) return `• *${i.nome}*\n   ${s.map(k => `${k} R$ ${brl(precoDe(i, k))}`).join(' · ')}`; return s.length ? `• ${i.nome} — ${s[0]} R$ ${brl(precoDe(i, s[0]))}` : `• ${i.nome} — R$ ${brl(precoDe(i))}`; };
  const marm = cardapio.filter(i => !isBebida(i)), beb = cardapio.filter(isBebida);
  if (!marm.length && !beb.length) return 'Hoje ainda não temos itens no cardápio 😕\nSe precisar, digite *3* para falar com um atendente.';
  let t = 'Cardápio de hoje 🍽️';
  if (marm.length) t += '\n\n*Marmitas* 🍱\n' + marm.map(linha).join('\n');
  if (beb.length) t += '\n\n*Bebidas* 🥤\n' + beb.map(linha).join('\n');
  return t + '\n\nÉ só me dizer o que quer 😊';
}
const descreve = cart => cart.map(i => `• ${i.qtd}× ${i.nome}${i.etiqueta ? ' (' + i.etiqueta + ')' : ''}${i.note ? ' — ' + i.note : ''} — R$ ${brl(i.preco * i.qtd)}`).join('\n');
const diasDe = it => (Array.isArray(it && it.dias) && it.dias.length) ? it.dias : [0, 1, 2, 3, 4, 5, 6];
const DIAS_NOME = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
// "segunda, quarta e sábado" | "todos os dias" | "de segunda a sexta"
function nomesDias(arr) {
  const d = [...new Set(arr)].filter(x => x >= 0 && x <= 6).sort((a, b) => a - b);
  if (d.length >= 7) return 'todos os dias';
  if (d.length === 5 && d.join() === '1,2,3,4,5') return 'de segunda a sexta';
  const ns = d.map(x => DIAS_NOME[x]);
  return ns.length > 1 ? ns.slice(0, -1).join(', ') + ' e ' + ns[ns.length - 1] : (ns[0] || '—');
}
const totalCart = cart => cart.reduce((s, i) => s + i.preco * i.qtd, 0);

// junta linhas por nome+etiqueta+obs (Skill A06)
function addItem(cart, ni) { const s = cart.find(i => i.nome === ni.nome && (i.etiqueta || '') === (ni.etiqueta || '') && (i.note || '') === (ni.note || '')); if (s) s.qtd += ni.qtd; else cart.push({ ...ni }); }

/**
 * Processa uma mensagem do cliente. Função PURA: não muta `estado`, devolve um novo.
 * @returns {{respostas:string[], estado:object}}
 */
export function responder(texto, estado, ctx) {
  // cardapioAll = cardápio completo (com item.dias); `hoje` no fuso do chamador.
  // `cardapio` (do dia) é o que o cliente pode pedir agora; perguntas de
  // disponibilidade ("que dia tem X?") usam o completo. Ver A22/A24.
  const cardapioAll = (ctx && ctx.cardapio) || [];
  const cfg = (ctx && ctx.config) || {};
  const hoje = (ctx && ctx.hoje != null) ? ctx.hoje : new Date().getDay();
  const cardapio = cardapioAll.filter(i => diasDe(i).includes(hoje));
  let e = estado ? JSON.parse(JSON.stringify(estado)) : estadoInicial();
  if (!e.step) e.step = 'menu';
  const out = [];
  const say = t => { out.push(t); };
  const v = norm(texto).slice(0, 1000); // defesa: limita entrada absurda (WhatsApp já limita a 4096)
  const done = () => ({ respostas: out.slice(0, 5), estado: e }); // trava anti-loop (A10)
  const umItem = txt => { const cs = candidatos(txt, cardapioAll); return cs.length === 1 ? cs[0] : null; };

  if (!v) { say('Não recebi sua mensagem 🙂 Pode repetir?'); return done(); }

  // "que dia(s) tem X?" / "quando tem X?" — informa os dias em que o item é servido
  if (/\b(que dia|que dias|quando|qual dia|quais dias)\b/.test(v)) {
    const it = umItem(texto);
    if (it) { say(`*${it.nome}* a gente serve ${nomesDias(diasDe(it))} 🗓️${diasDe(it).includes(hoje) ? '\nHoje tem! Quer pedir? 😊' : ''}`); return done(); }
  }
  // "tem carne hoje?" / "rola feijoada?" / "vocês têm X?" — disponibilidade
  if (/\b(tem|te[mn]|rola|voce?s? te[mn]|vcs? te[mn]|dispon[ií]vel|hoje tem)\b/.test(v) && !/\b(quero|vou querer|manda|me v[eê]|adiciona|p[oõ]e)\b/.test(v)) {
    const it = umItem(texto);
    if (it) {
      if (diasDe(it).includes(hoje)) { if (e.step === 'menu') e.step = 'pedido'; say(`Temos sim! *${it.nome}* está no cardápio de hoje 😋\nQuer que eu anote? (sim / não)`); e.pend = { tipo: 'confirmar', item: it, qtd: 1 }; return done(); }
      say(`Hoje não tem *${it.nome}* 😕\nA gente serve ${nomesDias(diasDe(it))}. Posso te sugerir algo do cardápio de hoje?`); return done();
    }
  }

  // universais (valem em qualquer passo)
  if (/\batendente\b|\bhumano\b|falar com (alguem|atendente|gente)/.test(v)) { e.humano = true; say('Sem problema! 🙋 Já estou chamando um atendente humano. Um instante…'); return done(); }
  if (/^\s*(obrigad|obg|vlw|valeu|brigad)/.test(v)) { say('Imagina! 😊 Precisando, é só chamar.'); return done(); }
  if (/\b(hor[aá]rio|que horas|abre|fecha|funciona|aberto|fechado)\b/.test(v)) { say(`Nosso horário: *${cfg.horario || '—'}* ⏰\nPosso anotar seu pedido? 😊`); return done(); }
  if (/(cancela|apaga|limpa|zera|desist)/.test(v) && /(pedido|tudo|carrinho|compra|desist)/.test(v)) {
    if (!e.cart.length) { say('Você ainda não tem itens anotados 🙂'); return done(); }
    e.cart = []; e.step = 'pedido'; say('Tudo bem, cancelei seu pedido 🗑️\nQuando quiser, é só me chamar 😊'); return done();
  }
  if (/(meu|o) endere[çc]o|qual.*endere[çc]o/.test(v)) { say(e.endereco ? `Seu endereço de entrega é:\n📍 *${e.endereco}*\nEstá correto?` : 'Ainda não tenho seu endereço 🙂 Quando chegar essa etapa eu peço.'); return done(); }
  if (/(meu pedido|o que.*pedi|resumo|qual.*total)/.test(v)) { say(e.cart.length ? 'Seu pedido até agora:\n' + descreve(e.cart) + `\n*Total: R$ ${brl(totalCart(e.cart))}*` : 'Seu pedido ainda está vazio 🙂'); return done(); }

  // atalhos numéricos (A07) — fora do pagamento
  if (e.step !== 'pagamento') {
    if (v === '1') { if (e.step === 'menu') e.step = 'pedido'; say(menuTxt(cardapio)); return done(); }
    if (v === '2') { e.step = 'pedido'; say('Pode mandar! 📝 Ex.: "2 marmitas e uma Coca". O que vai querer?'); return done(); }
    if (v === '3') { e.humano = true; say('Já estou chamando um atendente 🙋'); return done(); }
  }
  if (/card[aá]pio|\bmenu\b|o que (tem|voce|vcs)/.test(v)) { if (e.step === 'menu') e.step = 'pedido'; say(menuTxt(cardapio)); return done(); }

  // pagamento
  if (e.step === 'pagamento') {
    let pg = null;
    if (/^1\b|pix/.test(v)) pg = 'Pix'; else if (/^2\b|dinheiro|espécie|especie/.test(v)) pg = 'Dinheiro'; else if (/^3\b|cart[aã]o|credito|débito|debito/.test(v)) pg = 'Cartão';
    if (pg) {
      e.pagamento = pg; e.step = 'concluido';
      const tx = cfg.entregaGratis ? 0 : (+cfg.taxaEntrega || 0);
      const linha = tx > 0 ? `\nEntrega: R$ ${brl(tx)}` : '\nEntrega: grátis 🎉';
      const tot = totalCart(e.cart) + tx;
      if (pg === 'Pix') say(`Pedido registrado! ✅${linha}\n*Total: R$ ${brl(tot)}*\n\nChave Pix: *${cfg.pixKey || '—'}*\nDepois de pagar, me envie o *comprovante* 🧾`);
      else say(`Pedido confirmado! 🎉${linha}\n*Total: R$ ${brl(tot)}* — *${pg}*\nTempo estimado: ${cfg.tempoEntrega || '40 min'}. Obrigado! 😄`);
      return done();
    }
    say('Como prefere pagar? *1* Pix · *2* Dinheiro · *3* Cartão'); return done();
  }

  // endereço
  if (e.step === 'endereco') {
    if (/[a-z]{3,}/i.test(v) && /\b\d{1,5}\b/.test(v)) {
      e.endereco = texto.trim(); e.step = 'pagamento';
      say(`Anotado! Confirmando seu endereço:\n📍 *${e.endereco}*`);
      say(`Por último, *como prefere pagar*?\n\n*1* — Pix\n*2* — Dinheiro\n*3* — Cartão`);
      return done();
    }
    say('Preciso do endereço no formato: *rua, número e bairro* 🙏\n(ex.: Rua das Flores, 123, Centro)'); return done();
  }

  // finalizar
  if (/(finaliz|confirm|fechar|conclui|encerrar|so isso|é só isso|nada mais|pode seguir)/.test(v) || v.split(/\s+/).some(w => w.length >= 5 && lev(w, 'finalizar') <= 2)) {
    if (e.cart.length) { e.step = 'endereco'; say('📋 *Revisão do pedido:*\n' + descreve(e.cart) + `\n*Total: R$ ${brl(totalCart(e.cart))}*\n\nPerfeito! 📍 Qual o *endereço de entrega*? (rua, número e bairro)`); }
    else say('Seu carrinho está vazio 🙂. O que vai querer?\n' + opcoes());
    return done();
  }

  // reclamação
  if (/\b(demora|absurdo|p[eé]ssimo|horr[ií]vel|ridiculo|palha[çc]ada|cad[eê] (meu|o) pedido|que raiva)\b/.test(v)) {
    if (e.pagamento) say(`Desculpa pela espera! 😔 Seu pedido está em preparo 🍱\nTempo estimado: *${cfg.tempoEntrega || '40 min'}*.`);
    else { e.humano = true; say('Desculpa por qualquer transtorno! 😔 Já estou te encaminhando para um atendente. Um instante…'); }
    return done();
  }

  // saudação
  if (RE_SAUDACAO.test(v) && !e.cart.length && e.step === 'menu') { say(`Olá! 👋 Sou o robô da *${cfg.nome || 'nossa loja'}*.\nÉ só me dizer seu pedido ou escolher:\n\n${opcoes()}`); return done(); }

  // aguardando tamanho / confirmação pendente
  if (e.pend) {
    const p = e.pend; const sizes = etqsOf(p.item);
    const pedida = (v.match(/\b(p|m|g|lata|600|2l)\b/) || [])[1] || (/(pequen)/.test(v) ? 'p' : /(grand)/.test(v) ? 'g' : /(m[eé]di)/.test(v) ? 'm' : null);
    if (p.tipo === 'tamanho' && pedida) { const own = sizes.find(s => s.toLowerCase() === pedida); if (own) { addItem(e.cart, { nome: p.item.nome, preco: precoDe(p.item, own), etiqueta: own, qtd: p.qtd || 1, note: null }); e.pend = null; return confirma(e, cardapio, say, done, ctx); } }
    if (p.tipo === 'confirmar' && /^(sim|s|isso|claro|pode|quero|ok|blz|👍|👌|✅)/.test(v)) {
      // vários tamanhos → pergunta qual (não anota o 1º por conta própria, A02)
      if (sizes.length > 1) { e.pend = { tipo: 'tamanho', item: p.item, qtd: p.qtd || 1 }; say(`*${p.item.nome}* tem os tamanhos ${sizes.map(s => `${s} R$ ${brl(precoDe(p.item, s))}`).join(' · ')} — qual você quer? 😊`); return done(); }
      addItem(e.cart, { nome: p.item.nome, preco: precoDe(p.item, sizes[0] || ''), etiqueta: sizes[0] || '', qtd: p.qtd || 1, note: null }); e.pend = null; return confirma(e, cardapio, say, done, ctx);
    }
    if (/^(n[aã]o|nao)/.test(v)) { e.pend = null; say('Tudo bem! 🙂 Deseja mais alguma coisa ou finalizar?'); return done(); }
    e.pend = null; // não respondeu — segue
  }

  // pedido genérico → lista a categoria (A04)
  if (/\b(bebida|refrigerante|suco)s?\b/.test(v)) { const bs = cardapio.filter(isBebida); if (bs.length) { say(`Temos ${bs.map(b => '*' + b.nome + '*').join(', ')} — qual você prefere? 😊`); if (e.step === 'menu') e.step = 'pedido'; return done(); } }
  if (/\b(marmita|comida|almo[çc]o|janta|prato)s?\b/.test(v) && !candidatos(v, cardapio).length) { const ms = cardapio.filter(i => !isBebida(i)); if (ms.length) { say(`Temos ${ms.map(m => '*' + m.nome + '*').join(', ')} — qual você prefere? 😊`); if (e.step === 'menu') e.step = 'pedido'; return done(); } }

  // adicionar item
  const cands = candidatos(texto, cardapio);
  if (cands.length === 1) {
    const it = cands[0], sizes = etqsOf(it);
    if (e.step === 'menu') e.step = 'pedido';
    if (sizes.length > 1) { e.pend = { tipo: 'tamanho', item: it, qtd: parseQty(texto) }; say(`*${it.nome}* tem os tamanhos ${sizes.map(s => `${s} R$ ${brl(precoDe(it, s))}`).join(' · ')} — qual você quer? 😊`); return done(); }
    addItem(e.cart, { nome: it.nome, preco: precoDe(it, sizes[0]), etiqueta: sizes[0] || '', qtd: parseQty(texto), note: null });
    return confirma(e, cardapio, say, done, ctx);
  }
  if (cands.length > 1) { if (e.step === 'menu') e.step = 'pedido'; say(`Temos ${cands.map(o => '*' + o.nome + '*').join(', ')} — qual você prefere? 😊`); return done(); }

  // sim solto
  if (/^(sim|s|isso|claro|pode ser|quero|ok|blz|beleza|👍|👌|✅)\b/.test(v)) { say('Pode mandar o próximo item 😄'); if (e.step === 'menu') e.step = 'pedido'; return done(); }

  // fallback variado (A14)
  e.nEntendi = (e.nEntendi || 0) + 1;
  const fb = [
    `Hmm, não entendi 🤔\nMe diz seu pedido (ex.: "uma marmita de frango") ou escolha:\n${opcoes()}`,
    `Essa eu não peguei 😅 Pode escrever de outro jeito?\nEx.: "uma marmita de carne e uma coca".`,
    `Ainda não consegui entender 😕\nSe preferir, digite *3* que eu chamo um atendente humano.`,
  ];
  say(fb[Math.min(e.nEntendi, 3) - 1]);
  return done();
}

// confirma item(ns) + sugere bebida uma vez + repete o pedido completo (A05)
function confirma(e, cardapio, say, done, ctx) {
  let msg = 'Anotado! ✅ Seu pedido até agora:\n' + descreve(e.cart);
  const temBebida = e.cart.some(i => { const it = cardapio.find(x => x.nome === i.nome); return it && isBebida(it); });
  if (!temBebida && !e.suggested) { const bs = cardapio.filter(isBebida); if (bs.length) { msg += `\n\n🥤 Quer uma bebida pra acompanhar? Tem ${bs.map(b => b.nome).join(', ')}.`; e.suggested = true; } }
  msg += '\n\nPosso anotar mais alguma coisa, ou já deseja *finalizar* o pedido? 😊';
  say(msg); return done();
}
