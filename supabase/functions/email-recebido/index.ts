import { lerCorpoLimitado } from '../_shared/request-body.ts';
// Encaminha o que chega em contato@, suporte@ e admin@granaponto.com.br para a
// caixa do autor (EMAIL_ENCAMINHAR_PARA). marketing@ só envia: o que chega só para
// ele é descartado (decisão do autor, 12/10/2026). Endereço desconhecido do
// domínio entra como contato@, para cliente que errou o endereço ter resposta.
//
// A Resend recebe o e-mail (MX do domínio aponta para ela), mas não tem caixa
// de entrada com resposta: só painel, API e webhook. Esta função é o webhook
// `email.received`. O autor responde pelo Gmail com "Enviar e-mail como"
// usando o SMTP da Resend, então a resposta sai de @granaponto.com.br.
//
// Quem chama é a Resend (via Svix), sem JWT do Supabase: publicar com
// `--no-verify-jwt`. A autenticação é a assinatura Svix (RESEND_WEBHOOK_SECRET).
//
// Repetição: a Resend reenvia o webhook quando a resposta não é 2xx. O envio
// usa `Idempotency-Key` com o id do e-mail recebido, então um reenvio não vira
// um segundo e-mail na caixa do autor.
import { timingSafeEqual } from '../_shared/seguranca.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_WEBHOOK_SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '';
const ENCAMINHAR_PARA = Deno.env.get('EMAIL_ENCAMINHAR_PARA') ?? '';

const API = 'https://api.resend.com';
const DOMINIO = 'granaponto.com.br';
const CAIXAS = ['contato', 'suporte', 'admin'];
const SO_ENVIO = ['marketing'];
const MAX_BODY_BYTES = 256 * 1024;
const TOLERANCIA_ASSINATURA_S = 5 * 60;
// A Resend aceita até 40 MB por envio, já com o base64. Acima disto o
// encaminhamento sai sem os anexos e avisa no topo do e-mail.
const MAX_ANEXOS_BYTES = 25 * 1024 * 1024;
// Prazo total do trabalho, com folga para o aviso de falha caber depois dele.
const PRAZO_TOTAL_MS = 60_000;

type Endereco = string | string[] | null | undefined;
type Recebido = {
  from?: string;
  to?: Endereco;
  cc?: Endereco;
  reply_to?: Endereco;
  received_for?: Endereco;
  subject?: string | null;
  html?: string | null;
  text?: string | null;
  attachments?: { id: string; size?: number }[];
};
type Anexo = {
  filename?: string;
  content_type?: string;
  content_disposition?: string;
  content_id?: string;
  size?: number;
  download_url?: string;
};

class FalhaHttp extends Error {}
class FalhaTemporaria extends FalhaHttp {}

function lista(e: Endereco): string[] {
  if (!e) return [];
  return (Array.isArray(e) ? e : [e]).filter((x): x is string => typeof x === 'string');
}

function enderecoDe(bruto: string): string {
  const m = bruto.match(/<([^>]+)>/);
  return (m ? m[1] : bruto).trim().toLowerCase();
}

