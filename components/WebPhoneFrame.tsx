import type { PropsWithChildren } from 'react';
import { Platform, View } from 'react-native';
import { theme } from '@/lib/theme';

/**
 * Preenche a janela do navegador na web e não faz nada no nativo.
 *
 * Antes isto desenhava uma "moldura de celular": o app inteiro espremido em
 * 460px no centro da página, com o resto preenchido por cinza. Fazia sentido
 * enquanto a web era só um espelho do app de celular — mostrar o layout
 * mobile esticado até 2500px seria pior do que emoldurá-lo.
 *
 * Deixou de fazer quando o layout passou a ser responsivo de verdade (ver
 * lib/breakpoints.ts): a partir de 768px a navegação vira lateral e o
 * conteúdo se reorganiza em colunas. Manter a moldura agora seria travar o
 * app abaixo do primeiro corte para sempre, e a versão desktop nunca
 * apareceria. O componente continua existindo para segurar o fundo e a
 * altura da viewport, que a web precisa e o nativo não.
 */
export default function WebPhoneFrame({ children }: PropsWithChildren) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  return <View style={webStyles.page as any}>{children}</View>;
}

const webStyles = {
  page: {
    /* 100dvh e não 100vh: no navegador de celular a barra de endereço some e
       aparece conforme a rolagem, e 100vh continua valendo a altura da tela
       com ela escondida — o rodapé fica cortado. `dvh` acompanha. */
    height: '100dvh',
    minHeight: '100dvh',
    width: '100%',
    backgroundColor: theme.paper,
    overflow: 'hidden',
  },
};
