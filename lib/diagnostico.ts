import { CATEGORIES } from './types';
import { supabase } from './supabase';

/**
 * Diagnóstico financeiro inicial: das respostas do questionário ao arquétipo,
 * ao orçamento sugerido e ao plano de ação.
 *
 * Vive em arquivo próprio, e não em heuristics.ts, porque a natureza é outra:
 * heuristics.ts adivinha categoria e valor a partir de texto solto — chute
 * sobre dado sujo. Aqui não há adivinhação: as respostas são fechadas e o
 * resultado é uma classificação determinística. Misturar as duas coisas faria
 * parecer que o arquétipo também é um palpite.
 */

/* ── Etapa 1: consciência e organização ─────────────────────────────────── */

export type NivelOrganizacao =
  | 'feeling'
  | 'tentativas'
  | 'buscando-metodo'
  | 'estruturado'
  | 'renda-variavel';

/* ── Etapa 2: dor do momento ────────────────────────────────────────────── */

export type Foco = 'fatura' | 'sobrar' | 'reserva' | 'agilidade';

/* ── Etapa 3: relação com crédito ───────────────────────────────────────── */

export type UsoCartao = 'no-limite' | 'parcelado' | 'controlado' | 'quase-nao-uso';

/* ── Etapa 4: ambição de poupança ───────────────────────────────────────── */

export type Ambicao = 'gradual' | 'equilibrio' | 'acelerada' | 'equilibrar-primeiro';

export type Respostas = {
  organizacao: NivelOrganizacao;
  foco: Foco;
  cartao: UsoCartao;
  rendaMensal: number;
  ambicao: Ambicao;
};

/* ── Arquétipos ─────────────────────────────────────────────────────────── */

export type ArquetipoId = 'resgate' | 'construtor' | 'otimizador' | 'estrategista';

export type Arquetipo = {
  id: ArquetipoId;
  emoji: string;
  nome: string;
  /** Uma frase que a pessoa deve reconhecer como sendo sobre ela. */
  retrato: string;
  /** O que o app vai priorizar para esse perfil. */
  missao: string;
  /** Passos concretos, na ordem em que fazem diferença. */
  plano: string[];
};

export const ARQUETIPOS: Record<ArquetipoId, Arquetipo> = {
  resgate: {
    id: 'resgate',
    emoji: '🛡️',
    nome: 'Organizador & Resgate',
    retrato:
      'Hoje o cartão manda mais no seu mês do que você. Não é falta de disciplina — é que parcela antiga cobra do salário de amanhã, e isso não aparece em lugar nenhum até a fatura chegar.',
    missao: 'Tirar o compromisso futuro da sombra e cortar o que drena sem você perceber.',
    plano: [
      'Cadastre todas as parcelas em aberto como contas a pagar, com a data de cada uma. Ver o total comprometido dos próximos meses é o passo que muda o comportamento.',
      'Importe o extrato do último mês por CSV. O diagnóstico só fica honesto quando você olha o que gastou de verdade, não o que acha que gastou.',
      'Ative o modo privacidade se for usar o app em público — os valores ficam borrados.',
      'Antes de qualquer corte, quite a menor dívida até o fim. A sensação de ter fechado uma sustenta as próximas.',
    ],
  },
  construtor: {
    id: 'construtor',
    emoji: '🧱',
    nome: 'Construtor de Reserva',
    retrato:
      'Suas contas fecham, mas o que sobra some sem deixar rastro. O que falta não é renda — é dar um destino ao excedente antes que o mês o encontre.',
    missao: 'Transformar sobra eventual em reserva previsível.',
    plano: [
      'Trate a reserva como uma conta a pagar com vencimento no dia do salário, não como o que sobrar no fim.',
      'Defina o alvo em meses de custo fixo, não em um número redondo. Três meses de despesa é uma meta que se sabe quando foi atingida.',
      'Confira o gráfico de fluxo toda semana. É onde um mês ruim aparece cedo, enquanto ainda dá para corrigir.',
      'Revise as assinaturas: é a categoria que mais cresce sem ninguém decidir que ela cresça.',
    ],
  },
  otimizador: {
    id: 'otimizador',
    emoji: '🚀',
    nome: 'Otimizador & Investidor',
    retrato:
      'Você já tem o controle resolvido. O ganho agora não vem de cortar cafés — vem de enxergar padrões que só aparecem quando se olha o ano inteiro.',
    missao: 'Aumentar a taxa de sobra sem apertar a vida.',
    plano: [
      'Compare os mesmos meses ano a ano. Sazonalidade — IPVA, material escolar, festas — é o que quebra orçamento de quem já é organizado.',
      'Registre também os aportes, como saída da categoria correspondente. Sem isso a taxa de poupança é chute.',
      'Use os orçamentos como alarme, não como amarra: o valor existe para avisar o desvio, não para você obedecer.',
      'Uma vez por trimestre, revise os limites por categoria. Orçamento que nunca muda vira ficção.',
    ],
  },
  estrategista: {
    id: 'estrategista',
    emoji: '🌊',
    nome: 'Estrategista de Renda Variável',
    retrato:
      'Seu mês bom paga o mês ruim — o problema é que os dois chegam fora de ordem. Orçamento baseado em média mensal não funciona para você, porque a média não paga aluguel em julho.',
    missao: 'Criar um piso previsível sobre uma renda que não é.',
    plano: [
      'Calcule seu piso: a média dos três piores meses do último ano. É sobre esse número que o orçamento deve ser montado, não sobre o mês bom.',
      'Todo valor acima do piso vai para a reserva no mesmo dia em que entra. É ela que vai pagar o salário dos meses fracos.',
      'Mire numa reserva de seis meses, e não de três. Renda que oscila exige colchão maior.',
      'Lance o faturamento assim que receber, não quando for gastar. Com renda irregular, a memória atrapalha mais que ajuda.',
    ],
  },
};

