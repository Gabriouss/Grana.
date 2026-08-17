import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { brand, theme, fonts } from '@/lib/theme';

/**
 * A assinatura "Grana." dos cabeçalhos.
 *
 * Antes cada tela escrevia o nome como texto solto, então o ponto herdava a
 * cor do título e a marca aparecia em duas versões ligeiramente diferentes.
 * Aqui ele é sempre `brand.dot` — a regra da identidade é que o ponto seja o
 * contraste do texto, e contra o off-white de `theme.ink` esse contraste é o
 * menta.
 *
 * Uma ressalva registrada na auditoria do design system: isto é **texto em
 * Neue Machina, não o logotipo desenhado**. No logotipo real o G é o próprio
 * símbolo da marca, nunca tipografia. Tratamos o cabeçalho como título de
 * interface; se um dia ele precisar ser a assinatura de verdade, o caminho é
 * trocar por design-system/marca/logotipo-*.svg como imagem.
 */
export default function BrandLogo({
  size = 26,
  style,
}: {
  size?: number;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[styles.base, { fontSize: size }, style]}>
      Grana<Text style={styles.dot}>.</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { color: theme.ink, fontFamily: fonts.light },
  dot: { color: brand.dot },
});
