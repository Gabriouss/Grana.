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
