export type MomentoLocal = {
  data: string;
  minutosDoDia: number;
  diaSemana: number;
};

const DIAS: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function momentoNaZona(agora: Date, timezone: string): MomentoLocal | null {
  try {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      weekday: 'short',
    }).formatToParts(agora);
    const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
      partes.find((parte) => parte.type === tipo)?.value ?? '';
    const hora = Number(valor('hour'));
    const minuto = Number(valor('minute'));
    const diaSemana = DIAS[valor('weekday')];
    if (!Number.isInteger(hora) || !Number.isInteger(minuto) || diaSemana === undefined) return null;
    return {
      data: `${valor('year')}-${valor('month')}-${valor('day')}`,
      minutosDoDia: hora * 60 + minuto,
      diaSemana,
    };
  } catch {
    return null;
  }
}

export function chegouHorario(momento: MomentoLocal, hora: number, minuto: number): boolean {
  return momento.minutosDoDia >= hora * 60 + minuto;
}

/** Segunda a sexta, no fuso já resolvido de `MomentoLocal.diaSemana`
    (0=domingo...6=sábado). Usado pela janela de almoço, que não faz
    sentido em dia sem expediente. */
export function ehDiaUtil(diaSemana: number): boolean {
  return diaSemana >= 1 && diaSemana <= 5;
}

/** Horário fixo da janela de almoço — não configurável, mesmo espírito
    dos lembretes de conta (fixos às 9h). Reaproveita `chegouHorario`
    com o mesmo padrão "sem teto superior" de sempre: o outbox
    (`unique(token, dia, janela)`) é quem impede reenvio no mesmo dia. */
export function chegouHorarioAlmoco(momento: MomentoLocal): boolean {
  return chegouHorario(momento, 12, 0);
}

function numeroDoDia(data: string): number {
  const [ano, mes, dia] = data.split('-').map(Number);
  return Math.floor(Date.UTC(ano, mes - 1, dia) / 86400000);
}

export function contextoDasDatas(datas: string[], hoje: string): { streak: number; diasInativo: number } {
  const dias = new Set(datas);
  const hojeNumero = numeroDoDia(hoje);
  const numeros = datas.map(numeroDoDia).filter(Number.isFinite);
  const maisRecente = numeros.length ? Math.max(...numeros) : Number.NEGATIVE_INFINITY;
  const diasInativo = Number.isFinite(maisRecente) ? Math.max(0, hojeNumero - maisRecente) : 99;

  let cursor = hojeNumero;
  if (!dias.has(hoje)) cursor -= 1;
  let streak = 0;
  while (dias.has(new Date(cursor * 86400000).toISOString().slice(0, 10))) {
    streak += 1;
    cursor -= 1;
  }
  return { streak, diasInativo };
}

export function atrasoDaTentativa(tentativas: number): number {
  const minutos = Math.min(360, 5 * 2 ** Math.max(0, tentativas - 1));
  return minutos * 60_000;
}

/**
 * A entrega e at-least-once. Esta chave faz FCM/APNs agruparem retentativas
 * da mesma pessoa/data/janela, em vez de exibirem lembretes iguais lado a
 * lado — inclui a janela pra almoço e noite não colapsarem uma na outra
 * quando caem no mesmo dia (sem isso, a segunda a chegar apagaria a
 * primeira da gaveta de notificações antes da pessoa ver).
 */
export function chaveColapsoEntrega(dataLocal: string, janela: string): string {
  return `grana-habito-${dataLocal}-${janela}`;
}
