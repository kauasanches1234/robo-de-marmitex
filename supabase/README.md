# Backend (Supabase) — Fase 2

Faz o robô **receber e responder sozinho** no WhatsApp, com os dados na nuvem.

```
supabase/
├── migrations/20260708_init.sql        ← tabelas + segurança (RLS)
└── functions/
    ├── _shared/engine.js               ← cérebro do robô (puro, testado)
    └── whatsapp-webhook/index.ts       ← recebe da Meta → engine → responde
```

O `engine.js` é o **mesmo cérebro** validado por `tests/engine.test.js` (rode
`node tests/engine.test.js`). Meta é: no futuro o `index.html` importar este
mesmo arquivo, acabando com a duplicação front/back.

## Passo a passo (uma vez)

Pré-requisito: [Supabase CLI](https://supabase.com/docs/guides/cli). Você já tem
a conta, o projeto e a integração com o GitHub.

```bash
# 1. login e vínculo com o seu projeto (pegue o ref em Project Settings → General)
supabase login
supabase link --project-ref SEU_PROJECT_REF

# 2. cria as tabelas
supabase db push

# 3. segredos do webhook (NUNCA vão para o Git)
supabase secrets set WHATSAPP_VERIFY_TOKEN="uma-frase-secreta-sua"
supabase secrets set WHATSAPP_TOKEN="EAAG...token-da-meta"

# 4. publica o webhook (sem exigir JWT — quem chama é a Meta)
supabase functions deploy whatsapp-webhook --no-verify-jwt
```

A URL fica: `https://SEU_PROJECT_REF.supabase.co/functions/v1/whatsapp-webhook`

## Ligar na Meta

No app da Meta → **WhatsApp → Configuração → Webhooks**:
1. **Callback URL**: a URL acima.
2. **Verify token**: a mesma frase de `WHATSAPP_VERIFY_TOKEN`.
3. Assine o campo **messages**.

Depois cadastre seu restaurante e o número (o `phone_number_id` liga a mensagem
recebida ao restaurante):

```sql
insert into restaurants (nome, pix_key, wa_phone_number_id)
values ('Marmitaria Sabor Caseiro', 'pix@sabor.com', '1178743998661377');

-- cardápio de exemplo (troque restaurant_id pelo id gerado acima)
insert into menu_items (restaurant_id, nome, tipo, etiqueta, precos, palavras) values
 ('<REST_ID>', 'Marmita de Frango', 'marmita', 'P+M+G', '{"P":16,"M":18,"G":22}', 'frango, file de frango'),
 ('<REST_ID>', 'Coca-Cola',        'bebida',  'lata',   '{"lata":7}',           'coca, refri');
```

Mande "oi" do seu WhatsApp para o número → o robô responde. 🎉
(Enquanto o erro **130497** não for resolvido — ver `docs/FASE2-WHATSAPP.md` —
o envio para números BR fica bloqueado pela Meta; o webhook já funciona, só a
entrega da resposta depende da verificação do negócio.)

## Testar o cérebro sem a Meta

```bash
node tests/engine.test.js     # 24 casos, sem rede nem banco
```

## Próximos passos

- Painel (`index.html`) lê/escreve no Supabase em vez de `localStorage`.
- Botão **Conectar WhatsApp** (Embedded Signup) — cada restaurante liga o próprio
  número sem tocar na Meta (ver `docs/ARQUITETURA-SAAS.md`).
- Unificar o cérebro: o front passa a importar `_shared/engine.js`.
- (Opcional) trocar o parser heurístico pela **Claude API** dentro do webhook,
  usando a Skill como contexto do sistema.
