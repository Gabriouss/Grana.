import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { selecionarMensagem } from '../../../lib/notification-catalog.ts';
import {
  atrasoDaTentativa,
  chaveColapsoEntrega,
  chegouHorario,
  contextoDasDatas,
  momentoNaZona,
} from '../_shared/push-habit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_PUSH_SECRET = Deno.env.get('CRON_PUSH_SECRET') ?? '';
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';
const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_TENTATIVAS = 8;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type PushToken = {
  expo_push_token: string;
  user_id: string;
  plataforma: 'android' | 'ios';
  timezone: string;
  horario_hora: number;
  horario_minuto: number;
  ativo: boolean;
  mensagens_recentes: string[];
};

type Entrega = {
  id: string;
  expo_push_token: string;
  data_local: string;
  mensagem_id: string;
  titulo: string;
  corpo: string;
  tentativas: number;
  expo_ticket_id: string | null;
  enviado_em: string | null;
};

type TicketExpo = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

type ReciboExpo = {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function headersExpo(): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
  };
}

async function fetchExpo(url: string, body: unknown): Promise<Response> {
  let ultimaResposta: Response | null = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const resposta = await fetch(url, { method: 'POST', headers: headersExpo(), body: JSON.stringify(body) });
      ultimaResposta = resposta;
      if (resposta.status !== 429 && resposta.status < 500) return resposta;
    } catch {
      // Erro de rede é transitório; o mesmo payload será repetido abaixo.
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** tentativa));
  }
  if (ultimaResposta) return ultimaResposta;
  throw new Error('expo_network_error');
}

async function todosOsTokensAtivos(): Promise<PushToken[]> {
  const todos: PushToken[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase
      .from('push_tokens')
      .select('expo_push_token,user_id,plataforma,timezone,horario_hora,horario_minuto,ativo,mensagens_recentes')
      .eq('ativo', true)
      .range(inicio, inicio + 999);
    if (error) throw error;
    const pagina = (data ?? []) as PushToken[];
    todos.push(...pagina);
    if (pagina.length < 1000) return todos;
  }
}

async function contextosDosUsuarios(userIds: string[]): Promise<Map<string, string[]>> {
  if (!userIds.length) return new Map();
  const { data, error } = await supabase.rpc('contextos_push_habito', { p_user_ids: userIds });
  if (error) throw error;
  return new Map((data ?? []).map((item: { usuario_id: string; datas_recentes: string[] }) => [
    item.usuario_id,
    item.datas_recentes ?? [],
  ]));
}

async function criarEntregasDoDia(tokens: PushToken[], agora: Date): Promise<number> {
  const vencidos = tokens.flatMap((token) => {
    const momento = momentoNaZona(agora, token.timezone);
    return momento && chegouHorario(momento, token.horario_hora, token.horario_minuto)
      ? [{ token, momento }]
      : [];
  });
  if (!vencidos.length) return 0;

  const userIds = [...new Set(vencidos.map(({ token }) => token.user_id))];
  const contextos = await contextosDosUsuarios(userIds);
  const linhas = vencidos.map(({ token, momento }) => {
    const contexto = contextoDasDatas(contextos.get(token.user_id) ?? [], momento.data);
    const mensagem = selecionarMensagem(
      { ...contexto, diaSemana: momento.diaSemana },
      token.mensagens_recentes ?? []
    );
    return {
      expo_push_token: token.expo_push_token,
      data_local: momento.data,
      mensagem_id: mensagem.id,
      titulo: mensagem.titulo,
      corpo: mensagem.texto.replace('{streak}', String(contexto.streak)),
    };
  });
  const { error } = await supabase
    .from('push_habit_deliveries')
    .upsert(linhas, { onConflict: 'expo_push_token,data_local', ignoreDuplicates: true });
  if (error) throw error;
  return linhas.length;
}

async function reagendarOuFalhar(entrega: Entrega, codigo: string): Promise<void> {
  const tentativas = entrega.tentativas;
  const falhou = tentativas >= MAX_TENTATIVAS;
  await supabase.from('push_habit_deliveries').update({
    status: falhou ? 'failed' : 'pending',
    tentativas,
    proxima_tentativa_em: new Date(Date.now() + atrasoDaTentativa(tentativas)).toISOString(),
    expo_ticket_id: null,
    ultimo_erro: codigo.slice(0, 200),
    atualizado_em: new Date().toISOString(),
  }).eq('id', entrega.id);
}

async function removerTokenInvalido(token: string): Promise<void> {
  const { error } = await supabase.from('push_tokens').delete().eq('expo_push_token', token);
  if (error) throw error;
}

