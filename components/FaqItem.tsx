import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing, fonts, type } from '@/lib/theme';
import AppPressable from '@/components/AppPressable';

type Props = { pergunta: string; resposta: string };

/** Uma linha de FAQ que abre sozinha — mantém a página de entrada curta pra quem só quer ler o essencial. */
export function FaqItem({ pergunta, resposta }: Props) {
  const [aberto, setAberto] = useState(false);

  return (
    <View style={styles.linha}>
      <AppPressable
        style={styles.cabecalho}
        onPress={() => setAberto((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberto }}
      >
        <Text style={styles.pergunta}>{pergunta}</Text>
        <Ionicons name={aberto ? 'remove' : 'add'} size={18} color={theme.inkSoft} />
      </AppPressable>
      {aberto && <Text style={styles.resposta}>{resposta}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { borderBottomWidth: 1, borderBottomColor: theme.rule, paddingVertical: spacing.md },
  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  pergunta: { flex: 1, color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular },
  resposta: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: 21, fontFamily: fonts.light, marginTop: spacing.sm, paddingRight: spacing.xl },
});
