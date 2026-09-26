import {
  ehIntencaoBoleto,
  ehIntencaoCredito,
  entradaComIntencaoDeCredito,
  limparReferenciaCarteira,
  matchWalletByText,
} from './heuristics';

/**
 * Para onde uma fala que NÃO foi gravada sozinha leva a pessoa, dentro do app.
 *
 * Usada pelo botão de voz da Início (depois da revisão) e pelo toque na
 * notificação de revisão do widget. Antes, cada tela decidia por conta própria
 * e só olhava `ehIntencaoCredito`: "X de 40 no crédito" com tipo entrada, que o
 * núcleo da voz recusa (26/09/2026), abria a folha de COMPRA do cartão já
 * preenchida. Agora a regra é a mesma do núcleo e do Granabô
 * (`entradaComIntencaoDeCredito`), na mesma ordem: boleto antes de crédito.
 *
 *  - `contas`: conta a pagar, abre a folha de nova conta;
 *  - `credito`: compra no cartão, abre a folha de nova compra;
 *  - `revisao`: todo o resto, inclusive entrada com intenção de crédito; abre
 *    o formulário padrão de revisão com o texto, sem gravar nada.
 *
 * A carteira citada ("na carteira Viagem") sai do texto antes de decidir, como
 * no núcleo. Sem a lista de carteiras ou de cartões, decide pelo texto
 * inteiro: no pior caso uma compra vai para a revisão, nunca uma entrada para
 * a folha de compra.
 */
export type DestinoDaFala = 'contas' | 'credito' | 'revisao';

type CarteiraBusca = { id: string; name: string };
type CartaoBusca = { id: string; name: string; bank: string; wallet_id?: string | null };

export function destinoDaFala(
  texto: string,
  carteiras: CarteiraBusca[] = [],
  cartoes: CartaoBusca[] = [],
): DestinoDaFala {
  /* Mesma normalização do núcleo (`lib/widget-voz-task.ts`): a forma curta
     "cartão C6" tem a intenção de "no cartão C6". */
  const normalizado = texto.replace(/\bcart[aã]o\b/giu, 'no cartão');
  const carteira = matchWalletByText(normalizado, carteiras);
  const financeiro = carteira ? limparReferenciaCarteira(normalizado, carteira.name) : normalizado;
  if (ehIntencaoBoleto(financeiro)) return 'contas';
  if (entradaComIntencaoDeCredito(financeiro, cartoes)) return 'revisao';
  if (ehIntencaoCredito(financeiro)) return 'credito';
  return 'revisao';
}
