/**
 * Quais pontos do eixo X ganham rótulo: todos os dados continuam desenhados,
 * só os rótulos é que são ralos o bastante para nenhum encostar no vizinho.
 *
 * **Por que não é uma distribuição contínua.** A versão anterior contava
 * quantos rótulos caberiam na largura (`floor(width / labelWidth) + 1`) e
 * espalhava essa quantidade por igual, arredondando o índice de cada um. A
 * conta da quantidade valia para rótulos livres na régua; só que rótulo mora
 * em cima de um PONTO, e o arredondamento podia cair em dois pontos vizinhos.
 * Com seis meses numa faixa de 300px (60px entre pontos, rótulo de 64px), ela
 * escolhia os índices 0, 1, 3, 4 e 5: "Abr/26" e "Mai/26" encostados, e o
 * mesmo no fim. Foi o que a auditoria de 17/09/2026 fotografou em
 * Gráficos > Geral > Período — um mês sumido e dois colados.
 *
 * Agora o passo é calculado em PONTOS, não em pixels: quantos pontos de
 * distância um rótulo precisa para o vizinho não encostar. Como o passo é
 * inteiro desde o começo, dois rótulos escolhidos nunca ficam mais perto que
 * a largura de um deles.
 *
 * O último ponto ancora a contagem (é o mês mais recente, o que a pessoa
 * procura primeiro) e o primeiro sempre entra, para o eixo ter começo e fim.
 */
export function visibleChartLabels(count: number, width: number, labelWidth = 64): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];

  const distanciaEntrePontos = width / (count - 1);
  const passo = Math.max(1, Math.ceil(labelWidth / distanciaEntrePontos));

  const indices: number[] = [];
  for (let i = count - 1; i > 0; i -= passo) indices.unshift(i);

  /* O vizinho colado no primeiro ponto cede o lugar a ele. */
  if (indices.length > 0 && indices[0] < passo) indices.shift();
  /* Nem dois rótulos cabem: fica o último, que é o dado mais recente. */
  if (indices.length === 0) return [count - 1];

  indices.unshift(0);
  return indices;
}
