---
name: robo-atendimento
description: >
  Base de conhecimento e aprendizado contínuo do Robô de Marmitex — atendente
  profissional de WhatsApp especializado em restaurantes, delivery e alimentação.
  CONSULTE antes de alterar qualquer comportamento do robô (parser, intenções,
  fluxo de pedido, mensagens). ATUALIZE a cada erro corrigido ou padrão novo de
  cliente observado. Contém: princípios do produto, aprendizados estruturados
  (problema→causa→solução→estratégia), padrões reais de linguagem dos clientes
  e o processo obrigatório de testes.
---

# Robô de Marmitex — Skill de Aprendizado Contínuo

Este arquivo é a **memória permanente** do projeto. Ele cresce a cada erro
corrigido e a cada padrão novo observado nas conversas.

## Como usar (obrigatório)

1. **Antes de mexer no robô**: leia os aprendizados abaixo — o problema pode já
   ter sido resolvido, e as estratégias evitam reintroduzir bugs antigos.
2. **A cada correção**: registre um aprendizado novo (formato abaixo) ou evolua
   um existente (incremente frequência, atualize data e histórico). Nunca duplique.
3. **A cada alteração**: rode TODAS as baterias (`tests/bateria*.js`) — só
   publique com 100% verde. Se falhar: corrija → atualize esta Skill → rode tudo
   de novo. Repita até zerar.
4. **Fase 2 (Claude API)**: este arquivo vira contexto do sistema da IA real.
   Em runtime, a ponte atual é a seção "Peculiaridades" da Configuração
   (`ensinar()` / `renderAiPreview()`), editável pelo dono do restaurante.

## Especialização do produto

Atendente humano experiente de restaurante/delivery no WhatsApp. Sempre:

- Interpretar pedidos escritos de qualquer jeito (typos, gírias, abreviações,
  emojis, mensagens em partes) — o parser tolera erro de digitação por
  distância de edição em termos DISTINTIVOS.
- **Nunca anotar por dedução.** Só entra no carrinho o que o cliente nomeou ou
  confirmou. Dúvida → pergunta com as opções; indisponível → avisa e NÃO anota.
- **Sempre responder, nunca disparar.** 1 mensagem do cliente ⇒ 1 resposta
  (no máx. pequenas sequências legítimas). Trava anti-loop descarta acima de 5
  seguidas. Nunca iniciar conversa por conta própria.
- Perguntar só quando necessário; confirmar naturalmente repetindo o pedido
  completo; sugerir bebida uma única vez; variar frases de fallback.
- Formato de endereço: *rua, número e bairro*; geocodificação restrita à
  região do restaurante.

## Arquitetura (onde mexer)

`index.html` único (Fase 1, localStorage). Pontos-chave:

| Responsabilidade | Função |
|---|---|
| Entrada única de mensagem do cliente | `ConversationEngine.handle` |
| Interpretação (intenção, sem efeitos) | `interpretar(texto, estado, conv)` |
| Regras/estado/respostas | `processarIntent(c, r, text)` |
| Extração de itens (com incerteza) | `parseOrder` → `{itens, indisponiveis, ambiguos, semTamanho, confirmar}` |
| Casamento de produto | `matchItem` (1º) / `matchCandidatos` (todos os plausíveis) |
| Tamanhos e preços | `etqsOf`, `precoDe`, `tamanhosPrecos` (`etiqueta:"P+M+G"`, `precos:{P:16,…}`) |
| Fala do robô (com trava anti-loop) | `botSay` |
| Endereço/zona | `resolverZona` (geocode SÓ com `bounds`) |
| Expiração/sincronização | `limparConversasParadas` (TTL 60s; sincroniza clientes ANTES) |

Testes: `tests/bateria.js` (fluxo base/contatos), `bateria2.js` (parser/endereço),
`bateria3.js` (anti-loop/TTL/preços), `bateria4.js` (linguagem real/edge cases).
Rodar: subir `npx live-server . --port=3457` e `node tests/bateriaN.js`.

---

## Aprendizados

