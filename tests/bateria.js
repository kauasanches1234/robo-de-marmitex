const { chromium } = require('playwright-core');
let pass = 0, fail = 0;
const check = (nome, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + nome); cond ? pass++ : fail++; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  const dialogos = [];
  page.on('dialog', d => d.accept(dialogos.length ? dialogos.shift() : ''));
  const say = async txt => { await page.fill('#convInput', txt); await page.press('#convInput', 'Enter'); await page.waitForTimeout(1400); };
  const ultimaBot = () => page.$$eval('#convMsgs .msg.bot', els => els.length ? els[els.length - 1].innerText : '');

  await page.goto('http://localhost:3457/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 1. estado inicial
  check('inbox visível com estado vazio', await page.$eval('#inboxCard', e => e.style.display !== 'none') && !!(await page.$('.cli-empty')));
  check('KPIs zerados', (await page.$eval('#kpiOrders', e => e.innerText)) === '0');

  // 2. conversa nova = número desconhecido SEM botão + (ainda sem pedido)
  await page.click('#newConvBtn');
  await page.waitForTimeout(1200);
  check('conversa exibe número', /\(\d{2}\)\s9\d{4}-\d{4}/.test(await page.$eval('.inbox-name', e => e.innerText)));
  check('sem + antes de fechar pedido', !(await page.$('.add-contact')));

  // 3. fluxo de conversa
  await say('oi'); check('saudação responde menu', /cardápio/i.test(await ultimaBot()));
  await say('1'); check('cardápio listado', /Cardápio de hoje/.test(await ultimaBot()));
  await say('quanto custa a marmita fitness?'); check('preço respondido', /R\$ 22,00/.test(await ultimaBot()));
  await say('sim'); check('pendingAdd anota e mostra pedido completo', /Seu pedido até agora:[\s\S]*Marmita Fitness/.test(await ultimaBot()));
  await say('um refri'); check('ambíguo pergunta opções', /qual você prefere\?/.test(await ultimaBot()));
  await say('guarana'); check('resolve ambiguidade', /Guaraná/.test(await ultimaBot()));
  await say('marmita de frang g'); check('tamanho indisponível avisa sem anotar', /Não temos \*Marmita de Frango\* no tamanho \*G\*/.test(await ultimaBot()));
  await say('não'); check('recusa a oferta', /Tudo bem/.test(await ultimaBot()));
  await say('tira o guarana'); check('remove item', /Removi \*Guaraná\*/.test(await ultimaBot()));
  await say('meu pedido'); check('consulta mostra carrinho', /Marmita Fitness/.test(await ultimaBot()));
  await say('finalizar'); check('revisão do pedido', /Revisão do seu pedido/.test(await ultimaBot()));
  await say('confirmar'); check('pede endereço', /endereço de entrega/.test(await ultimaBot()));
  await say('Av. Paulista, 1000 - Bela Vista');
  await page.waitForTimeout(2500);
  await say('1'); check('Pix registrado com chave', /Chave Pix/.test(await ultimaBot()));
  await say('enviei o comprovante'); check('comprovante recebido', /Recebi seu comprovante/.test(await ultimaBot()));

  // 4. + aparece SÓ depois do pedido fechado; salva contato
  check('+ aparece após pedido fechado', !!(await page.$('.add-contact:not(.edit)')));
  dialogos.push('Maria Oliveira');
  await page.click('.add-contact:not(.edit)');
  await page.waitForTimeout(800);
  check('contato salvo vira nome', (await page.$eval('.inbox-name', e => e.innerText)).includes('Maria Oliveira'));
  check('lápis substitui o +', !!(await page.$('.add-contact.edit')) && !(await page.$('.add-contact:not(.edit)')));

  // 5. lápis na conversa edita nome e telefone
  dialogos.push('Maria O. Souza', '(11) 91234-5678');
  await page.click('.add-contact.edit');
  await page.waitForTimeout(800);
  check('nome editado na conversa', (await page.$eval('.inbox-name', e => e.innerText)).includes('Maria O. Souza'));
  check('telefone editado no painel', (await page.$eval('#convPhone', e => e.innerText)) === '(11) 91234-5678');

  // 6. aba Clientes: pedidos contados, lápis e lixeira
  await page.click('#tabCliBtn');
  await page.waitForTimeout(800);
  const linha = await page.$eval('.cli-row', e => e.innerText.replace(/\n/g, ' | '));
  check('cliente com 1 pedido e gasto', /1 pedido/.test(linha) && /R\$ \d/.test(linha));
  check('badges Sistema+WhatsApp', /Sistema/.test(linha) && /WhatsApp/.test(linha));
  check('lápis presente na aba Clientes', !!(await page.$('[data-editc]')));
  dialogos.push('Maria Final', '(11) 91234-5678');
  await page.click('[data-editc]');
  await page.waitForTimeout(600);
  check('lápis da aba Clientes edita', /Maria Final/.test(await page.$eval('.cli-row', e => e.innerText)));

  // 7. pedidos/KPI
  await page.click('#tabAtBtn'); await page.waitForTimeout(400);
  check('KPI 1 pedido', (await page.$eval('#kpiOrders', e => e.innerText)) === '1');
  await page.click('#confirmPayBtn').catch(() => {});
  await page.waitForTimeout(600);
  await page.click('#tabPedBtn'); await page.waitForTimeout(600);
  check('pedido na aba Pedidos', !!(await page.$('.ped-it, .ped-info, #pedList > *')));

  // 8. exclusão devolve o + (pedido já fechado)
  await page.click('#tabCliBtn'); await page.waitForTimeout(500);
  await page.click('[data-del]'); await page.waitForTimeout(500);
  check('contato excluído', !(await page.$('.cli-row')));
  await page.click('#tabAtBtn'); await page.waitForTimeout(500);
  check('+ volta após excluir contato', !!(await page.$('.add-contact:not(.edit)')));

  check('zero erros de JavaScript', erros.length === 0);
  if (erros.length) console.log('ERROS JS:', erros);
  console.log(`\nRESULTADO: ${pass} pass, ${fail} fail`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO FATAL:', e.message); process.exit(1); });
