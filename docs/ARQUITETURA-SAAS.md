# Arquitetura do produto (SaaS de robô de WhatsApp para restaurantes)

Como o Robô de Marmitex funciona como **produto vendido a vários restaurantes**.

## Quem faz o quê

| Papel | Responsabilidade | Frequência |
|---|---|---|
| **Você (dono do SaaS)** | App na Meta + verificação de negócio + App Review (uma vez); mantém o backend | 1 vez |
| **Restaurante (cliente)** | Clica "Conectar WhatsApp" no painel e autoriza o próprio número | 1 vez, no cadastro |
| **Cliente final** | Manda mensagem no WhatsApp do restaurante | nada a configurar |

O cliente final **nunca** cadastra nada. Ele conversa com o número do
restaurante como faria com qualquer negócio; o robô atende automaticamente.

## Como o restaurante conecta o número: Embedded Signup

O jeito profissional (usado por todo SaaS de WhatsApp) é o **Embedded Signup**:

1. No painel há um botão **"Conectar meu WhatsApp"**.
2. O dono do restaurante clica, faz login com o Facebook numa janela da própria
   Meta, escolhe o número e autoriza.
3. Ele **não cria app, não vê token, não mexe no developers.facebook.com**.
4. O token daquele restaurante é guardado no **seu** backend (Supabase), ligado
   ao registro dele em `restaurants` (coluna `wa_phone_number_id`).

Para você habilitar isso (uma vez): o app precisa passar pela **App Review** da
Meta com as permissões `whatsapp_business_management` e `whatsapp_business_messaging`,
e você vira um "Tech Provider". Antes disso, dá para conectar manualmente (colando
`phone_number_id` + token), como fazemos no protótipo.

## Camadas

```
Cliente final ──WhatsApp──▶ Meta Cloud API ──webhook──▶ Supabase Edge Function
                                                              │  engine.js (cérebro)
                                                              ▼
                                                     Postgres (RLS por restaurante)
                                                              ▲
                        Dono do restaurante ──▶ Painel (index.html) ──────┘
```

- **Cérebro único** (`supabase/functions/_shared/engine.js`): interpreta a
  mensagem e decide a resposta. Puro e testado (`tests/engine.test.js`). Meta:
  o painel também passar a importá-lo (hoje o front tem a sua própria cópia da
  lógica em `index.html`; unificar elimina divergências).
- **Isolamento (multi-tenant)**: RLS no Postgres garante que cada dono só vê os
  próprios dados. O webhook usa a `service_role` para operar o atendimento.

## Custos (WhatsApp)

A Meta cobra por **conversa** (janela de 24h), não por mensagem. Há uma cota
mensal gratuita (~1.000 conversas de serviço). Acima disso, centavos por
conversa. Modelos possíveis para o SaaS:
- Embutir no preço da mensalidade (mais simples para o restaurante); ou
- Repassar direto (cada restaurante paga o WhatsApp dele).

Decidir quando houver volume real. Supabase e GitHub Pages têm planos gratuitos
que sustentam o começo.

## Roteiro

1. **Fase 1 (feito)**: painel + robô no navegador, dados em `localStorage`.
2. **Fase 1.5 (feito)**: envio real pela Cloud API a partir do painel (teste).
3. **Fase 2 (em curso)**: webhook no Supabase (receber+responder) + banco.
4. **Fase 3**: painel lê/escreve no Supabase; Embedded Signup; cérebro unificado.
5. **Fase 4 (opcional)**: Claude API no lugar do parser, com a Skill como contexto.
