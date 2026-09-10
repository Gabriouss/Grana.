import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, radius, spacing, fonts, type, lh } from '@/lib/theme';
import { assinarModoOffline, estaServindoDoCache } from '@/lib/cache-de-tela';

/**
 * Avisa que a tela está mostrando dado guardado, não dado de agora.
 *
 * Sem este aviso, o cache offline seria uma piora disfarçada de melhora: o
 * saldo de ontem apareceria com a mesma cara do saldo de agora, e a pessoa
 * tomaria decisão de dinheiro sobre número velho sem saber. Mostrar o número
 * antigo é útil; mostrar o número antigo em silêncio, não.
 *
 * O desenho é o mesmo que a tela de Lançamentos já usava desde a primeira fila
 * offline — este componente existe para as outras cinco telas não
 * reinventarem a peça, que é como a barra de cabeçalho já tinha virado quatro
 * tratamentos diferentes antes do `ScreenHeader`.
 */
export function useModoOffline(): boolean {
  const [offline, setOffline] = useState(estaServindoDoCache);
  useEffect(() => assinarModoOffline(setOffline), []);
  return offline;
}

export default function FaixaOffline({ estilo }: { estilo?: object }) {
  const offline = useModoOffline();
  if (!offline) return null;
  return (
    <View
      style={[styles.faixa, estilo]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="cloud-offline-outline" size={13} color={theme.inkFaint} />
      <Text style={styles.texto} numberOfLines={1}>
        Sem conexão — mostrando dados salvos no aparelho
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  faixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.icone,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.rule,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.icone,
  },
  texto: {
    color: theme.inkFaint,
    fontSize: type.legenda,
    lineHeight: lh(type.legenda, 'apoio'),
    flexShrink: 1,
    fontFamily: fonts.light,
  },
});
