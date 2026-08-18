import AsyncStorage from '@react-native-async-storage/async-storage';

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
  | 'boletos';

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
};

const ORDEM_PADRAO: HomeBlockKey[] = [
  'saldo', 'cofrinhos', 'atalhos', 'fluxo', 'categoria', 'orcamento', 'credito', 'boletos',
];

const CHAVE = 'grana_home_layout_config';

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
  try {
    const raw = await AsyncStorage.getItem(CHAVE);
    if (!raw) return layoutPadrao();
    const salvo = JSON.parse(raw) as HomeBlockConfig[];
    if (!Array.isArray(salvo)) return layoutPadrao();

    const chavesSalvas = new Set(salvo.map((b) => b.key));
    const resultado = salvo.filter((b) => ORDEM_PADRAO.includes(b.key));
    ORDEM_PADRAO.forEach((key) => {
      if (!chavesSalvas.has(key)) resultado.push({ key, visible: true });
    });
    return resultado.length > 0 ? resultado : layoutPadrao();
  } catch {
    return layoutPadrao();
  }
}

export async function salvarLayoutHome(config: HomeBlockConfig[]): Promise<void> {
  await AsyncStorage.setItem(CHAVE, JSON.stringify(config));
}
