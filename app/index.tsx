import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing, radius, fonts, type } from '@/lib/theme';
import { colunaConteudo, colunaLeitura, useBreakpoint } from '@/lib/breakpoints';
import AppPressable from '@/components/AppPressable';
import BrandLogotype from '@/components/BrandLogotype';
import LandingHeroDemo from '@/components/LandingHeroDemo';
import { FaqItem } from '@/components/FaqItem';
import RevealOnScroll from '@/components/RevealOnScroll';
import EntradaEscalonada from '@/components/EntradaEscalonada';
import GlowOrb from '@/components/GlowOrb';

/**
 * Página pública em `/` — recebe quem nunca ouviu falar do Grana.: clique de
 * anúncio, link compartilhado, busca no Google. É por isso que ela existe
 * separada da tela de login: `sign-in.tsx` pressupõe que a pessoa já sabe o
 * que é o Grana. e só quer entrar; quem chega aqui de fora não sabe nada
 * disso, e uma tela de e-mail/senha sem contexto não converte ninguém.
 *
 * Só existe na web — no nativo o app sempre abre direto pra dentro (login ou
 * a própria conta já logada), porque quem tem o app instalado já passou
 * dessa etapa. Antes desta tela existir, `/` no nativo já caía em sign-in
 * por não haver rota nenhuma cadastrada pra raiz — o redirect abaixo só
 * torna esse comportamento explícito, sem mudar nada do que já acontecia.
 */
export default function LandingPage() {
  if (Platform.OS !== 'web') {
    return <Redirect href="/sign-in" />;
  }
  return <ConteudoWeb />;
}

/**
 * Botão + microcópia de fricção logo abaixo — repetido três vezes na página
 * de propósito (herói, meio, fechamento). Cada CTA de resposta direta reduz
 * uma objeção diferente que ainda não foi vencida: "quanto tempo leva" no
 * herói, "e agora, depois de ver como funciona" no meio, "por que ainda não
 * cliquei" no fechamento — mas o texto do BOTÃO em si fica igual nos três,
 * de propósito: repetição do mesmo verbo de ação reforça a ação, variar a
 * cada seção só confunde o que a pessoa está prestes a fazer.
 *
 * O brilho por trás do botão (boxShadow colorido, não borda) é deliberado: o
 * CTA precisa ser a coisa mais "clicável" da tela em qualquer seção onde
 * aparece — se um card de recurso e o botão de ação têm a mesma presença
 * visual, a hierarquia não está fazendo o trabalho dela.
 */
function BotaoCTA({ microcopy, estiloExtra }: { microcopy: string; estiloExtra?: object }) {
  const router = useRouter();
  return (
    <View>
      <AppPressable
        style={({ hovered }) => [styles.ctaPrimario, estiloExtra, hovered && styles.ctaPrimarioHover]}
        onPress={() => router.push('/sign-up')}
      >
        <Text style={styles.ctaPrimarioTexto}>Criar conta grátis</Text>
        <Ionicons name="arrow-forward" size={17} color={theme.paper} />
      </AppPressable>
      <Text style={styles.ctaMicrocopy}>{microcopy}</Text>
    </View>
  );
}

/**
 * Faixa de largura cheia atrás de uma seção — o jeito de dar ritmo pra uma
 * página inteira na mesma cor de fundo sem inventar cor nova: alterna entre
 * o `paper` base e o `paperRaised` que todo card já usa, igual zebra de
 * tabela. `colunaConteudo` continua limitando o CONTEÚDO; é só o FUNDO que
 * vai de ponta a ponta da janela.
 */
function FaixaFundo({ levantada, children }: { levantada?: boolean; children: React.ReactNode }) {
  return (
    <View style={levantada && styles.bandaLevantada}>
      <View style={[colunaConteudo, styles.faixa]}>{children}</View>
    </View>
  );
}

const BENEFICIOS_HERO = [
  'Fala ou manda áudio — nada de digitar',
  'Categoriza sozinho, na hora',
  'Mostra quanto sobra pra gastar hoje',
];

