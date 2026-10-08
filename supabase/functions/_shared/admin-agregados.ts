import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';

function contagem(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor < 0) throw new Error('contagem');
  return valor;
}

// O prazo envolve a Promise inteira (cabeçalhos E corpo), além de abortar o transporte.
export async function consultaComPrazo<T>(
  executar: (signal: AbortSignal) => PromiseLike<T>,
  total: AbortSignal,
  prazoMs = 10_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelar: () => void = () => {};
  const expirou = new Promise<never>((_, reject) => {
    cancelar = () => { controller.abort(); reject(new Error('prazo')); };
    if (total.aborted) cancelar();
    else total.addEventListener('abort', cancelar, { once: true });
    timer = setTimeout(cancelar, prazoMs);
  });
  try {
    if (total.aborted) throw new Error('prazo');
    return await Promise.race([Promise.resolve().then(() => executar(controller.signal)), expirou]);
  } finally {
    clearTimeout(timer);
    total.removeEventListener('abort', cancelar);
  }
}

export async function consultarAgregados(cliente: SupabaseClient, agora: Date, total: AbortSignal) {
  const dias7 = new Date(agora.getTime() - 7 * 86_400_000).toISOString();
  const isoAgora = agora.toISOString();
  const falhas: string[] = [];
  async function bloco<T>(nome: string, ler: () => Promise<T>, vazio: T): Promise<T | (T & { indisponivel: true })> {
    try { return await ler(); }
    catch { falhas.push(nome); return { ...vazio, indisponivel: true }; }
  }
  const contar = async (query: {
    abortSignal(signal: AbortSignal): PromiseLike<{ error: unknown; count: number | null }>;
  }) => {
    const r = await consultaComPrazo((signal) => query.abortSignal(signal), total);
    if (r.error) throw new Error('consulta');
    return contagem(r.count);
  };
  // auth.users n?o possui fronteira agregada autorizada nesta rodada.
  // N?o chamar RPC inexistente nem listar usu?rios para contar no cliente.
  const contas = { total: 0, novas7d: 0, novas30d: 0, indisponivel: true as const };
  falhas.push('contas');
  // Mesma regra temporal de public.usuario_tem_direito; sem ler registros.
  const ativas = () => cliente.from('subscriptions').select('id', { count: 'exact', head: true })
    .or(`access_until.gte.${isoAgora},and(status.eq.past_due,grace_until.gte.${isoAgora})`);
  const assinaturas = bloco('assinaturas', async () => {
    const [ativasTotal, mensal, anual, venda, cortesia] = await Promise.all([
      contar(ativas()), contar(ativas().ilike('plan', '%mensal%')), contar(ativas().ilike('plan', '%anual%')),
      contar(ativas().in('provider', ['cakto', 'kiwify'])), contar(ativas().eq('provider', 'interno')),
    ]);
    return { ativas: ativasTotal, porPlano: { mensal, anual }, porOrigem: { venda, cortesia } };
  }, { ativas: 0, porPlano: { mensal: 0, anual: 0 }, porOrigem: { venda: 0, cortesia: 0 } });
  const app = bloco('app', async () => {
    const r = await consultaComPrazo((signal) => cliente.from('app_release').select('version,updated_at')
      .eq('id', 1).abortSignal(signal).maybeSingle(), total);
    const versao = r.data?.version;
    const data = r.data?.updated_at;
    // Mesmo campos de sistema passam por lista/formato estritos; nenhuma string livre sai.
    if (r.error || typeof versao !== 'string' || !/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(versao)
      || typeof data !== 'string' || !Number.isFinite(Date.parse(data))) throw new Error('consulta');
    return { versaoAnunciada: versao, anunciadaEm: new Date(data).toISOString() };
  }, { versaoAnunciada: '0.0.0', anunciadaEm: null as string | null });
  const uso = bloco('uso', async () => {
    const [voz7d, aparelhosComNotificacao] = await Promise.all([
      contar(cliente.from('voice_operations').select('id', { count: 'exact', head: true })
        .eq('status', 'committed').gte('created_at', dias7)),
      contar(cliente.from('push_tokens').select('expo_push_token', { count: 'exact', head: true }).eq('ativo', true)),
    ]);
    return { voz7d, aparelhosComNotificacao };
  }, { voz7d: 0, aparelhosComNotificacao: 0 });
  const [c, s, a, u] = await Promise.all([contas, assinaturas, app, uso]);
  return {
    dados: { contas: c, assinaturas: s, receita: { disponivel: false, soma30d: null, moeda: 'BRL' }, app: a, uso: u },
    falhas,
  };
}
