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
  /* A fala e o lançamento usam padrões reconhecíveis do app: entrada curta
     acima, transação completa abaixo. Não há seta ou chip solto para o leitor
     precisar adivinhar a relação entre as duas informações. */
  lancar: (
    <View style={styles.mockColuna}>
      <View style={styles.entradaVoz}>
        <View style={styles.entradaVozIcone} aria-hidden>
          <Ionicons name="mic-outline" size={15} color={theme.accent2} />
        </View>
        <Text style={styles.entradaVozTexto}>“Almoço 32 no mercado”</Text>
      </View>
      <View style={styles.divisor} />
      <View style={styles.transacaoLinha}>
        <View style={[styles.categoriaPonto, { backgroundColor: '#bb6b60' }]} />
        <View style={styles.transacaoDescricao}>
          <Text style={styles.transacaoTitulo}>Almoço no mercado</Text>
          <Text style={styles.transacaoMeta}>Alimentação · agora</Text>
        </View>
        <Text style={styles.transacaoValor}>− R$ 32,00</Text>
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

  /* Categorias com nome e valor: a barra continua ajudando na comparação,
     mas deixa de ser um conjunto de cores sem legenda. */
  mes: (
    <View style={styles.mockColuna}>
      <View style={styles.linhaTopo}>
        <Text style={styles.rotulo}>Gastos deste mês</Text>
        <Text style={styles.valorResumo}>R$ 1.210</Text>
      </View>
      <CategoriaResumo nome="Alimentação" valor="R$ 620" pct={62} cor="#bb6b60" />
      <CategoriaResumo nome="Casa" valor="R$ 380" pct={38} cor="#6b9dc2" />
      <CategoriaResumo nome="Lazer" valor="R$ 210" pct={21} cor="#d3b869" />
    </View>
  ),

  /* Mesma anatomia do card real de cofrinho em GoalsCarousel: ícone, título,
     valor atual, alvo, trilho e rodapé com percentual/prazo. */
  organizar: (
    <View style={styles.metaResumo}>
      <View style={styles.linhaTopo}>
        <View style={styles.metaIdentidade}>
          <View style={styles.metaIcone} aria-hidden>
            <Ionicons name="shield-checkmark-outline" size={15} color={theme.accent2} />
          </View>
          <Text style={styles.metaTitulo}>Reserva de emergência</Text>
        </View>
      </View>
      <Text style={styles.metaValor}>R$ 1.800</Text>
      <Text style={styles.metaAlvo}>de R$ 4.000</Text>
      <Barra pct={45} cor={theme.accent2} />
      <View style={styles.linhaTopo}>
        <Text style={styles.aviso}>45% guardado</Text>
        <Text style={styles.aviso}>até dezembro</Text>
      </View>
    </View>
  ),

  /* Uma mini Home em grade comunica composição e reorganização melhor que
     três linhas idênticas com alças soltas. */
  personalizar: (
    <View style={styles.mockColuna}>
      <View style={styles.linhaTopo}>
        <Text style={styles.rotulo}>Sua tela inicial</Text>
        <View style={styles.reordenarDica}>
          <Ionicons name="move-outline" size={12} color={theme.accent2} aria-hidden />
          <Text style={styles.reordenarTexto}>reorganize</Text>
        </View>
      </View>
      <View style={styles.blocoGrade}>
        <BlocoHome icone="wallet-outline" texto="Livre" largo />
        <BlocoHome icone="archive-outline" texto="Cofrinhos" />
        <BlocoHome icone="receipt-outline" texto="Boletos" />
      </View>
    </View>
  ),
  };
  return mapa[variante];
}

function CategoriaResumo({ nome, valor, pct, cor }: { nome: string; valor: string; pct: number; cor: string }) {
  return (
    <View style={styles.categoriaResumo}>
      <View style={styles.categoriaCabecalho}>
        <View style={styles.categoriaNome}>
          <View style={[styles.categoriaPonto, { backgroundColor: cor }]} />
          <Text style={styles.categoriaTexto}>{nome}</Text>
        </View>
        <Text style={styles.categoriaValor}>{valor}</Text>
      </View>
      <Barra pct={pct} cor={cor} />
    </View>
  );
}

