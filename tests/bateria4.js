/* Bateria 4 — linguagem real de cliente: gírias, irritação, cancelamento,
   fora de contexto, mensagens em partes, pedidos múltiplos e tentativas de quebra. */
const { chromium } = require('playwright-core');
let pass = 0, fail = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + nome); cond ? pass++ : fail++; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('dialog', d => d.accept(''));
  let geo = [];
  await page.route('**nominatim.openstreetmap.org/**', r => {
    if (r.request().url().includes('/reverse')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ address: { city: 'São Paulo', state: 'SP' } }) });
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(geo) });
  });
  const say = async txt => { await page.fill('#convInput', txt); await page.press('#convInput', 'Enter'); await page.waitForTimeout(1400); };
  const ultimaBot = () => page.$$eval('#convMsgs .msg.bot', els => els.length ? els[els.length - 1].innerText : '');

  await page.goto('http://localhost:3457/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.click('#newConvBtn');
  await page.waitForTimeout(1200);

  // ===== horário e agradecimento =====
  await say('que horas vocês abrem?');
  check('horário de funcionamento respondido', /11h–15h e 18h–22h/.test(await ultimaBot()));
  await say('obrigado');
  check('agradecimento tem resposta própria', /Imagina/.test(await ultimaBot()));
  await say('vlw');
  check('gíria de agradecimento (vlw)', /Imagina/.test(await ultimaBot()));

  // ===== pedido genérico → lista opções =====
  await say('quero uma marmita');
  check('"uma marmita" lista as opções', /Marmita de Frango[\s\S]*Marmita de Carne[\s\S]*Marmita Fitness/.test(await ultimaBot()));
  await say('de frango');
  check('resposta em partes resolve o prato', /1× Marmita de Frango/.test(await ultimaBot()));

  // ===== emoji como confirmação (sugestão de bebida pendente não há; usa pergunta de preço) =====
  await say('quanto custa o guaraná?');
  check('pergunta de preço', /Guaraná[\s\S]*R\$ 6,00/.test(await ultimaBot()));
  await say('👍');
  check('emoji 👍 confirma e anota', /1× Guaraná/.test(await ultimaBot()));

  // ===== pedido múltiplo em uma frase =====
  await say('2 marmitas de carne sem cebola e 3 pepsi');
  const carrinho = (await page.$eval('#orderList', e => e.innerText)).replace(/\s+/g, ' ');
  check('múltiplos com quantidade e observação', /2× Marmita de Carne/.test(carrinho) && /3× Pepsi/.test(carrinho) && /sem cebola/.test(carrinho));

  // ===== cancelamento total =====
  await say('quero cancelar o pedido');
  check('cancela o pedido inteiro', /cancelei seu pedido/i.test(await ultimaBot()));
  check('carrinho esvaziado', /Nenhum item ainda/.test(await page.$eval('#orderList', e => e.innerText)));

  // ===== cliente irritado sem pedido → desculpa + atendente =====
  await say('que demora, isso é um absurdo');
  check('reclamação recebe desculpa e vai pra atendente', /Desculpa/.test(await ultimaBot()));
  const flag = await page.evaluate(() => window.__app.cur().querAtendente);
  check('conversa sinalizada para humano', flag === true);

  // ===== fora de contexto e variação de fallback =====
  await page.click('#newConvBtn');
  await page.waitForTimeout(1200);
  await say('qual a capital da frança?');
  const f1 = await ultimaBot();
  await say('me conta uma piada');
  const f2 = await ultimaBot();
  check('fora de contexto não quebra e não repete a mesma frase', f1 !== f2 && /não entendi|não peguei|não consegui|não encontrei/i.test(f1));
  await say('asdkjhasd');
  await say('xyzxyz abcabc');
  check('3º fallback oferece atendente', /atendente/i.test(await ultimaBot()));

  // ===== tentativa de quebra: HTML/injeção vira texto inofensivo =====
  await say('<script>alert(1)</script> quero uma fitness');
  check('injeção não executa e o pedido é entendido', /1× Marmita Fitness/.test(await ultimaBot()));

  // ===== conversa longa: 20 interações seguidas sem erro =====
  for (let i = 0; i < 10; i++) { await say('1'); await say('meu pedido'); }
  check('conversa longa (20 msgs) continua respondendo', /Marmita Fitness/.test(await ultimaBot()));

  // ===== cliente irritado COM pedido → status em vez de pânico =====
  await say('finalizar'); await say('confirmar');
  geo = [{ lat: '-23.5614', lon: '-46.6559', display_name: 'Rua Teste, São Paulo', address: {} }];
  await say('Rua Teste, 123, Centro');
  await page.waitForTimeout(1800);
  await say('2');
  check('pedido fechado', /Pedido confirmado/.test(await ultimaBot()));
  await say('que demora absurda');
  check('reclamação pós-pedido informa o preparo', /em preparo/.test(await ultimaBot()));

  check('zero erros de JavaScript', erros.length === 0);
  if (erros.length) console.log('ERROS JS:', erros);
  console.log(`\nRESULTADO: ${pass} pass, ${fail} fail`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO FATAL:', e.message); process.exit(1); });
