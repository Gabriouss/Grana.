import type { Bill, Budget, CreditCard, Goal, Transaction, Wallet } from './types';

/**
 * Datas relativas ao mês em que o app está sendo aberto, nunca literais.
 *
 * A versão anterior fixava tudo em agosto/2026. Quando setembro chegou, o
 * modo de exemplo passou a abrir num mês VAZIO: "Livre para gastar" zerado,
 * gráfico sem barra nenhuma, cofrinhos sem movimento — justamente as telas
 * que o modo existe pra mostrar cheias. Com as funções abaixo o conjunto
 * acompanha o calendário sozinho e não envelhece de novo.
 */
const HOJE = new Date();

function dataISO(ano: number, mes: number, dia: number): string {
  // `mes` aqui é 0-indexado (padrão do Date), e o construtor já normaliza
  // dia/mês fora do intervalo — 31 de fevereiro vira 3 de março, e não uma
  // data inválida.
  const d = new Date(ano, mes, dia);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Um dia do mês corrente. */
function esteMes(dia: number): string {
  return dataISO(HOJE.getFullYear(), HOJE.getMonth(), dia);
}

/** Um dia de `n` meses atrás (1 = mês passado). */
function mesesAtras(n: number, dia: number): string {
  return dataISO(HOJE.getFullYear(), HOJE.getMonth() - n, dia);
}

/** Um dia de `n` meses à frente — usado só em contas a vencer. */
function mesesAFrente(n: number, dia: number): string {
  return dataISO(HOJE.getFullYear(), HOJE.getMonth() + n, dia);
}

export const CAT_COLORS = [
  /* paleta harmoniosa "Refreshing Aqua Tones" */
  '#0b4f6c', '#12a8de', '#b0f7d4', '#339989', '#7fdc8a',
  '#b3564f', '#bb6b60', '#a8534c', '#c98a5e', '#c1804e', '#d19a72',
  '#d3b869', '#d8c384', '#c1a24c', '#93aa7e', '#74a17c', '#5f9468',
  '#4f9483', '#5aa79b', '#6ba398', '#6f9a97', '#4f8f8f', '#4f9bab',
  '#6b9dc2', '#5687ab', '#7086c4', '#6070a8', '#7c8aa0', '#8391c9',
  '#a480ad', '#93739e', '#8f6bb0', '#ab8bc2', '#c66f8e', '#d087a0',
  '#cf7d8f', '#a3566a', '#93715f', '#83614f', '#78899a', '#8b9198',
];

/* wallet_id fixo em 'demo-wallet-1' via .map() no fim do array (ver abaixo),
   em vez de repetir o campo em cada objeto — todas as transações demo caem
   na carteira "Principal" por padrão, coerente com o comportamento real de
   um lançamento sem carteira escolhida. */
const DEMO_TRANSACTIONS_RAW: Transaction[] = [
  {
    id: 'demo-9001',
    user_id: 'demo',
    type: 'out',
    description: 'Supermercado Pão de Açúcar',
    amount: 187.4,
    category: 'Alimentação',
    color: '#bb6b60',
    occurred_on: esteMes(15),
    recurring: false,
    parent_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-9002',
    user_id: 'demo',
    type: 'out',
    description: '99 Táxi',
    amount: 24.0,
    category: 'Transporte',
    color: '#6b9dc2',
    occurred_on: esteMes(15),
    recurring: false,
    parent_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-9003',
    user_id: 'demo',
    type: 'in',
    description: 'Empresa · folha salarial',
    amount: 6200.0,
    category: 'Salário',
    color: '#4f9483',
    occurred_on: esteMes(14),
    recurring: false,
    parent_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-9004',
    user_id: 'demo',
    type: 'out',
    description: 'Condomínio Ed. Ipê',
    amount: 620.0,
    category: 'Moradia',
    color: '#93739e',
    occurred_on: esteMes(14),
    recurring: false,
    parent_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-9005',
    user_id: 'demo',
    type: 'out',
    description: 'Cinemark',
    amount: 68.0,
    category: 'Lazer',
    color: '#c66f8e',
    occurred_on: esteMes(14),
    recurring: false,
    parent_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-9006',
    user_id: 'demo',
    type: 'out',
    description: 'Netflix',
    amount: 44.9,
    category: 'Assinaturas',
    color: '#d3b869',
    occurred_on: esteMes(10),
    recurring: true,
    parent_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-9007',
    user_id: 'demo',
    type: 'out',
    description: 'Spotify',
    amount: 21.9,
    category: 'Assinaturas',
    color: '#d3b869',
    occurred_on: esteMes(12),
    recurring: true,
    parent_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-9008',
    user_id: 'demo',
    type: 'out',
    description: 'Farmácia São João',
    amount: 56.3,
    category: 'Saúde',
    color: '#74a17c',
    occurred_on: esteMes(8),
    recurring: false,
    parent_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-9009',
    user_id: 'demo',
    type: 'out',
    description: 'Posto Ipiranga',
    amount: 150.0,
    category: 'Transporte',
    color: '#6b9dc2',
    occurred_on: esteMes(5),
    recurring: false,
    parent_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-9010',
    user_id: 'demo',
    type: 'out',
    description: 'iFood',
    amount: 62.5,
    category: 'Alimentação',
    color: '#bb6b60',
    occurred_on: esteMes(3),
    recurring: false,
    parent_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-9011',
    user_id: 'demo',
    type: 'in',
    description: 'Freelance design',
    amount: 850.0,
    category: 'Outros',
    color: '#8b9198',
    occurred_on: esteMes(2),
    recurring: false,
    parent_id: null,
    created_at: new Date().toISOString(),
  },
];

/**
 * Histórico dos 5 meses anteriores.
 *
 * Existe por um motivo visual específico: com lançamentos só do mês
 * corrente, todo gráfico de evolução vira uma barra sozinha ou uma linha
 * reta, e as telas de Gráficos/Comprometimento não mostram nada do que
 * sabem fazer. Os valores variam de propósito (dezembro com décimo terceiro
 * e gasto alto de fim de ano, um mês de viagem, um mês magro) pra que a
 * curva tenha altos e baixos de verdade em vez de ruído em torno da média.
 */
const MESES_ANTERIORES: { mes: number; entradas: [string, number][]; saidas: [string, number, string, string][] }[] = [
  {
    mes: 1,
    entradas: [['Empresa · folha salarial', 6200]],
    saidas: [
      ['Supermercado', 742.3, 'Alimentação', '#bb6b60'],
      ['Aluguel', 1850, 'Moradia', '#93739e'],
      ['Transporte no mês', 388.4, 'Transporte', '#6b9dc2'],
      ['Assinaturas', 178.6, 'Assinaturas', '#d3b869'],
      ['Lazer', 265, 'Lazer', '#c66f8e'],
    ],
  },
  {
    mes: 2,
    // Mês da viagem: gasto de lazer muito acima do normal.
    entradas: [['Empresa · folha salarial', 6200]],
    saidas: [
      ['Supermercado', 610.9, 'Alimentação', '#bb6b60'],
      ['Aluguel', 1850, 'Moradia', '#93739e'],
      ['Passagens e hospedagem', 2480, 'Lazer', '#c66f8e'],
      ['Transporte no mês', 512.7, 'Transporte', '#6b9dc2'],
      ['Assinaturas', 178.6, 'Assinaturas', '#d3b869'],
    ],
  },
  {
    mes: 3,
    // Mês magro logo depois da viagem: a pessoa segurou os gastos.
    entradas: [['Empresa · folha salarial', 6200]],
    saidas: [
      ['Supermercado', 498.2, 'Alimentação', '#bb6b60'],
      ['Aluguel', 1850, 'Moradia', '#93739e'],
      ['Transporte no mês', 214.5, 'Transporte', '#6b9dc2'],
      ['Assinaturas', 178.6, 'Assinaturas', '#d3b869'],
    ],
  },
  {
    mes: 4,
    entradas: [
      ['Empresa · folha salarial', 6200],
      ['Freelance design', 1450],
    ],
    saidas: [
      ['Supermercado', 688.4, 'Alimentação', '#bb6b60'],
      ['Aluguel', 1850, 'Moradia', '#93739e'],
      ['Manutenção do carro', 940, 'Transporte', '#6b9dc2'],
      ['Assinaturas', 178.6, 'Assinaturas', '#d3b869'],
      ['Saúde', 320, 'Saúde', '#74a17c'],
    ],
  },
  {
    mes: 5,
    // Décimo terceiro entrando e presentes saindo: o pico do período.
    entradas: [
      ['Empresa · folha salarial', 6200],
      ['Décimo terceiro', 3100],
    ],
    saidas: [
      ['Supermercado e ceia', 1120.8, 'Alimentação', '#bb6b60'],
      ['Aluguel', 1850, 'Moradia', '#93739e'],
      ['Presentes', 1340, 'Lazer', '#c66f8e'],
      ['Transporte no mês', 402.1, 'Transporte', '#6b9dc2'],
      ['Assinaturas', 178.6, 'Assinaturas', '#d3b869'],
    ],
  },
];

const DEMO_HISTORICO: Transaction[] = MESES_ANTERIORES.flatMap((bloco, blocoIndice) => {
  const base = (indice: number) => ({
    user_id: 'demo',
    recurring: false,
    parent_id: null,
    created_at: new Date().toISOString(),
    occurred_on: mesesAtras(bloco.mes, 5 + indice * 3),
  });
  const entradas: Transaction[] = bloco.entradas.map((entrada, i) => ({
    ...base(i),
    id: `demo-hist-${blocoIndice}-in-${i}`,
    type: 'in',
    description: entrada[0],
    amount: entrada[1],
    category: 'Salário',
    color: '#4f9483',
  }));
  const saidas: Transaction[] = bloco.saidas.map((saida, i) => ({
    ...base(i + entradas.length),
    id: `demo-hist-${blocoIndice}-out-${i}`,
    type: 'out',
    description: saida[0],
    amount: saida[1],
    category: saida[2],
    color: saida[3],
  }));
  return [...entradas, ...saidas];
});

/**
 * Compras parceladas no cartão, com parcelas futuras em janelas diferentes.
 *
 * Sem isto, o gráfico de "Comprometimento futuro" (`FutureTimelineChart`)
 * mostrava 6 barras idênticas — contas recorrentes valem o mesmo valor todo
 * mês (é a regra real de `projetarComprometimentoFuturo`), e sem nenhuma
 * parcela cadastrada não sobrava nada pra variar. Cada compra aqui começa e
 * termina num ponto diferente da janela de 6 meses, então a soma por mês
 * sobe até um pico (mais parcelas sobrepostas) e desce depois (compras
 * quitando) — um comportamento real, não um número sorteado pra "parecer
 * bonito".
 */
function parcelasFuturas(
  idBase: string,
  descricao: string,
  categoria: string,
  cor: string,
  valorParcela: number,
  totalParcelas: number,
  parcelaAtual: number,
  /** Meses a partir de agora em que a PRIMEIRA parcela desta lista cai — 0
      pra compra que já vinha rendendo, >0 pra compra que só começa mais
      adiante (é o que cria um pico no meio da janela, não só no início). */
  atrasoMeses = 0
): Transaction[] {
  const restantes = totalParcelas - parcelaAtual + 1;
  return Array.from({ length: restantes }, (_, i) => ({
    id: `${idBase}-${parcelaAtual + i}`,
    user_id: 'demo',
    type: 'out' as const,
    description: descricao,
    amount: valorParcela,
    category: categoria,
    color: cor,
    occurred_on: mesesAFrente(atrasoMeses + i, 15),
    recurring: false,
    parent_id: null,
    payment_method: 'credit' as const,
    card_id: 'demo-card-1',
    installment_current: parcelaAtual + i,
    installment_total: totalParcelas,
    created_at: new Date().toISOString(),
  }));
}

const DEMO_PARCELAS: Transaction[] = [
  ...parcelasFuturas('demo-parc-notebook', 'Notebook Dell', 'Outros', '#8b9198', 550, 3, 1),
  ...parcelasFuturas('demo-parc-geladeira', 'Geladeira Brastemp', 'Moradia', '#93739e', 412.5, 4, 3),
  ...parcelasFuturas('demo-parc-sofa', 'Sofá retrátil', 'Moradia', '#93739e', 380, 5, 1),
  // Começa daqui a 2 meses, não agora — é o que cria o pico no meio da
  // janela em vez de mais uma compra que começa hoje.
  ...parcelasFuturas('demo-parc-celular', 'iPhone seminovo', 'Outros', '#8b9198', 700, 2, 1, 2),
];

export const DEMO_TRANSACTIONS: Transaction[] = [...DEMO_TRANSACTIONS_RAW, ...DEMO_HISTORICO, ...DEMO_PARCELAS].map(
  (t) => ({
    ...t,
    wallet_id: 'demo-wallet-1',
  })
);

const DEMO_BILLS_RAW: Bill[] = [
  {
    id: 'demo-9101',
    user_id: 'demo',
    description: 'Cartão · Nubank',
    category: 'Outros',
    color: '#8b9198',
    amount: 1340.55,
    due_date: esteMes(22),
    status: 'due',
    recurring: false,
    paid_transaction_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-9102',
    user_id: 'demo',
    description: 'Energia · Enel',
    category: 'Moradia',
    color: '#93739e',
    amount: 214.9,
    due_date: esteMes(18),
    status: 'due',
    recurring: true,
    paid_transaction_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-9103',
    user_id: 'demo',
    description: 'Internet · Vivo Fibra',
    category: 'Moradia',
    color: '#93739e',
    amount: 99.9,
    due_date: esteMes(20),
    status: 'due',
    recurring: true,
    paid_transaction_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-9104',
    user_id: 'demo',
    description: 'IPTU · parcela 8/10',
    category: 'Moradia',
    color: '#93739e',
    amount: 156.0,
    due_date: esteMes(10),
    status: 'due',
    recurring: false,
    paid_transaction_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-9105',
    user_id: 'demo',
    description: 'Academia · Smart Fit',
    category: 'Saúde',
    color: '#74a17c',
    amount: 109.9,
    due_date: esteMes(5),
    status: 'paid',
    recurring: true,
    paid_transaction_id: null,
    created_at: new Date().toISOString(),
  },
];
export const DEMO_BILLS: Bill[] = DEMO_BILLS_RAW.map((b) => ({ ...b, wallet_id: 'demo-wallet-1' }));

export const DEMO_BUDGETS: Budget[] = [
  { user_id: 'demo', category: 'Alimentação', amount: 700, color: '#bb6b60', updated_at: new Date().toISOString() },
  { user_id: 'demo', category: 'Moradia', amount: 1200, color: '#93739e', updated_at: new Date().toISOString() },
  { user_id: 'demo', category: 'Transporte', amount: 350, color: '#6b9dc2', updated_at: new Date().toISOString() },
  { user_id: 'demo', category: 'Lazer', amount: 250, color: '#c66f8e', updated_at: new Date().toISOString() },
];

const DEMO_GOALS_RAW: Goal[] = [
  {
    id: 'demo-goal-1',
    user_id: 'demo',
    title: 'Reserva de emergência',
    target_amount: 10000,
    current_amount: 1800,
    color: '#1fa98d',
    icon: 'shield-checkmark',
    deadline: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-goal-2',
    user_id: 'demo',
    title: 'Viagem para a praia',
    target_amount: 3000,
    current_amount: 650,
    color: '#12a8de',
    icon: 'airplane',
    deadline: mesesAFrente(4, 20),
    created_at: new Date().toISOString(),
  },
];
export const DEMO_GOALS: Goal[] = DEMO_GOALS_RAW.map((g) => ({ ...g, wallet_id: 'demo-wallet-1' }));

export const DEMO_WALLETS: Wallet[] = [
  {
    id: 'demo-wallet-1',
    user_id: 'demo',
    name: 'Principal',
    initial_balance: 1500,
    color: '#1fa98d',
    icon: 'wallet-outline',
    is_default: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-wallet-2',
    user_id: 'demo',
    name: 'Casamento',
    initial_balance: 5000,
    color: '#c66f8e',
    icon: 'heart-outline',
    is_default: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-wallet-3',
    user_id: 'demo',
    name: 'Reserva & Mãe',
    initial_balance: 2200,
    color: '#6b9dc2',
    icon: 'shield-checkmark-outline',
    is_default: false,
    created_at: new Date().toISOString(),
  },
];

export const DEMO_CREDIT_CARDS: CreditCard[] = [
  {
    id: 'demo-card-1',
    user_id: 'demo',
    name: 'Nubank Ultravioleta',
    bank: 'nubank',
    color: '#820ad1',
    last_digits: '4092',
    limit_amount: 8500,
    closing_day: 18,
    due_day: 25,
    wallet_id: 'demo-wallet-1',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-card-2',
    user_id: 'demo',
    name: 'Itaú Personalité Black',
    bank: 'itau',
    color: '#ec7000',
    last_digits: '8831',
    limit_amount: 15000,
    closing_day: 5,
    due_day: 12,
    wallet_id: 'demo-wallet-1',
    created_at: new Date().toISOString(),
  },
];

/** XP vitalício de exemplo — nível 5 (elo Construtor), o suficiente para mostrar o pill de nível sem já estar num elo avançado. */
export const DEMO_LIFETIME_XP = 850;
