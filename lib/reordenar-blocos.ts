/**
 * Regras puras de reordenar blocos por arraste, usadas pela janela
 * "Personalizar Início". Moram aqui, sem React, para valerem o mesmo em
 * qualquer superfície e para o teste exercitar o módulo real.
 *
 * `WidgetGrid` (web desktop) tem a mesma regra escrita dentro do componente
 * e foi deixado intacto de propósito: ele mede a tela com `measureInWindow`
 * a cada arraste, e mexer nele para dividir três linhas de lógica não vale o
 * risco de regredir a Início da web. Se um dia for unificado, os dois devem
 * passar por estas funções.
 */

/** Um cartão em coordenadas do conteúdo da lista (não da tela). */
export type AreaDoBloco = { chave: string; topo: number; altura: number };

/**
 * Troca as DUAS posições envolvidas e deixa o resto onde estava. Não é
 * "tira e insere": soltar o bloco 0 sobre o 3 não desloca o 1 e o 2.
 * Devolve a própria lista (mesma referência) quando não há o que trocar.
 */
export function trocarPosicoes<T extends { key: string }>(lista: T[], chaveA: string, chaveB: string): T[] {
  if (chaveA === chaveB) return lista;
  const a = lista.findIndex((i) => i.key === chaveA);
  const b = lista.findIndex((i) => i.key === chaveB);
  if (a < 0 || b < 0) return lista;
  const novo = lista.slice();
  [novo[a], novo[b]] = [novo[b], novo[a]];
  return novo;
}

/**
 * Qual cartão está sob o dedo. `yDaTela` é a posição vertical do dedo na
 * janela, `topoDaLista` a posição da borda de cima da lista na janela e
 * `rolagem` o quanto o conteúdo já rolou: como a lista rola durante o gesto,
 * a posição do cartão na tela é recalculada a partir destes três valores, e
 * nenhum cartão precisa ser medido de novo. Fora de qualquer cartão (nas
 * frestas entre eles), devolve `null`, e soltar ali não muda nada.
 */
export function blocoSobOsDedos(
  areas: AreaDoBloco[],
  yDaTela: number,
  topoDaLista: number,
  rolagem: number
): string | null {
  const yNoConteudo = yDaTela - topoDaLista + rolagem;
  for (const a of areas) {
    if (yNoConteudo >= a.topo && yNoConteudo <= a.topo + a.altura) return a.chave;
  }
  return null;
}

/**
 * Quanto rolar a lista por quadro quando o dedo está perto da borda de cima
 * ou de baixo. Negativo sobe, positivo desce, zero fora das faixas. A faixa
 * é `borda` dentro da lista e a velocidade cresce com a proximidade da
 * borda, até `velocidadeMax`, para dar controle fino perto do limite.
 */
export function passoDeRolagem(
  yDaTela: number,
  topoDaLista: number,
  alturaDaLista: number,
  borda: number,
  velocidadeMax: number
): number {
  const dentro = yDaTela - topoDaLista;
  if (dentro < borda) {
    const forca = Math.min(1, (borda - dentro) / borda);
    return -Math.round(velocidadeMax * forca);
  }
  const faltam = alturaDaLista - dentro;
  if (faltam < borda) {
    const forca = Math.min(1, (borda - faltam) / borda);
    return Math.round(velocidadeMax * forca);
  }
  return 0;
}
