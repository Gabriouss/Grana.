import { View } from 'react-native';

type Props = {
  /** Sempre em rgba com o alfa já embutido — nunca opacity separado, porque
      opacity opacificaria o blur inteiro (inclusive a borda do círculo, que
      deve sumir gradualmente) em vez de só a cor. */
  cor: string;
  tamanho?: number;
  top?: number;
  left?: number | string;
  right?: number;
  bottom?: number;
};

/**
 * Um círculo de luz ambiente, borrado, atrás do conteúdo — a peça que tira a
 * página de "cor chapada com cards em cima" e coloca uma atmosfera por trás.
 * Web-only por natureza: `radial-gradient`/`filter: blur` não existem no
 * StyleSheet do React Native, só no CSS que o react-native-web gera —
 * mesmo raciocínio de `as any` já usado em RevealOnScroll e no cabeçalho
 * flutuante de _layout.tsx. Esta página inteira (app/index.tsx) só renderiza
 * na web, então não existe caminho nativo pra proteger aqui.
 */
export default function GlowOrb({ cor, tamanho = 640, top, left, right, bottom }: Props) {
  return (
    <View
      pointerEvents="none"
      style={
        {
          position: 'absolute',
          top,
          left,
          right,
          bottom,
          width: tamanho,
          height: tamanho,
          borderRadius: tamanho / 2,
          backgroundImage: `radial-gradient(circle, ${cor} 0%, transparent 70%)`,
          filter: 'blur(70px)',
        } as any
      }
    />
  );
}
