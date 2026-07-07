# Baterias de teste do Robô de Marmitex

Testes de ponta a ponta com Playwright (Chromium) dirigindo o painel real.

## Como rodar

```bash
# 1. dependência (uma vez)
npm i playwright-core

# 2. servidor local
npx live-server . --port=3457 --no-browser

# 3. todas as baterias (a partir da raiz do projeto)
node tests/bateria.js && node tests/bateria2.js && node tests/bateria3.js && node tests/bateria4.js
```

Se o Chromium não estiver no caminho padrão, aponte com `CHROMIUM=/caminho/chrome`.

## O que cada bateria cobre

| Arquivo | Cobertura |
|---|---|
| `bateria.js` | Fluxo completo: número desconhecido, pedido, endereço, Pix/comprovante, contatos (+/lápis/lixeira), KPIs, aba Pedidos |
| `bateria2.js` | Parser: confirmação por etiqueta ("marmita g"), cardápio em seções, atalhos 1/2/3, etiquetas múltiplas, endereço restrito à região |
| `bateria3.js` | Trava anti-loop, expiração de conversa (60s), preço por tamanho (config → chat → carrinho → total) |
| `bateria4.js` | Linguagem real: gírias, agradecimento, horário, cancelamento total, cliente irritado, fora de contexto, fallback variado, injeção de HTML, mensagens em partes, pedidos múltiplos, conversa longa |

## Regras (ver `.claude/skills/robo-atendimento/SKILL.md`)

- Toda alteração roda TODAS as baterias; só publicar com 100% verde.
- Teste que falhar: corrigir → registrar aprendizado na Skill → rodar tudo de novo.
- Cenário novo reportado pelo dono vira teste ANTES da correção.
- O Nominatim é mockado via `page.route` para testes determinísticos de endereço.
