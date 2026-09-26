import type { JanelaLembrete } from './notification-catalog';

export const ID_HABITO_LEGADO = 'habito-diario';
export const PREFIXO_ID_HABITO = 'habito-diario-';
/** Prefixo da janela de almoço — precisa ser distinto do de `noite` pro
    mesmo dia poder ter as duas notificações agendadas sem colidir por ID. */
export const PREFIXO_ID_HABITO_ALMOCO = 'habito-almoco-';
/** Prefixo do lembrete de meio-dia de fim de semana (25/09/2026) — precisa
    ser distinto dos outros dois pro mesmo dia poder ter até duas
    notificações (meio-dia + noite) sem colidir por ID. */
export const PREFIXO_ID_HABITO_MEIO_DIA_FINDE = 'habito-meiodia-finde-';
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
  return (
    id === ID_HABITO_LEGADO ||
    id.startsWith(PREFIXO_ID_HABITO) ||
    id.startsWith(PREFIXO_ID_HABITO_ALMOCO) ||
    id.startsWith(PREFIXO_ID_HABITO_MEIO_DIA_FINDE)
  );
}

/**
 * Monta uma janela de notificações avulsas, uma por dia. Não usamos o gatilho
 * DAILY porque ele repetiria para sempre o mesmo texto; IDs por data deixam o
 * catálogo escolher uma mensagem diferente em cada ocorrência.
 *
 * `janela` decide o prefixo do ID (pra não colidir com as outras janelas no
 * mesmo dia) e quais dias entram na contagem: `almoco` pula sábado e
 * domingo (só dia útil), `meio_dia_finde` faz o OPOSTO — pula dia útil, só
 * sábado e domingo —, e `noite` continua contando todo santo dia como
 * sempre contou.
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
  const prefixo =
    janela === 'almoco' ? PREFIXO_ID_HABITO_ALMOCO
    : janela === 'meio_dia_finde' ? PREFIXO_ID_HABITO_MEIO_DIA_FINDE
    : PREFIXO_ID_HABITO;

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
    const foraDoFimDeSemana = janela === 'meio_dia_finde' && !ehFimDeSemana(quando);
    const hojeJaResolvido = diasDesdeHoje === 0 && opts.jaLancouHoje;
    if (!foraDoDiaUtil && !foraDoFimDeSemana && !hojeJaResolvido && quando.getTime() > opts.agora.getTime()) {
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
