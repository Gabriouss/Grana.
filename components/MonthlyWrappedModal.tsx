import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, type, fonts, lh } from '@/lib/theme';
import { formatMoney } from '@/lib/format';
import { hapticTap } from '@/lib/haptics';
import type { MonthlyWrapped } from '@/lib/monthly-wrapped';
import AppPressable from './AppPressable';
import { useModalAccessibility } from '@/lib/modal-accessibility';
import ExportPdfButton from './ExportPdfButton';
import type { Bill, Transaction } from '@/lib/types';
import { useReducedMotion } from '@/lib/motion';

/**
 * Retrospectiva mensal em formato Stories. A navegação é só por toque
 * (esquerda volta, direita avança) e pelos botões — deliberadamente sem
 * avanço automático por tempo: os números aqui merecem ser lidos no ritmo de
 * quem lê, e um slide sobre déficit sumindo sozinho em 5 segundos seria
 * exatamente o slide que a pessoa mais precisa encarar.
 */

type Slide = {
  key: string;
  rotulo: string;
  titulo: string;
  destaque: string;
  destaqueCor: string;
  apoio: string;
  icone: keyof typeof Ionicons.glyphMap;
};

function montarSlides(w: MonthlyWrapped): Slide[] {
  const slides: Slide[] = [];
  const superavit = w.saldo >= 0;

  /* `theme.down` (ciano) no déficit, nunca `theme.danger`. Vermelho não existe
     no vocabulário de cor do produto, e a regra vale especialmente aqui: a
     retrospectiva é o momento em que o app fala sobre o mês da pessoa, e
     pintar um mês apertado de vermelho de alarme é exatamente o julgamento
     que a estrela guia do DESIGN.md descarta. "No vermelho" saiu da copy pelo
     mesmo motivo. */
  slides.push({
    key: 'balanco',
    rotulo: w.label,
    titulo: superavit ? 'Você fechou o mês com sobra' : 'Você gastou mais do que entrou',
    destaque: `${superavit ? '+' : '−'} R$ ${formatMoney(Math.abs(w.saldo))}`,
    destaqueCor: superavit ? theme.up : theme.down,
    apoio:
      `Entraram R$ ${formatMoney(w.entradas)} e saíram R$ ${formatMoney(w.saidas)} em ${w.totalLancamentos} lançamentos.` +
      (w.taxaPoupanca !== null && w.taxaPoupanca > 0
        ? ` Isso é ${Math.round(w.taxaPoupanca * 100)}% da sua renda guardada.`
        : ''),
    icone: superavit ? 'trending-up-outline' : 'trending-down-outline',
  });

  /* Comparação com o mês de antes. É a leitura que um resumo de mês pede
     naturalmente ("foi melhor ou pior que o anterior?") e que a versão
     anterior não respondia — ela descrevia o mês isolado, sem régua. */
  if (w.saidasMesAnterior !== null && w.saidasMesAnterior > 0 && w.saidas > 0) {
    const variacao = ((w.saidas - w.saidasMesAnterior) / w.saidasMesAnterior) * 100;
    const estavel = Math.abs(variacao) < 5;
    slides.push({
      key: 'comparacao',
      rotulo: 'Contra o mês anterior',
      titulo: estavel ? 'Um mês parecido com o anterior' : variacao > 0 ? 'Um mês mais pesado' : 'Um mês mais leve',
      destaque: `${variacao > 0 ? '+' : '−'} ${Math.abs(variacao).toFixed(0)}%`,
      destaqueCor: variacao > 0 ? theme.down : theme.up,
      apoio: `As saídas foram de R$ ${formatMoney(w.saidasMesAnterior)} para R$ ${formatMoney(w.saidas)}. ${
        estavel ? 'Praticamente o mesmo ritmo dos dois meses.' : 'A diferença aparece na divisão por categoria, na tela de Gráficos.'
      }`,
      icone: variacao > 0 ? 'arrow-up-outline' : 'arrow-down-outline',
    });
  }

  /* Quanto do mês já estava decidido antes de ele começar. Separar custo fixo
     de gasto escolhido é o que transforma "gastei muito" em algo acionável. */
  if (w.saidas > 0 && w.comprometidoFixo > 0) {
    const fatia = Math.round((w.comprometidoFixo / w.saidas) * 100);
    slides.push({
      key: 'comprometido',
      rotulo: 'Fixo e variável',
      titulo: 'Parte do mês já estava decidida',
      destaque: `${fatia}%`,
      destaqueCor: theme.accent2,
      apoio: `R$ ${formatMoney(w.comprometidoFixo)} saíram de contas recorrentes e boletos. Os outros R$ ${formatMoney(
        w.saidas - w.comprometidoFixo
      )} foram decididos ao longo do mês.`,
      icone: 'repeat-outline',
    });
  }

  if (w.maiorDespesa) {
    slides.push({
      key: 'maior-despesa',
      rotulo: 'A maior de todas',
      titulo: w.maiorDespesa.description,
      destaque: `R$ ${formatMoney(Number(w.maiorDespesa.amount))}`,
      destaqueCor: theme.accent2,
      apoio: `Sua maior despesa isolada do mês, na categoria ${w.maiorDespesa.category}. Sozinha, ela representou ${
        w.saidas > 0 ? Math.round((Number(w.maiorDespesa.amount) / w.saidas) * 100) : 0
      }% de tudo que saiu.`,
      icone: 'flame-outline',
    });
  }

  if (w.categoriaCampea) {
    const c = w.categoriaCampea;
    const sobreOrcamento =
      c.usoDoOrcamento !== null
        ? c.usoDoOrcamento > 1
          ? ` Você passou ${Math.round((c.usoDoOrcamento - 1) * 100)}% do orçamento que tinha definido.`
          : ` Você usou ${Math.round(c.usoDoOrcamento * 100)}% do orçamento definido — dentro do combinado.`
        : '';
    slides.push({
      key: 'categoria',
      rotulo: 'Categoria campeã',
      titulo: c.nome,
      destaque: `R$ ${formatMoney(c.total)}`,
      destaqueCor: c.cor,
      apoio: `${Math.round(c.fatiaDasSaidas * 100)}% de todas as suas saídas do mês foram para aqui.${sobreOrcamento}`,
      icone: 'pie-chart-outline',
    });
  }

  slides.push({
    key: 'level',
    rotulo: 'Sua evolução',
    titulo: w.level.elo.title,
    destaque: `Nível ${w.level.level}`,
    destaqueCor: theme.accent2,
    apoio:
      `${w.level.xp} XP acumulados até aqui.` +
      (w.level.nextElo
        ? ` Faltam ${Math.max(0, w.level.xpParaProximoLevel - w.level.xpAtualNoLevel)} XP para o próximo nível, rumo a ${w.level.nextElo.title}.`
        : ' Você chegou ao topo dos elos — segue firme.'),
    icone: 'trophy-outline',
  });

  slides.push({
    key: 'final',
    rotulo: 'Resumo de ' + w.label,
    titulo: superavit ? 'Mês fechado com sobra' : 'Mês fechado com aperto',
    destaque: `${superavit ? '+' : '−'} R$ ${formatMoney(Math.abs(w.saldo))}`,
    destaqueCor: superavit ? theme.up : theme.down,
    apoio: `${w.totalLancamentos} lançamentos em ${w.diasComRegistro} de ${w.diasNoMes} dias · ${w.boletosPagos} ${
      w.boletosPagos === 1 ? 'boleto quitado' : 'boletos quitados'
    } (R$ ${formatMoney(w.valorBoletosPagos)}) · Nível ${w.level.level}, ${w.level.elo.title}.`,
    icone: 'sparkles-outline',
  });

  return slides;
}