function BlocoHome({ icone, texto, largo }: { icone: React.ComponentProps<typeof Ionicons>['name']; texto: string; largo?: boolean }) {
  return (
    <View style={[styles.blocoHome, largo && styles.blocoHomeLargo]}>
      <Ionicons name={icone} size={14} color={theme.accent2} aria-hidden />
      <Text style={styles.blocoTexto}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  palco: {
    /* Medido, não estimado: com 108 as variantes `mes` e `organizar` pediam
       115px de conteúdo e `personalizar` 109 — como o palco é
       `justifyContent: 'center'` + `overflow: 'hidden'`, o excedente saía
       igualmente por cima e por baixo e comia o próprio padding, então a
       primeira linha encostava na borda ("Gastos deste mês / R$ 1.210" sem
       respiro nenhum) e a última era cortada. Altura única pra todas as
       variantes é de propósito: é o que mantém o rótulo/título de cada card
       da dobra na mesma linha de base. 124 = a mais alta (115) com folga. */
    height: 124,
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
  mockColuna: { gap: spacing.xs, width: '100%' },
  metaResumo: { gap: spacing.xs, width: '100%', maxWidth: 320, alignSelf: 'center' },
  entradaVoz: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  entradaVozIcone: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentDeep },
  entradaVozTexto: { flex: 1, color: theme.inkSoft, fontSize: type.micro, fontFamily: fonts.light },
  divisor: { height: 1, backgroundColor: theme.rule, marginVertical: spacing.xs },
  transacaoLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  transacaoDescricao: { flex: 1, minWidth: 0 },
  transacaoTitulo: { color: theme.ink, fontSize: type.micro, fontFamily: fonts.regular },
  transacaoMeta: { color: theme.inkFaint, fontSize: type.micro, fontFamily: fonts.light, marginTop: 2 },
  transacaoValor: { color: theme.ink, fontSize: type.micro, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  categoriaPonto: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  linhaTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rotulo: { color: theme.inkFaint, fontSize: type.micro, fontFamily: fonts.light },
  rotuloForte: { color: theme.ink, fontSize: type.micro, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  valorResumo: { color: theme.ink, fontSize: type.micro, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  trilho: { height: 6, borderRadius: 3, backgroundColor: theme.paperRaised, overflow: 'hidden' },
  preenchido: { height: 6, borderRadius: 3 },
  aviso: { color: theme.inkFaint, fontSize: type.micro, fontFamily: fonts.light },
  linhaBoleto: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selo: { width: 30, height: 34, borderRadius: radius.sm, backgroundColor: theme.accentDeep, alignItems: 'center', justifyContent: 'center' },
  // `type.micro` (11-12px, conforme a escala) é o piso de legibilidade do
  // sistema — achado da auditoria de 02/09/2026: este selo usava 8px fixo,
  // abaixo de qualquer token de tipografia da página.
  seloMes: { color: theme.accent2, fontSize: type.micro, lineHeight: type.micro, fontFamily: fonts.regular },
  seloDia: { color: theme.ink, fontSize: type.micro, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  boletoNome: { flex: 1, color: theme.inkSoft, fontSize: type.micro, fontFamily: fonts.light },
  categoriaResumo: { gap: 3 },
  categoriaCabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  categoriaNome: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoriaTexto: { color: theme.inkSoft, fontSize: type.micro, fontFamily: fonts.light },
  categoriaValor: { color: theme.ink, fontSize: type.micro, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  metaIdentidade: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaIcone: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentDeep },
  metaTitulo: { color: theme.ink, fontSize: type.micro, fontFamily: fonts.regular },
  metaValor: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  metaAlvo: { color: theme.inkFaint, fontSize: type.micro, fontFamily: fonts.light, marginTop: -2 },
  reordenarDica: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reordenarTexto: { color: theme.accent2, fontSize: type.micro, fontFamily: fonts.light },
  blocoGrade: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  blocoHome: { flexGrow: 1, flexBasis: '35%', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.paperRaised, borderRadius: radius.sm, paddingVertical: 7, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: theme.rule },
  blocoHomeLargo: { flexBasis: '55%' },
  blocoTexto: { color: theme.inkSoft, fontSize: type.micro, fontFamily: fonts.light },
});
