/** Exemplo ficticio de setembro/2026. Atualizado para a regra autorizada em
 * 17/10/2026: os cofrinhos existentes sao anteriores ao mes (reserva zero),
 * e a fatura aberta de 1342,50 reserva dinheiro antes do pagamento.
 * Os numeros textuais acompanham a regra; capturas estaticas antigas precisam
 * ser refeitas pelo fluxo de capturas, sem retocar os valores em imagem.
 */
const PARTIDA_CENTAVOS = {
  saldo: 581500,
  cofrinhos: 0,
  creditoNaoPago: 134250,
  diasRestantes: 26,
} as const;

/** Contas pendentes do mês fictício: só a conversa do Granabô cita. */
const CONTAS_DO_MES_CENTAVOS = 181135;

const livreCentavos = PARTIDA_CENTAVOS.saldo - PARTIDA_CENTAVOS.cofrinhos - PARTIDA_CENTAVOS.creditoNaoPago;

/* O por dia é ARREDONDADO ao centavo, igual ao que o app mostra
   (4.472,50 ÷ 26 = 172,0230…). A exigência do V01 era que a subtração que a
   pessoa lê na tela feche, e ela fecha ao centavo. */
const porDiaCentavos = Math.round(livreCentavos / PARTIDA_CENTAVOS.diasRestantes);

export const EXEMPLO_LIVRE = {
  saldo: PARTIDA_CENTAVOS.saldo / 100,
  cofrinhos: PARTIDA_CENTAVOS.cofrinhos / 100,
  creditoNaoPago: PARTIDA_CENTAVOS.creditoNaoPago / 100,
  diasRestantes: PARTIDA_CENTAVOS.diasRestantes,
  /** R$ 4.472,50: o que sobra depois da reserva do credito. */
  livreNoTotal: livreCentavos / 100,
  /** R$ 172,02: o valor por dia que a Início mostra. */
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
 * As contas do mês não entram no Livre para Gastar desde 25/09/2026 (regra
 * 20); o Granabô continua respondendo quanto vence no mês.
 */
export const EXEMPLO_CONVERSA = {
  mes: 'setembro de 2026',
  alimentacao: 249.9,
  contas: { quantidade: 4, total: CONTAS_DO_MES_CENTAVOS / 100 },
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
