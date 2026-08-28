import { useId, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing, fonts, type } from '@/lib/theme';
import AppPressable from '@/components/AppPressable';

type Props = {
  pergunta: string;
  resposta: string;
  estiloExtra?: object;
  abertoInicial?: boolean;
};

/** Uma linha de FAQ que abre sozinha — mantém a página de entrada curta pra quem só quer ler o essencial. */
export function FaqItem({ pergunta, resposta, estiloExtra, abertoInicial = false }: Props) {
  const [aberto, setAberto] = useState(abertoInicial);
  const respostaId = `faq-resposta-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <View style={[styles.linha, estiloExtra]}>
      <AppPressable
        style={({ hovered }) => [styles.cabecalho, hovered && styles.cabecalhoHover]}
        onPress={() => setAberto((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberto }}
        aria-expanded={aberto}
        aria-controls={respostaId}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      >
        <Text style={styles.pergunta}>{pergunta}</Text>
        <View style={styles.iconeWrapper} aria-hidden>
          <Ionicons name={aberto ? 'remove' : 'add'} size={18} color={aberto ? theme.accent2 : theme.inkSoft} />
        </View>
      </AppPressable>
      {aberto && (
        <View nativeID={respostaId} role="region" accessibilityLabel={`Resposta: ${pergunta}`}>
          <Text style={styles.resposta}>{resposta}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { borderBottomWidth: 1, borderBottomColor: theme.rule, paddingVertical: spacing.md },
  cabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    gap: spacing.md,
    ...({ cursor: 'pointer', transition: 'opacity 150ms ease' } as any),
  },
  cabecalhoHover: { opacity: 0.85 },
  iconeWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.hover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pergunta: { flex: 1, color: theme.ink, fontSize: type.corpo, lineHeight: type.corpo * 1.4, fontFamily: fonts.regular },
  resposta: {
    color: theme.inkSoft,
    fontSize: type.apoio,
    lineHeight: type.apoio * 1.6,
    fontFamily: fonts.light,
    marginTop: spacing.sm + spacing.xs,
    paddingRight: spacing.sm,
  },
});
