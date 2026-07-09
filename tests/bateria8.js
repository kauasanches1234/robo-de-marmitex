/* Bateria 8 (front) — variedades personalizadas (Família, Kids…).
   Cria uma variedade na config, salva, e pede escolhendo-a no atendimento. */
const { chromium } = require('playwright-core');
let pass = 0, fail = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + nome); cond ? pass++ : fail++; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.route('**nominatim.openstreetmap.org/**', r => r.fulfill({ contentType: 'application/json', body: '[]' }));
  let promptResp = 'Família';
  page.on('dialog', d => d.type() === 'prompt' ? d.accept(promptResp) : d.accept());
  const say = async txt => { await page.fill('#convInput', txt); await page.press('#convInput', 'Enter'); await page.waitForTimeout(1300); };
  const ultimaBot = () => page.$$eval('#convMsgs .msg.bot', els => els.length ? els[els.length - 1].innerText : '');

  await page.goto('http://localhost:3457/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // ── Config: cria a variedade "Família" na 1ª marmita (Frango) ──
  await page.click('#tabCfgBtn'); await page.waitForTimeout(700);
  const item1 = page.locator('#menuRowsMarmita .menu-item').first();
  const nome1 = await item1.locator('.mi-nome').inputValue();
  await item1.locator('.add-var').click();
  await page.waitForTimeout(400);
  check('tile da variedade aparece', (await item1.locator('.size-tile.custom .st-cust').count()) === 1);
  // define o preço da variedade
  await item1.locator('.size-tile.custom input[data-ps="Família"]').fill('30');
  await page.click('#saveBtn'); await page.waitForTimeout(500);
  const et = await page.evaluate(n => window.__app.R().cardapio.find(i => i.nome === n).etiqueta, nome1);
  check('etiqueta inclui a variedade (…+Família)', /\+Família$/.test(et));
  const preco = await page.evaluate(n => window.__app.R().cardapio.find(i => i.nome === n).precos['Família'], nome1);
  check('preço da variedade salvo (30)', preco === 30);

  // duplicar variedade é bloqueado
  promptResp = 'Família';
  await item1.locator('.add-var').click();
  await page.waitForTimeout(300);
  check('não cria variedade duplicada', (await item1.locator('.size-tile.custom .st-cust').count()) === 1);

  // ── Atendimento: pede o frango e escolhe a variedade Família ──
  await page.click('#tabAtBtn'); await page.waitForTimeout(400);
  await page.click('#newConvBtn'); await page.waitForTimeout(1000);
  await say('cardapio');
  check('cardápio mostra a variedade com preço', /Família R\$ 30,00/.test(await ultimaBot()));
  await say('quero uma ' + nome1);
  check('robô pergunta o tamanho/variedade', /tem os tamanhos[\s\S]*Família R\$ 30,00[\s\S]*qual/.test(await ultimaBot()));
  await say('família');
  const anotou = await page.locator('#orderList', { hasText: 'Família' }).waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
  check('anota a variedade escolhida com o preço certo', anotou && /R\$ 30,00/.test(await page.$eval('#orderList', e => e.innerText)));

  // ── Remover a variedade volta ao normal ──
  await page.click('#tabCfgBtn'); await page.waitForTimeout(500);
  await item1.locator('.size-tile.custom .st-cust').click();
  await page.waitForTimeout(300);
  check('remover variedade tira o tile', (await item1.locator('.size-tile.custom').count()) === 0);

  check('zero erros de JavaScript', erros.length === 0);
  if (erros.length) console.log('ERROS JS:', erros);
  console.log(`\nRESULTADO: ${pass} pass, ${fail} fail`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO FATAL:', e.message); process.exit(1); });