const CENAS_DOR = [
  'Sexta ao meio-dia, e você não sabe se sobra dinheiro pra sair à noite.',
  'A fatura chega com um valor que você jura não lembrar de ter gasto.',
  'Baixou uma planilha pra controlar tudo. Durou quatro dias.',
];

function ConteudoWeb() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { classe, ehCompacto } = useBreakpoint();
  const largura2 = ehCompacto ? '100%' : classe === 'medio' ? '48%' : '31%';

  return (
    <ScrollView style={styles.pagina} contentContainerStyle={{ paddingBottom: insets.bottom }}>
      {/* ───────── Cabeçalho ───────── */}
      <View style={[colunaConteudo, styles.faixa]}>
        <View style={[styles.cabecalho, { paddingTop: insets.top + spacing.lg }]}>
          <BrandLogotype width={104} />
          <AppPressable onPress={() => router.push('/sign-in')} hitSlop={12}>
            <Text style={styles.entrarTexto}>Entrar</Text>
          </AppPressable>
        </View>
      </View>

      {/* ───────── Hero — o momento de assinatura da página ───────── */}
      <View style={styles.palcoHero}>
        <GlowOrb cor="rgba(31,169,141,0.35)" tamanho={720} top={-260} left={-160} />
        <GlowOrb cor="rgba(174,255,227,0.16)" tamanho={520} top={-80} right={-120} />
        <View style={[colunaConteudo, styles.faixa]}>
          <View style={[styles.hero, ehCompacto && styles.heroCompacto]}>
            <View style={[colunaLeitura, !ehCompacto && styles.heroTexto, ehCompacto && { alignItems: 'flex-start' }]}>
              <EntradaEscalonada atraso={0}>
                <Text style={styles.eyebrow}>Acesso antecipado</Text>
              </EntradaEscalonada>
              <EntradaEscalonada atraso={70}>
                <Text style={[styles.headline, ehCompacto && styles.headlineCompacto]}>Cadê meu dinheiro?</Text>
              </EntradaEscalonada>
              <EntradaEscalonada atraso={150}>
                <Text style={styles.subheadline}>
                  Todo mês a mesma cena: o extrato fecha e você não faz ideia de pra onde foi. O Grana.
                  resolve isso antes de virar problema — fala ou manda um áudio no WhatsApp, e o
                  lançamento aparece organizado sozinho.
                </Text>
              </EntradaEscalonada>

              <EntradaEscalonada atraso={230}>
                <View style={styles.listaBeneficios}>
                  {BENEFICIOS_HERO.map((b) => (
                    <View key={b} style={styles.itemBeneficio}>
                      <Ionicons name="checkmark" size={16} color={theme.accent2} />
                      <Text style={styles.textoBeneficio}>{b}</Text>
                    </View>
                  ))}
                </View>
              </EntradaEscalonada>

              <EntradaEscalonada atraso={310}>
                <BotaoCTA microcopy="Leva 30 segundos. Sem cartão de crédito." />
              </EntradaEscalonada>
            </View>

            <EntradaEscalonada atraso={200} style={!ehCompacto && styles.heroDemoWrap}>
              <View style={styles.heroDemoCard}>
                <Text style={styles.heroDemoRotulo}>o que acontece quando você fala</Text>
                <LandingHeroDemo />
              </View>
            </EntradaEscalonada>
          </View>
        </View>
      </View>

      {/* ───────── Reconhece isso? (dor, antes da solução) ───────── */}
      <RevealOnScroll>
      <View style={[colunaConteudo, styles.faixa]}>
        <View style={[styles.secao, colunaLeitura]}>
          <Text style={styles.secaoEyebrow}>Reconhece isso?</Text>
          <Text style={styles.secaoTitulo}>Não é falta de disciplina. É que anotar dá trabalho.</Text>
          <View style={styles.listaCenas}>
            {CENAS_DOR.map((c) => (
              <View key={c} style={styles.itemCena}>
                <View style={styles.marcadorCena} />
                <Text style={styles.textoCena}>{c}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.pontePergunta}>O Grana. não pede mais disciplina. Pede só que você fale.</Text>
        </View>
      </View>
      </RevealOnScroll>

      {/* ───────── Como entra o lançamento ───────── */}
      <RevealOnScroll>
      <FaixaFundo levantada>
        <View style={styles.secao}>
          <Text style={styles.secaoEyebrow}>A parte que você não vai adiar</Text>
          <Text style={styles.secaoTitulo}>O único esforço é lembrar que o gasto existe</Text>

          <View style={styles.grid}>
            {[
              {
                icone: 'mic-outline' as const,
                titulo: 'Voz, dentro do app',
                texto: 'Toque no microfone e fale como fala com alguém: "gastei 30 no mercado". O Grana. entende valor, nome e categoria sozinho.',
              },
              {
                icone: 'logo-whatsapp' as const,
                titulo: 'Texto ou áudio no WhatsApp',
                texto: 'Manda uma mensagem — escrita ou falada — pro número do Grana. e o lançamento aparece no app. Sem abrir nada.',
              },
              {
                icone: 'qr-code-outline' as const,
                titulo: 'Foto da nota fiscal',
                texto: 'Aponta a câmera pro QR Code da nota (NFC-e) e cada item da compra vira lançamento, já categorizado.',
              },
            ].map((f) => (
              <View key={f.titulo} style={[styles.cardFeature, { flexBasis: largura2 }]}>
                <View style={styles.featureIconeCirculo}>
                  <Ionicons name={f.icone} size={18} color={theme.accent2} />
                </View>
                <Text style={styles.featureTitulo}>{f.titulo}</Text>
                <Text style={styles.featureTexto}>{f.texto}</Text>
              </View>
            ))}
          </View>

          <View style={styles.ctaMeio}>
            <Text style={styles.ctaMeioTitulo}>Pronto pra parar de perder a conta?</Text>
            <BotaoCTA microcopy="Grátis enquanto o Grana. está em acesso antecipado." />
          </View>
        </View>
      </FaixaFundo>
      </RevealOnScroll>

      {/* ───────── Inteligência financeira ───────── */}
      <RevealOnScroll>
      <View style={[colunaConteudo, styles.faixa]}>
        <View style={[styles.secao, styles.secaoComCartao]}>
          <View style={colunaLeitura}>
            <Text style={styles.secaoEyebrow}>Depois que o lançamento existe</Text>
            <Text style={styles.secaoTitulo}>Ele não só guarda. Avisa antes de você se apertar.</Text>
            <Text style={styles.secaoTexto}>
              Não é só uma lista de gastos. O card de <Text style={styles.destaqueInline}>Livre para Gastar</Text>{' '}
              soma o que ainda falta pagar no mês e mostra quanto sobra por dia, sem susto. A linha do tempo de
              compromissos futuros junta parcelas do cartão e contas fixas, pra nada pegar de surpresa lá na
              frente.
            </Text>
          </View>

          <View style={styles.mockSafeToSpend}>
            <Text style={styles.mockRotulo}>Livre para gastar hoje</Text>
            <Text style={styles.mockValor}>R$ 48,00</Text>
            <Text style={styles.mockLegenda}>até o fim do mês, considerando contas e parcelas já agendadas</Text>
          </View>
        </View>
      </View>
      </RevealOnScroll>

      {/* ───────── Segurança e confiança ───────── */}
      <RevealOnScroll>
      <FaixaFundo levantada>
        <View style={styles.secao}>
          <Text style={styles.secaoEyebrow}>A pergunta que todo mundo faz</Text>
          <Text style={styles.secaoTitulo}>"Tá, mas é seguro dar meus gastos pra um app?"</Text>
          <Text style={styles.secaoTexto}>
            Faz sentido perguntar. Aqui está exatamente o que a gente faz — e o que a gente nunca faz.
          </Text>

          <View style={styles.grid}>
            {[
              { icone: 'lock-closed-outline' as const, texto: 'Cada conta só enxerga os próprios dados — reforçado no banco, não só na tela.' },
              { icone: 'finger-print-outline' as const, texto: 'Bloqueio por biometria ou senha do aparelho, se você ativar.' },
              { icone: 'eye-off-outline' as const, texto: 'Modo privacidade oculta os valores da tela com um toque.' },
              { icone: 'shield-checkmark-outline' as const, texto: 'Sua senha é conferida contra vazamentos conhecidos no cadastro.' },
              { icone: 'ban-outline' as const, texto: 'O Grana. não movimenta dinheiro de verdade — é registro, não pagamento.' },
              { icone: 'megaphone-outline' as const, texto: 'Sem anúncio, sem venda de dado. O que você registra é seu.' },
            ].map((s) => (
              <View key={s.texto} style={[styles.cardSeguranca, { flexBasis: largura2 }]}>
                <Ionicons name={s.icone} size={18} color={theme.inkSoft} />
                <Text style={styles.segurancaTexto}>{s.texto}</Text>
              </View>
            ))}
          </View>
        </View>
      </FaixaFundo>
      </RevealOnScroll>

      {/* ───────── FAQ ───────── */}
      <RevealOnScroll>
      <View style={[colunaConteudo, styles.faixa]}>
        <View style={[styles.secao, colunaLeitura]}>
          <Text style={styles.secaoEyebrow}>Perguntas diretas</Text>
          <Text style={styles.secaoTitulo}>Sem letra miúda</Text>

          <View style={styles.faqLista}>
            <FaqItem
              pergunta="O Grana. puxa meu extrato do banco sozinho?"
              resposta="Não. O Grana. não se conecta ao seu banco — você registra por voz, por texto, pelo WhatsApp ou apontando a câmera pra nota, e ele organiza. É mais rápido de registrar do que de conectar uma conta bancária, e você nunca compartilha senha de banco com ninguém."
            />
            <FaqItem
              pergunta="O Grana. movimenta meu dinheiro?"
              resposta="Não. O Grana. é um registro — não é uma instituição financeira, não processa pagamento nenhum. Ele mostra pra onde seu dinheiro foi, com base no que você mesmo conta pra ele."
            />
            <FaqItem
              pergunta="É seguro?"
              resposta="Cada conta só acessa os próprios dados, reforçado no banco de dados (não só na tela). A sessão fica criptografada no aparelho, e telas com valor bloqueiam print. Detalhes completos na Política de Privacidade."
            />
            <FaqItem
              pergunta="Preciso instalar alguma coisa?"
              resposta="Não pra começar — o Grana. roda no navegador, neste mesmo endereço. Uma versão para Android e iOS está a caminho."
            />
            <FaqItem
              pergunta="É pago?"
              resposta="O Grana. está em fase de acesso antecipado — criar conta é livre agora. Um plano pago está a caminho; quem já usa é avisado antes de qualquer cobrança começar."
            />
          </View>
        </View>
      </View>
      </RevealOnScroll>

      {/* ───────── CTA final ───────── */}
      <RevealOnScroll>
      <View style={styles.palcoCtaFinal}>
        <GlowOrb cor="rgba(31,169,141,0.22)" tamanho={620} top={-200} left="50%" />
        <View style={[colunaConteudo, styles.faixa]}>
          <View style={[styles.ctaFinal, colunaLeitura]}>
            <Text style={styles.ctaFinalTitulo}>Você vai continuar se perguntando "cadê meu dinheiro" até quando?</Text>
            <BotaoCTA microcopy="Grátis enquanto o Grana. está em acesso antecipado." estiloExtra={styles.ctaFinalBotao} />
          </View>
        </View>
      </View>
      </RevealOnScroll>

      {/* ───────── Rodapé ───────── */}
      <View style={[colunaConteudo, styles.faixa]}>
        <View style={styles.rodape}>
          <BrandLogotype width={72} />
          <View style={styles.rodapeLinks}>
            <AppPressable onPress={() => router.push('/termos')}>
              <Text style={styles.rodapeLink}>Termos de Uso</Text>
            </AppPressable>
            <AppPressable onPress={() => router.push('/privacidade')}>
              <Text style={styles.rodapeLink}>Privacidade</Text>
            </AppPressable>
            <AppPressable onPress={() => router.push('/exclusao-de-dados')}>
              <Text style={styles.rodapeLink}>Excluir dados</Text>
            </AppPressable>
          </View>
          <Text style={styles.rodapeContato}>gbr.design30@gmail.com</Text>
        </View>
      </View>
    </ScrollView>
  );
}

/* Sombra de verdade (boxShadow), não só borda — `as any` porque `boxShadow`
   não existe no tipo ViewStyle do React Native, só no CSS que o
   react-native-web gera. Esta página só renderiza na web (ver o redirect no
   topo do arquivo), então não há caminho nativo perdendo o efeito. */
const sombraCard = { boxShadow: '0 16px 40px -12px rgba(0,0,0,0.5)' } as any;
const sombraHero = { boxShadow: '0 32px 80px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(174,255,227,0.07)' } as any;

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: theme.paper },
  faixa: { paddingHorizontal: spacing.xl },
  bandaLevantada: { backgroundColor: theme.paperRaised },

  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: spacing.lg },
  entrarTexto: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.light },

  // `overflow: hidden` prende os GlowOrb dentro do herói — sem isso, o brilho
  // borrado vazaria por baixo das seções seguintes e criaria uma faixa de luz
  // fantasma na altura errada da página.
  palcoHero: { position: 'relative', overflow: 'hidden' },
  palcoCtaFinal: { position: 'relative', overflow: 'hidden' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxl, paddingTop: spacing.xxl, paddingBottom: spacing.xxl },
  heroCompacto: { flexDirection: 'column', alignItems: 'stretch' },
  /* Só entra quando o hero está em linha (lado a lado com o card de demo) —
     `flex: 1` reparte a largura entre os dois. Empilhado (ehCompacto), o
     mesmo flex passaria a valer para a ALTURA dentro do ScrollView, que não
     tem altura definida no eixo de rolagem — o texto cortava no meio da
     frase e o botão "Criar minha conta" desaparecia, sem erro nenhum. */
  heroTexto: { flex: 1 },
  eyebrow: { color: theme.accent2, fontSize: type.legenda, letterSpacing: 1, fontFamily: fonts.regular, marginBottom: spacing.md, textTransform: 'uppercase' },
  // Escala bem acima do resto da tipografia do app de propósito — esta é a
  // única frase que precisa ser lida antes de qualquer outra coisa na
  // página, e o tamanho tem que dizer isso antes mesmo do conteúdo.
  headline: { color: theme.ink, fontSize: 80, lineHeight: 80, letterSpacing: -2, fontFamily: fonts.regular, marginBottom: spacing.lg },
  headlineCompacto: { fontSize: 44, lineHeight: 46, letterSpacing: -1 },
  subheadline: { color: theme.inkSoft, fontSize: type.destaque, lineHeight: type.destaque * 1.5, fontFamily: fonts.light, marginBottom: spacing.xl, maxWidth: 520 },

  ctaPrimario: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: theme.accent,
    borderRadius: radius.pill,
    paddingVertical: 16,
    paddingHorizontal: spacing.xl + spacing.xs,
    ...({ boxShadow: '0 10px 32px -8px rgba(31,169,141,0.6)', transitionProperty: 'box-shadow, transform', transitionDuration: '180ms' } as any),
  },
  ctaPrimarioHover: {
    ...({ boxShadow: '0 14px 40px -6px rgba(31,169,141,0.8)', transform: [{ translateY: -2 }] } as any),
  },
  ctaPrimarioTexto: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
  // Fica sob TODO botão de CTA — reduz a maior fricção não dita ("quanto
  // tempo vou perder", "vão me cobrar") no exato instante em que a pessoa
  // está decidindo clicar, em vez de deixar a resposta só no FAQ lá embaixo.
  ctaMicrocopy: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, marginTop: spacing.sm },

  listaBeneficios: { gap: spacing.sm, marginBottom: spacing.xl },
  itemBeneficio: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  textoBeneficio: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.light },

  listaCenas: { gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.lg },
  itemCena: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  marcadorCena: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.down, marginTop: 9 },
  textoCena: { flex: 1, color: theme.inkSoft, fontSize: type.corpo, lineHeight: 22, fontFamily: fonts.light },
  // "down" (a mesma cor de saída/gasto usada no resto do app) marca a dor;
  // a ponte de volta pra solução já usa o accent2 da marca — a paleta muda
  // de tom no exato lugar onde a copy muda de tom.
  pontePergunta: { color: theme.accent2, fontSize: type.destaque, fontFamily: fonts.regular },

  ctaMeio: {
    marginTop: spacing.xxl,
    alignItems: 'center',
    paddingTop: spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: theme.ruleStrong,
  },
  ctaMeioTitulo: { color: theme.ink, fontSize: type.destaque, fontFamily: fonts.regular, marginBottom: spacing.lg, textAlign: 'center' },

  heroDemoWrap: { flex: 1, minWidth: 300 },
  heroDemoCard: {
    backgroundColor: theme.paperRaised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    padding: spacing.xl,
    ...sombraHero,
  },
  heroDemoRotulo: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, marginBottom: spacing.lg },

  secao: { paddingVertical: spacing.xxl },
  secaoComCartao: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxl, flexWrap: 'wrap' },
  secaoEyebrow: { color: theme.accent2, fontSize: type.legenda, letterSpacing: 1, fontFamily: fonts.regular, textTransform: 'uppercase', marginBottom: spacing.xs },
  secaoTitulo: { color: theme.ink, fontSize: type.cabecalho + 4, fontFamily: fonts.regular, marginBottom: spacing.lg, maxWidth: 640 },
  secaoTexto: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: 23, fontFamily: fonts.light },
  destaqueInline: { color: theme.accent2, fontFamily: fonts.regular },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.sm },

  cardFeature: {
    backgroundColor: theme.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.lg,
    ...sombraCard,
  },
  featureIconeCirculo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  featureTitulo: { color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular, marginBottom: spacing.xs },
  featureTexto: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: 20, fontFamily: fonts.light },

  mockSafeToSpend: {
    backgroundColor: theme.paperRaised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    padding: spacing.xl,
    minWidth: 260,
    flexGrow: 1,
    ...sombraCard,
  },
  mockRotulo: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, marginBottom: spacing.xs },
  mockValor: { color: theme.up, fontSize: type.valor + 6, fontFamily: fonts.regular, marginBottom: spacing.xs },
  mockLegenda: { color: theme.inkSoft, fontSize: type.legenda, lineHeight: 17, fontFamily: fonts.light },

  cardSeguranca: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  segurancaTexto: { flex: 1, color: theme.inkSoft, fontSize: type.apoio, lineHeight: 20, fontFamily: fonts.light },

  faqLista: { marginTop: spacing.sm },

  ctaFinal: { alignSelf: 'center', alignItems: 'center', paddingVertical: spacing.xxl * 1.5, gap: spacing.xl },
  ctaFinalTitulo: { color: theme.ink, fontSize: type.destaque + 4, lineHeight: (type.destaque + 4) * 1.3, fontFamily: fonts.regular, textAlign: 'center' },
  ctaFinalBotao: { alignSelf: 'center' },

  rodape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingVertical: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: theme.rule,
  },
  rodapeLinks: { flexDirection: 'row', gap: spacing.lg },
  rodapeLink: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  rodapeContato: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
});
