import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing, radius, fonts, type } from '@/lib/theme';
import { colunaFormulario } from '@/lib/breakpoints';
import AppPressable from '@/components/AppPressable';
import TextoComLinks from '@/components/TextoComLinks';
import type { DocumentoLegal } from '@/lib/legal-content';

type Props = { doc: DocumentoLegal };

/** Renderizador único pra Termos, Privacidade e Exclusão de dados — ver lib/legal-content.ts. */
export default function LegalDocScreen({ doc }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.cabecalho, { paddingTop: insets.top + spacing.sm }]}>
        <AppPressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={theme.ink} />
        </AppPressable>
      </View>
      <ScrollView contentContainerStyle={[styles.scroll, colunaFormulario, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <Text style={styles.titulo}>{doc.titulo}</Text>
        <Text style={styles.atualizado}>Última atualização: {doc.atualizadoEm}</Text>

        {doc.blocos.map((bloco, i) => {
          if (bloco.tipo === 'subtitulo') {
            return (
              <Text key={i} style={styles.subtitulo}>
                {bloco.texto}
              </Text>
            );
          }
          if (bloco.tipo === 'paragrafo') {
            return <TextoComLinks key={i} texto={bloco.texto} style={styles.paragrafo} linkStyle={styles.link} />;
          }
          if (bloco.tipo === 'lista') {
            return (
              <View key={i} style={styles.lista}>
                {bloco.itens.map((item, j) => (
                  <View key={j} style={styles.itemLista}>
                    <Text style={styles.marcador}>—</Text>
                    <TextoComLinks texto={item} style={styles.paragrafoEmLista} linkStyle={styles.link} />
                  </View>
                ))}
              </View>
            );
          }
          // 'passos' — lista numerada, usada só na página de exclusão de dados.
          return (
            <View key={i} style={styles.caixaPassos}>
              {bloco.itens.map((item, j) => (
                <View key={j} style={styles.itemLista}>
                  <Text style={styles.marcador}>{j + 1}.</Text>
                  <TextoComLinks texto={item} style={styles.paragrafoEmLista} linkStyle={styles.link} />
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.paper },
  cabecalho: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  scroll: { paddingHorizontal: spacing.xl },
  titulo: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular, marginBottom: spacing.xs },
  atualizado: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, marginBottom: spacing.xl },
  subtitulo: {
    color: theme.ink,
    fontSize: type.corpo,
    fontFamily: fonts.regular,
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.rule,
  },
  paragrafo: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: 21, fontFamily: fonts.light, marginTop: spacing.sm },
  // Mesma tipografia do parágrafo solto, mas sem o próprio marginTop — o
  // espaçamento entre itens vem de `itemLista`, e o `flex: 1` deixa o texto
  // quebrar linha usando o espaço que sobra ao lado do marcador.
  paragrafoEmLista: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: 21, fontFamily: fonts.light, flex: 1 },
  link: { color: theme.accent2, fontFamily: fonts.regular },
  lista: { marginTop: spacing.xs },
  caixaPassos: {
    marginTop: spacing.sm,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  itemLista: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, alignItems: 'flex-start' },
  marcador: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.regular },
});