Formato de cada entrada: **Categoria · Problema · Causa · Solução · Estratégia
· Exemplo real · Frequência · Confiança · Atualizado · Histórico**.

### A01 — Etiqueta nunca troca o produto nomeado
- **Categoria**: interpretação de pedido
- **Problema**: "Marmita de frang g" anotava *Marmita de Carne G* (produto errado).
- **Causa**: a regra "qual produto tem etiqueta G?" rodava ANTES da correção de
  typo; "frang" não casava exato e a etiqueta sequestrava o produto.
- **Solução**: ordem fixa em `matchItem`: nome exato → typo (fuzzy) → etiqueta
  como ÚLTIMO recurso; typo só casa termos distintivos (freq. 1 no cardápio).
- **Estratégia**: se o cliente nomeou o produto (mesmo errado), a etiqueta serve
  só para escolher o TAMANHO — jamais para trocar o produto.
- **Exemplo real**: cliente digitou "Marmita de frang g" (2026-07-05).
- **Frequência**: 1 caso real + coberto por teste. **Confiança**: alta.
- **Atualizado**: 2026-07-05. **Histórico**: v1 correção da ordem; v2 termos distintivos.

### A02 — Dedução por etiqueta exige confirmação
- **Categoria**: interpretação de pedido
- **Problema**: "Marmita g" anotava direto a única marmita G.
- **Causa**: candidato único por etiqueta era tratado como certeza.
- **Solução**: `parseOrder` marca `via:'etiqueta'` → vira `confirmar` ("Você
  quis dizer *X* G? sim/não"); com 2+ candidatos, pergunta qual.
- **Estratégia**: dedução ≠ certeza. Sem nome de produto → confirmar sempre.
- **Exemplo real**: "Marmita g" → anotou Carne G sem perguntar (2026-07-06).
- **Frequência**: 2 relatos do dono. **Confiança**: alta.
- **Atualizado**: 2026-07-06. **Histórico**: v1 confirmação sim/não.

### A03 — Indisponível avisa, NUNCA anota
- **Categoria**: interpretação de pedido
- **Problema**: "frango g" (só havia M) anotava o M silenciosamente.
- **Causa**: parser ignorava o tamanho pedido quando não existia.
- **Solução**: lista `indisponiveis` → mensagem "Não temos X no tamanho G —
  disponível: M (R$…)" + oferta sim/não. Se existir linha do mesmo nome com o
  tamanho pedido, usa a linha certa.
- **Estratégia**: nunca substituir o que o cliente pediu por algo "parecido".
- **Exemplo real**: "Marmita frango g e una coca" (2026-07-05).
- **Frequência**: 2 casos reais. **Confiança**: alta.
- **Atualizado**: 2026-07-05. **Histórico**: v1 aviso; v2 oferta com preço.

### A04 — Termo ambíguo pergunta com as opções
- **Categoria**: interpretação de pedido
- **Problema**: "um refri" anotava Pepsi (primeira da lista) sem perguntar.
- **Causa**: keyword compartilhada (`refri` em 3 bebidas) retornava o 1º match.
- **Solução**: `matchCandidatos` devolve todos; >1 → pergunta "temos Pepsi,
  Coca, Guaraná — qual você prefere?". Genéricos ("bebida", "suco", "marmita",
  "comida", "almoço") listam a categoria.
- **Estratégia**: em dúvida entre produtos, listar e perguntar; nunca chutar.
- **Exemplo real**: vídeo do dono mostrando "um refri" → Pepsi (2026-07-05).
- **Frequência**: 1 caso + regra geral. **Confiança**: alta.
- **Atualizado**: 2026-07-07. **Histórico**: v1 bebidas; v2 qualquer produto; v3 genéricos de comida.

