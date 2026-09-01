import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';

/**
 * Miniaturas que ilustram cada card da dobra "Tudo que o Grana. faz".
 *
 * Existem porque um inventário de benefícios com ícone e texto vira uma grade
 * de cards intercambiáveis: o olho não distingue um do outro e a dobra inteira
 * é ignorada. Cada variante mostra o benefício ACONTECENDO, com os mesmos
 * tokens da interface real.
 *
 * Todos os valores são fictícios. Nada aqui é captura de conta real.
 */

export type VarianteMock =
  | 'lancar'
  | 'cartao'
  | 'boletos'
  | 'mes'
  | 'organizar'
  | 'personalizar';

export default function MiniMockBeneficio({ variante, destaque = false }: { variante: VarianteMock; destaque?: boolean }) {
  return <View style={[styles.palco, destaque && styles.palcoDestaque]}>{conteudo(variante)}</View>;
}

/* ---- variantes ---- */

/* A cor da categoria fica na BORDA e no fundo tingido; o rótulo usa `theme.ink`.
   Pintar o texto com a própria cor da categoria derrubava o contraste pra
   4,25:1 (`#bb6b60` a 12px sobre `paperRaised`), abaixo dos 4,5:1 da WCAG AA —
   e as cores de categoria de `lib/demo-data.ts` são escolhidas pra distinguir
   fatias de gráfico, não pra carregar texto pequeno. É a mesma divisão que o
   app já usa nos seletores de entrada/saída (`typeBtnIn`/`typeBtnOut`) e que a
   própria landing usa no ponto de categoria de `LandingHeroDemo`. */
const CategoriaChip = ({ nome, cor }: { nome: string; cor: string }) => (
  <View style={[styles.chip, { borderColor: cor, backgroundColor: cor + '22' }]}>
    <Text style={styles.chipTexto}>{nome}</Text>
  </View>
);

/** Barra de progresso genérica, na mesma receita do limite de cartão e do orçamento. */
const Barra = ({ pct, cor }: { pct: number; cor: string }) => (
  <View style={styles.trilho}>
    <View style={[styles.preenchido, { width: `${pct}%`, backgroundColor: cor }]} />
  </View>
);

/* Função, não constante: um objeto no topo do módulo seria avaliado antes de
   `styles` existir (StyleSheet.create fica no fim do arquivo), e o TS acusa
   uso antes da declaração. */
function conteudo(variante: VarianteMock): React.ReactNode {
  const mapa: Record<VarianteMock, React.ReactNode> = {
  /* Reconhecimento: o texto vira valor + categoria sugerida. */
  lancar: (
    <View style={{ gap: spacing.sm, alignItems: 'center' }}>
      <Text style={styles.frase}>"almoço 32 no mercado"</Text>
      <Ionicons name="arrow-down" size={14} color={theme.inkFaint} aria-hidden />
      <View style={styles.linhaLancamento}>
        <Text style={styles.valor}>R$ 32,00</Text>
        <CategoriaChip nome="Alimentação" cor="#bb6b60" />
      </View>
    </View>
  ),

  /* Alerta de limite: os degraus reais são 50/70/90/100 (lib/creditLimitAlert.ts). */
  cartao: (
    <View style={{ gap: spacing.xs, width: '100%' }}>
      <View style={styles.linhaTopo}>
        <Text style={styles.rotulo}>Limite usado</Text>
        <Text style={styles.rotuloForte}>70%</Text>
      </View>
      <Barra pct={70} cor={theme.accent} />
      <Text style={styles.aviso}>Você chegou a 70% do limite</Text>
    </View>
  ),

  /* Boleto recorrente: pagar cria a saída e gera a próxima ocorrência. */
  boletos: (
    <View style={{ gap: spacing.xs, width: '100%' }}>
      <View style={styles.linhaBoleto}>
        <View style={styles.selo}>
          <Text style={styles.seloMes}>SET</Text>
          <Text style={styles.seloDia}>05</Text>
        </View>
        <Text style={styles.boletoNome}>Aluguel</Text>
        <Ionicons name="checkmark-circle" size={16} color={theme.up} aria-hidden />
      </View>
      <Text style={styles.aviso}>Próxima em outubro, criada sozinha</Text>
    </View>
  ),

  /* Composição por categoria, como a Home mostra. */
  mes: (
    <View style={{ gap: spacing.xs, width: '100%' }}>
      <Text style={styles.rotulo}>Gastos por categoria</Text>
      <View style={{ gap: 4 }}>
        <Barra pct={62} cor="#bb6b60" />
        <Barra pct={38} cor="#6b9dc2" />
        <Barra pct={21} cor="#d3b869" />
      </View>
    </View>
  ),

  /* Cofrinho com progresso. */
  organizar: (
    <View style={{ gap: spacing.xs, width: '100%' }}>
      <View style={styles.linhaTopo}>
        <Text style={styles.rotulo}>Reserva de emergência</Text>
        <Text style={styles.rotuloForte}>45%</Text>
      </View>
      <Barra pct={45} cor={theme.accent2} />
      <Text style={styles.aviso}>R$ 1.800 de R$ 4.000</Text>
    </View>
  ),

  /* Blocos da Home, que a pessoa reordena. */
  personalizar: (
    <View style={{ gap: 6, width: '100%' }}>
      {['Livre para gastar', 'Cofrinhos', 'Boletos'].map((b) => (
        <View key={b} style={styles.blocoHome}>
          <Ionicons name="reorder-three-outline" size={13} color={theme.inkFaint} aria-hidden />
          <Text style={styles.blocoTexto}>{b}</Text>
        </View>
      ))}
    </View>
  ),
  };
  return mapa[variante];
}

const styles = StyleSheet.create({
  palco: {
    height: 108,
    borderRadius: radius.md,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  palcoDestaque: { height: 132, paddingHorizontal: spacing.xl },
  frase: { color: theme.inkSoft, fontSize: type.legenda, fontFamily: fonts.light },
  linhaLancamento: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  valor: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  chipTexto: { color: theme.ink, fontSize: type.micro, fontFamily: fonts.regular },
  linhaTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rotulo: { color: theme.inkFaint, fontSize: type.micro, fontFamily: fonts.light },
  rotuloForte: { color: theme.ink, fontSize: type.micro, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  trilho: { height: 6, borderRadius: 3, backgroundColor: theme.paperRaised, overflow: 'hidden' },
  preenchido: { height: 6, borderRadius: 3 },
  aviso: { color: theme.inkFaint, fontSize: type.micro, fontFamily: fonts.light },
  linhaBoleto: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selo: { width: 30, height: 34, borderRadius: radius.sm, backgroundColor: theme.accentDeep, alignItems: 'center', justifyContent: 'center' },
  seloMes: { color: theme.accent2, fontSize: 8, fontFamily: fonts.regular },
  seloDia: { color: theme.ink, fontSize: type.micro, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  boletoNome: { flex: 1, color: theme.inkSoft, fontSize: type.micro, fontFamily: fonts.light },
  blocoHome: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: theme.paperRaised, borderRadius: radius.sm, paddingVertical: 5, paddingHorizontal: spacing.sm },
  blocoTexto: { color: theme.inkSoft, fontSize: type.micro, fontFamily: fonts.light },
});