async function processarRecibos(): Promise<number> {
  const limite = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data, error } = await supabase
    .from('push_habit_deliveries')
    .select('id,expo_push_token,data_local,mensagem_id,titulo,corpo,tentativas,expo_ticket_id,enviado_em')
    .eq('status', 'sent')
    .is('recibo_consultado_em', null)
    .lte('enviado_em', limite)
    .limit(1000);
  if (error) throw error;
  const entregas = (data ?? []) as Entrega[];
  if (!entregas.length) return 0;

  const ids = entregas.map((item) => item.expo_ticket_id).filter((id): id is string => !!id);
  const resposta = await fetchExpo(EXPO_RECEIPTS_URL, { ids });
  if (!resposta.ok) throw new Error(`expo_receipts_http_${resposta.status}`);
  const payload = await resposta.json() as { data?: Record<string, ReciboExpo> };
  let processados = 0;

  for (const entrega of entregas) {
    if (!entrega.expo_ticket_id) continue;
    const recibo = payload.data?.[entrega.expo_ticket_id];
    if (!recibo) {
      if (entrega.enviado_em && Date.now() - new Date(entrega.enviado_em).getTime() > 23 * 60 * 60_000) {
        await reagendarOuFalhar(entrega, 'receipt_missing');
      }
      continue;
    }
    processados++;
    if (recibo.status === 'ok') {
      await supabase.from('push_habit_deliveries').update({
        recibo_consultado_em: new Date().toISOString(),
        entregue_ao_provedor_em: new Date().toISOString(),
        ultimo_erro: null,
        atualizado_em: new Date().toISOString(),
      }).eq('id', entrega.id);
    } else if (recibo.details?.error === 'DeviceNotRegistered') {
      await removerTokenInvalido(entrega.expo_push_token);
    } else {
      await reagendarOuFalhar(entrega, recibo.details?.error ?? recibo.message ?? 'receipt_error');
    }
  }
  return processados;
}

async function enviarPendentes(tokens: PushToken[], agora: Date): Promise<number> {
  const { data, error } = await supabase.rpc('reivindicar_entregas_push_habito', { p_limite: 500 });
  if (error) throw error;
  const reivindicadas = (data ?? []) as Entrega[];
  const tokensPorId = new Map(tokens.map((token) => [token.expo_push_token, token]));
  const pendentes: Entrega[] = [];
  for (const entrega of reivindicadas) {
    const token = tokensPorId.get(entrega.expo_push_token);
    const momento = token ? momentoNaZona(agora, token.timezone) : null;
    if (token && momento?.data === entrega.data_local) {
      pendentes.push(entrega);
    } else {
      await supabase.from('push_habit_deliveries').update({
        status: 'failed', ultimo_erro: 'expired_local_date', atualizado_em: agora.toISOString(),
      }).eq('id', entrega.id);
    }
  }
  let enviados = 0;

  for (let inicio = 0; inicio < pendentes.length; inicio += 100) {
    const lote = pendentes.slice(inicio, inicio + 100);
    if (!lote.length) continue;

    let resposta: Response;
    try {
      resposta = await fetchExpo(EXPO_SEND_URL, lote.map((entrega) => {
        const token = tokensPorId.get(entrega.expo_push_token)!;
        const chave = chaveColapsoEntrega(entrega.data_local);
        return {
          to: entrega.expo_push_token,
          title: entrega.titulo,
          body: entrega.corpo,
          sound: 'default',
          priority: 'high',
          channelId: 'lembretes-contas',
          collapseId: chave,
          ...(token.plataforma === 'android' ? { tag: chave } : {}),
          data: { tipo: 'habito-diario', mensagemId: entrega.mensagem_id },
        };
      }));
    } catch {
      await Promise.all(lote.map((entrega) => reagendarOuFalhar(entrega, 'expo_network_error')));
      continue;
    }
    if (!resposta.ok) {
      await Promise.all(lote.map((entrega) => reagendarOuFalhar(entrega, `expo_http_${resposta.status}`)));
      continue;
    }

    const payload = await resposta.json() as { data?: TicketExpo[] | TicketExpo };
    const tickets = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
    for (let i = 0; i < lote.length; i++) {
      const entrega = lote[i];
      const ticket = tickets[i];
      if (ticket?.status === 'ok' && ticket.id) {
        enviados++;
        const token = tokensPorId.get(entrega.expo_push_token)!;
        const recentes = [...(token.mensagens_recentes ?? []).filter((id) => id !== entrega.mensagem_id), entrega.mensagem_id].slice(-10);
        token.mensagens_recentes = recentes;
        await Promise.all([
          supabase.from('push_habit_deliveries').update({
            status: 'sent', expo_ticket_id: ticket.id,
            enviado_em: new Date().toISOString(), ultimo_erro: null, atualizado_em: new Date().toISOString(),
          }).eq('id', entrega.id),
          supabase.from('push_tokens').update({
            mensagens_recentes: recentes, atualizado_em: new Date().toISOString(),
          }).eq('expo_push_token', entrega.expo_push_token),
        ]);
      } else if (ticket?.details?.error === 'DeviceNotRegistered') {
        await removerTokenInvalido(entrega.expo_push_token);
      } else {
        await reagendarOuFalhar(entrega, ticket?.details?.error ?? ticket?.message ?? 'ticket_missing');
      }
    }
  }
  return enviados;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CRON_PUSH_SECRET) {
    console.error('[enviar-lembretes-habito] configuração obrigatória ausente');
    return Response.json({ error: 'not_configured' }, { status: 500 });
  }
  const segredo = req.headers.get('x-cron-secret') ?? '';
  if (!timingSafeEqual(segredo, CRON_PUSH_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const agora = new Date();
    const recibos = await processarRecibos();
    const tokens = await todosOsTokensAtivos();
    const criadas = await criarEntregasDoDia(tokens, agora);
    const enviadas = await enviarPendentes(tokens, agora);
    return Response.json({ ok: true, tokens: tokens.length, criadas, enviadas, recibos });
  } catch (error) {
    console.error('[enviar-lembretes-habito] falha', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'processing_error' }, { status: 500 });
  }
});
