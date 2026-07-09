/* Bateria 6 — cardápio por dia da semana.
   Relógio fixado numa QUARTA (2026-07-08) para validar o filtro por dia. */
const { chromium } = require('playwright-core');
let pass = 0, fail = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + nome); cond ? pass++ : fail++; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.route('**nominatim.openstreetmap.org/**', r => r.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.clock.install({ time: new Date('2026-07-08T16:00:00Z') }); // quarta-feira (getDay=3)
  const say = async txt => { await page.fill('#convInput', txt); await page.press('#convInput', 'Enter'); await page.waitForTimeout(1300); };
  const ultimaBot = () => page.$$eval('#convMsgs .msg.bot', els => els.length ? els[els.length - 1].innerText : '');

  await page.goto('http://localhost:3457/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  check('hoje é quarta (getDay 3)', await page.evaluate(() => new Date().getDay()) === 3);

  // ── Config: seletor de dia + chips por item ──
  await page.click('#tabCfgBtn');
  await page.waitForTimeout(700);
  check('seletor de dia tem Todos + 7 dias', (await page.$$eval('#menuDiaSel .dia-chip', e => e.length)) === 8);
  check('dia de hoje destacado no seletor', await page.$eval('#menuDiaSel', e => !!e.querySelector('.dia-chip.hoje')));
  const item1 = page.locator('#menuRowsMarmita .menu-item').first();
  check('cada item tem 7 chips de dia', (await item1.locator('.mid-chip').count()) === 7);

  // deixa a 1ª marmita (Frango) servida SÓ no Domingo (remove dias 1..6)
  const nomeItem1 = await item1.locator('.mi-nome').inputValue();
  for (const d of [1, 2, 3, 4, 5, 6]) await item1.locator(`.mid-chip[data-dia="${d}"]`).click();
  check('sobra só 1 dia ativo (Domingo)', (await item1.locator('.mid-chip.on').count()) === 1);
  await page.click('#saveBtn');
  await page.waitForTimeout(500);
  const diasSalvos = await page.evaluate(n => window.__app.R().cardapio.find(i => i.nome === n).dias, nomeItem1);
  check('dias persistidos = [0] (Domingo)', JSON.stringify(diasSalvos) === '[0]');

  // filtro do seletor: em "Qua" o item some; em "Dom" aparece
  await page.click('#menuDiaSel .dia-chip[data-dsel="3"]'); await page.waitForTimeout(300);
  const naQua = await page.$$eval('#menuRowsMarmita .mi-nome', els => els.map(e => e.value));
  check('na Quarta o item de Domingo não aparece na config', !naQua.includes(nomeItem1));
  await page.click('#menuDiaSel .dia-chip[data-dsel="0"]'); await page.waitForTimeout(300);
  const naDom = await page.$$eval('#menuRowsMarmita .mi-nome', els => els.map(e => e.value));
  check('no Domingo o item aparece na config', naDom.includes(nomeItem1));

  // ── Atendimento (hoje=quarta): o item de Domingo não é servido ──
  await page.click('#tabAtBtn'); await page.waitForTimeout(400);
  await page.click('#newConvBtn'); await page.waitForTimeout(1000);
  await say('cardapio');
  const menu = await ultimaBot();
  check('cardápio de hoje NÃO lista o item de Domingo', !menu.includes(nomeItem1));
  check('cardápio de hoje lista item de todos os dias (Carne)', /Marmita de Carne/.test(menu));
  await say('quero uma ' + nomeItem1);
  check('pedir item fora do dia não anota', !new RegExp('1× ' + nomeItem1).test(await page.$eval('#orderList', e => e.innerText)));

  check('zero erros de JavaScript', erros.length === 0);
  if (erros.length) console.log('ERROS JS:', erros);
  console.log(`\nRESULTADO: ${pass} pass, ${fail} fail`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO FATAL:', e.message); process.exit(1); });
