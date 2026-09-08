import { Platform } from 'react-native';
import { theme } from './theme';

/**
 * Anel de foco visível para navegação por teclado, na web.
 *
 * O app nasceu para toque, onde foco de teclado não existe — nenhum
 * componente trata `onFocus`. No navegador isso significa que percorrer a
 * interface com Tab não mostra onde você está: o `react-native-web` zera o
 * `outline` padrão dos elementos interativos que gera, e nada o substitui.
 * Para quem não usa mouse, a interface fica inoperável.
 *
 * Resolvido com uma regra de CSS injetada uma vez, e não com estado de foco
 * em cada componente, por dois motivos. Primeiro, alcance: uma regra cobre
 * os ~40 componentes e qualquer um criado depois, sem ninguém precisar
 * lembrar. Segundo, e mais importante, `:focus-visible` é uma distinção que
 * só o navegador sabe fazer — ele mostra o anel quando o foco veio do
 * teclado e o esconde quando veio de um clique. Reproduzir isso com
 * `onFocus` daria anel em todo clique de mouse, que é ruído visual e o
 * motivo pelo qual tanta gente remove o outline em primeiro lugar.
 */
/**
 * Ajustes globais de documento que o `app/+html.tsx` NÃO consegue entregar.
 *
 * Descoberto em 08/09/2026 com `expo export`: o `index.html` publicado é, byte
 * a byte, o template padrão da Expo (`@expo/cli/static/template/index.html`) —
 * mesmo `httpEquiv`, mesma string de `viewport`, mesmo `<style id="expo-reset">`.
 * O `+html.tsx` só é honrado quando `web.output` é `"static"`; aqui a chave não
 * existe em `app.json`, então vale o padrão `"single"` (SPA) e aquele arquivo é
 * inerte. Confirmado inserindo uma `<meta>` marcadora que nunca apareceu no
 * export, mesmo depois de limpar `.expo`, `node_modules/.cache` e rodar com
 * `--clear`.
 *
 * Consequência prática do que ficava de fora: a Neue Machina Light saía
 * engrossada pelo subpixel rendering, girar o iPhone inflava o texto sozinho, e
 * campo autopreenchido pelo Chrome aparecia com fundo claro no meio da UI
 * petróleo. Injetar em runtime resolve os três sem trocar o modo de
 * renderização do site inteiro, que seria uma mudança de outra ordem.
 */
export function instalarDocumentoWeb(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  /* `env(safe-area-inset-*)` só devolve valor real no Safari do iOS com
     `viewport-fit=cover`; sem isso o SafeAreaProvider mede zero e o cabeçalho
     encosta no recorte no app instalado. O template padrão não traz. */
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport && !/viewport-fit/.test(viewport.getAttribute('content') ?? '')) {
    viewport.setAttribute(
      'content',
      `${viewport.getAttribute('content')}, viewport-fit=cover`
    );
  }
  if (!document.documentElement.getAttribute('lang')) {
    document.documentElement.setAttribute('lang', 'pt-BR');
  }

  if (document.getElementById('grana-documento')) return;
  const estilo = document.createElement('style');
  estilo.id = 'grana-documento';
  estilo.textContent = `
    html { -webkit-text-size-adjust: 100%; color-scheme: dark; }
    body {
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    /* Campo autopreenchido vinha com fundo claro e texto quase preto dentro da
       UI petróleo: o Chrome pinta por cima do background e ignora \`color\`. O
       inset shadow é a única forma de cobrir esse fundo, e o
       \`-webkit-text-fill-color\` é o que alcança o texto. A transição longa
       existe porque o navegador reaplica o próprio estilo por alguns instantes
       depois de preencher. Atinge login, cadastro, nova senha e troca de e-mail
       no Perfil — as telas onde o navegador oferece autopreenchimento. */
    input:-webkit-autofill,
    input:-webkit-autofill:hover,
    input:-webkit-autofill:focus,
    input:-webkit-autofill:active {
      -webkit-box-shadow: 0 0 0 1000px ${theme.paperRaised} inset !important;
      -webkit-text-fill-color: ${theme.ink} !important;
      caret-color: ${theme.ink};
      transition: background-color 100000s ease-in-out 0s;
    }
  `;
  document.head.appendChild(estilo);
}

export function instalarAnelDeFoco(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('grana-foco')) return;

  const estilo = document.createElement('style');
  estilo.id = 'grana-foco';
  estilo.textContent = `
    :focus-visible {
      outline: 2px solid ${theme.accent2};
      outline-offset: 2px;
      border-radius: 4px;
    }
    /* Clique de mouse não deixa anel para trás. */
    :focus:not(:focus-visible) { outline: none; }
  `;
  document.head.appendChild(estilo);
}