/**
 * Classifica o perfil a partir das respostas.
 *
 * A ordem das regras é a hierarquia do diagnóstico, e é deliberada:
 *
 *  1. Renda variável vence tudo. Não é um estágio de maturidade, é uma
 *     condição estrutural — um autônomo organizado e um endividado autônomo
 *     precisam ambos de piso e teto antes de qualquer outra coisa.
 *  2. Sinal de crédito em risco vem em seguida. Não adianta falar em reserva
 *     para quem paga juros rotativo: a dívida rende mais contra a pessoa do
 *     que qualquer aplicação rende a favor.
 *  3. Depois, quem ainda não tem controle constrói o hábito antes de otimizar.
 *  4. O otimizador é o resto: controle resolvido e nenhum sinal de alerta.
 */
export function calcularArquetipo(r: Respostas): Arquetipo {
  if (r.organizacao === 'renda-variavel') return ARQUETIPOS.estrategista;

  const creditoEmRisco = r.cartao === 'no-limite' || r.cartao === 'parcelado';
  if (creditoEmRisco || r.foco === 'fatura' || r.ambicao === 'equilibrar-primeiro') {
    return ARQUETIPOS.resgate;
  }

  if (r.organizacao === 'estruturado' && (r.ambicao === 'acelerada' || r.foco === 'agilidade')) {
    return ARQUETIPOS.otimizador;
  }

  if (r.foco === 'reserva' || r.foco === 'sobrar') return ARQUETIPOS.construtor;

  return ARQUETIPOS.otimizador;
}

/** Fatia da renda que a pessoa quer poupar, como faixa e como valor de cálculo. */
export function metaPoupanca(ambicao: Ambicao): { rotulo: string; fracao: number } {
  switch (ambicao) {
    case 'gradual':
      return { rotulo: '5% a 10%', fracao: 0.08 };
    case 'equilibrio':
      return { rotulo: '15% a 25%', fracao: 0.2 };
    case 'acelerada':
      return { rotulo: '30% ou mais', fracao: 0.3 };
    case 'equilibrar-primeiro':
      return { rotulo: 'equilibrar as contas primeiro', fracao: 0 };
  }
}

/* Distribuição das despesas por arquétipo, como fração do que sobra depois de
   reservada a poupança. Somam 1 — a normalização final garante isso mesmo se
   alguém editar os números aqui. */
