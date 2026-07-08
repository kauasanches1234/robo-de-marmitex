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
7. Toque em **Enviar mensagem de teste** → chega uma mensagem **"Hello World"**
   no seu WhatsApp e o status vira **Conectado** ✅.

> **Por que "Hello World" e não um texto nosso?** A Cloud API só entrega texto
> livre depois que o CLIENTE manda a primeira mensagem (janela de 24h). Como
> primeiro contato, é obrigatório um **template aprovado** — usamos o
> `hello_world` que já vem pronto. Se você mandar "oi" do seu WhatsApp para o
> número de teste, a janela abre e aí o robô pode responder em texto livre.
> Se o painel disser "enviada" mas nada chegar, é quase sempre isto: mande uma
> mensagem do seu WhatsApp para o número de teste e tente de novo.

### Se der erro

| Mensagem da Meta | Causa provável |
|---|---|
| `Invalid OAuth access token` | Token vencido (o temporário dura 24h) — gere outro no passo 4 |
| `Recipient phone number not in allowed list` | Faça o passo 5 (adicionar seu número à lista) |
| `Object with ID ... does not exist` | Phone Number ID errado |
| `Business account is restricted from messaging users in this country` (código **130497**) | A conta ainda **não pode enviar para o Brasil** — falta **verificar o negócio** (veja abaixo). A API aceita o envio (200 OK) e a falha só chega no **webhook** como `status: failed`. |

## Erro 130497 — liberar envio para o Brasil (verificação de negócio)

A Meta restringe o envio para números brasileiros até a conta estar verificada.
Isso é política da Meta, não do nosso código — a integração técnica (token,
Phone Number ID, envio, webhook) já está funcionando; o número de destino
inclusive é reconhecido corretamente.

Como liberar:

1. Acesse **business.facebook.com/settings** (Meta Business Suite → Configurações do negócio).
2. **Central de Segurança** (Security Center) → **Iniciar verificação**.
3. Informe os dados da empresa (razão social, endereço, telefone) e anexe um
   documento — no Brasil normalmente o **CNPJ** ou conta de serviço no nome do negócio.
4. A Meta analisa (de horas a alguns dias). Aprovada a verificação, o 130497 some.

Atalho que às vezes destrava antes da verificação completa: adicionar uma
**forma de pagamento** à conta WhatsApp Business (WABA) em
**WhatsApp → Configuração → Faturamento/Pagamentos**.

> Enquanto não verifica, dá para testar mandando para um número de **outro país**
> (que não tenha a restrição), mas para valer no seu caso o caminho é a verificação.

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