### A05 — Confirmações repetem o pedido COMPLETO
- **Categoria**: experiência de atendimento
- **Problema**: "Anotado!" mostrava só o item novo; cliente perdia o contexto.
- **Causa**: mensagem usava a lista recém-adicionada, não o carrinho.
- **Solução**: toda confirmação (Anotado/Adicionei/Corrigido) lista `c.cart` inteiro.
- **Estratégia**: o cliente deve sempre enxergar o estado atual do pedido.
- **Exemplo real**: reclamação do dono com print (2026-07-05).
- **Frequência**: pedido explícito do dono. **Confiança**: alta.
- **Atualizado**: 2026-07-05. **Histórico**: v1.

### A06 — Carrinho separa linhas por tamanho
- **Categoria**: lógica de carrinho
- **Problema**: Frango P era somado ao Frango G ("2× Frango G").
- **Causa**: fusão de itens por `id + observação`, ignorando etiqueta.
- **Solução**: chave de fusão = `id + observação + etiqueta`.
- **Estratégia**: tamanho diferente = linha diferente (e preço diferente).
- **Exemplo real**: teste de bateria pegou antes de ir pro ar (2026-07-06).
- **Frequência**: 1 (pego em teste). **Confiança**: alta.
- **Atualizado**: 2026-07-06. **Histórico**: v1.

### A07 — Atalhos numéricos valem no fluxo todo
- **Categoria**: fluxo de conversa
- **Problema**: depois de ver o cardápio, digitar "1" caía em "não entendi" —
  mesmo com o robô oferecendo "*1* — Ver cardápio" na própria mensagem.
- **Causa**: 1/2/3 só eram interpretados no estado `menu`; o cardápio muda o
  estado para `pedido`.
- **Solução**: 1/2/3 valem em `menu/pedido/mais/revisao`; no `pagamento`
  continuam sendo Pix/Dinheiro/Cartão.
- **Estratégia**: toda opção que o robô OFERECE precisa ser aceita como resposta.
- **Exemplo real**: cliente digitou "1" 3× seguidas sem sucesso (2026-07-06).
- **Frequência**: 1 caso real (3 repetições). **Confiança**: alta.
- **Atualizado**: 2026-07-06. **Histórico**: v1.

### A08 — Endereço restrito à região; formato rua, número e bairro
- **Categoria**: endereço/entrega
- **Problema**: "Rua zero, 409, Itamambuca" era geocodificado longe/errado.
- **Causa**: fallback de busca AMPLA quando a busca regional não achava.
- **Solução**: busca SOMENTE dentro de `coberturaBounds()`; não achou →
  "Não encontrei esse endereço na nossa região — confere e manda de novo:
  rua, número e bairro". Validação prévia: rua (3+ letras) + número (1–5 dígitos).
  IMPORTANTE: o dono precisa localizar a loja em Mapas (ancora a busca).
- **Estratégia**: errar endereço custa entrega; melhor pedir de novo que chutar.
- **Exemplo real**: print do dono com endereço de Itamambuca (2026-07-06).
- **Frequência**: 1 caso real. **Confiança**: alta.
- **Atualizado**: 2026-07-06. **Histórico**: v1 bounded; v2 mensagens de formato.

### A09 — Falha de rede ≠ endereço inexistente
- **Categoria**: robustez
- **Problema**: sem internet no serviço de mapas, todos os endereços seriam recusados.
- **Causa**: `catch` devolvia o mesmo `null` de "não achou".
- **Solução**: erro de rede devolve `{erro:true}` → segue SEM validar (fail-open).
- **Estratégia**: falha de infraestrutura nunca pode travar a venda.
- **Exemplo real**: descoberto ao testar em container sem acesso ao Nominatim.
- **Frequência**: ambiente-dependente. **Confiança**: alta.
- **Atualizado**: 2026-07-06. **Histórico**: v1.

### A10 — Trava anti-loop no botSay
- **Categoria**: robustez (crítico)
- **Problema**: um bug poderia fazer o robô responder em loop infinito.
- **Causa**: nenhum limite entre falas do robô sem fala do cliente.
- **Solução**: `_botStreak` conta falas seguidas do robô (zera quando o cliente
  fala); acima de 5, `botSay` DESCARTA. Teto extra: 300 mensagens por conversa.