const PESOS: Record<ArquetipoId, Record<string, number>> = {
  resgate: {
    Moradia: 0.34, Alimentação: 0.22, Transporte: 0.11,
    Saúde: 0.08, Outros: 0.14, Lazer: 0.07, Assinaturas: 0.04,
  },
  construtor: {
    Moradia: 0.32, Alimentação: 0.21, Transporte: 0.11,
    Saúde: 0.08, Outros: 0.11, Lazer: 0.12, Assinaturas: 0.05,
  },
  otimizador: {
    Moradia: 0.31, Alimentação: 0.20, Transporte: 0.11,
    Saúde: 0.08, Outros: 0.10, Lazer: 0.14, Assinaturas: 0.06,
  },
  estrategista: {
    Moradia: 0.33, Alimentação: 0.22, Transporte: 0.11,
    Saúde: 0.09, Outros: 0.13, Lazer: 0.08, Assinaturas: 0.04,
  },
};

export type LinhaOrcamento = { category: string; amount: number; color: string };

export type OrcamentoSugerido = {
  linhas: LinhaOrcamento[];
  /** Quanto a pessoa reserva por mês, dado o alvo escolhido. */
  poupancaMensal: number;
  /** Soma das linhas de despesa. */
  despesaTotal: number;
};

/**
 * Monta o orçamento por categoria.
 *
 * A poupança sai PRIMEIRO da renda, e as despesas se distribuem no que resta.
 * É o oposto do que a maioria faz — poupar o que sobra — e é a diferença
 * entre uma meta que acontece e uma que só existe no papel.
 */
export function calcularOrcamento(r: Respostas, arquetipo: Arquetipo): OrcamentoSugerido {
  const { fracao } = metaPoupanca(r.ambicao);
  const renda = Math.max(0, r.rendaMensal);
  const poupancaMensal = Math.round(renda * fracao * 100) / 100;
  const disponivel = renda - poupancaMensal;

  const pesos = PESOS[arquetipo.id];
  const somaPesos = Object.values(pesos).reduce((a, b) => a + b, 0);

  const cor = (nome: string) =>
    CATEGORIES.find((c) => c.name === nome)?.color ?? '#8b9198';

  const linhas = Object.entries(pesos)
    .map(([category, peso]) => ({
      category,
      // Normaliza pela soma real dos pesos: assim editar um número acima não
      // desequilibra o total em silêncio.
      amount: Math.round(((disponivel * peso) / somaPesos) * 100) / 100,
      color: cor(category),
    }))
    .filter((l) => l.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const despesaTotal = linhas.reduce((soma, l) => soma + l.amount, 0);

  return { linhas, poupancaMensal, despesaTotal };
}

/** Frase de abertura do laudo, usando o nome quando existe. */
export function saudacaoLaudo(nome: string, arquetipo: Arquetipo): string {
  const quem = nome ? `${nome}, você` : 'Você';
  return `${quem} é ${arquetipo.nome}`;
}

/* ── Persistência ────────────────────────────────────────────────────────
 *
 * Igual ao nome de exibição em lib/profile.ts: guardado em user_metadata do
 * Supabase Auth, não numa tabela própria. O diagnóstico é lido só pelo dono
 * da conta (no Perfil e, no futuro, para personalizar lembretes) — não há
 * motivo para o custo de uma tabela com RLS quando o metadata já resolve.
 */

const CHAVE_METADATA = 'diagnostico';

type DiagnosticoSalvo = {
  respostas: Respostas;
  arquetipoId: ArquetipoId;
  atualizadoEm: string;
};

export async function salvarDiagnostico(
  respostas: Respostas,
  arquetipo: Arquetipo
): Promise<{ ok: boolean; error?: string }> {
  const payload: DiagnosticoSalvo = {
    respostas,
    arquetipoId: arquetipo.id,
    atualizadoEm: new Date().toISOString(),
  };
  const { error } = await supabase.auth.updateUser({ data: { [CHAVE_METADATA]: payload } });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type DiagnosticoCarregado = { respostas: Respostas; arquetipo: Arquetipo; atualizadoEm: string };

export async function carregarDiagnostico(): Promise<DiagnosticoCarregado | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const bruto = data.user.user_metadata?.[CHAVE_METADATA] as DiagnosticoSalvo | undefined;
  if (!bruto || !bruto.arquetipoId || !ARQUETIPOS[bruto.arquetipoId]) return null;

  return {
    respostas: bruto.respostas,
    arquetipo: ARQUETIPOS[bruto.arquetipoId],
    atualizadoEm: bruto.atualizadoEm,
  };
}
