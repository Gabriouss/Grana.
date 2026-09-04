import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, spacing, theme, type } from '@/lib/theme';
import RevealOnScroll from '@/components/RevealOnScroll';

/* As duas etapas revelam em sequência (fala, DEPOIS resultado), não juntas
   — é a demonstração central do mecanismo do produto, e o olho precisa ler
   causa antes de efeito. `atraso={220}` na segunda começa a contar só
   depois que ELA MESMA entra na tela (ambas costumam intersectar quase no
   mesmo instante de scroll, já que ficam lado a lado/empilhadas bem
   próximas — o atraso é o que garante a ordem, não a posição). */
export default function DemoRegistroRapido({ compacto = false }: { compacto?: boolean }) {
  return (
    <View role="img" style={styles.raiz} accessibilityLabel="Exemplo de lançamento por voz organizado pelo Grana.">
      <View style={[styles.fluxo, compacto && styles.fluxoCompacto]}>
        <RevealOnScroll variante="prova" style={styles.etapa}>
          <View style={styles.etapaCabecalho}>
            <View style={styles.icone} aria-hidden>
              <Ionicons name="mic-outline" size={18} color={theme.accent2} />
            </View>
            <Text style={styles.rotulo}>Você diz</Text>
          </View>
          <Text style={[styles.fala, compacto && styles.textoCentralizado]}>“Almoço 32 no mercado”</Text>
        </RevealOnScroll>

        <View style={[styles.conector, compacto && styles.conectorCompacto]} aria-hidden>
          <View style={[styles.linha, compacto && styles.linhaCompacta]} />
          <View style={styles.seta}>
            <Ionicons name={compacto ? 'arrow-down' : 'arrow-forward'} size={18} color={theme.accent2} />
          </View>
          <View style={[styles.linha, compacto && styles.linhaCompacta]} />
        </View>

        <RevealOnScroll variante="prova" atraso={220} style={styles.etapa}>
          <View style={styles.etapaCabecalho}>
            <View style={styles.icone} aria-hidden>
              <Ionicons name="sparkles-outline" size={18} color={theme.accent2} />
            </View>
            <Text style={styles.rotulo}>O Grana. organiza</Text>
          </View>
          <View style={[styles.lancamento, compacto && styles.lancamentoCompacto]}>
            <View style={styles.descricao}>
              <Text style={styles.titulo}>Almoço no mercado</Text>
              <Text style={styles.meta}>Alimentação · agora</Text>
            </View>
            <Text style={styles.valor}>− R$ 32,00</Text>
          </View>
        </RevealOnScroll>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    width: '100%',
    maxWidth: 820,
    marginTop: spacing.xxl,
    paddingTop: spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: theme.ruleStrong,
  },
  fluxo: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  fluxoCompacto: { flexDirection: 'column', gap: spacing.md },
  etapa: { flex: 1, minWidth: 0, gap: spacing.md },
  etapaCabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  icone: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.accentDeep,
  },
  rotulo: { color: theme.accent2, fontSize: type.nota, lineHeight: type.nota * 1.35, fontFamily: fonts.regular },
  fala: { color: theme.ink, fontSize: type.titulo, lineHeight: type.titulo * 1.4, fontFamily: fonts.regular, textAlign: 'center' },
  textoCentralizado: { textAlign: 'center' },
  conector: { width: 120, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md },
  conectorCompacto: { width: 40, height: 54, flexDirection: 'column', paddingHorizontal: 0 },
  linha: { flex: 1, height: 1, backgroundColor: theme.ruleStrong },
  linhaCompacta: { width: 1, height: 'auto' },
  seta: { marginHorizontal: spacing.xs },
  lancamento: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.rule,
  },
  lancamentoCompacto: { width: '100%' },
  descricao: { flex: 1, minWidth: 0 },
  titulo: { color: theme.ink, fontSize: type.apoio, lineHeight: type.apoio * 1.4, fontFamily: fonts.regular },
  meta: { color: theme.inkFaint, fontSize: type.nota, lineHeight: type.nota * 1.4, fontFamily: fonts.light, marginTop: spacing.xs },
  valor: { color: theme.ink, fontSize: type.apoio, lineHeight: type.apoio * 1.4, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
});
