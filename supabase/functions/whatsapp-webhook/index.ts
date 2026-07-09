// Edge Function: webhook do WhatsApp (Cloud API da Meta) → robô → resposta.
// Deno. Deploy: supabase functions deploy whatsapp-webhook --no-verify-jwt
//
// Fluxo:
//   GET  → verificação do webhook (hub.challenge) exigida pela Meta.
//   POST → mensagem do cliente: identifica o restaurante pelo phone_number_id,
//          carrega cardápio+config+estado do banco, roda engine.js, responde
//          pela Cloud API e persiste tudo. Também registra falhas de entrega.
//
// Segredos (supabase secrets set ...): WHATSAPP_VERIFY_TOKEN, WHATSAPP_TOKEN.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados pela plataforma.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { responder, estadoInicial } from '../_shared/engine.js';

const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? '';
const GRAPH = 'https://graph.facebook.com/v21.0';
const enc = new TextEncoder();

// comparação de tempo constante (evita timing attack na checagem da assinatura)
function seguroIgual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
// valida X-Hub-Signature-256 (HMAC-SHA256 do corpo com o App Secret da Meta).
// Sem isso o webhook público aceitaria mensagens forjadas. Se APP_SECRET não
// estiver configurado, loga aviso e deixa passar (para não travar o setup) —
// em produção, configure SEMPRE (supabase secrets set WHATSAPP_APP_SECRET=...).
async function assinaturaValida(req: Request, raw: string): Promise<boolean> {
  if (!APP_SECRET) { console.warn('WHATSAPP_APP_SECRET ausente — assinatura NÃO verificada (inseguro)'); return true; }
  const sig = req.headers.get('x-hub-signature-256');
  if (!sig) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(raw));
  const hex = 'sha256=' + [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  return seguroIgual(hex, sig);
}

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

// dia da semana (0=Dom … 6=Sáb) no fuso do restaurante — NUNCA usar getDay() do
// servidor (roda em UTC): à noite no Brasil já seria o dia seguinte lá.
function diaSemanaBR(tz = 'America/Sao_Paulo'): number {
  const wd = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(new Date());
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? new Date().getDay();
}
const itemServidoHoje = (dias: number[] | null, dow: number) => !dias || dias.length === 0 || dias.includes(dow);

async function enviarTexto(phoneNumberId: string, to: string, body: string) {
  const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!r.ok) console.error('envio falhou', r.status, await r.text().catch(() => ''));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // 1) verificação do webhook (a Meta chama uma vez ao configurar)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === VERIFY_TOKEN) return new Response(challenge ?? '', { status: 200 });
    return new Response('forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('ok');

  // lê o corpo cru para validar a assinatura ANTES de confiar no conteúdo
  const raw = await req.text();
  if (!(await assinaturaValida(req, raw))) return new Response('invalid signature', { status: 403 });
  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }

  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // registra falhas de entrega (ex.: 130497) para diagnóstico
        for (const st of value.statuses ?? []) {
          if (st.status === 'failed') console.error('entrega falhou', JSON.stringify(st.errors ?? st));
        }

        for (const msg of value.messages ?? []) {
          if (msg.type !== 'text') continue;                 // v1: só texto
          const from = msg.from;                             // wa_id do cliente
          const texto = msg.text?.body ?? '';

          // restaurante dono deste número
          const { data: rest } = await db.from('restaurants')
            .select('*').eq('wa_phone_number_id', phoneNumberId).maybeSingle();
          if (!rest) { console.error('sem restaurante para', phoneNumberId); continue; }

          // cardápio + config
          const { data: itens } = await db.from('menu_items')
            .select('*').eq('restaurant_id', rest.id).eq('ativo', true).order('ordem');
          const dow = diaSemanaBR();  // cardápio do dia, no fuso do Brasil
          const cardapio = (itens ?? [])
            .filter((i: any) => itemServidoHoje(i.dias, dow))
            .map((i: any) => ({ nome: i.nome, tipo: i.tipo, etiqueta: i.etiqueta, precos: i.precos, preco: i.preco, palavras: i.palavras }));
          const config = { nome: rest.nome, horario: rest.horario, pixKey: rest.pix_key, tempoEntrega: rest.tempo_entrega, taxaEntrega: rest.taxa_entrega, entregaGratis: rest.entrega_gratis };

          // conversa (estado) + cliente
          const { data: conv } = await db.from('conversations')
            .upsert({ restaurant_id: rest.id, wa_id: from }, { onConflict: 'restaurant_id,wa_id' })
            .select().single();
          await db.from('customers').upsert({ restaurant_id: rest.id, wa_id: from }, { onConflict: 'restaurant_id,wa_id', ignoreDuplicates: true });

          // dedupe: se já processamos esta wam_id, ignora
          if (msg.id) {
            const { data: dup } = await db.from('messages').select('id').eq('wam_id', msg.id).maybeSingle();
            if (dup) continue;
          }
          await db.from('messages').insert({ conversation_id: conv.id, quem: 'cliente', texto, wam_id: msg.id });

          if (conv.humano) continue;                          // atendente assumiu

          // roda o robô
          const estado = (conv.estado && Object.keys(conv.estado).length) ? conv.estado : estadoInicial();
          const r = responder(texto, estado, { cardapio, config });

          // persiste estado + envia respostas
          await db.from('conversations').update({ estado: r.estado, humano: !!r.estado.humano, last_at: new Date().toISOString() }).eq('id', conv.id);
          for (const t of r.respostas) {
            await enviarTexto(phoneNumberId, from, t);
            await db.from('messages').insert({ conversation_id: conv.id, quem: 'bot', texto: t });
          }

          // pedido fechado → grava e atualiza o cliente
          if (r.estado.step === 'concluido' && r.estado.pagamento && !r.estado._gravado) {
            const total = (r.estado.cart ?? []).reduce((s: number, i: any) => s + i.preco * i.qtd, 0) + (config.entregaGratis ? 0 : (+config.taxaEntrega || 0));
            await db.from('orders').insert({ restaurant_id: rest.id, itens: r.estado.cart, endereco: r.estado.endereco, pagamento: r.estado.pagamento, total, status: 'novo' });
            const { data: cli } = await db.from('customers').select('id,pedidos_count,gasto_total').eq('restaurant_id', rest.id).eq('wa_id', from).single();
            if (cli) await db.from('customers').update({ nome: cli.nome, pedidos_count: (cli.pedidos_count || 0) + 1, gasto_total: (+cli.gasto_total || 0) + total, updated_at: new Date().toISOString() }).eq('id', cli.id);
            r.estado._gravado = true;
            await db.from('conversations').update({ estado: r.estado }).eq('id', conv.id);
          }
        }
      }
    }
  } catch (e) {
    console.error('erro no processamento', e);
  }
  return new Response('ok');   // sempre 200: a Meta reenvia se não for 200
});
