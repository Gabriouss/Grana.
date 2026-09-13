import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, radius, spacing, fonts, type, lh } from '@/lib/theme';
import { assinarDadoNovo, assinarModoOffline, estaServindoDoCache, motivoDoModoOffline, type MotivoOffline } from '@/lib/cache-de-tela';

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

/** O motivo, para o texto não afirmar "sem conexão" a quem só está lento. */
export function useMotivoOffline(): MotivoOffline | null {
  const [motivo, setMotivo] = useState(motivoDoModoOffline);
  useEffect(() => assinarModoOffline(() => setMotivo(motivoDoModoOffline())), []);
  return motivo;
}

/** Texto único da faixa, para Lançamentos e as outras telas dizerem o mesmo. */
export function textoDaFaixaOffline(motivo: MotivoOffline | null): string {
  return motivo === 'lento'
    ? 'Conexão lenta, mostrando dados salvos no aparelho'
    : 'Sem conexão, mostrando dados salvos no aparelho';
}

/**
 * Recarrega a tela quando uma resposta que tinha perdido o prazo chega.
 *
 * Sem isto a tela ficava presa no dado velho e na faixa acesa, porque a
 * resposta nova ia só para o disco. A recarga encontra o dado atrasado em
 * memória e devolve na hora, então funciona mesmo com a rede ainda lenta.
 * A função é lida por ref para a tela não precisar memoizar nada.
 */
export function useRecarregarAoChegarDadoNovo(recarregar: () => void) {
  const ref = useRef(recarregar);
  ref.current = recarregar;
  useEffect(() => assinarDadoNovo(() => ref.current()), []);
}

export default function FaixaOffline({ estilo }: { estilo?: object }) {
  const motivo = useMotivoOffline();
  if (!motivo) return null;
  return (
    <View
      style={[styles.faixa, estilo]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="cloud-offline-outline" size={13} color={theme.inkFaint} />
      <Text style={styles.texto} numberOfLines={1}>
        {textoDaFaixaOffline(motivo)}
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
