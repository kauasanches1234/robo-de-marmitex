# Fase 2 — Conectar o WhatsApp de verdade (Cloud API da Meta)

O painel já **envia** mensagens pela API oficial do WhatsApp. Este guia mostra
como conseguir as credenciais e testar em ~10 minutos, de graça, direto do iPad.

## Passo a passo (número de teste gratuito da Meta)

1. Acesse **https://developers.facebook.com** e entre com sua conta do Facebook.
2. Menu **Meus apps → Criar app** → tipo **Empresa/Business** → dê um nome
   (ex.: "Robo de Marmitex") → criar.
3. Na tela do app, procure o produto **WhatsApp** e clique em **Configurar**.
4. Abra **WhatsApp → Configuração da API** (API Setup). Nessa tela a Meta já te dá:
   - **Número de teste** (Test number) — esse é o "número do robô" por enquanto;
   - **Phone Number ID** — copie;
   - **Token de acesso temporário** (dura 24h) — copie.
5. Ainda nessa tela, em **Para (To)**, clique em **Gerenciar lista** e adicione o
   **seu WhatsApp pessoal** (o número precisa confirmar por código). Só números
   dessa lista recebem mensagens do número de teste.
6. No painel do robô → aba **Clientes → WhatsApp do robô**, preencha:
   - *Número do robô*: o número de teste da Meta;
   - *Número para teste*: o seu WhatsApp pessoal (com DDD; pode colar com +55);
   - *Phone Number ID* e *Token de acesso*: os copiados no passo 4.
7. Toque em **Enviar mensagem de teste** → a mensagem "🤖 Teste do Robô de
   Marmitex…" chega no seu WhatsApp e o status vira **Conectado** ✅.

### Se der erro

| Mensagem da Meta | Causa provável |
|---|---|
| `Invalid OAuth access token` | Token vencido (o temporário dura 24h) — gere outro no passo 4 |
| `Recipient phone number not in allowed list` | Faça o passo 5 (adicionar seu número à lista) |
| `Object with ID ... does not exist` | Phone Number ID errado |

## O que já funciona × o que falta

| Capacidade | Status |
|---|---|
| Enviar mensagem pelo número do robô | ✅ funciona hoje, direto do painel |
| Receber mensagens dos clientes (robô responder sozinho) | 🔜 exige um **webhook** — um servidorzinho que a Meta chama a cada mensagem |
| Guardar clientes/pedidos fora do aparelho | 🔜 banco de dados |

## Próxima etapa: backend + banco (Supabase)

O plano — um único serviço gratuito resolve os dois "faltantes":

1. **Você cria uma conta em https://supabase.com** (grátis) e um projeto.
2. **Banco**: tabelas `clientes`, `pedidos`, `cardapio` (eu escrevo o SQL).
3. **Webhook**: uma *Edge Function* do Supabase recebe as mensagens da Meta,
   roda o cérebro do robô e responde pela Cloud API — com o token guardado em
   segredo no servidor (nunca mais no aparelho).
4. No app da Meta, **WhatsApp → Configuração → Webhook**: colar a URL da função
   e o *verify token*.
5. Para ter número definitivo (o seu, não o de teste): número próprio no
   WhatsApp Business + token permanente (system user) — a Meta cobra por
   conversa depois da cota gratuita mensal (1.000 conversas de serviço).

Quando criar a conta do Supabase, me avise na sessão que eu gero o SQL, a Edge
Function e conecto tudo.

## Segurança (importante)

- O token digitado no painel fica **somente no localStorage do seu aparelho** —
  aceitável para testar com o número de teste, **não** para produção.
- Na Fase 2 o token vai para os *secrets* do Supabase e o painel para de guardá-lo.
- Nunca commite tokens no GitHub (o repositório é público).
