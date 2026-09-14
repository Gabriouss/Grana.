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

/**
 * O MESMO mês fictício nas quatro perguntas que o Granabô responde na página
 * (bloco 8). Cada número sai de `lib/demo-data.ts`, a conta de demonstração
 * que gerou as capturas, e `__tests__/exemplo-landing.cjs` confere todos
 * contra os módulos reais, com o relógio parado no dia das capturas
 * (5 de setembro de 2026, o dia que dá os 26 dias restantes):
 *
 *   Alimentação    Pão de Açúcar 187,40 + iFood 62,50            R$ 249,90
 *   Contas do mês  IPTU 156,00 (dia 10), Enel 214,90, Vivo 99,90
 *                  e cartão Nubank 1.340,55                      R$ 1.811,35
 *   Fatura Nubank  parcelas de notebook, geladeira e sofá        R$ 1.342,50
 *                  (o cartão fecha dia 18: ciclo de 18/08 a 17/09)
 *
 * O total das contas é o mesmo "Contas a vencer este mês" do Livre para
 * Gastar, e por isso vem de `EXEMPLO_LIVRE` em vez de ser digitado de novo.
 */
export const EXEMPLO_CONVERSA = {
  mes: 'setembro de 2026',
  alimentacao: 249.9,
  contas: { quantidade: 4, total: EXEMPLO_LIVRE.contas },
  contaMaisProxima: { nome: 'IPTU', valor: 156, dia: 10 },
  fatura: {
    cartao: 'Nubank Ultravioleta',
    valor: 1342.5,
    limite: 8500,
    fechamento: 18,
    ciclo: '18 de agosto a 17 de setembro',
  },
} as const;

/** Formata em real, no mesmo formato que o app usa. */
export const emReais = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