- **Estratégia**: o robô só fala em resposta; rajadas são descartadas em silêncio.
- **Exemplo real**: exigência do dono (2026-07-07); teste força 20 disparos → saem 5.
- **Frequência**: preventivo. **Confiança**: alta.
- **Atualizado**: 2026-07-07. **Histórico**: v1.

### A11 — Conversa expira em 60s; sincronizar ANTES de limpar
- **Categoria**: ciclo de vida da conversa
- **Problema**: conversas paradas acumulavam; e a limpeza podia descartar
  pedidos ainda não somados aos clientes.
- **Causa**: TTL longo (3min) e limpeza sem sincronização prévia.
- **Solução**: TTL 60s (verificação a cada 15s); `sincronizarClientes(true)`
  roda ANTES da limpeza e ao fechar pedido (flag `contabilizado` evita dupla
  contagem). Atendimento humano não expira. Cliente que voltar começa do zero.
- **Estratégia**: nada de estatística perdida; conversa nova = contexto limpo.
- **Exemplo real**: exigência do dono (2026-07-06/07).
- **Frequência**: regra de produto. **Confiança**: alta.
- **Atualizado**: 2026-07-07. **Histórico**: v1 3min; v2 60s + sync prévio.

### A12 — Contatos: salvar só quem fechou pedido; + e lápis
- **Categoria**: clientes/CRM
- **Problema**: qualquer curioso virava cliente salvo.
- **Causa**: sincronização importava toda conversa.
- **Solução**: botão **+** só aparece em número não salvo COM pedido fechado;
  lápis edita nome/telefone (propaga para as conversas); lixeira exclui e
  reabilita o + (liberando recontagem). Sync só atualiza contatos já salvos —
  a API do WhatsApp (Fase 2) importará os contatos salvos do número.
- **Estratégia**: cliente = quem comprou; contato é decisão do dono.
- **Exemplo real**: instruções do dono (2026-07-06).
- **Frequência**: regra de produto. **Confiança**: alta.
- **Atualizado**: 2026-07-06. **Histórico**: v1 sync automático; v2 modelo atual.

### A13 — Preço por tamanho
- **Categoria**: cardápio/precificação
- **Problema**: preço único por prato não reflete P/M/G nem lata/600/2L.
- **Causa**: modelo de dados com um `preco` só.
- **Solução**: `precos:{P:16,M:18,G:22}` + `precoDe(item, etiqueta)`; UI de
  cartões com tiles (tile ativo mostra o preço dentro); cardápio, perguntas e
  carrinho usam o preço do tamanho escolhido; migração automática dos dados.
- **Estratégia**: dinheiro não admite aproximação — preço sempre do tamanho exato.
- **Exemplo real**: pedido do dono (2026-07-07).
- **Frequência**: regra de produto. **Confiança**: alta.
- **Atualizado**: 2026-07-07. **Histórico**: v1 grade; v2 cartões com tiles (padrão Apple).

### A14 — Linguagem real do cliente (gírias, emojis, irritação)
- **Categoria**: linguagem natural
- **Problema**: "obrigado/vlw" caíam em "não entendi"; "que horas abre?" sem
  resposta; "cancelar o pedido" tentava remover um item chamado "pedido";
  cliente irritado recebia resposta neutra; 👍 não confirmava; fallback
  repetia a mesma frase indefinidamente.
- **Causa**: intenções sociais/utilitárias não mapeadas.
- **Solução**: intents AGRADECER, HORARIO, CANCELAR_PEDIDO (zera carrinho),
  RECLAMACAO (com pedido → status do preparo; sem pedido → desculpa + humano);
  emojis 👍👌✅ = sim; genéricos de comida listam marmitas; fallback com 3
  variações e oferta de atendente na 3ª.
- **Estratégia**: mapear TODO padrão social recorrente para uma resposta
  específica; fallback é o último recurso e nunca se repete igual.
- **Exemplos reais/typos observados**: "frang", "pepesi", "una coca", "vlw",
  "obg", "blz", "Marmita g", frases uma-por-mensagem ("quero" / "uma marmita" /
  "de frango").
