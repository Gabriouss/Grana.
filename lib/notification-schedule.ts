export const ID_HABITO_LEGADO = 'habito-diario';
export const PREFIXO_ID_HABITO = 'habito-diario-';
export const QUANTIDADE_LEMBRETES_HABITO = 7;

export type LembreteHabitoPlanejado = {
  id: string;
  quando: Date;
  diasDesdeHoje: number;
};

function chaveDataLocal(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function ehIdLembreteHabito(id: string): boolean {
  return id === ID_HABITO_LEGADO || id.startsWith(PREFIXO_ID_HABITO);
}

/**
 * Monta uma janela de notificações avulsas, uma por dia. Não usamos o gatilho
 * DAILY porque ele repetiria para sempre o mesmo texto; IDs por data deixam o
 * catálogo escolher uma mensagem diferente em cada ocorrência.
 */
export function planejarLembretesHabito(opts: {
  agora: Date;
  hour: number;
  minute: number;
  jaLancouHoje: boolean;
  quantidade?: number;
}): LembreteHabitoPlanejado[] {
  const quantidade = opts.quantidade ?? QUANTIDADE_LEMBRETES_HABITO;
  if (quantidade <= 0) return [];

  const planejados: LembreteHabitoPlanejado[] = [];
  let diasDesdeHoje = 0;

  while (planejados.length < quantidade) {
    const quando = new Date(
      opts.agora.getFullYear(),
      opts.agora.getMonth(),
      opts.agora.getDate() + diasDesdeHoje,
      opts.hour,
      opts.minute,
      0,
      0
    );

    const hojeJaResolvido = diasDesdeHoje === 0 && opts.jaLancouHoje;
    if (!hojeJaResolvido && quando.getTime() > opts.agora.getTime()) {
      planejados.push({
        id: `${PREFIXO_ID_HABITO}${chaveDataLocal(quando)}`,
        quando,
        diasDesdeHoje,
      });
    }

    diasDesdeHoje += 1;
  }

  return planejados;
}
