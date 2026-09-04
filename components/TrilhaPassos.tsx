import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts as uiFonts, radius, spacing, theme, type } from '@/lib/theme';

const fonts = { regular: uiFonts.brandRegular, light: uiFonts.brandLight };

type Passo = {
  cena: 'fala' | 'lugares';
  titulo: string;
  texto: string;
};

/**
 * Cada passo mostra o mecanismo ACONTECENDO, não um ícone que repete a
 * palavra do título. Ícone de balãozinho ao lado de "Fale com o Granabô"
 * não acrescenta informação nenhuma; uma mensagem virando lançamento
 * categorizado, sim.
 *
 * Dimensionadas pro card compacto primeiro (≈350px de largura no celular):
 * tudo que precisa caber, cabe lá, e sobra folga no amplo.
 */
function CenaFala() {
  return (
    <View style={styles.cena}>
      <View style={styles.mensagemEnviada}>
        <Text style={styles.mensagemTexto}>almoço 32 no mercado</Text>
      </View>
      <View style={styles.setaCena} aria-hidden>
        <Ionicons name="arrow-down" size={14} color={theme.accent2} />
      </View>
      <View style={styles.lancamentoCena}>
        <View style={[styles.pontoCategoria, { backgroundColor: '#bb6b60' }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.lancamentoTitulo}>Almoço no mercado</Text>
          <Text style={styles.lancamentoMeta}>Alimentação</Text>
        </View>
        <Text style={styles.lancamentoValor}>− R$ 32,00</Text>
      </View>
    </View>
  );
}

function CenaLugares() {
  return (
    <View style={[styles.cena, styles.cenaLugares]}>
      <View style={styles.celular}>
        <View style={styles.celularTela}>
          <View style={styles.linhaFalsa} />
          <View style={[styles.linhaFalsa, styles.linhaCurta]} />
          <View style={styles.linhaDestacada} />
        </View>
      </View>
      <View style={styles.navegador}>
        <View style={styles.navegadorBarra}>
          <View style={styles.navegadorPonto} />
          <View style={styles.navegadorPonto} />
          <View style={styles.navegadorPonto} />
        </View>
        <View style={styles.navegadorTela}>
          <View style={styles.linhaFalsa} />
          <View style={styles.linhaDestacada} />
          <View style={[styles.linhaFalsa, styles.linhaCurta]} />
        </View>
      </View>
    </View>
  );
}

/* Dois passos, não três: o passo que os concorrentes colocam primeiro
   ("conecte seu banco") não existe aqui por decisão de produto, e inventar
   um terceiro só pra encher a trilha seria enfeite. */
const PASSOS: Passo[] = [
  {
    cena: 'fala',
    titulo: 'Fale com o Granabô',
    texto: 'Texto ou áudio no WhatsApp, ou voz direto no aplicativo. Ele identifica o valor, a descrição e a categoria.',
  },
  {
    cena: 'lugares',
    titulo: 'Confira onde quiser',
    texto: 'O lançamento aparece no celular e no computador, pronto pra você ajustar se precisar.',
  },
];

export default function TrilhaPassos({ compacto = false }: { compacto?: boolean }) {
  return (
    <View style={styles.raiz}>
      <View style={[styles.passos, compacto && styles.passosCompactos]}>
        {PASSOS.map((passo) => (
          <View key={passo.titulo} style={styles.passo}>
            {passo.cena === 'fala' ? <CenaFala /> : <CenaLugares />}
            <Text style={styles.tituloPasso}>{passo.titulo}</Text>
            <Text style={styles.textoPasso}>{passo.texto}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { width: '100%', marginTop: spacing.xxl },
  passos: { flexDirection: 'row', gap: spacing.xl, alignItems: 'stretch' },
  passosCompactos: { flexDirection: 'column', gap: spacing.lg },
  passo: {
    flex: 1,
    minWidth: 0,
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paperRaised,
  },
  /* A cena tem altura fixa nos dois cards pra que título e texto comecem na
     mesma linha de base, mesmo com conteúdos internos diferentes. */
  cena: {
    height: 128,
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  cenaLugares: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  mensagemEnviada: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    backgroundColor: theme.accentDeep,
    borderRadius: radius.md,
    borderTopRightRadius: 2,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  mensagemTexto: { color: theme.ink, fontSize: type.nota, fontFamily: fonts.light },
  setaCena: { alignSelf: 'center' },
  lancamentoCena: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  pontoCategoria: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  lancamentoTitulo: { color: theme.ink, fontSize: type.legenda, fontFamily: fonts.regular },
  lancamentoMeta: { color: theme.inkFaint, fontSize: type.micro, fontFamily: fonts.light },
  lancamentoValor: { color: theme.ink, fontSize: type.legenda, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  /* Celular e navegador desenhados em CSS, sem asset — mesma receita das
     molduras que a landing já usa, reduzida ao tamanho de miniatura. */
  celular: { width: 46, height: 84, borderRadius: 10, borderWidth: 2, borderColor: theme.ruleStrong, padding: 4, justifyContent: 'center' },
  celularTela: { flex: 1, borderRadius: 5, backgroundColor: theme.paperRaised, padding: 5, gap: 4, justifyContent: 'center' },
  navegador: { flex: 1, maxWidth: 150, height: 84, borderRadius: 8, borderWidth: 2, borderColor: theme.ruleStrong, overflow: 'hidden' },
  navegadorBarra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    height: 14,
    backgroundColor: theme.paperRaised,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  navegadorPonto: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.rule },
  navegadorTela: { flex: 1, padding: 8, gap: 5, justifyContent: 'center' },
  linhaFalsa: { height: 4, borderRadius: 2, backgroundColor: theme.rule },
  linhaCurta: { width: '60%' },
  /* A linha destacada é o MESMO lançamento aparecendo nos dois lugares — é o
     que a copy promete, e sem ela os dois aparelhos seriam só decoração. */
  linhaDestacada: { height: 5, borderRadius: 2, backgroundColor: theme.accent2, opacity: 0.75 },
  tituloPasso: { color: theme.ink, fontSize: type.corpo, lineHeight: type.corpo * 1.3, fontFamily: fonts.regular },
  textoPasso: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: type.apoio * 1.5, fontFamily: fonts.light },
});
