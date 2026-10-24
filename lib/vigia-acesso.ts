/**
 * Quando o app volta a perguntar ao servidor se a assinatura ainda vale.
 *
 * Existe por um susto do autor em 24/10/2026: tirou a cortesia da própria
 * conta, o bloqueio foi processado, e o app, aberto, mostrou todos os
 * lançamentos zerados. A causa: o RLS nega também a LEITURA de quem perdeu o
 * acesso (`transactions: dono com acesso`, supabase/schema.sql), o banco
 * devolve lista vazia sem erro, e o app só perguntava pelo acesso quando a
 * pessoa logada mudava. Com o app aberto ou voltando do segundo plano, ele
 * seguia achando `allowed: true` e desenhava as telas sem nada. Para quem
 * paga, isso parece exclusão de dados, ou golpe.
 *
 * Quatro momentos fazem perguntar de novo:
 * 1. o app volta ao primeiro plano;
 * 2. chega o instante em que o prazo prometido pelo servidor acaba;
 * 3. o servidor recusa uma gravação por falta de acesso (`42501`);
 * 4. uma tela que tinha dados no disco volta vazia do servidor
 *    (`assinarLeituraEsvaziou`, em `lib/cache-de-tela.ts`). É o caso do
 *    acesso que cai com o app aberto em primeiro plano, sem gravação.
 *
 * Quando a resposta vira `allowed: false`, a guarda de `app/_layout.tsx` leva
 * a pessoa à tela da assinatura, que explica o bloqueio.
 *
 * Sem import nenhum, de propósito: `lib/supabase.ts` avisa a recusa por aqui,
 * e `lib/entitlement-context.tsx` importa `lib/supabase.ts`. Relógio,
 * temporizador e evento de primeiro plano chegam por parâmetro, e é assim que
 * o teste controla o tempo (`__tests__/vigia-acesso.cjs`).
 */

export type EstadoParaVigia = {
  enforced: boolean;
  allowed: boolean;
  status: string | null;
  access_until: string | null;
  grace_until: string | null;
};

/** Intervalo mínimo entre duas perguntas disparadas por evento. Voltar ao app
 *  dez vezes num minuto, ou uma rajada de gravações recusadas, faz UMA consulta. */
export const RECONSULTA_MINIMA_MS = 60_000;
/** Teto do `setTimeout` (2^31 − 1 ms, uns 24 dias). Prazo mais longe que isso
 *  fica para o primeiro plano seguinte, que pergunta de novo. */
export const ATRASO_MAXIMO_MS = 2_147_483_647;
/** Folga depois do prazo, para o servidor já responder que acabou. */
const FOLGA_APOS_PRAZO_MS = 2_000;

/**
 * Quanto falta para o acesso liberado acabar, pela palavra do próprio
 * servidor. `null` quando não há prazo a vigiar: acesso já negado, cobrança
 * desligada, sem data, ou prazo além do que o temporizador alcança.
 *
 * Mesma regra de `tem_assinatura_ativa()`: `access_until`, e `grace_until`
 * só quando o pagamento está pendente (`past_due`).
 */
export function msAteFimDoAcesso(estado: EstadoParaVigia | null, agora: number): number | null {
  if (!estado || !estado.allowed || !estado.enforced) return null;
  const datas = [estado.access_until, estado.status === 'past_due' ? estado.grace_until : null]
    .map((d) => (d ? Date.parse(d) : Number.NaN))
    .filter((n) => Number.isFinite(n));
  if (!datas.length) return null;
  const ms = Math.max(0, Math.max(...datas) - agora) + FOLGA_APOS_PRAZO_MS;
  return ms > ATRASO_MAXIMO_MS ? null : ms;
}

/**
 * A resposta do servidor é recusa por falta de permissão (`42501`) numa
 * chamada de dados? Leitura bloqueada não chega aqui (o RLS devolve vazio),
 * mas gravação e RPC respondem 403 com o código no corpo.
 */
export function respostaNegaAcesso(status: number, url: string, corpo: string): boolean {
  return status === 403 && url.includes('/rest/v1/') && corpo.includes('42501');
}

const ouvintesNegado = new Set<() => void>();

/** Chamado por `lib/supabase.ts` quando o servidor recusa por permissão. */
export function avisarAcessoNegado(): void {
  for (const fn of [...ouvintesNegado]) {
    try {
      fn();
    } catch (erro) {
      console.warn('[acesso] ouvinte de recusa falhou', (erro as { name?: string })?.name ?? 'erro');
    }
  }
}

export function ouvirAcessoNegado(fn: () => void): () => void {
  ouvintesNegado.add(fn);
  return () => {
    ouvintesNegado.delete(fn);
  };
}

export function criarVigiaDoAcesso(deps: {
  recarregar: () => void | Promise<void>;
  /** Registra o aviso de "voltou ao primeiro plano" e devolve como desligar. */
  ouvirPrimeiroPlano: (fn: () => void) => () => void;
  agendar: (fn: () => void, ms: number) => unknown;
  cancelar: (id: unknown) => void;
  agora?: () => number;
}) {
  const agora = deps.agora ?? Date.now;
  // A consulta inicial é do próprio provedor, no mesmo instante em que a vigia nasce.
  let ultima = agora();
  let temporizador: unknown = null;
  let parado = false;

  function consultar() {
    ultima = agora();
    Promise.resolve()
      .then(() => deps.recarregar())
      .catch((erro) => console.warn('[acesso] reconsulta falhou', (erro as { name?: string })?.name ?? 'erro'));
  }
  function porEvento() {
    if (parado || agora() - ultima < RECONSULTA_MINIMA_MS) return;
    consultar();
  }

  const pararPrimeiroPlano = deps.ouvirPrimeiroPlano(porEvento);
  const pararNegado = ouvirAcessoNegado(porEvento);

  return {
    /** Reagenda o temporizador do prazo a cada estado novo confirmado. */
    acompanhar(estado: EstadoParaVigia | null) {
      if (temporizador !== null) deps.cancelar(temporizador);
      temporizador = null;
      if (parado) return;
      const ms = msAteFimDoAcesso(estado, agora());
      if (ms === null) return;
      temporizador = deps.agendar(() => {
        temporizador = null;
        // O prazo é exato: pergunta mesmo que outra consulta tenha acabado de acontecer.
        if (!parado) consultar();
      }, ms);
    },
    parar() {
      parado = true;
      if (temporizador !== null) deps.cancelar(temporizador);
      temporizador = null;
      pararPrimeiroPlano();
      pararNegado();
    },
  };
}
