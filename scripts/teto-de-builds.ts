/**
 * Teto de builds por semana.
 *
 * Decisão do autor em 01/10/2026: "Tendo conhecimento de que temos apenas 15
 * builds por mês, gostaria de definir um teto de disparo de builds por
 * semana", e depois: "3 por semana, segunda a domingo".
 *
 * ── Por que 3 ──────────────────────────────────────────────────────────────
 *
 * A cota do EAS é de 15 builds por mês, compartilhada entre as duas máquinas.
 * Três por semana gastam 12 a 13 no mês e deixam 2 ou 3 de reserva. Com
 * quatro a cota acaba na última semana, que é justamente quando um defeito
 * grave em produção não teria build para sair. Já aconteceu: em 22/09/2026 a
 * 1.10.4 foi preparada e o EAS recusou por cota esgotada, com o reset só em
 * 01/10. Medido no histórico: a semana de 07/09 teve nove preparos e a de
 * 31/08 teve oito, ou seja, a cota de um mês inteiro foi gasta em duas.
 *
 * ── O que conta como build ─────────────────────────────────────────────────
 *
 * Um commit que muda a linha `"version": "x.y.z"` do `app.json`. Todo build de
 * release passa por `npm run build:preparar`, que sobe essa versão (regra 5 do
 * AGENTS.md), então o histórico do git já é o livro-caixa — e é o mesmo nas
 * duas máquinas, sem depender de arquivo local nem de consulta ao EAS.
 *
 * A contagem peca por excesso, de propósito: uma versão preparada cujo build
 * o EAS recusou também conta. Errar para menos gastaria a cota; errar para
 * mais só pede ao autor que libere com `--emergencia`.
 *
 * ── A semana ───────────────────────────────────────────────────────────────
 *
 * Segunda 00:00 a domingo 23:59, na hora LOCAL da máquina (Brasília nas duas).
 * Hora local, e nunca UTC: depois das 21h em Brasília o UTC já virou o dia, e
 * um preparo de domingo à noite cairia na semana seguinte.
 */

export const TETO_DE_BUILDS_POR_SEMANA = 3;

/** Segunda-feira 00:00, hora local, da semana que contém `agora`. */
export function inicioDaSemana(agora: Date): Date {
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  /* getDay(): domingo = 0. Domingo pertence à semana que COMEÇOU na segunda
     anterior, então recua 6 dias, e não zero. */
  const diasDesdeSegunda = (inicio.getDay() + 6) % 7;
  inicio.setDate(inicio.getDate() - diasDesdeSegunda);
  return inicio;
}

/** Segunda-feira 00:00 seguinte: quando o teto zera. */
export function fimDaSemana(agora: Date): Date {
  const fim = inicioDaSemana(agora);
  fim.setDate(fim.getDate() + 7);
  return fim;
}

export type SituacaoDoTeto = {
  /** Preparos de build já feitos na semana de `agora`. */
  feitos: number;
  teto: number;
  /** Dá para preparar mais um sem estourar. */
  podePreparar: boolean;
  /** Datas (ISO, como vieram) dos preparos desta semana, do mais antigo ao mais novo. */
  daSemana: string[];
  zeraEm: Date;
};

/**
 * `datasDosPreparos` são as datas dos commits que subiram a versão, em ISO
 * com fuso (`git log --format=%cI`). Data ilegível é ignorada, não contada:
 * um histórico estranho não pode travar a build por engano.
 */
export function situacaoDoTeto(datasDosPreparos: string[], agora: Date): SituacaoDoTeto {
  const inicio = inicioDaSemana(agora).getTime();
  const fim = fimDaSemana(agora).getTime();
  const daSemana = datasDosPreparos
    .filter((iso) => {
      const t = new Date(iso).getTime();
      return Number.isFinite(t) && t >= inicio && t < fim;
    })
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return {
    feitos: daSemana.length,
    teto: TETO_DE_BUILDS_POR_SEMANA,
    podePreparar: daSemana.length < TETO_DE_BUILDS_POR_SEMANA,
    daSemana,
    zeraEm: fimDaSemana(agora),
  };
}
