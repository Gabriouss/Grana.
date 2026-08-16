import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { usePrivacy } from '@/lib/privacy-context';

/**
 * Modo privacidade — mesma técnica do protótipo (grana-app-preview.html:
 * `.stage.privacy-on .money { filter: blur(7px) }`): um blur de verdade
 * aplicado no próprio elemento, e não uma camada opaca por cima.
 *
 * Isso agora é possível também no app nativo: o React Native suporta o
 * style `filter` com `blur()` no Android 12+ rodando New Architecture
 * (padrão no SDK 57), e o react-native-web traduz direto pro filtro CSS.
 * Nesses dois casos usamos exatamente o blur(7px) do protótipo — nada de
 * véu escuro por cima, por isso o valor fica borrado de verdade em vez de
 * virar um retângulo.
 *
 * No iOS o RN não expõe `blur()` (só brightness/opacity), então lá cai no
 * BlurView do expo-blur com um véu leve por cima pra garantir que números
 * grandes fiquem realmente ilegíveis.
 */
const CSS_BLUR = 'blur(7px)';
const SUPPORTS_CSS_BLUR = Platform.OS === 'web' || Platform.OS === 'android';

export default function PrivacyValue({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { hidden } = usePrivacy();

  if (SUPPORTS_CSS_BLUR) {
    // Sem overflow:hidden aqui — o blur precisa "vazar" um pouco além do
    // texto pra parecer desfoque, e não recorte.
    return (
      <View style={[styles.base, style, hidden ? ({ filter: CSS_BLUR } as ViewStyle) : null]}>
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.base, styles.clip, style]}>
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
  base: { position: 'relative', alignSelf: 'flex-start' },
  clip: { overflow: 'hidden', borderRadius: 6 },
  scrim: {
    backgroundColor: 'rgba(5,34,41,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(175,255,227,0.18)',
    borderRadius: 6,
  },
});
