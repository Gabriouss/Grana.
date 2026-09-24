/**
 * Contador em memória de "a lista de lançamentos mudou".
 *
 * A Início, ao ganhar foco, roda só a carga leve (contas, orçamentos, cartões,
 * metas, XP) e não busca o histórico de lançamentos, que é caro. Até
 * 24/09/2026 nada avisava a Início quando um lançamento era gravado em outra
 * tela: salvar pelo "+" da Início (que abre o formulário em Lançamentos e
 * volta) mudava o saldo, que vem do contexto compartilhado, mas "Últimos
 * lançamentos" continuava sem o item (achado T2 do Sentinel).
 *
 * Quem grava em `transactions` chama `marcarLancamentosAlterados()` depois do
 * sucesso; a Início compara a versão com a da última carga completa e, se
 * mudou, faz a carga completa no foco. Não importa Supabase nem `lib/data`,
 * para não criar ciclo de import.
 */
let versao = 0;

export function marcarLancamentosAlterados(): void {
  versao += 1;
}

export function versaoDosLancamentos(): number {
  return versao;
}
