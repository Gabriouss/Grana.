import type { Bill } from './types';

/**
 * O texto da confirmação "Excluir boleto?".
 *
 * Apagar a CABEÇA de uma série de boletos leva todos os meses seguintes junto:
 * `bills.parent_id` é `on delete cascade` (schema.sql). A pergunta tem de dizer
 * isso, como a de lançamentos já faz. Quem recebe `todas` é a lista inteira de
 * boletos da tela (`fetchBills` pagina tudo), então a contagem vem dos filhos
 * que a pessoa já tem carregados.
 */
export function mensagemExcluirBoleto(bill: Pick<Bill, 'id' | 'description' | 'status'>, todas: Pick<Bill, 'parent_id'>[]): string {
  const seguintes = todas.filter((b) => b.parent_id === bill.id).length;
  const base = `Remover “${bill.description}”? ${bill.status === 'paid'
    ? 'A saída já lançada quando ele foi pago continua em Lançamentos.'
    : 'Os lembretes de vencimento dele também saem.'}`;
  if (seguintes === 0) return base;
  return `${base} Este boleto é o primeiro de uma série que se repete todo mês: ${seguintes === 1 ? 'o do mês seguinte também será removido' : `os ${seguintes} dos meses seguintes também serão removidos`}.`;
}
