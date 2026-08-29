import type { PieSlice } from '@/components/PieChart';

/**
 * Cores de categoria dos gráficos, e o agrupamento das fatias pequenas.
 *
 * ── Como a cor é escolhida ─────────────────────────────────────────────────
 *
 * Por NOME de categoria, nunca por posição na lista de fatias. Se a cor
 * seguisse o ranking, trocar o filtro de período repintaria as categorias
 * sobreviventes e a mesma "Alimentação" mudaria de cor entre duas telas.
 *
 * Este módulo existe para isso e para o agrupamento da cauda. A PALETA em si
 * é a mesma de `CATEGORIES` (lib/types.ts), que é também a que fica gravada
 * em `transactions.color` e vale para chip, ponto e etiqueta — gráfico e
 * resto do app falam a mesma língua de cor.
 */

/* As cores da marca, em tom pastel, exatamente as de `CATEGORIES`
   (lib/types.ts). Uma rodada anterior trocou isto por uma paleta de oito
   matizes saturadas escolhida para maximizar separação sob daltonismo; foi
   revertida a pedido do autor, porque o pastel é decisão de marca tomada no
   início do projeto e a paleta vívida descaracterizava a tela.

   O CUSTO fica registrado, medido com o validador do skill de dataviz contra
   o fundo `paperRaised`: Saúde (#74a17c) e Lazer (#c66f8e) ficam com ΔE 3.1
   sob deuteranopia, e Moradia (#93739e) e Alimentação (#bb6b60) com ΔE 10.8
   em visão normal, abaixo do piso de 15. Ou seja, alguns pares são difíceis
   de distinguir só pela cor.

   O que compensa isso é a legenda: ela lista TODAS as fatias com nome e
   porcentagem, então nenhuma informação do gráfico depende apenas da cor.
   Essa é a condição para a paleta pastel poder ficar. */
const PALETA = [
  '#bb6b60', // Alimentação
  '#93739e', // Moradia
  '#6b9dc2', // Transporte
  '#c66f8e', // Lazer
  '#74a17c', // Saúde
  '#d3b869', // Assinaturas
  '#4f9483', // Salário
  '#c1a24c', // Investimentos
];

/* Cinza para "Outros": é o balde do que não tem identidade própria, e ler
   como neutro aqui é o comportamento desejado. */
const NEUTRO = '#8b9198';

/** Cada categoria fixa do app ocupa o slot da própria cor de marca. */
const SLOT_FIXO: Record<string, number> = {
  'Alimentação': 0,
  'Moradia': 1,
  'Transporte': 2,
  'Lazer': 3,
  'Saúde': 4,
  'Assinaturas': 5,
  'Salário': 6,
  'Investimentos': 7,
};

/** Hash estável: a mesma categoria personalizada cai sempre no mesmo slot. */
function hashSlot(nome: string): number {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) | 0;
  return Math.abs(h) % PALETA.length;
}

/** Cor de uma categoria dentro de um gráfico. */
export function corDaCategoria(nome: string): string {
  if (nome === 'Outros') return NEUTRO;
  const fixo = SLOT_FIXO[nome];
  return PALETA[fixo !== undefined ? fixo : hashSlot(nome)];
}

/**
 * Teto de fatias de um donut. Acima disso as fatias viram lascas, os rótulos
 * se empilham na borda e a leitura "de relance" que justifica a forma deixa de
 * existir. Seis é o limite recomendado para parte-de-todo.
 */
export const MAX_FATIAS = 6;

/**
 * Ordena, recolore e dobra a cauda em "Outros".
 *
 * O agrupamento acontece aqui, junto da lista de fatias, e não dentro do
 * gráfico: a legenda ao lado precisa contar exatamente a mesma história, e uma
 * legenda com sete linhas ao lado de um donut de seis fatias seria pior que o
 * problema original.
 */
export function prepararFatias(fatias: PieSlice[], max: number = MAX_FATIAS): PieSlice[] {
  const ordenadas = [...fatias]
    .filter((f) => f.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((f) => ({ ...f, color: corDaCategoria(f.name) }));

  if (ordenadas.length <= max) return ordenadas;

  const visiveis = ordenadas.slice(0, max - 1);
  const resto = ordenadas.slice(max - 1);
  const jaTemOutros = visiveis.find((f) => f.name === 'Outros');
  const somaResto = resto.reduce((s, f) => s + f.value, 0);

  if (jaTemOutros) {
    jaTemOutros.value += somaResto;
    return visiveis.sort((a, b) => b.value - a.value);
  }

  return [...visiveis, { name: 'Outros', color: NEUTRO, value: somaResto }];
}
