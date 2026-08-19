import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, type } from '@/lib/theme';
import { formatMoney } from '@/lib/format';
import { hapticTap } from '@/lib/haptics';
import type { MonthlyWrapped } from '@/lib/monthly-wrapped';
import AppPressable from './AppPressable';

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

  slides.push({
    key: 'balanco',
    rotulo: w.label,
    titulo: superavit ? 'Você fechou o mês no azul' : 'Você fechou o mês no vermelho',
    destaque: `${superavit ? '+' : '−'} R$ ${formatMoney(Math.abs(w.saldo))}`,
    destaqueCor: superavit ? theme.up : '#e08b7f',
    apoio:
      `Entraram R$ ${formatMoney(w.entradas)} e saíram R$ ${formatMoney(w.saidas)} em ${w.totalLancamentos} lançamentos.` +
      (w.taxaPoupanca !== null && w.taxaPoupanca > 0
        ? ` Isso é ${Math.round(w.taxaPoupanca * 100)}% da sua renda guardada.`
        : ''),
    icone: superavit ? 'trending-up-outline' : 'trending-down-outline',
  });

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
    titulo: `${w.level.elo.emoji} ${w.level.elo.title}`,
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
    destaqueCor: superavit ? theme.up : '#e08b7f',
    apoio: `${w.totalLancamentos} lançamentos · ${w.boletosPagos} ${
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
}: {
  visible: boolean;
  wrapped: MonthlyWrapped | null;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const [indice, setIndice] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
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
    Animated.timing(fade, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.fundo, { paddingTop: insets.top + spacing.xl }]}>
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

        {/* Zonas de toque: metade esquerda volta, metade direita avança. */}
        <View style={styles.zonasToque} pointerEvents="box-none">
          <AppPressable
            style={[styles.zona, { width: width * 0.4 }]}
            scaleOnPress={false}
            android_ripple={{ color: 'transparent' }}
            onPress={() => irPara(indice - 1)}
          />
          <AppPressable
            style={[styles.zona, { width: width * 0.6 }]}
            scaleOnPress={false}
            android_ripple={{ color: 'transparent' }}
            onPress={() => irPara(indice + 1)}
          />
        </View>

        <View style={styles.rodape}>
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
  rotulo: { color: theme.inkFaint, fontSize: type.legenda, textTransform: 'uppercase', letterSpacing: 1 },

  conteudo: { flex: 1, justifyContent: 'center', gap: spacing.md },
  iconeCirculo: {
    width: 68, height: 68, borderRadius: 34, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  titulo: { color: theme.ink, fontSize: type.cabecalho, fontWeight: '500', lineHeight: 30 },
  destaque: { fontSize: 40, fontWeight: '600', letterSpacing: -1 },
  apoio: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: 22, marginTop: spacing.xs },

  zonasToque: { position: 'absolute', left: 0, right: 0, top: 120, bottom: 110, flexDirection: 'row' },
  zona: { height: '100%' },

  rodape: { gap: spacing.md, alignItems: 'stretch' },
  dica: { color: theme.inkFaint, fontSize: type.legenda, textAlign: 'center' },
  botaoFinal: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14,
  },
  botaoFinalTexto: { color: theme.paper, fontSize: type.corpo, fontWeight: '600' },
});
