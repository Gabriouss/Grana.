/**
 * Gera `public/telas/multiplataforma.webp`: o notebook e o celular juntos, cada
 * um com uma captura real do app (modo "Dados de exemplo", dado fictício), para
 * o passo "Confira onde quiser" da landing (`components/TrilhaPassos.tsx`).
 *
 *   node scripts/compor-mockup-multiplataforma.mjs
 *
 * Precisa do `ffmpeg` no PATH (só para ler e gravar WebP). Rodar de novo
 * sempre que `public/telas/inicio-web.png` ou `inicio-mobile.png` mudarem.
 *
 * Fontes:
 * - notebook: `public/notebook/notebook.webp`, o render do herói, já sem fundo.
 *   A tela dele trazia outra captura; aqui ela é coberta por `inicio-web.png`.
 * - celular: `design-system/marketing-mockups/celular-vazio.png` (foto aprovada
 *   pelo autor em 31/08/2026), recortado do fundo cinza pelo próprio contorno.
 *
 * Sem a sombra de chão do herói (`sombra.webp`): sobre o fundo petróleo do card
 * ela não aparece, e só alargava a margem transparente da imagem.
 *
 * As telas são mapeadas por homografia sobre os quatro cantos medidos (o
 * método de `design-system/marketing-mockups/README.md`). Os cantos foram
 * medidos em 17/09/2026 pela cor: o fundo petróleo da tela do notebook contra a
 * moldura preta, e o vidro azulado do celular contra a borda.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { PNG } = createRequire(import.meta.url)('pngjs');

const SAIDA = 'public/telas/multiplataforma.webp';
const LARGURA_SAIDA = 960;

/* Cantos no espaço de cada imagem de origem: [x, y], sentido horário a partir
   do superior esquerdo. */
/* A borda direita foi medida pela barra de rolagem da captura antiga, que
   não é petróleo: x = 1381 - 0,0678·(y - 60), meio pixel para fora. */
const TELA_NOTEBOOK = [[480.3, 56.1], [1384.5, 16.1], [1338.2, 699.3], [436, 650.7]];
const CELULAR_CONTORNO = [[829.3, 116.5], [1226.7, 116.5], [1232.3, 992.5], [823.7, 992.5]];
const CELULAR_RAIO = 42;
const CELULAR_TELA = [[849, 128], [1209.5, 128], [1210.5, 964], [847, 964]];
const CELULAR_TELA_RAIO = 30;
const CELULAR_CAMERA = { x: 1029.4, y: 152, raio: 9 };

/* Onde o celular entra, no espaço do notebook (notebook em 0,0). */
const ESCALA_CELULAR = 0.64;
const POSICAO_CELULAR = [1175, 360];

const tmp = mkdtempSync(join(tmpdir(), 'mockup-'));

function lerImagem(caminho) {
  let arquivo = caminho;
  if (caminho.endsWith('.webp')) {
    arquivo = join(tmp, `${Math.random().toString(36).slice(2)}.png`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', caminho, '-pix_fmt', 'rgba', arquivo]);
  }
  const png = PNG.sync.read(readFileSync(arquivo));
  return { w: png.width, h: png.height, d: png.data };
}

const nova = (w, h) => ({ w, h, d: Buffer.alloc(w * h * 4) });

function amostra(img, x, y) {
  const x0 = Math.max(0, Math.min(img.w - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(img.h - 1, Math.floor(y)));
  const x1 = Math.min(img.w - 1, x0 + 1), y1 = Math.min(img.h - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0));
  const out = [0, 0, 0, 0];
  for (const [xx, yy, p] of [[x0, y0, (1 - fx) * (1 - fy)], [x1, y0, fx * (1 - fy)], [x0, y1, (1 - fx) * fy], [x1, y1, fx * fy]]) {
    const i = (yy * img.w + xx) * 4;
    const a = img.d[i + 3] / 255;
    out[0] += img.d[i] * a * p; out[1] += img.d[i + 1] * a * p; out[2] += img.d[i + 2] * a * p; out[3] += a * p;
  }
  return out; // cor pré-multiplicada, alfa 0..1
}

/* Pinta cor pré-multiplicada (c, alfa a) por cima do pixel (x, y). */
function sobre(img, x, y, c, a) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h || a <= 0) return;
  const i = (y * img.w + x) * 4;
  const da = img.d[i + 3] / 255;
  const oa = a + da * (1 - a);
  for (let k = 0; k < 3; k++) img.d[i + k] = Math.round((c[k] + img.d[i + k] * da * (1 - a)) / (oa || 1));
  img.d[i + 3] = Math.round(oa * 255);
}

