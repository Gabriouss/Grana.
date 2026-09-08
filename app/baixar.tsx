import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppPressable from '@/components/AppPressable';
import { colunaFormulario } from '@/lib/breakpoints';
import { obterUrlDownloadAndroid } from '@/lib/download-app';
import { fonts, lh, radius, spacing, theme, type } from '@/lib/theme';

export default function BaixarApp() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [erro, setErro] = useState<string | null>(null);
  const urlDownload = obterUrlDownloadAndroid();

  async function baixar() {
    if (!urlDownload) return;
    setErro(null);
    try {
      await Linking.openURL(urlDownload);
    } catch {
      setErro('Não conseguimos abrir o download. Tente novamente ou fale com a gente.');
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.rolagem}
        contentContainerStyle={[styles.rolagemConteudo, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
      >
        <View style={[styles.content, colunaFormulario]}>
          <View style={styles.iconeMarca} accessibilityElementsHidden>
            <Text style={styles.iconeMarcaTexto}>G</Text>
          </View>
          <Text style={styles.eyebrow}>GRANA. PARA ANDROID</Text>
          <Text style={styles.title}>Seu dinheiro cabe no bolso.</Text>
          <Text style={styles.subtitle}>
            Baixe o aplicativo oficial, entre na sua conta e registre seus lançamentos do jeito que combina com você — por voz, texto ou foto.
          </Text>

          <View style={styles.card}>
            <View style={styles.linhaIcone}>
              <Ionicons name="download-outline" size={22} color={theme.accent2} />
              <View style={styles.linhaTexto}>
                <Text style={styles.cardTitulo}>Aplicativo Android</Text>
                <Text style={styles.cardTexto}>Instalação direta e atualização avisada dentro do app.</Text>
              </View>
            </View>

            {urlDownload ? (
              <AppPressable
                accessibilityRole="button"
                onPress={baixar}
                style={({ hovered }) => [styles.primaryBtn, hovered && styles.primaryBtnHover]}
              >
                <Ionicons name="download-outline" size={18} color={theme.paper} />
                <Text style={styles.primaryBtnText}>Baixar aplicativo</Text>
              </AppPressable>
            ) : (
              <View style={styles.indisponivel}>
                <Ionicons name="time-outline" size={18} color={theme.inkFaint} />
                <Text style={styles.indisponivelTexto}>O download está sendo preparado. Fale com a gente para receber o acesso.</Text>
              </View>
            )}

            {erro ? <Text style={styles.erro}>{erro}</Text> : null}
          </View>

          <View style={styles.passos}>
            <Text style={styles.sectionTitle}>Depois de baixar</Text>
            <Passo numero="1" texto="Abra o arquivo baixado e autorize a instalação quando o Android pedir." />
            <Passo numero="2" texto="Abra o Grana. e entre ou crie sua conta." />
            <Passo numero="3" texto="Sua assinatura será reconhecida automaticamente. Se precisar, use o link de ativação recebido por e-mail." />
          </View>

          <AppPressable
            accessibilityRole="link"
            onPress={() => router.push('/ativar')}
            style={({ hovered }) => [styles.secondaryBtn, hovered && styles.secondaryBtnHover]}
          >
            <Text style={styles.secondaryBtnText}>Já tenho uma assinatura</Text>
            <Ionicons name="arrow-forward" size={17} color={theme.accent2} />
          </AppPressable>

          <Text style={styles.rodape}>
            O Grana. não conecta sua conta bancária. Seus dados ficam vinculados à sua conta e podem ser excluídos quando você quiser.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Passo({ numero, texto }: { numero: string; texto: string }) {
  return (
    <View style={styles.passo}>
      <View style={styles.numero}>
        <Text style={styles.numeroTexto}>{numero}</Text>
      </View>
      <Text style={styles.passoTexto}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.paper },
  rolagem: { flex: 1 },
  rolagemConteudo: { flexGrow: 1, justifyContent: 'center' },
  content: { width: '100%', paddingHorizontal: spacing.xl },
  iconeMarca: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: theme.down,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  iconeMarcaTexto: { color: theme.paper, fontSize: 28, fontFamily: fonts.regular },
  eyebrow: { color: theme.inkFaint, fontSize: type.nota, letterSpacing: 1, fontFamily: fonts.light, marginBottom: spacing.xs },
  title: { color: theme.ink, fontSize: type.cabecalho, lineHeight: lh(type.cabecalho, 'titulo'), fontFamily: fonts.regular, marginBottom: spacing.md },
  subtitle: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.light, marginBottom: spacing.xl },
  card: { backgroundColor: theme.paperRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.ruleStrong, padding: spacing.lg, marginBottom: spacing.xxl },
  linhaIcone: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.lg },
  linhaTexto: { flex: 1 },
  cardTitulo: { color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular, marginBottom: spacing.xs },
  cardTexto: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.light },
  primaryBtn: { minHeight: 52, borderRadius: radius.md, backgroundColor: theme.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.icone, paddingHorizontal: spacing.lg },
  primaryBtnHover: { opacity: 0.88 },
  primaryBtnText: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
  indisponivel: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: theme.rule, flexDirection: 'row', alignItems: 'center', gap: spacing.icone, paddingHorizontal: spacing.md },
  indisponivelTexto: { flex: 1, color: theme.inkFaint, fontSize: type.apoio, lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.light },
  erro: { color: theme.danger, fontSize: type.legenda, fontFamily: fonts.light, marginTop: spacing.md },
  passos: { marginBottom: spacing.lg },
  sectionTitle: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular, marginBottom: spacing.md },
  passo: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  numero: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.ruleStrong, alignItems: 'center', justifyContent: 'center' },
  numeroTexto: { color: theme.accent2, fontSize: type.legenda, fontFamily: fonts.regular },
  passoTexto: { flex: 1, color: theme.inkSoft, fontSize: type.apoio, lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.light },
  secondaryBtn: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: theme.ruleStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.icone, paddingHorizontal: spacing.lg },
  secondaryBtnHover: { backgroundColor: theme.hover },
  secondaryBtnText: { color: theme.accent2, fontSize: type.apoio, fontFamily: fonts.regular },
  rodape: { color: theme.inkFaint, fontSize: type.legenda, lineHeight: lh(type.legenda, 'apoio'), fontFamily: fonts.light, textAlign: 'center', marginTop: spacing.xl },
});
