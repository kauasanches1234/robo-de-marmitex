const { chromium } = require('playwright-core');
let pass = 0, fail = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + nome); cond ? pass++ : fail++; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('dialog', d => d.accept(''));
  await page.route('**nominatim.openstreetmap.org/**', r => r.fulfill({ contentType: 'application/json', body: '[]' }));
  const say = async txt => { await page.fill('#convInput', txt); await page.press('#convInput', 'Enter'); await page.waitForTimeout(1500); };
  const ultimaBot = () => page.$$eval('#convMsgs .msg.bot', els => els.length ? els[els.length - 1].innerText : '');

  await page.goto('http://localhost:3457/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // ===== 1) TRAVA ANTI-LOOP: 20 tentativas de fala seguidas → no máx. 5 saem =====
  const loop = await page.evaluate(async () => {
    const app = window.__app;
    const c = app.newConv();
    for (let i = 0; i < 20; i++) app.greet(c); // greet dispara botSay
    await new Promise(r => setTimeout(r, 1500));
    return c.messages.filter(m => m.who === 'bot').length;
  });
  check(`anti-loop: 20 disparos viram no máx. 5 mensagens (saíram ${loop})`, loop <= 5);

  // cliente falando reseta a trava — o robô SEMPRE responde
  const responde = await page.evaluate(async () => {
    const app = window.__app;
    const c = app.convs()[app.convs().length - 1];
    const antes = c.messages.filter(m => m.who === 'bot').length;
    app.ConversationEngine.handle(c, 'cardapio');
    await new Promise(r => setTimeout(r, 1200));
    return c.messages.filter(m => m.who === 'bot').length > antes;
  }).catch(() => 'sem handleCustomer');
  check('após mensagem do cliente, o robô volta a responder', responde === true);

  // ===== 2) EXPIRAÇÃO 60s: conversa parada some; nova mensagem = começar do zero =====
  const ttl = await page.evaluate(() => {
    const app = window.__app;
    const c = app.newConv();
    const id = c.id;
    c.lastAt = Date.now() - 65000; // 65s parada
    app.limparConversasParadas();
    return { sumiu: !app.convs().some(x => x.id === id), ttlMs: app.TTL };
  });
  check('conversa parada há 65s é excluída', ttl.sumiu);
  check('TTL configurado em 60s', ttl.ttlMs === 60000);

  // ===== 3) PREÇO POR TAMANHO =====
  await page.click('#tabCfgBtn');
  await page.waitForTimeout(700);
  let row = await page.$('#menuRowsMarmita .menu-item');
  await (await row.$('.st-tag[data-etq="P"]')).click();
  await page.waitForTimeout(300);
  row = await page.$('#menuRowsMarmita .menu-item'); // re-render
  await (await row.$('.st-tag[data-etq="G"]')).click();
  await page.waitForTimeout(300);
  row = await page.$('#menuRowsMarmita .menu-item');
  check('campos de preço por tamanho aparecem', (await row.$$('input[data-ps]')).length === 3);
  await (await row.$('input[data-ps="P"]')).fill('16');
  await (await row.$('input[data-ps="G"]')).fill('22');
  // bebida: Pepsi com lata + 600
  let brow = await page.$('#menuRowsBebida .menu-item');
  await (await brow.$('.st-tag[data-etq="600"]')).click();
  await page.waitForTimeout(300);
  brow = await page.$('#menuRowsBebida .menu-item');
  await (await brow.$('input[data-ps="600"]')).fill('8');
  await page.click('#saveBtn');
  await page.waitForTimeout(600);
  const salvo = await page.evaluate(() => {
    const f = window.__app.R().cardapio.find(i => i.nome === 'Marmita de Frango');
    const p = window.__app.R().cardapio.find(i => i.nome === 'Pepsi');
    return { f: f.precos, p: p.precos };
  });
  check('preços salvos por tamanho (P16/M18/G22)', salvo.f.P === 16 && salvo.f.M === 18 && salvo.f.G === 22);
  check('bebida com preço por tamanho (lata 6 / 600 8)', salvo.p.lata === 6 && salvo.p['600'] === 8);

  await page.click('#tabAtBtn'); await page.waitForTimeout(400);
  await page.click('#newConvBtn'); await page.waitForTimeout(1100);
  await say('cardapio');
  const menu = (await ultimaBot()).replace(/\s+/g, ' ');
  check('cardápio lista preço de cada tamanho', /Frango\s*P R\$ 16,00 · M R\$ 18,00 · G R\$ 22,00/.test(menu));
  check('bebida no cardápio com dois preços', /Pepsi\s*lata R\$ 6,00 · 600 R\$ 8,00/.test(menu));
  await say('quanto custa a marmita de frango?');
  check('pergunta de preço responde por tamanho', /P R\$ 16,00 · M R\$ 18,00 · G R\$ 22,00/.test((await ultimaBot()).replace(/\s+/g, ' ')));
  await say('não');
  await say('uma marmita de frango g e uma pepsi 600');
  const carrinho = await page.$eval('#orderList', e => e.innerText.replace(/\s+/g, ' '));
  check('carrinho usa preço do tamanho (G=22, 600=8)', /R\$ 22,00/.test(carrinho) && /R\$ 8,00/.test(carrinho));
  await say('finalizar');
  check('total soma preços por tamanho (30 + entrega a calcular)', /Subtotal: R\$ 30,00/.test((await ultimaBot()).replace(/\s+/g, ' ')));

  check('zero erros de JavaScript', erros.length === 0);
  if (erros.length) console.log('ERROS JS:', erros);
  console.log(`\nRESULTADO: ${pass} pass, ${fail} fail`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO FATAL:', e.message); process.exit(1); });
