import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { usePrivacy } from '@/lib/privacy-context';
import { fonts, theme } from '@/lib/theme';

/**
 * Remove valores sensíveis da renderização quando o modo privacidade está
 * ativo. Um blur isolado não protege leitor de tela, seleção, cópia ou DOM.
 */
export default function PrivacyValue({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { hidden } = usePrivacy();

  if (hidden) {
    return (
      <View style={[styles.base, styles.oculto, style]} accessible accessibilityLabel="Valor oculto">
        <Text style={styles.marcador} importantForAccessibility="no">••••</Text>
      </View>
    );
  }

  return <View style={[styles.base, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { position: 'relative' },
  oculto: { minWidth: 42, justifyContent: 'center' },
  marcador: { color: theme.inkFaint, fontFamily: fonts.regular, letterSpacing: 2 },
});
