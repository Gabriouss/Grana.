import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { brand, fonts as uiFonts, lh, radius, sombraCard, spacing, theme, type } from '@/lib/theme';
import { useBreakpoint } from '@/lib/breakpoints';
import { EXEMPLO_LIVRE, emReais } from '@/lib/exemplo-landing';
import RevealOnScroll from '@/components/RevealOnScroll';

const fonts = { regular: uiFonts.brandRegular, light: uiFonts.brandLight };

/* Todas as cenas com a mesma altura: é o que põe os três títulos na mesma
   linha de base, mesmo com desenhos de alturas naturais diferentes. */
const ALTURA_CENA = 232;

/**
 * Bloco 6 da estrutura de 13 blocos: "E no seu bolso, ainda mais (mobile) —
 * widgets, lançamento por voz, foto de nota fiscal".
 *
 * O formato de três cards com a interface desenhada vem da landing feita no
 * Claude Design em 06/09/2026, que o autor apontou como um elemento de que
 * gostava ("da página 2 eu gosto desses elementos, porém precisamos
 * aprimorá-los"). O que foi aprimorado:
 *
 * - **WhatsApp saiu.** Era um dos três cards lá, e o canal está desligado
 *   desde 05/09/2026. No lugar, os widgets, que o bloco pede.
 * - **A nota fiscal parou de mentir.** Lá dizia "vira lançamento certo, sem
 *   digitar nada". O QR Code só traz o valor em nota emitida em contingência;
 *   na maioria das compras o app pede o valor. Aqui: "você confere o valor".
 * - **O widget parece widget.** O autor reprovou o desenho anterior ("não dá
 *   nem pra entender que é algo para a tela do celular"). Este mostra a TELA
 *   INICIAL: barra de status, ícones de outros apps e os dois widgets com o
 *   desenho real de `modules/grana-voice-widget/android/src/main/res/layout`
 *   — o de voz é um círculo com o degradê da marca e o rótulo "Lançar por
 *   voz", e o de Livre para Gastar é um cartão de canto 18 com as mesmas
 *   quatro linhas do nativo.
 *
 * Tudo aqui é do aplicativo de Android. Widget só existe no Android, e é o
 * que o texto de abertura do bloco diz.
 */
export default function NoSeuBolso() {
  const { ehCompacto } = useBreakpoint();
  const cards = [
    { chave: 'voz', rotulo: 'Voz', titulo: 'Fale o gasto', texto: 'Toque no microfone e diga o que gastou. O Grana. transcreve e sugere a categoria para você conferir.', cena: <CenaVoz /> },
    { chave: 'nota', rotulo: 'Nota fiscal', titulo: 'Leia o QR da nota', texto: 'Aponte a câmera para o QR Code da nota fiscal. O Grana. identifica a loja e a data na hora. O valor vem junto quando a nota carrega, e nas outras você digita antes de salvar.', cena: <CenaNota /> },
    { chave: 'widgets', rotulo: 'Widgets', titulo: 'O essencial na tela inicial', texto: 'Fale um gasto ou veja quanto sobra no mês direto da tela inicial do Android, sem abrir o aplicativo.', cena: <CenaWidgets /> },
  ];
  return (
    <View role="list" aria-label="O Grana. no aplicativo de Android" style={styles.grade}>
      {cards.map((card, i) => (
        <RevealOnScroll key={card.chave} atraso={i * 90} variante="card" style={[styles.cardPos, ehCompacto && styles.cardPosCompacto]}>
          <View role="listitem" style={styles.card}>
            <View style={styles.cena} aria-hidden>
              {card.cena}
            </View>
            <Text style={styles.rotulo}>{card.rotulo}</Text>
            <Text style={styles.titulo}>{card.titulo}</Text>
            <Text style={styles.texto}>{card.texto}</Text>
          </View>
        </RevealOnScroll>
      ))}
    </View>
  );
}

/* O microfone de dentro do app, escutando. Cor chapada (`accent2`), e não o
   degradê: dentro da interface o degradê é proibido, ele é assinatura de
   peça de marca (ver `brand` em lib/theme.ts). */