/* Homografia que leva os pontos `de` aos pontos `para` (4 pares). */
function homografia(de, para) {
  const A = [], b = [];
  for (let k = 0; k < 4; k++) {
    const [u, v] = de[k], [x, y] = para[k];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  for (let c = 0; c < 8; c++) {
    let m = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
    [A[c], A[m]] = [A[m], A[c]]; [b[c], b[m]] = [b[m], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return (x, y) => {
    const w = h[6] * x + h[7] * y + 1;
    return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
  };
}

/* Dentro do retângulo [0,L]x[0,A] com cantos de raio r? */
function dentroArredondado(u, v, L, A, r) {
  if (u < 0 || v < 0 || u > L || v > A) return false;
  const cx = u < r ? r : u > L - r ? L - r : u;
  const cy = v < r ? r : v > A - r ? A - r : v;
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
}

const caixa = (quad) => {
  const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
  return [Math.floor(Math.min(...xs)) - 1, Math.floor(Math.min(...ys)) - 1, Math.ceil(Math.max(...xs)) + 1, Math.ceil(Math.max(...ys)) + 1];
};

const SUB = [1 / 6, 3 / 6, 5 / 6];

/**
 * Cola `fonte` (recorte `[sx0, sy0, sx1, sy1]`) no quadrilátero `quad` de
 * `destino`, com cantos de raio `raio` (em pixels da fonte), reflexo de vidro e
 * vinheta leve.
 */
function colarTela(destino, quad, fonte, recorte, raio) {
  const [sx0, sy0, sx1, sy1] = recorte;
  const L = sx1 - sx0, A = sy1 - sy0;
  const paraFonte = homografia(quad, [[0, 0], [L, 0], [L, A], [0, A]]);
  const [bx0, by0, bx1, by1] = caixa(quad);
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const soma = [0, 0, 0]; let n = 0;
    for (const oy of SUB) for (const ox of SUB) {
      const [u, v] = paraFonte(x + ox, y + oy);
      if (!dentroArredondado(u, v, L, A, raio)) continue;
      const c = amostra(fonte, sx0 + u, sy0 + v);
      /* Vidro: um brilho diagonal fraco no alto à esquerda e as bordas um
         pouco mais escuras, senão a captura parece colada por cima. */
      const nu = u / L, nv = v / A;
      const brilho = 0.07 * Math.max(0, 1 - (nu * 0.9 + nv) * 1.4);
      const borda = 1 - 0.14 * Math.max(0, 1 - Math.min(nu, 1 - nu, nv, 1 - nv) * 14);
      for (let k = 0; k < 3; k++) soma[k] += (c[k] * borda) * (1 - brilho) + 255 * brilho;
      n++;
    }
    // Cor pré-multiplicada pela cobertura (n de 9 subamostras).
    if (n) sobre(destino, x, y, soma.map((s) => s / 9), n / 9);
  }
}

/* Desenha `camada` em `destino`, na posição (px, py), escalada por `escala`. */
function desenhar(destino, camada, px, py, escala) {
  const w = Math.ceil(camada.w * escala), h = Math.ceil(camada.h * escala);
  const passos = escala < 1 ? Math.ceil(2 / escala) : 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const soma = [0, 0, 0, 0];
    for (let j = 0; j < passos; j++) for (let i = 0; i < passos; i++) {
      const c = amostra(camada, (x + (i + 0.5) / passos) / escala - 0.5, (y + (j + 0.5) / passos) / escala - 0.5);
      for (let k = 0; k < 4; k++) soma[k] += c[k];
    }
    const q = passos * passos;
    sobre(destino, Math.round(px) + x, Math.round(py) + y, soma.slice(0, 3).map((s) => s / q), soma[3] / q);
  }
}

/* Sombra de um retângulo arredondado, suave (distância com sinal). */
function sombraRetangulo(destino, x0, y0, L, A, r, desfoque, opacidade) {
  for (let y = Math.floor(y0 - desfoque); y <= y0 + A + desfoque; y++) for (let x = Math.floor(x0 - desfoque); x <= x0 + L + desfoque; x++) {
    const qx = Math.abs(x + 0.5 - (x0 + L / 2)) - (L / 2 - r);
    const qy = Math.abs(y + 0.5 - (y0 + A / 2)) - (A / 2 - r);
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    const t = Math.max(0, Math.min(1, 0.5 - d / (2 * desfoque)));
    sobre(destino, x, y, [0, 0, 0], opacidade * t * t * (3 - 2 * t));
  }
}

try {
  const notebook = lerImagem('public/notebook/notebook.webp');
  const foto = lerImagem('design-system/marketing-mockups/celular-vazio.png');
  const web = lerImagem('public/telas/inicio-web.png');
  const mobile = lerImagem('public/telas/inicio-mobile.png');

  /* 1. Notebook com a captura web. */
  colarTela(notebook, TELA_NOTEBOOK, web, [0, 0, web.w, web.h], 10);

  /* 2. Celular recortado do fundo, com a captura mobile e a câmera por cima. */
  const [cx0, cy0, cx1, cy1] = caixa(CELULAR_CONTORNO);
  const celular = nova(cx1 - cx0 + 1, cy1 - cy0 + 1);
  const Lc = (CELULAR_CONTORNO[1][0] - CELULAR_CONTORNO[0][0] + CELULAR_CONTORNO[2][0] - CELULAR_CONTORNO[3][0]) / 2;
  const Ac = CELULAR_CONTORNO[3][1] - CELULAR_CONTORNO[0][1];
  const paraRet = homografia(CELULAR_CONTORNO, [[0, 0], [Lc, 0], [Lc, Ac], [0, Ac]]);
  for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
    let n = 0;
    for (const oy of SUB) for (const ox of SUB) {
      const [u, v] = paraRet(x + ox, y + oy);
      /* 0,8px para dentro: sem isso sobra um fio do fundo cinza na borda. */
      if (dentroArredondado(u - 0.8, v - 0.8, Lc - 1.6, Ac - 1.6, CELULAR_RAIO)) n++;
    }
    if (!n) continue;
    const i = (y * foto.w + x) * 4;
    sobre(celular, x - cx0, y - cy0, [foto.d[i], foto.d[i + 1], foto.d[i + 2]].map((c) => c * (n / 9)), n / 9);
  }
  const telaCel = CELULAR_TELA.map(([x, y]) => [x - cx0, y - cy0]);
  /* A captura é mais larga que a tela (0,46 contra 0,43): corta as laterais. */
  const alturaUtil = mobile.h;
  const larguraUtil = alturaUtil * ((CELULAR_TELA[1][0] - CELULAR_TELA[0][0]) / (CELULAR_TELA[3][1] - CELULAR_TELA[0][1]));
  const corte = (mobile.w - larguraUtil) / 2;
  colarTela(celular, telaCel, mobile, [corte, 0, mobile.w - corte, alturaUtil], CELULAR_TELA_RAIO);
  const { x: camX, y: camY, raio: camR } = CELULAR_CAMERA;
  for (let y = Math.floor(camY - camR - 2); y <= camY + camR + 2; y++) for (let x = Math.floor(camX - camR - 2); x <= camX + camR + 2; x++) {
    const a = Math.max(0, Math.min(1, camR + 0.5 - Math.hypot(x + 0.5 - camX, y + 0.5 - camY)));
    const i = (y * foto.w + x) * 4;
    sobre(celular, x - cx0, y - cy0, [foto.d[i], foto.d[i + 1], foto.d[i + 2]].map((c) => c * a), a);
  }

  /* 3. Composição: notebook, sombra do celular, celular. */
  const MARGEM = 60;
  const larguraFinal = Math.ceil(Math.max(notebook.w, POSICAO_CELULAR[0] + celular.w * ESCALA_CELULAR) + MARGEM * 2);
  const alturaFinal = Math.ceil(Math.max(notebook.h, POSICAO_CELULAR[1] + celular.h * ESCALA_CELULAR) + MARGEM * 2 + 40);
  const tela = nova(larguraFinal, alturaFinal);
  const ox = MARGEM, oy = MARGEM;
  desenhar(tela, notebook, ox, oy, 1);
  const [pcx, pcy] = POSICAO_CELULAR;
  const lcEsc = celular.w * ESCALA_CELULAR, acEsc = celular.h * ESCALA_CELULAR;
  /* O celular flutua à frente: sombra projetada no notebook, para baixo e à
     esquerda, e uma mancha mais difusa embaixo. */
  sombraRetangulo(tela, ox + pcx - 16, oy + pcy + 24, lcEsc, acEsc, CELULAR_RAIO * ESCALA_CELULAR, 26, 0.5);
  sombraRetangulo(tela, ox + pcx + lcEsc * 0.1, oy + pcy + acEsc + 14, lcEsc * 0.8, 18, 9, 22, 0.35);
  desenhar(tela, celular, ox + pcx, oy + pcy, ESCALA_CELULAR);

  /* 4. Recorta ao conteúdo e grava em WebP com transparência. */
  let [mx0, my0, mx1, my1] = [tela.w, tela.h, 0, 0];
  for (let y = 0; y < tela.h; y++) for (let x = 0; x < tela.w; x++) {
    if (tela.d[(y * tela.w + x) * 4 + 3] > 3) { mx0 = Math.min(mx0, x); my0 = Math.min(my0, y); mx1 = Math.max(mx1, x); my1 = Math.max(my1, y); }
  }
  const png = new PNG({ width: tela.w, height: tela.h });
  tela.d.copy(png.data);
  const intermediario = join(tmp, 'composicao.png');
  writeFileSync(intermediario, PNG.sync.write(png));
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', intermediario,
    '-vf', `crop=${mx1 - mx0 + 1}:${my1 - my0 + 1}:${mx0}:${my0},scale=${LARGURA_SAIDA}:-1:flags=lanczos`,
    '-c:v', 'libwebp', '-quality', '86', '-pix_fmt', 'yuva420p', SAIDA,
  ]);
  // `--previa=<arquivo.png>` guarda a composição em tamanho cheio, para conferir.
  const previa = process.argv.find((a) => a.startsWith('--previa='));
  if (previa) writeFileSync(previa.slice('--previa='.length), readFileSync(intermediario));
  console.log(`${SAIDA}: recorte ${mx1 - mx0 + 1}x${my1 - my0 + 1}, saída ${LARGURA_SAIDA}px de largura`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
