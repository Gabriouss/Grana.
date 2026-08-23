/**
 * Webhook da Kiwify — cria/atualiza `subscriptions` e libera o acesso pago
 * ao Grana. Configurar em: painel da Kiwify → Webhooks → nova URL,
 * apontando para este endpoint com o token de segurança na query string
 * (ver `tokenValido` abaixo).
 *
 * ATENÇÃO — a estrutura exata do payload da Kiwify NÃO foi confirmada contra
 * a documentação oficial no momento em que este arquivo foi escrito: as
 * páginas relevantes bloquearam a busca automatizada (403 de bot), e o
 * índice de docs que abriu era da API de BANKING deles (Pix/cashout), não a
 * de pedidos/assinaturas. `normalizarEvento` abaixo tenta vários nomes de
 * campo vistos em guias de terceiros e no formato de "envelope"
 * (id/type/data/version) que a Kiwify documenta para outros produtos — mas
 * isso PRECISA ser confirmado contra um evento real antes deste webhook
 * poder ser considerado pronto para produção.
 *
 * O caminho pra fechar isso sem chute: toda chamada recebida é gravada
 * inteira em `webhook_raw_log` (corpo e headers), autenticada ou não,
 * reconhecida ou não. Baixe o primeiro evento de teste enviado pelo painel
 * da Kiwify (ou a primeira compra real) e ajuste `normalizarEvento` pelos
 * nomes de campo que aparecerem de verdade ali.
 *
 * Autenticação: o modelo mais citado em integrações de terceiros da Kiwify
 * (Zapier, n8n, Pluga) é um token compartilhado colado na PRÓPRIA URL do
 * webhook, configurado no painel deles — não um header assinado. Confirme
 * isso na tela de criar webhook antes de apontar pra cá; se for diferente
 * (ex.: header HMAC), a verificação abaixo precisa mudar.
 *
 * Por segurança, nenhum evento sem token válido chega a alterar
 * `subscriptions` — só fica registrado no log. Isso deixa seguro testar o
 * endpoint (e capturar payloads reais) mesmo antes de `KIWIFY_WEBHOOK_TOKEN`
 * estar configurado com o valor certo.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const KIWIFY_WEBHOOK_TOKEN = Deno.env.get('KIWIFY_WEBHOOK_TOKEN') ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/* Duração do ciclo quando o payload não traz a data da próxima cobrança
   explicitamente — acontece na oferta de entrada (3 meses fixos), que não é
   bem uma "assinatura recorrente" na primeira compra. 92 dias (3 meses +
   folga) em vez de 90 cravado: absorve o atraso entre o pagamento e o
   processamento do webhook sem cortar ninguém à toa. */
const DIAS_CICLO_PADRAO = 92;
const DIAS_CARENCIA_ATRASO = 3;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Token vem na query string da URL cadastrada no painel da Kiwify — ver o
   aviso no topo do arquivo sobre essa suposição não estar confirmada. */
function tokenValido(url: URL): boolean {
  if (!KIWIFY_WEBHOOK_TOKEN) return false;
  const recebido = url.searchParams.get('token') ?? '';
  return recebido.length > 0 && timingSafeEqual(recebido, KIWIFY_WEBHOOK_TOKEN);
}

/* Anda por uma lista de caminhos candidatos (o mais específico primeiro) e
   devolve o primeiro que existir de verdade. Existe porque não há confirmação
   de qual convenção de payload chega aqui — ver aviso no topo do arquivo. */
function pegar(obj: unknown, caminhos: string[]): unknown {
  for (const caminho of caminhos) {
    let valor: unknown = obj;
    for (const chave of caminho.split('.')) {
      valor = valor && typeof valor === 'object' ? (valor as Record<string, unknown>)[chave] : undefined;
      if (valor === undefined) break;
    }
    if (valor !== undefined && valor !== null && valor !== '') return valor;
  }
  return undefined;
}

type Categoria = 'aprovado' | 'reembolso' | 'chargeback' | 'atrasado' | 'cancelado' | 'desconhecido';

type EventoNormalizado = {
  categoria: Categoria;
  email: string | null;
  orderId: string | null;
  plano: string | null;
  proximaCobranca: string | null;
};

const STATUS_APROVADO = new Set(['paid', 'approved', 'completed', 'complete', 'purchase_approved']);
const STATUS_REEMBOLSO = new Set(['refunded', 'refund']);
const STATUS_CHARGEBACK = new Set(['chargedback', 'chargeback', 'dispute']);
const STATUS_ATRASADO = new Set(['delayed', 'overdue', 'waiting_payment', 'billet_printed', 'boleto_gerado']);
const STATUS_CANCELADO = new Set(['canceled', 'cancelled', 'subscription_canceled', 'subscription_cancelled']);

