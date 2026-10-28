export type ControleRetomadaVoz = { signal: AbortSignal; conferir(): void; fim: number; userId?: string };

/** Adaptador do agendador Android. Nenhuma decisão financeira vive no Worker. */
export async function agendarVoz(requestId: string, userId: string, atrasoMs = 30_000): Promise<boolean> {
  try {
    const nativo = await import('@/modules/grana-voice-widget');
    return await nativo.agendarRetomadaVoz(requestId, userId, atrasoMs);
  } catch (erro) {
    console.error('[voz] retomada automática não foi agendada', requestId, erro);
    return false;
  }
}

export async function cancelarVoz(requestId: string, userId: string): Promise<void> {
  try {
    const nativo = await import('@/modules/grana-voice-widget');
    await nativo.cancelarRetomadaVoz(requestId, userId);
  } catch (erro) {
    console.error('[voz] retomada concluída não foi cancelada', requestId, erro);
  }
}