/** Qual caixa recebeu. null quando só caixas de envio receberam. */
export function caixaDestino(e: Recebido): string | null {
  const nossos = [...lista(e.to), ...lista(e.cc), ...lista(e.received_for)]
    .map(enderecoDe).filter((x) => x.endsWith(`@${DOMINIO}`)).map((x) => x.split('@')[0]);
  const caixa = nossos.find((u) => CAIXAS.includes(u));
  if (caixa) return caixa;
  if (nossos.length && nossos.every((u) => SO_ENVIO.includes(u))) return null;
  return 'contato';
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function base64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function assinaturaValida(
  segredo: string, id: string, carimbo: string, assinaturas: string, corpo: string | Uint8Array<ArrayBuffer>, agoraMs: number,
): Promise<boolean> {
  if (!segredo || !id || !carimbo || !assinaturas) return false;
  const t = Number(carimbo);
  if (!Number.isFinite(t) || Math.abs(agoraMs / 1000 - t) > TOLERANCIA_ASSINATURA_S) return false;
  let chave: Uint8Array<ArrayBuffer>;
  try {
    chave = Uint8Array.from(atob(segredo.replace(/^whsec_/, '')), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  const k = await crypto.subtle.importKey('raw', chave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prefixo = new TextEncoder().encode(`${id}.${carimbo}.`);
  const bytes = typeof corpo === 'string' ? new TextEncoder().encode(corpo) : corpo;
  const assinado = new Uint8Array(prefixo.length + bytes.length);
  assinado.set(prefixo);
  assinado.set(bytes, prefixo.length);
  const sig = await crypto.subtle.sign('HMAC', k, assinado);
  const esperada = base64(new Uint8Array(sig));
  return assinaturas.split(' ').some((parte) => {
    const [versao, valor] = parte.split(',');
    return versao === 'v1' && timingSafeEqual(valor ?? '', esperada);
  });
}

/** fetch com o prazo cobrindo também a leitura do corpo, não só a conexão. */
async function chamar<T>(
  url: string, init: RequestInit, prazo: number, ler: (r: Response) => Promise<T>,
): Promise<{ status: number; corpo: T | string }> {
  const restante = prazo - Date.now();
  if (restante <= 0) throw new FalhaTemporaria('prazo esgotado');
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), restante);
  try {
    const r = await fetch(url, { ...init, signal: controle.signal });
    if (!r.ok) {
      void r.body?.cancel().catch(() => {});
      return { status: r.status, corpo: '' };
    }
    return { status: r.status, corpo: await ler(r) };
  } catch {
    throw new FalhaTemporaria('resend: transporte_ou_resposta');
  } finally {
    clearTimeout(timer);
  }
}

function falhaHttp(onde: string, status: number): Error {
  const msg = `resend: ${onde} respondeu ${status}`;
  return status === 429 || status >= 500 ? new FalhaTemporaria(msg) : new FalhaHttp(msg);
}

const auth = () => ({ Authorization: `Bearer ${RESEND_API_KEY}` });

async function buscarAnexos(id: string, prazo: number): Promise<{ anexos: unknown[]; aviso: string | null }> {
  const r = await chamar(`${API}/emails/receiving/${id}/attachments?limit=100`, { headers: auth() }, prazo, (x) => x.json());
  if (r.status !== 200) throw falhaHttp('lista de anexos', r.status);
  // Imagem inline já vem dentro do html (html_format=data_uri, o padrão).
  const itens = ((r.corpo as { data?: Anexo[] }).data ?? []).filter(
    (a) => !(a.content_disposition === 'inline' && a.content_id),
  );
  const total = itens.reduce((s, a) => s + (a.size ?? 0), 0);
  if (total > MAX_ANEXOS_BYTES) {
    return { anexos: [], aviso: `${itens.length} anexo(s) grandes demais para encaminhar; abra no painel da Resend (Emails, Receiving).` };
  }
  const anexos = [];
  for (const a of itens) {
    if (!a.download_url) continue;
    const d = await chamar(a.download_url, {}, prazo, async (x) => new Uint8Array(await x.arrayBuffer()));
    if (d.status !== 200) throw falhaHttp('download de anexo', d.status);
    anexos.push({ filename: a.filename ?? 'anexo', content: base64(d.corpo as Uint8Array), content_type: a.content_type });
  }
  return { anexos, aviso: null };
}

async function enviar(corpo: Record<string, unknown>, chaveIdem: string, prazo: number): Promise<void> {
  const r = await chamar(`${API}/emails`, {
    method: 'POST',
    headers: { ...auth(), 'Content-Type': 'application/json', 'Idempotency-Key': chaveIdem },
    body: JSON.stringify(corpo),
  }, prazo, (x) => x.json());
  if (r.status !== 200) throw falhaHttp('envio', r.status);
}

async function encaminhar(id: string, prazo: number): Promise<boolean> {
  const r = await chamar(`${API}/emails/receiving/${id}`, { headers: auth() }, prazo, (x) => x.json());
  if (r.status !== 200) throw falhaHttp('e-mail recebido', r.status);
  const e = r.corpo as Recebido;

  const caixa = caixaDestino(e);
  if (!caixa) return false;
  const remetente = e.from ?? '';
  const responderPara = lista(e.reply_to).length ? lista(e.reply_to) : (remetente ? [remetente] : []);
  const { anexos, aviso } = e.attachments?.length ? await buscarAnexos(id, prazo) : { anexos: [], aviso: null };

  const topo = `Recebido em ${caixa}@${DOMINIO}, de ${remetente || 'remetente desconhecido'}.` + (aviso ? ` ${aviso}` : '');
  const html = `<p style="font:12px sans-serif;color:#666;margin:0 0 12px">${escaparHtml(topo)}</p>`
    + (e.html ?? `<pre style="white-space:pre-wrap">${escaparHtml(e.text ?? '')}</pre>`);

  await enviar({
    // O remetente original NÃO entra no From. "security@facebookmail.com via
    // admin" saindo do nosso domínio é o desenho de phishing, e a Resend alertou
    // a conta em 12/10/2026 depois de encaminhar assim códigos do Facebook e
    // links do Google e da Anthropic. Quem mandou fica no topo do corpo e no
    // Reply-To.
    from: `Grana. ${caixa} <${caixa}@${DOMINIO}>`,
    to: [ENCAMINHAR_PARA],
    reply_to: responderPara,
    subject: e.subject?.trim() || '(sem assunto)',
    html,
    text: `${topo}\n\n${e.text ?? ''}`,
    attachments: anexos,
  }, `encaminhar/${id}`, prazo);
  return true;
}

/** Recibo quando o encaminhamento falha de vez: o e-mail não some em silêncio. */
async function avisarFalha(id: string, meta: Record<string, unknown>, motivo: string): Promise<void> {
  const linhas = [
    'Chegou um e-mail que não pôde ser encaminhado para cá.',
    `Para: ${lista(meta.to as Endereco).join(', ') || '?'}`,
    `De: ${String(meta.from ?? '?')}`,
    `Assunto: ${String(meta.subject ?? '(sem assunto)')}`,
    `Motivo: ${motivo}`,
    'Ele continua no painel da Resend, em Emails, Receiving.',
  ];
  await enviar({
    from: `Grana. encaminhamento <contato@${DOMINIO}>`,
    to: [ENCAMINHAR_PARA],
    subject: `Falha ao encaminhar: ${String(meta.subject ?? '(sem assunto)').slice(0, 120)}`,
    text: linhas.join('\n'),
  }, `falha/${id}`, Date.now() + 15_000);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!RESEND_API_KEY || !RESEND_WEBHOOK_SECRET || !ENCAMINHAR_PARA) {
    console.error('[email-recebido] configuração obrigatória ausente');
    return new Response('Not configured', { status: 500 });
  }
  const lido = await lerCorpoLimitado(req, MAX_BODY_BYTES);
  if (!lido.ok) return Response.json({ error: 'request_body_rejected' }, { status: lido.status });
  const corpo = new TextDecoder().decode(lido.bytes);

  const ok = await assinaturaValida(
    RESEND_WEBHOOK_SECRET,
    req.headers.get('svix-id') ?? '',
    req.headers.get('svix-timestamp') ?? '',
    req.headers.get('svix-signature') ?? '',
    lido.bytes,
    Date.now(),
  );
  if (!ok) return new Response('Invalid signature', { status: 401 });

  let evento: { type?: string; data?: Record<string, unknown> & { email_id?: string } };
  try {
    evento = JSON.parse(corpo);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (evento.type !== 'email.received') return new Response('ignored', { status: 200 });
  const id = evento.data?.email_id;
  if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) return new Response('Invalid email id', { status: 400 });

  try {
    const encaminhado = await encaminhar(id, Date.now() + PRAZO_TOTAL_MS);
    return new Response(encaminhado ? 'ok' : 'ignored: send-only mailbox', { status: 200 });
  } catch (erro) {
    const motivo = erro instanceof FalhaHttp ? erro.message : 'resend: resposta_invalida';
    console.error(JSON.stringify({ codigo: 'email-recebido-falha', id, temporaria: erro instanceof FalhaTemporaria, motivo }));
    // Temporária: 500 faz a Resend tentar de novo, e a chave de idempotência
    // impede duplicar se a primeira tentativa tiver chegado a enviar.
    if (erro instanceof FalhaTemporaria) return new Response('retry', { status: 500 });
    try {
      await avisarFalha(id, evento.data ?? {}, motivo);
    } catch {
      console.error(JSON.stringify({ codigo: 'email-recebido-aviso-falhou', id }));
      return new Response('retry', { status: 500 });
    }
    return new Response('failed, notified', { status: 200 });
  }
});
