/**
 * O exemplo fictício ÚNICO da landing page.
 *
 * Existe porque a mesma conta de "Livre para Gastar" aparecia em três lugares
 * da página com três resultados diferentes: o card da dobra `#livre` dizia
 * R$ 84,00/dia, a conversa de exemplo do Granabô dizia R$ 48,00/dia, e o
 * mini-mock de widgets dizia R$ 48,23/dia — este último sem fechar conta
 * nenhuma (48,23 × 13 = 627,  não 624).
 *
 * O R$ 48,23 é exatamente o número que o achado V01 da auditoria visual de
 * 06/09/2026 reprovou por não corresponder a dias inteiros. A correção da
 * época derivou os valores numa estrutura só DENTRO do card, e por isso os
 * outros dois lugares continuaram com cópias à mão — um deles com o valor
 * já condenado. Um módulo compartilhado é o que impede a terceira repetição.
 *
 * Regra que este arquivo existe para manter: **nenhum componente da landing
 * escreve valor de Livre para Gastar à mão.** Todos importam daqui, e tudo
 * abaixo da linha de `PARTIDA` é derivado, nunca digitado.
 *
 * Os valores são inventados de propósito. Nunca usar dado de conta real em
 * material de marketing, nem em modo de demonstração.
 */

/** Os únicos números digitados. Todo o resto sai de conta a partir daqui. */
const PARTIDA = {
  saldo: 3240,
  contas: 1180,
  cofrinhos: 800,
  diasRestantes: 15,
} as const;

const livreNoTotal = PARTIDA.saldo - PARTIDA.contas - PARTIDA.cofrinhos;

/* A divisão precisa dar valor exato em centavos, senão a página volta a
   anunciar um "por dia" que não multiplica de volta para o total — que foi
   literalmente o defeito do V01. 1260 ÷ 15 = 84, exato. Se alguém mexer nos
   números de PARTIDA e quebrar isso, a checagem abaixo avisa em teste e em
   desenvolvimento, em vez de o erro aparecer só na tela. */
const porDia = livreNoTotal / PARTIDA.diasRestantes;

if (Math.round(porDia * 100) !== porDia * 100) {
  const aviso =
    `exemplo-landing: ${livreNoTotal} ÷ ${PARTIDA.diasRestantes} = ${porDia}, ` +
    'que não é um valor exato em centavos. Ajuste PARTIDA para a divisão fechar.';
  if (process.env.NODE_ENV === 'test') throw new Error(aviso);
  console.warn(aviso);
}

export const EXEMPLO_LIVRE = {
  ...PARTIDA,
  /** R$ 1.260 — o que sobra depois de contas e cofrinhos. */
  livreNoTotal,
  /** R$ 84,00 — o número que a marca promete, e o que a página anuncia. */
  porDia,
} as const;

/** Formata em real, no mesmo formato que o app usa. */
export const emReais = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
