import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { usePrivacy } from '@/lib/privacy-context';

/**
 * Modo privacidade: em vez de trocar os dígitos por "•" (que só disfarça o
 * texto, não borra de verdade), envolve o valor num BlurView real por cima
 * — o número continua lá embaixo, só fica ilegível. Funciona nativo e web
 * (expo-blur usa backdrop-filter no navegador).
 *
 * O blur nativo sozinho (Android em especial) fica fraco demais em textos
 * grandes/negrito — o desfoque não é forte o bastante pra tornar dígitos
 * grandes ilegíveis, mesmo em intensidade alta. Por isso soma-se um véu
 * semi-opaco por cima do blur: o blur cuida do efeito visual "vidro fosco",
 * o véu garante que o valor fique realmente ilegível em qualquer plataforma.
 */
export default function PrivacyValue({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { hidden } = usePrivacy();
  return (
    <View style={[styles.wrap, style]}>
      {children}
      {hidden && (
        <>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', alignSelf: 'flex-start', overflow: 'hidden', borderRadius: 4 },
  scrim: { backgroundColor: 'rgba(5,34,41,0.6)' },
});
