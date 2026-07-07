const { chromium } = require('playwright-core');
let pass = 0, fail = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + nome); cond ? pass++ : fail++; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('dialog', d => d.accept(''));

  let geoResposta = [];
  await page.route('**nominatim.openstreetmap.org/**', route => {
    if (route.request().url().includes('/reverse')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ address: { city: 'São Paulo', state: 'SP' } }) });
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(geoResposta) });
  });

  const say = async txt => { await page.fill('#convInput', txt); await page.press('#convInput', 'Enter'); await page.waitForTimeout(1500); };
  const ultimaBot = () => page.$$eval('#convMsgs .msg.bot', els => els.length ? els[els.length - 1].innerText : '');

  await page.goto('http://localhost:3457/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // ===== A) "marmita g" NUNCA adiciona direto: confirma =====
  await page.click('#newConvBtn');
  await page.waitForTimeout(1200);
  await say('Marmita g');
  check('"marmita g" pede confirmação', /Você quis dizer \*Marmita de Carne\*/.test(await ultimaBot()));
  const semCarrinho = await page.$eval('#orderList', e => e.innerText);
  check('nada anotado antes do sim', /Nenhum item ainda/.test(semCarrinho));
  await say('não');
  check('"não" cancela sem anotar', /Tudo bem/.test(await ultimaBot()));
  await say('marmita g');
  await say('sim');
  check('"sim" anota Carne G', /1× Marmita de Carne G/.test(await ultimaBot()));

  // ===== B) cardápio em seções =====
  await say('cardapio');
  const menu = await ultimaBot();
  check('cardápio separa Marmitas e Bebidas', /Marmitas[\s\S]*Bebidas/.test(menu));
  check('tamanhos ao lado de cada item (com preço)', /Carne — G R\$ 20,00/.test(menu.replace(/\s+/g, ' ')));

  // ===== B2) atalhos 1/2/3 continuam valendo depois do cardápio (bug reportado) =====
  await say('1');
  check('"1" reabre o cardápio após já ter visto', /Cardápio de hoje/.test(await ultimaBot()));
  await say('1');
  check('"1" funciona repetidamente', /Cardápio de hoje/.test(await ultimaBot()));
  await say('2');
  check('"2" inicia pedido', /Pode mandar/.test(await ultimaBot()));

  // ===== C) etiquetas múltiplas =====
  await page.click('#tabCfgBtn');
  await page.waitForTimeout(700);
  await page.click('#menuRowsMarmita .menu-item .st-tag[data-etq="P"]');
  await page.waitForTimeout(300);
  await page.click('#menuRowsMarmita .menu-item .st-tag[data-etq="G"]');
  await page.waitForTimeout(300);
  await page.click('#saveBtn');
  await page.waitForTimeout(600);
  const etqSalva = await page.evaluate(() => window.__app.R().cardapio.find(i => i.nome === 'Marmita de Frango').etiqueta);
  check('etiqueta salva como P+M+G', etqSalva === 'P+M+G');
  await page.click('#tabAtBtn');
  await page.waitForTimeout(500);
  await say('uma marmita de frango');
  check('sem tamanho → pergunta', /tem os tamanhos[\s\S]*qual você quer/.test(await ultimaBot()));
  await say('grande');
  check('anota o tamanho G escolhido', /1× Marmita de Frango G/.test(await ultimaBot()));
  await say('marmita de frango p');
  check('tamanho explícito P entra direto', /1× Marmita de Frango P/.test(await ultimaBot()));
  await say('marmita g');
  check('"marmita g" com 2 opções vira pergunta', /qual você prefere\?/.test(await ultimaBot()));

  // ===== D) endereço =====
  await say('finalizar'); await say('confirmar');
  await say('sem numero aqui');
  check('endereço sem número é rejeitado', /rua, número e bairro/.test(await ultimaBot()));
  geoResposta = [];
  await say('Rua Zero, 409, Itamambuca');
  await page.waitForTimeout(1500);
  check('endereço fora da região não é aceito', /Não encontrei esse endereço na nossa região/.test(await ultimaBot()));
  geoResposta = [{ lat: '-23.5614', lon: '-46.6559', display_name: 'Rua Teste, São Paulo', address: {} }];
  await say('Rua Teste, 123, Centro');
  await page.waitForTimeout(1800);
  const fim = await page.$$eval('#convMsgs .msg.bot', els => els.slice(-2).map(e => e.innerText).join('\n'));
  check('endereço válido acha a zona e segue ao pagamento', /Zona 1/.test(fim) && /como prefere pagar/i.test(fim));
  await say('2');
  check('pedido fecha em dinheiro', /Pedido confirmado/.test(await ultimaBot()));

  check('zero erros de JavaScript', erros.length === 0);
  if (erros.length) console.log('ERROS JS:', erros);
  console.log(`\nRESULTADO: ${pass} pass, ${fail} fail`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO FATAL:', e.message); process.exit(1); });
