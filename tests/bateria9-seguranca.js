/* Bateria 9 (front) — SEGURANÇA: XSS em nome de variedade/etiqueta.
   Duas camadas de defesa:
   1) o render escapa a etiqueta (mesmo que um dado malicioso chegue do banco);
   2) a entrada de variedade tira metacaracteres de HTML.
   Um payload com onerror NÃO pode executar nem virar elemento no painel. */
const { chromium } = require('playwright-core');
let pass = 0, fail = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + nome); cond ? pass++ : fail++; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.route('**nominatim.openstreetmap.org/**', r => r.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.goto('http://localhost:3457/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const PAYLOAD = '"><img src=x onerror="window.__xss=1">';

  // ── camada 1: render escapa etiqueta maliciosa vinda "do banco" ──
  await page.evaluate((p) => {
    const app = window.__app;
    const c = app.newConv();
    c.cart.push({ id: 1, nome: 'Marmita', etiqueta: p, preco: 10, qtd: 1, note: null });
    app.selectConv(c.id);      // dispara o render do pedido
  }, PAYLOAD);
  await page.waitForTimeout(400);

  check('nenhum <img> malicioso foi injetado no #orderList', (await page.locator('#orderList img').count()) === 0);
  check('o onerror NÃO executou (window.__xss indefinido)', await page.evaluate(() => window.__xss === undefined));
  check('a etiqueta aparece como TEXTO escapado', await page.evaluate(() => {
    const html = document.querySelector('#orderList').innerHTML;
    return html.includes('&lt;img') || html.includes('&quot;'); // escapado, não como tag
  }));

  // ── camada 2: a entrada de variedade remove metacaracteres de HTML ──
  await page.click('#tabCfgBtn'); await page.waitForTimeout(500);
  page.once('dialog', d => d.accept(PAYLOAD));               // digita o payload no prompt
  const item1 = page.locator('#menuRowsMarmita .menu-item').first();
  const nome1 = await item1.locator('.mi-nome').inputValue();
  await item1.locator('.add-var').click();
  await page.waitForTimeout(300);
  const etq = await page.evaluate(n => {
    const it = window.__app.draft.cardapio.find(i => i.nome === n);
    return it ? it.etiqueta : '';
  }, nome1);
  check('etiqueta salva não contém < > " & (sanitizada)', !/[<>&"']/.test(etq));

  check('zero erros de JavaScript', erros.length === 0);
  if (erros.length) console.log('ERROS JS:', erros);
  console.log(`\nRESULTADO: ${pass} pass, ${fail} fail`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO FATAL:', e.message); process.exit(1); });