function CenaVoz() {
  const barras = [10, 22, 34, 18, 28, 12, 20];
  return (
    <View style={styles.cenaCentro}>
      <View style={styles.vozAro}>
        <View style={styles.vozBotao}>
          <Ionicons name="mic" size={26} color={theme.paper} />
        </View>
      </View>
      <View style={styles.vozBarras}>
        {barras.map((altura, i) => (
          <View key={i} style={[styles.vozBarra, { height: altura }]} />
        ))}
      </View>
      <Text style={styles.vozEstado}>Ouvindo…</Text>
      <Text style={styles.vozFala}>“cinquenta reais no mercado”</Text>
    </View>
  );
}

/* A mira da câmera: quatro cantos, e o aviso honesto por baixo. */
function CenaNota() {
  return (
    <View style={styles.cenaCentro}>
      <View style={styles.mira}>
        <View style={[styles.canto, styles.cantoSupEsq]} />
        <View style={[styles.canto, styles.cantoSupDir]} />
        <View style={[styles.canto, styles.cantoInfEsq]} />
        <View style={[styles.canto, styles.cantoInfDir]} />
        <Ionicons name="qr-code-outline" size={44} color={theme.inkFaint} />
      </View>
      <View style={styles.notaAviso}>
        <Ionicons name="checkmark-circle" size={14} color={theme.up} />
        <Text style={styles.notaAvisoTexto}>Nota lida · confira o valor</Text>
      </View>
    </View>
  );
}

/* A tela inicial do Android, com os dois widgets reais. */
function CenaWidgets() {
  return (
    <View style={styles.celular}>
      <View style={styles.statusBar}>
        <Text style={styles.statusHora}>9:41</Text>
        <View style={styles.statusIcones}>
          <Ionicons name="cellular" size={9} color={theme.inkSoft} />
          <Ionicons name="wifi" size={9} color={theme.inkSoft} />
          <Ionicons name="battery-full" size={11} color={theme.inkSoft} />
        </View>
      </View>

      {/* Fileira de cima: o widget de voz (1×1) e dois ícones de outros apps,
          que são o que faz a pessoa reconhecer uma tela inicial. */}
      <View style={styles.fileira}>
        <View style={styles.celulaApp}>
          <View style={styles.widgetVozCirculo}>
            <Ionicons name="mic" size={16} color={brand.dark} />
          </View>
          <Text style={styles.rotuloApp} numberOfLines={1}>Lançar por voz</Text>
        </View>
        <View style={styles.celulaApp}>
          <View style={styles.iconeApp} />
          <View style={styles.rotuloAppFalso} />
        </View>
        <View style={styles.celulaApp}>
          <View style={styles.iconeApp} />
          <View style={styles.rotuloAppFalso} />
        </View>
      </View>

      {/* O widget de Livre para Gastar (2 colunas), com as quatro linhas do
          nativo e os números do exemplo único da página. */}
      <View style={styles.widgetLivre}>
        <Text style={styles.widgetLivreTitulo}>Livre para gastar</Text>
        <Text style={styles.widgetLivreValor}>
          {emReais(EXEMPLO_LIVRE.porDia)}
          <Text style={styles.widgetLivreSufixo}>/dia</Text>
        </Text>
        <Text style={styles.widgetLivreApoio} numberOfLines={1}>
          {emReais(EXEMPLO_LIVRE.livreNoTotal)} no total · {EXEMPLO_LIVRE.diasRestantes} dias
        </Text>
        <Text style={styles.widgetLivreAtualizado}>Atualizado agora</Text>
      </View>

      <View style={styles.fileira}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.celulaApp}>
            <View style={styles.iconeApp} />
            <View style={styles.rotuloAppFalso} />
          </View>
        ))}
      </View>
    </View>
  );
}

const CANTO = 22;

