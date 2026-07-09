# Fase 2 — Integração Front ↔ Back (Supabase)

Objetivo: o painel deixar de viver só no `localStorage` e passar a **ler e
gravar no Supabase**, com **login por restaurante** (multi-tenant), sem quebrar
o que já funciona. Documento vivo — atualizar a cada slice entregue.

## 1. Onde estamos

- **Front (`index.html`)**: single-file, todo o estado em `localStorage`
  (`saveDB()` em ~40 pontos). Fonte da verdade hoje: `DB` (ver `defaultDB()`).
- **Back (`supabase/`)**: schema multi-tenant com RLS
  (`migrations/20260708_init.sql`), webhook do WhatsApp e `engine.js` (cérebro
  único). Pronto, mas **o painel ainda não fala com ele**.
- **Camada nova (este slice)**: `js/mappers.js` — tradução pura front↔linhas do
  banco, coberta por `tests/mappers.test.js` (25 casos). É a fronteira única de
  conversão (DRY): ninguém remonta campos à mão.

## 2. Mapa tabelas ↔ telas

| Tela / dado do painel        | Tabela Supabase   | Mapeador                         |
|------------------------------|-------------------|----------------------------------|
| Configurações do restaurante | `restaurants`     | `configToRow` / `rowToConfig`    |
| Cardápio (marmitas/bebidas)  | `menu_items`      | `cardapioToRows` / `rowsToCardapio` |
| Clientes salvos              | `customers`       | `customerToRow` / `rowToCustomer`|
| Pedidos / KPIs               | `orders`          | (leitura; escrita é do webhook)  |
| Conversas em atendimento     | `conversations` + `messages` | (tempo real; fase seguinte) |

**Gap coberto:** `mapa` (áreas/zonas) e `peculiaridades` não tinham coluna →
migração `20260709_config_extra.sql` adiciona `restaurants.config_extra jsonb`,
onde o mapeador guarda esse bloco de UI.

## 3. Autenticação (multi-tenant)

- **Supabase Auth** (e-mail + senha ou magic link). Cada dono autentica; o
  `auth.uid()` casa com `restaurants.owner_id` e a **RLS** garante que ele só
  enxerga o próprio restaurante — nenhuma checagem de dono no front (a segurança
  é no banco, não na UI).
- **Chaves no front**: `SUPABASE_URL` + **anon key** são públicas por design
  (a RLS é quem protege). Ficam num `config.js` público. A `service_role`
  **NUNCA** vai ao front (repo é público) — só no servidor/webhook via
  `supabase secrets`.
- **Modo offline**: sem `config.js` válido, o painel roda como hoje (localStorage,
  sem login). Assim o site continua funcionando enquanto as chaves não entram.

## 4. Estratégia de migração (sem quebrar nada)

Rollout em fatias pequenas, cada uma verde na suíte antes da próxima:

1. **[feito]** Mapeadores puros + testes + coluna `config_extra`.
2. Cliente Supabase (`js/supa-client.js`) com bootstrap por `config.js` e
   fallback offline. Sem tocar nos `saveDB()`.
3. **Seam de persistência**: um repositório (`repo`) que embrulha hoje o
   localStorage (comportamento idêntico → suíte segue verde). Todos os
   `saveDB()`/leituras passam a chamar `repo.*`.
4. Implementação `SupaRepo` do repositório (usa os mapeadores). Flag liga
   cloud quando `config.js` + sessão existirem.
5. Tela de login + carga inicial do restaurante do dono.
6. Import único: na 1ª conexão, sobe o `DB` local pro banco (semear o tenant).
7. Tempo real de conversas/pedidos (Supabase Realtime) — depois do WhatsApp.

## 5. Revisão de segurança (diretriz 3)

- **Exposição de dados sensíveis**: anon key é pública por design; a proteção
  real é a RLS. Auditado: toda tabela tem RLS e policy por `owner_id`. ✅
- **Escalada de privilégios / IDOR**: front nunca envia `restaurant_id` de
  outro tenant porque a policy `with check` recusa no banco. ✅
- **Injeção**: cliente supabase-js usa API parametrizada (sem SQL cru). Sem
  `dangerouslySetInnerHTML`/`eval`; entrada do cliente já é limitada no engine.
- **XSS no painel**: conteúdo do banco (nome do prato, do cliente) é renderizado
  como texto — auditar que nenhum ponto usa `innerHTML` com dado do banco ao
  ligar o cloud (checklist do slice 4).
- **CORS/cookies/tokens**: Supabase Auth guarda o token no `localStorage` do
  domínio (padrão da lib); GitHub Pages é HTTPS. Sem cookies próprios.
- **Dependência**: `@supabase/supabase-js@2` (oficial, mantida). Fixar versão.
- **service_role**: só no servidor. Nunca no bundle do front. ✅

## 6. Riscos e trade-offs

- **Estático sem build**: sem injeção de env em runtime → `config.js` público
  (aceitável: anon key é pública). Trade-off consciente.
- **Offline/online divergir**: enquanto houver os dois modos, o import (slice 6)
  precisa de estratégia clara de “fonte da verdade” para não duplicar dados.
- **Migração de 40 call sites**: risco de regressão → mitigado pelo seam (slice
  3) que preserva comportamento e mantém a suíte como rede de segurança.
- **`id` numérico local vs uuid do banco**: o mapeador não envia id numérico
  (o banco gera uuid); o front passa a usar o uuid ao ler do cloud.

## 7. Como testar

- Puro (Node, sem banco): `node tests/mappers.test.js`.
- Suíte completa: ver `.claude/skills/robo-atendimento/SKILL.md` (processo de
  testes). Slices que ligam o banco de verdade exigem `config.js` com um
  projeto Supabase (URL + anon key) e as migrações aplicadas.
