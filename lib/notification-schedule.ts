import type { JanelaLembrete } from './notification-catalog';

export const ID_HABITO_LEGADO = 'habito-diario';
export const PREFIXO_ID_HABITO = 'habito-diario-';
/** Prefixo da janela de almoço — precisa ser distinto do de `noite` pro
    mesmo dia poder ter as duas notificações agendadas sem colidir por ID. */
export const PREFIXO_ID_HABITO_ALMOCO = 'habito-almoco-';
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

/** 0=domingo, 6=sábado (mesma convenção de `Date.getDay()`). */
function ehFimDeSemana(data: Date): boolean {
  const dia = data.getDay();
  return dia === 0 || dia === 6;
}

export function ehIdLembreteHabito(id: string): boolean {
  return id === ID_HABITO_LEGADO || id.startsWith(PREFIXO_ID_HABITO) || id.startsWith(PREFIXO_ID_HABITO_ALMOCO);
}

/**
 * Monta uma janela de notificações avulsas, uma por dia. Não usamos o gatilho
 * DAILY porque ele repetiria para sempre o mesmo texto; IDs por data deixam o
 * catálogo escolher uma mensagem diferente em cada ocorrência.
 *
 * `janela` decide o prefixo do ID (pra não colidir com a outra janela no
 * mesmo dia) e se sábado/domingo entram na contagem — `almoco` pula os
 * dois, `noite` continua contando todo santo dia como sempre contou.
 */
export function planejarLembretesHabito(opts: {
  agora: Date;
  hour: number;
  minute: number;
  jaLancouHoje: boolean;
  quantidade?: number;
  janela?: JanelaLembrete;
}): LembreteHabitoPlanejado[] {
  const quantidade = opts.quantidade ?? QUANTIDADE_LEMBRETES_HABITO;
  if (quantidade <= 0) return [];
  const janela = opts.janela ?? 'noite';
  const prefixo = janela === 'almoco' ? PREFIXO_ID_HABITO_ALMOCO : PREFIXO_ID_HABITO;

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

    const foraDoDiaUtil = janela === 'almoco' && ehFimDeSemana(quando);
    const hojeJaResolvido = diasDesdeHoje === 0 && opts.jaLancouHoje;
    if (!foraDoDiaUtil && !hojeJaResolvido && quando.getTime() > opts.agora.getTime()) {
      planejados.push({
        id: `${prefixo}${chaveDataLocal(quando)}`,
        quando,
        diasDesdeHoje,
      });
    }

    diasDesdeHoje += 1;
  }

  return planejados;
}
