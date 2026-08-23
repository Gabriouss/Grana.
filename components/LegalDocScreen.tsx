import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing, radius, fonts, type } from '@/lib/theme';
import { colunaLeitura, useBreakpoint } from '@/lib/breakpoints';
import AppPressable from '@/components/AppPressable';
import BrandLogotype from '@/components/BrandLogotype';
import TextoComLinks from '@/components/TextoComLinks';
import type { DocumentoLegal } from '@/lib/legal-content';

type Props = { doc: DocumentoLegal };

/**
 * Renderizador único pra Termos, Privacidade e Exclusão de dados — ver
 * lib/legal-content.ts.
 *
 * Quem abre esta tela raramente vem de dentro do app: é o revisor da Meta
 * validando o app do WhatsApp, é o formulário de checkout da Kiwify, é
 * alguém buscando "grana política de privacidade" no Google. Por isso o
 * cabeçalho mostra a marca (ninguém que chegou por link direto tem outro
 * jeito de saber que está no lugar certo) e o corpo usa `colunaLeitura`, não
 * `colunaFormulario` — 420px é largura de campo de e-mail, não de parágrafo;
 * nesta tela ela deixava a linha quebrar a cada 4-5 palavras.
 *
 * Só no navegador, a partir do primeiro corte de largura (`!ehCompacto`), o
 * texto ganha um cartão flutuante sobre o fundo — o mesmo vocabulário visual
 * de `useSheetFlutuante` (lib/breakpoints.ts): nessa largura, conteúdo colado
 * na borda da janela lê como página quebrada, não como decisão. No celular
 * (nativo ou web estreito) o cartão some e o texto volta a ir de ponta a
 * ponta, como qualquer tela do app.
 */
export default function LegalDocScreen({ doc }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ehCompacto } = useBreakpoint();
  const flutuante = !ehCompacto; // só existe na web — ver useBreakpoint()

  return (
    <View style={styles.pagina}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <View style={[colunaLeitura, styles.coluna]}>
          <View style={[styles.cabecalho, { paddingTop: insets.top + spacing.lg }]}>
            <AppPressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              hitSlop={12}
              style={styles.voltar}
            >
              <Ionicons name="chevron-back" size={18} color={theme.inkSoft} />
              <Text style={styles.voltarTexto}>Voltar</Text>
            </AppPressable>
            <BrandLogotype width={92} />
          </View>

          <View style={[styles.corpo, flutuante && styles.corpoFlutuante]}>
            <Text style={styles.titulo}>{doc.titulo}</Text>
            <Text style={styles.atualizado}>Última atualização: {doc.atualizadoEm}</Text>

            {doc.blocos.map((bloco, i) => {
              if (bloco.tipo === 'subtitulo') {
                const m = bloco.texto.match(/^(\d+)\.\s*(.+)$/);
                return (
                  <View key={i} style={styles.subtituloLinha}>
                    {m ? (
                      <>
                        <Text style={styles.subtituloNumero}>{m[1]}</Text>
                        <Text style={styles.subtitulo}>{m[2]}</Text>
                      </>
                    ) : (
                      <Text style={styles.subtitulo}>{bloco.texto}</Text>
                    )}
                  </View>
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
                        <View style={styles.marcador} />
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
                    <View key={j} style={styles.itemPasso}>
                      <View style={styles.passoNumero}>
                        <Text style={styles.passoNumeroTexto}>{j + 1}</Text>
                      </View>
                      <TextoComLinks texto={item} style={styles.paragrafoEmLista} linkStyle={styles.link} />
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: theme.paper },
  scroll: { flexGrow: 1 },
  coluna: { flex: 1, paddingHorizontal: spacing.xl },
  cabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  voltarTexto: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.light },
  corpo: { paddingBottom: spacing.xxl },
  // Cartão flutuante — só na web, a partir do primeiro corte de largura.
  corpoFlutuante: {
    backgroundColor: theme.paperRaised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    marginBottom: spacing.xxl,
  },
  titulo: { color: theme.ink, fontSize: type.destaque, fontFamily: fonts.regular, marginBottom: spacing.xs },
  atualizado: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, marginBottom: spacing.xl },
  subtituloLinha: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.rule,
  },
  // Numeração das seções é a numeração real do documento (1., 2., 3.) — não
  // é decoração adicionada por cima; por isso ela ganha destaque de cor em
  // vez de virar um rótulo genérico "Seção X".
  subtituloNumero: { color: theme.accent2, fontSize: type.destaque, fontFamily: fonts.light },
  subtitulo: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular, flex: 1 },
  paragrafo: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: 22, fontFamily: fonts.light, marginTop: spacing.md },
  // Mesma tipografia do parágrafo solto, mas sem o próprio marginTop — o
  // espaçamento entre itens vem de `itemLista`/`itemPasso`, e o `flex: 1`
  // deixa o texto quebrar linha usando o espaço que sobra ao lado do marcador.
  paragrafoEmLista: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: 22, fontFamily: fonts.light, flex: 1 },
  link: { color: theme.accent2, fontFamily: fonts.regular },
  lista: { marginTop: spacing.sm },
  itemLista: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, alignItems: 'flex-start' },
  // Bolinha em vez de travessão: um travessão preso à fonte Light lia como
  // hífen solto flutuando longe do texto, sem peso suficiente pra marcar
  // item de lista à distância de leitura de monitor.
  marcador: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.accent2, marginTop: 8 },
  caixaPassos: {
    marginTop: spacing.md,
    backgroundColor: theme.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.lg,
    gap: spacing.md,
  },
  itemPasso: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  passoNumero: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passoNumeroTexto: { color: theme.accent2, fontSize: type.nota, fontFamily: fonts.regular },
});