- **Frequência**: contínua. **Confiança**: média-alta (crescerá com uso real).
- **Atualizado**: 2026-07-07. **Histórico**: v1.

### A15 — Cache do Safari/iPad esconde versões novas
- **Categoria**: operação/deploy
- **Problema**: o dono via comportamento antigo após o deploy e reportava
  bugs já corrigidos.
- **Causa**: cache do Safari no iPad (GitHub Pages).
- **Solução/Estratégia**: após cada deploy, recarregar a página (puxar para
  baixo). Ao receber um bug report, PRIMEIRO conferir se o print é da versão
  atual antes de mexer no código.
- **Exemplo real**: prints das 19h05 refletindo versão anterior (2026-07-06).
- **Frequência**: 2 casos. **Confiança**: alta.
- **Atualizado**: 2026-07-06. **Histórico**: v1.

### A16 — Formatação WhatsApp renderizada no chat
- **Categoria**: experiência de atendimento
- **Problema**: mensagens exibiam `*Marmitas*` com asteriscos crus, e o cardápio
  com 3 preços quebrava linha de forma ilegível.
- **Causa**: o simulador não renderizava a marcação do WhatsApp; preços por
  tamanho na mesma linha do nome estouravam a largura do balão.
- **Solução**: `buildBubble` converte `*negrito*`/`_itálico_`/`~riscado~` (após
  `esc()`, antes dos chips); cardápio põe os tamanhos em linha própria indentada;
  prévia do inbox remove os asteriscos.
- **Estratégia**: o simulador deve espelhar EXATAMENTE como o WhatsApp real
  renderiza — o texto das mensagens já usa a sintaxe oficial (`*b*`, `_i_`, `~s~`).
- **Exemplo real**: print do dono com `*Marmitas*` cru (2026-07-07).
- **Frequência**: 1 caso real. **Confiança**: alta.
- **Atualizado**: 2026-07-07. **Histórico**: v1.

### A17 — Integração WhatsApp: enviar ≠ receber
- **Categoria**: integração/arquitetura
- **Problema**: conectar o robô ao WhatsApp real a partir de um site estático.
- **Causa/limite**: a Cloud API da Meta permite ENVIAR do navegador
  (`graph.facebook.com` aceita CORS), mas RECEBER exige webhook (servidor).
- **Solução (parcial, Fase 1.5)**: painel Clientes envia mensagem de teste real
  (`POST /v21.0/{phoneId}/messages`, token Bearer); número normalizado para
  E.164 com DDI 55; sucesso marca Conectado; erros da Meta são mostrados.
  Guia completo em `docs/FASE2-WHATSAPP.md`.
- **Estratégia**: recebimento e segredos vão para Supabase Edge Functions
  (webhook + token em secrets). NUNCA colocar token em código/commit — o token
  digitado fica só no localStorage do aparelho e isso é aceitável apenas para
  o número de teste.
- **Exemplo real**: pedido do dono "integre a api do whatsapp" (2026-07-07).
- **Frequência**: marco de produto. **Confiança**: alta.
- **Atualizado**: 2026-07-07. **Histórico**: v1 envio pelo painel.

### A18 — Pergunta sobre o próprio endereço/dados ≠ pergunta de preço
- **Categoria**: interpretação de pedido / experiência
- **Problema**: "qual é o meu endereço?" caía em "não encontrei esse item no
  cardápio" — e o robô nunca confirmava o endereço coletado.
- **Causa**: o catch-all de PRECO captura qualquer mensagem terminada em "?";
  não havia intent para consultar dados da própria conversa.
- **Solução**: intent `CONSULTAR_ENDERECO` (antes do PRECO) responde o
  `c.endereco` salvo (ou avisa que ainda não tem); ao coletar o endereço, o
  robô SEMPRE confirma repetindo "📍 *endereço*" + a zona/taxa.
- **Estratégia**: perguntas sobre o estado da própria conversa (endereço,
  pedido, total) têm intents próprios e vêm ANTES de catch-alls genéricos;
  dado crítico coletado (endereço) deve ser sempre confirmado de volta.
