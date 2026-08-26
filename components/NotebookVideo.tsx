import { createElement } from 'react';

type Props = {
  /** 'caixa' (padrão): largura 100%, altura proporcional — pro herói
      compacto, onde o vídeo é um bloco entre parágrafos de texto. 'fundo':
      preenche o pai inteiro (`position:absolute, inset:0`) com
      `objectFit:'cover'` — pro herói largo, onde o vídeo é o plano de fundo
      atrás do texto, não uma caixa própria. */
  variante?: 'caixa' | 'fundo';
};

/**
 * O notebook 3D flutuando com a tela do Grana. renderizada dentro — vídeo
 * real (renderizado fora do app), não um mock recriado em SVG/View. Toca em
 * loop silencioso, sem controles, como visual único e constante do herói:
 * só o título/subtítulo mudam a cada capítulo ao rolar, o notebook fica
 * parado ali, no mesmo espírito de "a peça mais bonita do produto flutua
 * sozinha" que guiava o antigo LaptopMockup (SVG por capítulo, aposentado
 * quando este vídeo passou a existir).
 *
 * Elemento <video> puro via `createElement`: React Native (e o
 * react-native-web) não tem um primitivo de vídeo embutido nos componentes
 * `View`/`Text`. Esta página inteira (app/index.tsx) só renderiza na web —
 * `LandingPage` redireciona pro app nativo antes de chegar aqui — então o nó
 * DOM real por trás do react-native-web aceita a tag sem problema, no mesmo
 * espírito do `document.createElement` já usado em TrustMarquee/foco-web.ts
 * pra sair do conjunto de primitivos do RN quando a página é web-only.
 *
 * Sem áudio (o arquivo já foi exportado sem trilha) e com `muted` mesmo
 * assim: autoplay só é permitido pelo navegador em vídeos mudos.
 */
export default function NotebookVideo({ variante = 'caixa' }: Props) {
  const estilo =
    variante === 'fundo'
      ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
      : { width: '100%', height: 'auto', display: 'block' };

  return createElement('video', {
    // Nome com sufixo de versão, não `notebook-flutuando.mp4` puro: um
    // <video> já montado no navegador nunca busca o arquivo de novo só
    // porque os bytes mudaram no servidor (mesmo com `Cache-Control:
    // no-store) — troca de nome é a única forma de garantir que uma aba já
    // aberta (ou o cache do navegador) pegue a versão nova, não a antiga.
    src: '/videos/notebook-flutuando-v3.mp4',
    poster: '/videos/notebook-poster-v2.webp',
    autoPlay: true,
    loop: true,
    muted: true,
    playsInline: true,
    'aria-hidden': true,
    style: estilo,
  });
}
