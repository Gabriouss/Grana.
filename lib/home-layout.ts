import { supabase } from './supabase';

/**
 * Personalização Modular da Tela Inicial — item 2 do "Plano Mestre de
 * Execução" (reestruturação de navegação em 5 abas). A ordem do array É a
 * ordem de exibição na Home; `visible` liga/desliga cada bloco sem tirá-lo
 * da lista, pra lembrar a posição escolhida se a pessoa reativar depois.
 */
export type HomeBlockKey =
  | 'saldo'
  | 'cofrinhos'
  | 'atalhos'
  | 'fluxo'
  | 'categoria'
  | 'orcamento'
  | 'credito'
  | 'boletos'
  | 'timeline'
  | 'lancamentos';

export type HomeBlockConfig = { key: HomeBlockKey; visible: boolean };

export const HOME_BLOCK_LABELS: Record<HomeBlockKey, string> = {
  saldo: 'Saldo líquido & Livre para gastar',
  cofrinhos: 'Carrossel de cofrinhos / metas',
  atalhos: 'Atalhos rápidos por categoria',
  fluxo: 'Gráfico de fluxo financeiro',
  categoria: 'Gastos por categoria',
  orcamento: 'Orçamentos do mês',
  credito: 'Resumo de faturas de crédito',
  boletos: 'Próximos boletos a vencer',
  timeline: 'Comprometimento futuro (6 meses)',
  lancamentos: 'Últimos lançamentos',
};

/* Ícone e descrição curta usados pelo customizador redesenhado
   (components/HomeCustomizerModal.tsx). Vivem aqui, ao lado dos rótulos, para
   que um bloco novo só precise ser descrito num lugar. */
export const HOME_BLOCK_ICONS: Record<HomeBlockKey, keyof typeof import('@expo/vector-icons').Ionicons.glyphMap> = {
  saldo: 'trending-up-outline',
  cofrinhos: 'gift-outline',
  atalhos: 'flash-outline',
  fluxo: 'stats-chart-outline',
  categoria: 'pie-chart-outline',
  orcamento: 'speedometer-outline',
  credito: 'card-outline',
  boletos: 'receipt-outline',
  timeline: 'calendar-outline',
  lancamentos: 'list-outline',
};

export const HOME_BLOCK_DESCRIPTIONS: Record<HomeBlockKey, string> = {
  saldo: 'Quanto ainda dá para gastar hoje, considerando contas e reservas.',
  cofrinhos: 'Suas metas de economia, com progresso e atalho para guardar.',
  atalhos: 'Chips de categoria para lançar uma saída em um toque.',
  fluxo: 'Entradas e saídas ao longo do mês, da semana ou do ano.',
  categoria: 'Donut com a fatia de cada categoria nos seus gastos.',
  orcamento: 'Limite definido por categoria e o quanto já foi usado.',
  credito: 'Fatura atual dos seus cartões, com atalho para o detalhe.',
  boletos: 'Contas fixas que vencem nos próximos dias.',
  timeline: 'Projeção dos próximos 6 meses, incluindo parcelas futuras.',
  lancamentos: 'As 5 movimentações mais recentes, para editar ou excluir.',
};

const ORDEM_PADRAO: HomeBlockKey[] = [
  'saldo', 'cofrinhos', 'atalhos', 'fluxo', 'categoria', 'orcamento', 'credito', 'boletos', 'timeline', 'lancamentos',
];

/**
 * Templates de interface oferecidos no onboarding e como botões de 1 toque
 * no customizador. A ordem de cada array É a ordem final dos blocos ativos;
 * `layoutDoPreset` anexa os blocos não citados como ocultos, na ordem de
 * `ORDEM_PADRAO`, para que a pessoa continue podendo reativá-los depois sem
 * perder onde eles ficam na lista do customizador.
 */
export type HomePreset = 'essencial' | 'completo' | 'metas';

export const HOME_PRESETS: Record<HomePreset, HomeBlockKey[]> = {
  essencial: ['categoria', 'atalhos', 'lancamentos'],
  completo: ['saldo', 'cofrinhos', 'timeline', 'credito', 'boletos', 'categoria', 'fluxo', 'orcamento', 'lancamentos'],
  metas: ['saldo', 'cofrinhos', 'orcamento', 'categoria', 'boletos'],
};

export function layoutDoPreset(preset: HomePreset): HomeBlockConfig[] {
  const ativos = HOME_PRESETS[preset];
  const ocultos = ORDEM_PADRAO.filter((key) => !ativos.includes(key));
  return [...ativos, ...ocultos].map((key) => ({ key, visible: ativos.includes(key) }));
}

/* Guardado em user_metadata do Supabase Auth — mesmo padrão de
   lib/diagnostico.ts e lib/profile.ts — em vez de AsyncStorage local. A
   personalização é por CONTA, não por aparelho: guardar só localmente fazia
   a organização dos cards sumir ao deslogar e entrar de novo (ou trocar de
   aparelho/navegador), porque cada AsyncStorage é isolado por dispositivo. */
const CHAVE_METADATA = 'home_layout';

export function layoutPadrao(): HomeBlockConfig[] {
  return ORDEM_PADRAO.map((key) => ({ key, visible: true }));
}

/**
 * Reconcilia a configuração salva com a lista atual de blocos: chaves
 * removidas em uma atualização do app são descartadas, e blocos novos que a
 * pessoa nunca configurou entram visíveis no fim — assim uma versão nova do
 * app nunca esconde silenciosamente uma seção nova nem quebra ao ler uma
 * configuração salva por uma versão antiga.
 */
export async function carregarLayoutHome(): Promise<HomeBlockConfig[]> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return layoutPadrao();

  const salvo = data.user.user_metadata?.[CHAVE_METADATA] as HomeBlockConfig[] | undefined;
  if (!salvo || !Array.isArray(salvo)) return layoutPadrao();

  const chavesSalvas = new Set(salvo.map((b) => b.key));
  const resultado = salvo.filter((b) => ORDEM_PADRAO.includes(b.key));
  ORDEM_PADRAO.forEach((key) => {
    if (!chavesSalvas.has(key)) resultado.push({ key, visible: true });
  });
  return resultado.length > 0 ? resultado : layoutPadrao();
}

export async function salvarLayoutHome(config: HomeBlockConfig[]): Promise<void> {
  await supabase.auth.updateUser({ data: { [CHAVE_METADATA]: config } });
}