const styles = StyleSheet.create({
  grade: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: spacing.lg, marginTop: spacing.xxl, width: '100%' },
  cardPos: { flexGrow: 1, flexBasis: '30%', minWidth: 280 },
  cardPosCompacto: { flexBasis: '100%', minWidth: 0, width: '100%' },
  card: {
    height: '100%',
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paperRaised,
    ...sombraCard,
  },
  cena: {
    height: ALTURA_CENA,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paper,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  cenaCentro: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  rotulo: { color: theme.accent2, fontSize: type.micro, lineHeight: lh(type.micro), fontFamily: fonts.regular, textTransform: 'uppercase', letterSpacing: 0.7 },
  titulo: { color: theme.ink, fontSize: type.destaque, lineHeight: lh(type.destaque), fontFamily: fonts.regular },
  texto: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: lh(type.corpo), fontFamily: fonts.light },

  // voz
  vozAro: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentDeep },
  vozBotao: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent2 },
  vozBarras: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36 },
  vozBarra: { width: 4, borderRadius: 2, backgroundColor: theme.accent2 },
  vozEstado: { color: theme.inkSoft, fontSize: type.nota, fontFamily: fonts.light },
  vozFala: { color: theme.accent2, fontSize: type.apoio, fontFamily: fonts.light },

  // nota fiscal
  mira: { width: 128, height: 128, alignItems: 'center', justifyContent: 'center' },
  canto: { position: 'absolute', width: CANTO, height: CANTO, borderColor: theme.accent2 },
  cantoSupEsq: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 6 },
  cantoSupDir: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 6 },
  cantoInfEsq: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 6 },
  cantoInfDir: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 6 },
  notaAviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
  },
  notaAvisoTexto: { color: theme.ink, fontSize: type.nota, fontFamily: fonts.regular },

  // tela inicial do Android
  /* 196 de largura, e não menos: com 178 a célula do widget de voz ficava com
     46px e o rótulo real "Lançar por voz" saía cortado em "Lançar por …"
     (visto na captura de conferência). Três colunas de 54 cabem em 196. */
  celular: {
    width: 196,
    height: ALTURA_CENA - 24,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: theme.ruleStrong,
    paddingHorizontal: 10,
    paddingTop: 6,
    gap: 8,
    ...({ backgroundImage: `linear-gradient(160deg, ${theme.paperRaised} 0%, ${theme.accentDeep} 100%)` } as any),
  },
  statusBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  statusHora: { color: theme.inkSoft, fontSize: 9, fontFamily: fonts.regular },
  statusIcones: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  fileira: { flexDirection: 'row', justifyContent: 'space-between' },
  celulaApp: { width: 54, alignItems: 'center', gap: 3 },
  iconeApp: { width: 30, height: 30, borderRadius: 9, backgroundColor: theme.paper, opacity: 0.55 },
  rotuloAppFalso: { width: 24, height: 3, borderRadius: 2, backgroundColor: theme.rule },
  /* O degradê oficial do círculo do widget de voz, na mesma direção do
     `grana_voice_fundo_gradiente.xml` (horizontal) e com o aro escuro. */
  widgetVozCirculo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: brand.dark,
    ...({ backgroundImage: `linear-gradient(90deg, ${brand.gradient.from}, ${brand.gradient.to})` } as any),
  },
  rotuloApp: { color: theme.ink, fontSize: 6.5, fontFamily: fonts.light },
  /* `grana_widget_card.xml`: superfície, borda de 1, canto 18. */
  widgetLivre: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    backgroundColor: theme.paperRaised,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  widgetLivreTitulo: { color: theme.inkSoft, fontSize: 9, fontFamily: fonts.light },
  widgetLivreValor: { color: theme.ink, fontSize: 16, fontFamily: fonts.regular, fontVariant: ['tabular-nums'], marginTop: 1 },
  widgetLivreSufixo: { color: theme.inkSoft, fontSize: 9, fontFamily: fonts.light },
  widgetLivreApoio: { color: theme.inkSoft, fontSize: 8, fontFamily: fonts.light, marginTop: 1 },
  widgetLivreAtualizado: { color: theme.inkFaint, fontSize: 7, fontFamily: fonts.light, marginTop: 3 },
});