export default function MonthlyWrappedModal({
  visible,
  wrapped,
  onClose,
  transactions,
  bills,
  carteira,
}: {
  visible: boolean;
  wrapped: MonthlyWrapped | null;
  onClose: () => void;
  /* Os três abaixo existem só para o PDF do último capítulo. Vêm de fora
     porque a Início já tem tudo carregado: pedir de novo aqui seria uma ida
     ao banco para repetir o que está na memória a um componente de distância. */
  transactions?: Transaction[];
  bills?: Bill[];
  carteira?: string;
}) {
  const { width } = useWindowDimensions();
  const [indice, setIndice] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const modalRef = useRef<View>(null);
  const reduzirMovimento = useReducedMotion();
  useModalAccessibility(modalRef, visible);
  /* O <Modal> desenha sob a barra de status no modo edge-to-edge; o 56 fixo
     que estava aqui acertava por acaso na maioria dos aparelhos e errava nos
     de barra mais alta ou mais baixa. */
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) setIndice(0);
  }, [visible]);

  if (!wrapped) return null;
  const slides = montarSlides(wrapped);
  const slide = slides[Math.min(indice, slides.length - 1)];

  function irPara(novo: number) {
    if (novo < 0) return;
    if (novo >= slides.length) {
      onClose();
      return;
    }
    hapticTap();
    fade.setValue(0);
    setIndice(novo);
    if (reduzirMovimento) {
      fade.setValue(1);
      return;
    }
    Animated.timing(fade, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }

  return (
    <Modal visible={visible} animationType={reduzirMovimento ? 'none' : 'fade'} onRequestClose={onClose}>
      <View ref={modalRef} style={[styles.fundo, { paddingTop: insets.top + spacing.xl }]} accessibilityViewIsModal role="dialog" focusable>
        {/* Barra de progresso dos slides */}
        <View style={styles.progressoRow}>
          {slides.map((s, i) => (
            <View key={s.key} style={styles.progressoTrilho}>
              <View style={[styles.progressoPreenchido, { width: i <= indice ? '100%' : '0%' }]} />
            </View>
          ))}
        </View>

        <View style={styles.topoRow}>
          <Text style={styles.rotulo}>{slide.rotulo}</Text>
          <AppPressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
            <Ionicons name="close" size={22} color={theme.inkFaint} />
          </AppPressable>
        </View>

        <Animated.View style={[styles.conteudo, { opacity: fade }]}>
          <View style={[styles.iconeCirculo, { borderColor: slide.destaqueCor }]}>
            <Ionicons name={slide.icone} size={30} color={slide.destaqueCor} />
          </View>
          <Text style={styles.titulo}>{slide.titulo}</Text>
          <Text style={[styles.destaque, { color: slide.destaqueCor }]}>{slide.destaque}</Text>
          <Text style={styles.apoio}>{slide.apoio}</Text>
        </Animated.View>

        {/* Zonas de toque: metade esquerda volta, metade direita avança.
            `android_ripple` transparente aqui é deliberado e NÃO é o mesmo
            caso das abas: um ripple do Material espalhando por 40% da tela
            não é retorno de toque, é um flash de tela inteira. Visualizador
            em capítulos (o padrão de "stories") não desenha feedback nessas
            zonas em plataforma nenhuma — o feedback é o capítulo virar.
            Os rótulos existem porque, sem texto nem ícone dentro, um leitor
            de tela anunciaria dois "botão" sem nome cobrindo a tela toda. */}
        <View style={[styles.zonasToque, { pointerEvents: 'box-none' }]} >
          <AppPressable
            style={[styles.zona, { width: width * 0.4 }]}
            scaleOnPress={false}
            android_ripple={{ color: 'transparent' }}
            accessibilityLabel="Capítulo anterior"
            onPress={() => irPara(indice - 1)}
          />
          <AppPressable
            style={[styles.zona, { width: width * 0.6 }]}
            scaleOnPress={false}
            android_ripple={{ color: 'transparent' }}
            accessibilityLabel="Próximo capítulo"
            onPress={() => irPara(indice + 1)}
          />
        </View>

        <View style={styles.rodape}>
          {/* A oferta do documento fica no ÚLTIMO capítulo, e só nele. A
              história termina e então pergunta se você quer levá-la; oferecer
              um download no meio interrompe a leitura para propor um arquivo. */}
          {indice === slides.length - 1 && wrapped && transactions && (
            <ExportPdfButton
              ano={wrapped.ano}
              mes={wrapped.mes}
              transactions={transactions}
              bills={bills}
              carteira={carteira ?? 'Total'}
              wrapped={wrapped}
              rotulo={`Baixar o PDF de ${wrapped.label}`}
            />
          )}
          <Text style={styles.dica}>
            {indice === slides.length - 1 ? 'Toque à direita para fechar' : 'Toque para avançar'}
          </Text>
          <AppPressable style={styles.botaoFinal} onPress={() => irPara(indice + 1)}>
            <Text style={styles.botaoFinalTexto}>
              {indice === slides.length - 1 ? 'Concluir' : 'Próximo'}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={theme.paper} />
          </AppPressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  /* paddingTop vem do inset no JSX. */
  fundo: { flex: 1, backgroundColor: theme.paper, paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },

  progressoRow: { flexDirection: 'row', gap: 4 },
  progressoTrilho: { flex: 1, height: 3, borderRadius: 2, backgroundColor: theme.rule, overflow: 'hidden' },
  progressoPreenchido: { height: 3, backgroundColor: theme.accent2, borderRadius: 2 },

  topoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg },
  rotulo: { color: theme.inkFaint, fontSize: type.legenda, letterSpacing: 1, fontFamily: fonts.light },

  conteudo: { flex: 1, justifyContent: 'center', gap: spacing.md },
  iconeCirculo: {
    width: 68, height: 68, borderRadius: 34, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  titulo: { color: theme.ink, fontSize: type.cabecalho, lineHeight: 30, fontFamily: fonts.regular },
  destaque: { fontSize: type.valor, letterSpacing: -1, fontFamily: fonts.regular },
  apoio: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: lh(type.corpo, 'corpo'), marginTop: spacing.xs, fontFamily: fonts.light },

  zonasToque: { position: 'absolute', left: 0, right: 0, top: 120, bottom: 110, flexDirection: 'row' },
  zona: { height: '100%' },

  rodape: { gap: spacing.md, alignItems: 'stretch' },
  dica: { color: theme.inkFaint, fontSize: type.legenda, textAlign: 'center', fontFamily: fonts.light },
  botaoFinal: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14,
  },
  botaoFinalTexto: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
});
