export type TipoCotaIA = 'assistente' | 'voz';

export type ResultadoCotaIA = {
  permitido: boolean;
  motivo: 'minuto' | 'dia' | null;
  minutoRestante: number;
  diaRestante: number;
};

type ClienteCota = {
  rpc: (nome: string, parametros: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
};

/**
 * Reserva uma chamada de IA no contador atômico do usuário.
 *
 * A função SQL é a autoridade: o contador em memória continua existindo como
 * defesa rápida, mas não pode ser usado sozinho porque Edge Function isolates
 * diferentes não compartilham memória.
 */
export async function consumirCotaIA(cliente: ClienteCota, tipo: TipoCotaIA): Promise<ResultadoCotaIA> {
  const { data, error } = await cliente.rpc('consumir_cota_ia', { p_tipo: tipo });
  if (error) {
    console.error('[ai-quota] RPC indisponível', { tipo, code: error.code ?? null, message: error.message ?? null });
    throw new Error('ai_quota_unavailable');
  }

  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha || typeof linha !== 'object') {
    console.error('[ai-quota] resposta inválida da RPC', { tipo });
    throw new Error('ai_quota_invalid_response');
  }

  const resposta = linha as Record<string, unknown>;
  if (typeof resposta.permitido !== 'boolean') {
    console.error('[ai-quota] resposta sem campo permitido', { tipo });
    throw new Error('ai_quota_invalid_response');
  }

  return {
    permitido: resposta.permitido,
    motivo: resposta.motivo === 'minuto' || resposta.motivo === 'dia' ? resposta.motivo : null,
    minutoRestante: Number.isFinite(Number(resposta.minuto_restante)) ? Number(resposta.minuto_restante) : 0,
    diaRestante: Number.isFinite(Number(resposta.dia_restante)) ? Number(resposta.dia_restante) : 0,
  };
}

export function mensagemCotaEsgotada(tipo: TipoCotaIA, motivo: ResultadoCotaIA['motivo']): string {
  if (tipo === 'voz') {
    return motivo === 'dia'
      ? 'Você atingiu o limite diário de lançamentos por voz. Tenta de novo amanhã.'
      : 'Você fez muitos lançamentos por voz seguidos. Espera um minutinho e tenta de novo.';
  }
  return motivo === 'dia'
    ? 'Você atingiu o limite diário de perguntas ao Granabô. Tenta de novo amanhã.'
    : 'Calma aí! Você fez muitas perguntas seguidas. Espera um minutinho e tenta de novo.';
}
