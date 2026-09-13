/**
 * O exemplo fictício ÚNICO da landing page.
 *
 * Existe porque a mesma conta de "Livre para Gastar" aparecia em vários
 * lugares da página com resultados diferentes. Primeiro eram três números
 * digitados à mão (R$ 84,00, R$ 48,00 e R$ 48,23/dia, este último o valor que
 * o achado V01 da auditoria de 06/09/2026 reprovou). Unificados, sobrou um
 * quarto lugar que ninguém tinha contado: as CAPTURAS REAIS do app que a
 * própria página exibe (`public/telas/inicio-web.png` e `inicio-mobile.png`),
 * que mostram outra conta, R$ 59,76/dia.
 *
 * Imagem não se edita junto com o código. Então, desde 13/09/2026, o exemplo
 * único é o DAS CAPTURAS, e tudo que a página desenha em código segue ele:
 *
 *   Saldo atual                     R$ 5.815,00
 *   Contas a vencer este mês      − R$ 1.811,35
 *   Reservado em cofrinhos        − R$ 2.450,00
 *   Livre no total · 26 dias        R$ 1.553,65   → R$ 59,76/dia
 *
 * Regra que este arquivo existe para manter: **nenhum componente da landing
 * escreve valor de Livre para Gastar à mão.** Todos importam daqui. Se as
 * capturas forem refeitas com outra conta, estes quatro números mudam junto,
 * e só eles.
 *
 * Tudo em CENTAVOS inteiros, para a subtração não carregar erro de ponto
 * flutuante (5815 − 1811.35 − 2450 não dá 1553.65 exato em `number`).
 *
 * Os valores são de conta fictícia de demonstração. Nunca usar dado de conta
 * real em material de marketing, nem em modo de demonstração.
 */

/** Os únicos números digitados, em centavos, copiados da captura da Início. */
const PARTIDA_CENTAVOS = {
  saldo: 581500,
  contas: 181135,
  cofrinhos: 245000,
  diasRestantes: 26,
} as const;

const livreCentavos = PARTIDA_CENTAVOS.saldo - PARTIDA_CENTAVOS.contas - PARTIDA_CENTAVOS.cofrinhos;

/* O por dia é ARREDONDADO ao centavo, igual ao que o app mostra. Não dá valor
   exato: 1.553,65 ÷ 26 = 59,7557… A exigência do V01 era outra — que a
   subtração que a pessoa lê na tela feche, e ela fecha ao centavo. Um por dia
   arredondado é o comportamento real do produto, e a captura exibida na
   própria página mostra exatamente R$ 59,76. */
const porDiaCentavos = Math.round(livreCentavos / PARTIDA_CENTAVOS.diasRestantes);

export const EXEMPLO_LIVRE = {
  saldo: PARTIDA_CENTAVOS.saldo / 100,
  contas: PARTIDA_CENTAVOS.contas / 100,
  cofrinhos: PARTIDA_CENTAVOS.cofrinhos / 100,
  diasRestantes: PARTIDA_CENTAVOS.diasRestantes,
  /** R$ 1.553,65 — o que sobra depois de contas e cofrinhos. */
  livreNoTotal: livreCentavos / 100,
  /** R$ 59,76 — o valor por dia que a Início mostra. */
  porDia: porDiaCentavos / 100,
} as const;

/** Formata em real, no mesmo formato que o app usa. */
export const emReais = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