function normalizarEvento(body: Record<string, unknown>): EventoNormalizado {
  const statusBruto = String(
    pegar(body, ['order_status', 'status', 'data.status', 'data.order_status', 'type', 'event']) ?? ''
  ).toLowerCase();

  let categoria: Categoria = 'desconhecido';
  if (STATUS_APROVADO.has(statusBruto) || statusBruto.includes('approved') || statusBruto.includes('paid')) {
    categoria = 'aprovado';
  } else if (STATUS_REEMBOLSO.has(statusBruto) || statusBruto.includes('refund')) {
    categoria = 'reembolso';
  } else if (STATUS_CHARGEBACK.has(statusBruto) || statusBruto.includes('chargeback') || statusBruto.includes('dispute')) {
    categoria = 'chargeback';
  } else if (STATUS_ATRASADO.has(statusBruto) || statusBruto.includes('delay') || statusBruto.includes('overdue')) {
    categoria = 'atrasado';
  } else if (STATUS_CANCELADO.has(statusBruto) || statusBruto.includes('cancel')) {
    categoria = 'cancelado';
  }

  const email = pegar(body, [
    'Customer.email', 'customer.email', 'data.customer.email', 'data.buyer.email', 'buyer.email', 'customer_email',
  ]);
  const orderId = pegar(body, ['order_id', 'order_ref', 'data.id', 'data.order_id', 'id']);
  const plano = pegar(body, ['product.name', 'Product.product_name', 'data.product.name', 'plan', 'data.plan.name']);
  const proximaCobranca = pegar(body, [
    'subscription.next_charge_date', 'data.subscription.next_charge_date', 'next_charge', 'data.next_charge_date',
  ]);

  return {
    categoria,
    email: email ? String(email) : null,
    orderId: orderId ? String(orderId) : null,
    plano: plano ? String(plano) : null,
    proximaCobranca: proximaCobranca ? String(proximaCobranca) : null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const url = new URL(req.url);
  const rawBody = await req.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = null;
  }

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k] = v;
  });

  const autenticado = tokenValido(url);

  // Grava tudo que chega, autenticado ou não — é o que permite fechar o
  // mapeamento de campo a partir do primeiro evento real (ver aviso no topo).
  const { data: logCriado } = await supabase
    .from('webhook_raw_log')
    .insert({ provider: 'kiwify', headers, body: body ?? { raw_nao_json: rawBody } })
    .select('id')
    .single();

  if (!autenticado) {
    // 401 mesmo assim: sem token batendo, NENHUM estado de assinatura muda.
    // Só o registro do log acima acontece.
    return new Response('Unauthorized', { status: 401 });
  }

  if (!body) {
    return new Response('Invalid JSON', { status: 400 });
  }

  const evento = normalizarEvento(body);

  if (evento.categoria === 'desconhecido' || !evento.orderId) {
    // Chegou autenticado, mas não bateu com nenhum campo conhecido — fica só
    // no log (já gravado acima, com resolvido=false), para revisão manual.
    return new Response('OK (evento nao reconhecido, registrado para revisao)', { status: 200 });
  }

  const agora = new Date();

  if (evento.categoria === 'aprovado') {
    const acessoAte = evento.proximaCobranca
      ? new Date(evento.proximaCobranca)
      : new Date(agora.getTime() + DIAS_CICLO_PADRAO * 24 * 60 * 60 * 1000);

    await supabase.from('subscriptions').upsert(
      {
        provider: 'kiwify',
        provider_order_id: evento.orderId,
        email_compra: evento.email ?? '',
        plan: evento.plano,
        status: 'active',
        access_until: acessoAte.toISOString(),
        grace_until: null,
        raw_last_event: body,
        updated_at: agora.toISOString(),
      },
      { onConflict: 'provider,provider_order_id' }
    );
  } else if (evento.categoria === 'reembolso' || evento.categoria === 'chargeback') {
    // Corta na hora, sem carência — dinheiro devolvido ou contestado não
    // continua com acesso, não importa quanto faltava no ciclo.
    await supabase
      .from('subscriptions')
      .update({
        status: evento.categoria,
        access_until: agora.toISOString(),
        grace_until: null,
        raw_last_event: body,
        updated_at: agora.toISOString(),
      })
      .eq('provider', 'kiwify')
      .eq('provider_order_id', evento.orderId);
  } else if (evento.categoria === 'atrasado') {
    await supabase
      .from('subscriptions')
      .update({
        status: 'past_due',
        grace_until: new Date(agora.getTime() + DIAS_CARENCIA_ATRASO * 24 * 60 * 60 * 1000).toISOString(),
        raw_last_event: body,
        updated_at: agora.toISOString(),
      })
      .eq('provider', 'kiwify')
      .eq('provider_order_id', evento.orderId);
  } else if (evento.categoria === 'cancelado') {
    // Só marca a intenção — access_until NÃO muda: quem cancelou continua
    // com acesso até o fim do período já pago, só não renova depois.
    await supabase
      .from('subscriptions')
      .update({ status: 'canceled', raw_last_event: body, updated_at: agora.toISOString() })
      .eq('provider', 'kiwify')
      .eq('provider_order_id', evento.orderId);
  }

  if (logCriado?.id) {
    await supabase.from('webhook_raw_log').update({ resolvido: true }).eq('id', logCriado.id);
  }

  return new Response('OK', { status: 200 });
});