- **Exemplo real**: "qual e o meu endereco?" → "não encontrei item" (2026-07-08).
- **Frequência**: 1 caso real. **Confiança**: alta.
- **Atualizado**: 2026-07-08. **Histórico**: v1 consulta + confirmação de endereço.

### A19 — Primeiro contato no WhatsApp exige TEMPLATE
- **Categoria**: integração WhatsApp
- **Problema**: o teste retornava sucesso (API aceitava, painel mostrava ✓) mas
  a mensagem NÃO chegava no celular.
- **Causa**: a Cloud API só entrega TEXTO LIVRE dentro da janela de 24h aberta
  quando o CLIENTE manda mensagem primeiro. Como primeiro contato, texto livre é
  aceito (retorna message id) porém descartado silenciosamente.
- **Solução**: o botão de teste envia um TEMPLATE aprovado
  (`type:'template'`, `hello_world`, `en_US`) — templates podem iniciar conversa.
- **Estratégia**: 1ª mensagem sempre template; texto livre só depois que o
  cliente responder (janela de 24h). Na Fase 2, o robô responde em texto livre
  porque o webhook só dispara quando o cliente já mandou mensagem (janela aberta).
- **Exemplo real**: dono viu "✓ enviada" mas nada chegou no WhatsApp (2026-07-08).
- **Frequência**: 1 caso real (comum na Cloud API). **Confiança**: alta.
- **Atualizado**: 2026-07-08. **Histórico**: v1 troca texto→template hello_world.

### A20 — Erro 130497: conta restrita de mensagear no Brasil (verificação)
- **Categoria**: integração WhatsApp / operação
- **Problema**: template hello_world aceito (200 OK, painel ✓) mas não chega; o
  WEBHOOK reportou `status: failed`, código **130497** "Business account is
  restricted from messaging users in this country".
- **Causa**: a Meta bloqueia envio para números do Brasil até a conta ter
  **verificação de negócio**. A resposta síncrona do POST é "aceito"; a falha
  real só aparece assíncrona no webhook — por isso o painel mostrava sucesso.
- **Solução**: verificar o negócio em business.facebook.com/settings → Central
  de Segurança → Iniciar verificação (dados da empresa + CNPJ). Alternativa:
  adicionar forma de pagamento à WABA. Documentado em docs/FASE2-WHATSAPP.md.
- **Estratégia**: "aceito pela API" ≠ "entregue" — status de entrega só via
  webhook. Sem webhook, erros pós-aceite ficam invisíveis. O número do cliente
  foi reconhecido (`5512992564992`), confirmando que token/IDs/lista estão OK.
- **Exemplo real**: webhook do dono retornou 130497 (2026-07-08).
- **Frequência**: 1 caso real (bloqueio de conta nova para BR). **Confiança**: alta.
- **Atualizado**: 2026-07-08. **Histórico**: v1 diagnóstico via webhook.

---

## Processo de testes (inegociável)

1. Suba o servidor local: `npx live-server . --port=3457 --no-browser`.
2. Rode **todas**: `node tests/bateria.js && node tests/bateria2.js &&
   node tests/bateria3.js && node tests/bateria4.js`.
3. Qualquer falha: corrigir → registrar/evoluir aprendizado aqui → rodar TUDO
   de novo. Só publicar (push na `main` → deploy automático) com 100% verde.
4. Cenário novo de cliente (print/vídeo do dono) → vira teste ANTES da correção.
5. Testes usam mock do Nominatim (`page.route`) para endereço determinístico.

## Backlog de evolução (propostas vivas)

- Fase 2: backend + Supabase (dados fora do aparelho) + Claude API no lugar do
  parser heurístico — esta Skill vira o contexto-base da IA.
- API oficial do WhatsApp: importar contatos salvos, receber mensagens reais.
- Combos/adicionais ("marmita + coca = R$ X", "arroz extra").
- Memória por cliente ("o de sempre") a partir do histórico de pedidos.
- Multi-restaurante (SaaS): isolar dados por tenant no Supabase (RLS).
