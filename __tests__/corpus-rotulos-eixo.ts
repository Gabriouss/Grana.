/*
 * Rótulo do eixo X não encosta no vizinho, e nenhum mês some sem motivo.
 *
 * Achado V4 da varredura de 17/09/2026 (M1), o mais forte dela: em
 * Gráficos > Geral > Período, o eixo mostrava "Abr/26 … (vão vazio) …
 * Jun/26Jul/26 … Set/26" — "Mai/26" sumia e dois rótulos ficavam colados.
 *
 * A causa não era o desenho: `visibleChartLabels` decidia QUANTOS rótulos
 * cabiam como se eles pudessem ficar em qualquer ponto da régua
 * (`floor(width / labelWidth) + 1`) e então espalhava essa quantidade por
 * igual, arredondando cada índice. Rótulo mora em cima de um PONTO, e o
 * arredondamento juntava dois pontos vizinhos: distância real menor que a
 * largura do rótulo, ou seja, colisão.
 *
 * Este teste roda a função real e prende o que importa: nunca dois rótulos
 * mais perto que a largura de um deles, sempre em ordem, com começo e fim do
 * eixo à vista.
 */
import { visibleChartLabels } from '../lib/chart-labels';

let total = 0;
let falhas = 0;
function conferir(nome: string, ok: boolean, visto?: unknown) {
  total++;
  if (ok) return;
  falhas++;
  console.error(`✗ ${nome}${visto === undefined ? '' : ` — visto: ${JSON.stringify(visto)}`}`);
}

/* ── 1. O caso exato do print ────────────────────────────────────────────
   Seis meses (abr a set) numa faixa de 300px: 60px entre pontos, rótulo de
   64px. A fórmula antiga escolhia [0, 1, 3, 4, 5] — três pares a 60px, todos
   colados. */
{
  const antiga = (count: number, width: number, labelWidth: number) => {
    const slots = Math.min(count, Math.max(1, Math.floor(width / labelWidth) + 1));
    if (slots === 1) return [count - 1];
    return Array.from({ length: slots }, (_, i) => Math.round((i * (count - 1)) / (slots - 1)));
  };
  const distancia = 300 / 5;
  const colados = (idx: number[]) => idx.slice(1).some((v, i) => (v - idx[i]) * distancia < 64 - 0.001);

  conferir('a fórmula antiga colava rótulos (o defeito do print)', colados(antiga(6, 300, 64)), antiga(6, 300, 64));
  conferir('a de hoje não cola nenhum', !colados(visibleChartLabels(6, 300, 64)), visibleChartLabels(6, 300, 64));
}

/* ── 2. Varredura: nenhuma combinação de dados e largura pode colidir ──── */
{
  let colisoes = 0;
  let semPonta = 0;
  let foraDeOrdem = 0;
  let combinacoes = 0;
  for (const pontos of [2, 3, 4, 5, 6, 7, 8, 12, 13, 24, 31]) {
    for (const largura of [120, 200, 300, 360, 420, 700]) {
      for (const larguraRotulo of [40, 64, 90]) {
        combinacoes++;
        const indices = visibleChartLabels(pontos, largura, larguraRotulo);
        const distancia = largura / (pontos - 1);
        if (!indices.every((v, i) => i === 0 || v > indices[i - 1])) foraDeOrdem++;
        if (indices.some((v) => v < 0 || v > pontos - 1)) foraDeOrdem++;
        for (let i = 1; i < indices.length; i++) {
          if ((indices[i] - indices[i - 1]) * distancia < larguraRotulo - 0.001) colisoes++;
        }
        /* Com dois ou mais rótulos, o eixo precisa mostrar onde começa e onde
           termina. Com um só, é o mais recente que fica. */
        if (indices.length > 1 && (indices[0] !== 0 || indices[indices.length - 1] !== pontos - 1)) semPonta++;
        if (indices.length === 1 && indices[0] !== pontos - 1 && indices[0] !== 0) semPonta++;
      }
    }
  }
  conferir(`nenhuma colisão em ${combinacoes} combinações`, colisoes === 0, colisoes);
  conferir('índices sempre crescentes e dentro do intervalo', foraDeOrdem === 0, foraDeOrdem);
  conferir('o eixo sempre mostra começo e fim', semPonta === 0, semPonta);
}

/* ── 3. Bordas ──────────────────────────────────────────────────────────── */
{
  conferir('sem dado, sem rótulo', JSON.stringify(visibleChartLabels(0, 300)) === '[]');
  conferir('um dado só', JSON.stringify(visibleChartLabels(1, 300)) === '[0]');
  conferir('faixa estreita demais fica com o dado mais recente', JSON.stringify(visibleChartLabels(5, 50, 64)) === '[4]', visibleChartLabels(5, 50, 64));
  conferir('faixa larga rotula tudo', JSON.stringify(visibleChartLabels(5, 700, 64)) === '[0,1,2,3,4]', visibleChartLabels(5, 700, 64));
}

console.log(`\n${total - falhas}/${total} checagens dos rótulos do eixo passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
