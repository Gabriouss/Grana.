import type { EstadoAcesso } from './entitlement-context';

export type TipoBloqueioAssinatura = 'vencida' | 'pagamento-pendente' | 'encerrada' | null;
export type TipoLembreteAssinatura = 'antes-7' | 'antes-3' | 'antes-1' | 'venceu';
export type AvisoAssinatura = {
  renovaSozinha: boolean;
  dataLimite: Date | null;
  diasRestantes: number | null;
  tipoBloqueio: TipoBloqueioAssinatura;
  mostrarFaixa: boolean;
  lembretes: { tipo: TipoLembreteAssinatura; quando: Date }[];
};

function dataValida(texto: string | null | undefined): Date | null {
  if (!texto) return null;
  const instante = Date.parse(texto);
  return Number.isFinite(instante) ? new Date(instante) : null;
}

/** Dias do calendário local, sem transformar uma virada de fuso/DST em dois dias. */
const diaLocal = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

/** Só decisão de apresentação/agenda. Nunca concede acesso nem altera o estado recebido. */
export function calcularAvisoAssinatura(estado: EstadoAcesso | null, agora: number = Date.now()): AvisoAssinatura {
  const dataLimite = dataValida(estado?.status === 'past_due' ? estado.grace_until : estado?.access_until);
  const diasRestantes = dataLimite ? Math.round((diaLocal(dataLimite) - diaLocal(new Date(agora))) / 86400000) : null;
  const renovaSozinha = estado?.status === 'active';
  const historico = !!estado?.status || (!!dataLimite && dataLimite.getTime() <= agora);
  let tipoBloqueio: TipoBloqueioAssinatura = null;
  if (estado?.enforced && !estado.allowed && historico) {
    tipoBloqueio = ['refunded', 'chargeback'].includes(estado.status ?? '') ? 'encerrada'
      : estado.status === 'past_due' ? 'pagamento-pendente' : 'vencida';
  }
  const avisaPrazo = !!estado?.enforced && ['canceled', 'past_due'].includes(estado.status ?? '');
  const lembretes: AvisoAssinatura['lembretes'] = [];
  if (avisaPrazo && dataLimite) {
    for (const dias of [7, 3, 1] as const) {
      const quando = new Date(dataLimite);
      quando.setDate(quando.getDate() - dias);
      quando.setHours(10, 0, 0, 0);
      lembretes.push({ tipo: `antes-${dias}`, quando });
    }
    lembretes.push({ tipo: 'venceu', quando: new Date(dataLimite) });
  }
  return { renovaSozinha, dataLimite, diasRestantes, tipoBloqueio,
    mostrarFaixa: avisaPrazo && !!estado?.allowed && !!dataLimite && dataLimite.getTime() > agora
      && diasRestantes !== null && diasRestantes >= 0 && diasRestantes <= 7,
    lembretes };
}

export function formatarDataAssinatura(data: Date | null): string | null {
  return data ? `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}` : null;
}

export function textoBloqueioAssinatura(aviso: AvisoAssinatura): { titulo: string; corpo: string } | null {
  if (!aviso.tipoBloqueio) return null;
  const data = formatarDataAssinatura(aviso.dataLimite);
  const guardados = 'Seus lançamentos, contas e metas continuam guardados.';
  if (aviso.tipoBloqueio === 'pagamento-pendente') {
    return { titulo: 'O pagamento não foi confirmado',
      corpo: `${data ? `Seu prazo de acesso foi até ${data}. ` : ''}${guardados} Atualize a cobrança para voltar a ver e registrar.` };
  }
  return { titulo: aviso.tipoBloqueio === 'encerrada' ? 'Sua assinatura foi encerrada' : `Sua assinatura venceu${data ? ` em ${data}` : ''}`,
    corpo: `${guardados} O vencimento não apaga seus dados. Renove para voltar a ver e registrar.` };
}
