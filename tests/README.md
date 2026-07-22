# Testes do Robô de Marmitex

Dois grupos: **backend/banco** (Node puro, sem servidor nem navegador) e
**front** (Playwright/Chromium dirigindo o painel real).

## Como rodar

```bash
# uma vez por ambiente: liga o Playwright pré-instalado e instala o pglite
npm run setup

# backend + banco (rápido, não precisa de servidor):
npm test              # = npm run test:back

# front (precisa do servidor de pé):
npm run serve         # em outro terminal (live-server na porta 3457)
npm run test:front
```

Se o Chromium não estiver no caminho padrão, aponte com `CHROMIUM=/caminho/chrome`.

## Backend / banco (`npm run test:back`)

| Arquivo | Cobertura |
|---|---|
| `engine.test.js` | Cérebro do robô (parser, intenções, fluxo) — o mesmo `engine.js` do webhook |
| `engine-dias.test.js` | Disponibilidade por dia da semana ("tem carne hoje?", "que dia tem feijoada?") |
| `engine-variedades.test.js` | Variedades personalizadas (Família, Kids…) com preço próprio |
| `mappers.test.js` | Tradução pura front↔Supabase (ida-e-volta, defaults, linhas nulas) |
| `webhook-flow.test.js` | Caminho REAL do webhook: linha do banco → mappers → engine → resposta |
| `schema.test.js` | Migrações num Postgres real (pglite): estrutura, constraints, cascata, triggers e **RLS** (isolamento entre restaurantes) |

## Front (`npm run test:front`)

| Arquivo | Cobertura |
|---|---|
| `bateria.js` | Fluxo completo: número desconhecido, pedido, endereço, Pix/comprovante, contatos (+/lápis/lixeira), KPIs, aba Pedidos |
| `bateria2.js` | Parser: confirmação por etiqueta ("marmita g"), cardápio em seções, atalhos 1/2/3, etiquetas múltiplas, endereço restrito à região |
| `bateria3.js` | Trava anti-loop, expiração de conversa (60s), preço por tamanho (config → chat → carrinho → total) |
| `bateria4.js` | Linguagem real: gírias, agradecimento, horário, cancelamento total, cliente irritado, fora de contexto, fallback variado, injeção de HTML, mensagens em partes, pedidos múltiplos, conversa longa |
| `bateria5.js`–`bateria8.js` | Bebidas, mapa/zonas de entrega, cardápio por dia, variedades no atendimento |

## Regras (ver `.claude/skills/robo-atendimento/SKILL.md`)

- Toda alteração roda TODAS as baterias; só publicar com 100% verde.
- Teste que falhar: corrigir → registrar aprendizado na Skill → rodar tudo de novo.
- Cenário novo reportado pelo dono vira teste ANTES da correção.
- O Nominatim é mockado via `page.route` para testes determinísticos de endereço.
