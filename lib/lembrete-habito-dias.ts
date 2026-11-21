/* Dias de atividade para o lembrete diário de hábito (item 1, 21/11/2026).

   O autor viu no celular "[inicio] lembrete de hábito falhou Error: A consulta
   de dias foi invalidada". A consulta de dias (`fetchDiasDeAtividade`, em
   `lib/data.ts`) descarta a resposta em voo quando a conta muda ou quando
   algum dado muda no meio: qualquer gravação avisa os widgets
   (`notificarDadosDosWidgetsAlterados`) e a fila offline sobe a versão dos
   lançamentos ao sincronizar, o que é comum logo na abertura. Esse descarte é
   desenho do C-01 (ad97de5c), não falha, mas a Início o registrava como erro
   e deixava de reagendar o lembrete.

   Aqui o descarte vira desfecho decidido (regra 9):
   - `registros`: temporário. Repete a consulta, que já lê o estado novo, até
     `TENTATIVAS_DIAS_DO_LEMBRETE` vezes; esgotado, avisa no log e desiste
     desta vez (a próxima carga completa da Início reagenda).
   - `conta`: a carga da conta nova é quem reagenda; avisa no log e desiste.
   - qualquer outro erro sobe para quem chamou, que continua registrando como
     falha real.
   Não importa `lib/data.ts` (Supabase): reconhece o erro pelo nome e motivo. */

export const TENTATIVAS_DIAS_DO_LEMBRETE = 3;

type Motivo = 'conta' | 'registros';

function motivoDaInvalidacao(erro: unknown): Motivo | null {
  if (!erro || typeof erro !== 'object') return null;
  const { name, motivo } = erro as { name?: unknown; motivo?: unknown };
  if (name !== 'ConsultaDeDiasInvalidada') return null;
  return motivo === 'conta' || motivo === 'registros' ? motivo : null;
}

/** Devolve os dias, ou `null` quando a consulta foi descartada e não vale
    insistir agora. Lança os erros que não são descarte. */
export async function diasParaOLembrete(
  buscar: () => Promise<Set<string>>,
  aindaVale: () => boolean = () => true,
  avisar: (mensagem: string) => void = (mensagem) => console.warn(mensagem),
): Promise<Set<string> | null> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await buscar();
    } catch (erro) {
      const motivo = motivoDaInvalidacao(erro);
      if (!motivo) throw erro;
      if (motivo === 'conta' || !aindaVale()) {
        avisar('[lembrete] consulta de dias descartada: a conta ou a carga mudou; a carga nova reagenda');
        return null;
      }
      if (tentativa >= TENTATIVAS_DIAS_DO_LEMBRETE) {
        avisar(`[lembrete] consulta de dias descartada ${tentativa} vezes seguidas; reagenda na próxima carga`);
        return null;
      }
    }
  }
}
