/* Bateria 7 (front) — disponibilidade por dia no simulador.
   Treino como cliente humano: "tem carne hoje?", "rola feijoada?", "que dia tem feijoada?".
   Configura Feijoada (Qua+Sáb) e fixa o relógio numa SEGUNDA. */
const { chromium } = require('playwright-core');
let pass = 0, fail = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + nome); cond ? pass++ : fail++; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.route('**nominatim.openstreetmap.org/**', r => r.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.clock.install({ time: new Date('2026-07-06T16:00:00Z') }); // segunda (getDay=1)
  const say = async txt => { await page.fill('#convInput', txt); await page.press('#convInput', 'Enter'); await page.waitForTimeout(1300); };
  const ultimaBot = () => page.$$eval('#convMsgs .msg.bot', els => els.length ? els[els.length - 1].innerText : '');

  await page.goto('http://localhost:3457/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  check('hoje é segunda (getDay 1)', await page.evaluate(() => new Date().getDay()) === 1);

  // adiciona "Feijoada" servida só Qua(3) e Sáb(6), via API interna do app
  await page.evaluate(() => {
    const app = window.__app; const db = app.DB;
    db.restaurant.cardapio.push({ id: 999, nome: 'Feijoada', tipo: 'marmita', etiqueta: '', preco: 25, precos: {}, palavras: 'feijoada, feijao', dias: [3, 6] });
    app.saveDB();
  });

  await page.click('#newConvBtn');
  await page.waitForTimeout(1000);

  await say('tem carne hoje?');
  check('"tem carne hoje?" → sim', /Temos sim!.*Marmita de Carne/s.test(await ultimaBot()));
  await say('sim');
  const anotou = await page.locator('#orderList', { hasText: 'Marmita de Carne' }).waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
  check('confirma e anota a carne', anotou);

  await page.click('#newConvBtn'); await page.waitForTimeout(1000);
  await say('rola feijoada?');
  check('"rola feijoada?" na segunda → não, com os dias', /Hoje não tem Feijoada[\s\S]*quarta e sábado/.test(await ultimaBot()));
  check('feijoada fora do dia não anota', /Nenhum item/.test(await page.$eval('#orderList', e => e.innerText)));

  await say('que dia tem feijoada?');
  check('"que dia tem feijoada?" lista os dias', /Feijoada[\s\S]*quarta e sábado/.test(await ultimaBot()));

  await say('cardapio');
  check('cardápio de segunda não lista feijoada', !/Feijoada/.test(await ultimaBot()));

  check('zero erros de JavaScript', erros.length === 0);
  if (erros.length) console.log('ERROS JS:', erros);
  console.log(`\nRESULTADO: ${pass} pass, ${fail} fail`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO FATAL:', e.message); process.exit(1); });
