/* Bateria 5 — formatação WhatsApp no chat e envio real pela Cloud API (mockada). */
const { chromium } = require('playwright-core');
let pass = 0, fail = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + nome); cond ? pass++ : fail++; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.route('**nominatim.openstreetmap.org/**', r => r.fulfill({ contentType: 'application/json', body: '[]' }));

  // mock da Cloud API da Meta
  let metaOk = true, ultimoEnvio = null;
  await page.route('**graph.facebook.com/**', r => {
    ultimoEnvio = { url: r.request().url(), auth: r.request().headers()['authorization'], body: r.request().postDataJSON() };
    if (metaOk) r.fulfill({ contentType: 'application/json', body: JSON.stringify({ messages: [{ id: 'wamid.TESTE' }] }) });
    else r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Invalid OAuth access token' } }) });
  });

  const say = async txt => { await page.fill('#convInput', txt); await page.press('#convInput', 'Enter'); await page.waitForTimeout(1400); };

  await page.goto('http://localhost:3457/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // ===== formatação WhatsApp no chat =====
  await page.click('#newConvBtn');
  await page.waitForTimeout(1200);
  await say('cardapio');
  const bolha = await page.$$eval('#convMsgs .msg.bot', els => {
    const e = els[els.length - 1];
    return { html: e.innerHTML, texto: e.innerText };
  });
  check('negrito renderizado (sem asteriscos crus)', /<b>Marmitas<\/b>/.test(bolha.html) && !/\*Marmitas\*/.test(bolha.texto));
  check('prévia do inbox sem asteriscos', !/\*/.test(await page.$eval('.inbox-last', e => e.innerText)));
  await say('quero uma marmita de frango');
  check('itálico/negrito nas demais mensagens', !/\*/.test(await page.$$eval('#convMsgs .msg.bot', els => els[els.length - 1].innerText)));

  // ===== envio de teste pela Cloud API =====
  await page.click('#tabCliBtn');
  await page.waitForTimeout(700);
  await page.fill('#waNumero', '+55 11 99999-0000');
  await page.fill('#waNumeroTeste', '(11) 98888-7777');
  await page.fill('#waPhoneId', '123456789012345');
  await page.fill('#waToken', 'EAAG-token-de-teste');
  await page.click('#waTesteBtn');
  await page.waitForTimeout(1200);
  check('chama a Graph API com o Phone Number ID', /graph\.facebook\.com\/v21\.0\/123456789012345\/messages/.test(ultimoEnvio.url));
  check('token vai no header Authorization', ultimoEnvio.auth === 'Bearer EAAG-token-de-teste');
  check('número de destino normalizado (E.164 com 55)', ultimoEnvio.body.to === '5511988887777');
  check('payload usa template hello_world (entrega no 1º contato)', ultimoEnvio.body.messaging_product === 'whatsapp' && ultimoEnvio.body.type === 'template' && ultimoEnvio.body.template.name === 'hello_world');
  check('status vira Conectado', (await page.$eval('#waStatus', e => e.innerText)) === 'Conectado');
  check('feedback de sucesso na tela', /✓ Enviada/.test(await page.$eval('#waTesteStatus', e => e.innerText)));

  // ===== falha da Meta (token inválido) =====
  metaOk = false;
  await page.click('#waTesteBtn');
  await page.waitForTimeout(1200);
  check('erro da Meta é mostrado ao dono', /Invalid OAuth access token/.test(await page.$eval('#waTesteStatus', e => e.innerText)));
  check('status volta a Desconectado', (await page.$eval('#waStatus', e => e.innerText)) === 'Desconectado');

  // ===== credenciais persistem após recarregar =====
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.click('#tabCliBtn');
  await page.waitForTimeout(600);
  check('credenciais persistem no aparelho', (await page.$eval('#waPhoneId', e => e.value)) === '123456789012345');

  check('zero erros de JavaScript', erros.length === 0);
  if (erros.length) console.log('ERROS JS:', erros);
  console.log(`\nRESULTADO: ${pass} pass, ${fail} fail`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO FATAL:', e.message); process.exit(1); });
