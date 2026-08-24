import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AppPressable from '@/components/AppPressable';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import type { HomeTourStep, HomeTourStepId } from '@/lib/home-tour';

export type Rect = { x: number; y: number; width: number; height: number };

type Props = {
  visible: boolean;
  steps: HomeTourStep[];
  /** Rect de cada passo em coordenadas de janela (measureInWindow) — um passo
      sem entrada aqui foi ocultado pela personalização da Início e é
      silenciosamente descartado da sequência. */
  targets: Partial<Record<HomeTourStepId, Rect>>;
  onFinish: () => void;
  /** Chamado sempre que o passo exibido muda (inclusive na abertura do
      primeiro passo) — quem usa aproveita pra rolar a tela até o alvo antes
      de medir de novo. Sem isso, um alvo abaixo da dobra (comum em telas de
      celular, onde a Início é bem mais alta que a tela) fazia o destaque e
      até o próprio tooltip saírem da área visível — o "travamento sem botão
      pra apertar" relatado. */
  onStepChange?: (id: HomeTourStepId) => void;
};

/* Sem recorte real (buraco/máscara) no fundo escurecido — a borda de
   destaque já comunica "olha aqui" sem precisar de máscara SVG pra só 5
   passos. Fica como possível melhoria futura (react-native-svg já está
   instalado no projeto), não necessária agora. */
const FOLGA_DESTAQUE = 6;

/* Altura estimada do tooltip, só pra decidir o fallback de segurança abaixo
   — não precisa ser exata, só grande o bastante pra a estimativa de "cabe
   ali" ser conservadora. Título + 2-3 linhas de texto + botões, no
   `type.apoio`/`type.corpo` deste tema, não passa disso na prática. */
const ALTURA_TOOLTIP_ESTIMADA = 190;

export default function HomeTourOverlay({ visible, steps, targets, onFinish, onStepChange }: Props) {
  const { width: larguraJanela, height: alturaTela } = useWindowDimensions();
  const passosValidos = steps.filter((s) => targets[s.id]);
  const [passo, setPasso] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    setPasso(0);
  }, [visible]);

  // Lista vazia (todos os alvos ocultos pela personalização) não deveria nem
  // aparecer — encerra sozinho, sem o autor precisar lidar com esse caso.
  useEffect(() => {
    if (visible && passosValidos.length === 0) onFinish();
  }, [visible, passosValidos.length]);

  useEffect(() => {
    if (!visible || passosValidos.length === 0) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  }, [passo, visible, passosValidos.length]);

  // Avisa quem está de fora qual passo está ativo agora — é o gancho pra
  // rolar a tela até o alvo (ver comentário na prop, e app/(app)/index.tsx).
  useEffect(() => {
    if (!visible || passosValidos.length === 0) return;
    onStepChange?.(passosValidos[passo].id);
  }, [visible, passo, passosValidos.length]);

  if (!visible || passosValidos.length === 0) return null;

  const atual = passosValidos[passo];
  const alvo = targets[atual.id];
  if (!alvo) return null; // não deveria acontecer (passosValidos já filtrou), guarda defensiva

  const ultimo = passo === passosValidos.length - 1;
  const destino = {
    left: alvo.x - FOLGA_DESTAQUE,
    top: alvo.y - FOLGA_DESTAQUE,
    width: alvo.width + FOLGA_DESTAQUE * 2,
    height: alvo.height + FOLGA_DESTAQUE * 2,
  };

  /* O alvo real pode estar fora da área visível — quem chama tenta rolar até
     ele (onStepChange), mas isso é assíncrono (scroll animado, ou nem existe
     no nativo) e não pode ser a única garantia. Sem este clamp, um alvo
     abaixo da dobra fazia a conta `alturaTela - destino.top` dar um número
     tão grande que o tooltip inteiro saía por baixo da tela — os botões
     Pular/Concluir ficavam atrás da barra de navegação, inacessíveis: era
     exatamente o "trava sem indicação de onde apertar" relatado. Quando o
     alvo está total ou quase totalmente fora da tela, cai num fallback fixo
     e sempre visível — o destaque pode não aparecer nesse instante, mas o
     tooltip com os botões nunca fica preso fora do alcance do toque. */
  const alvoForaDaTela = destino.top + destino.height < spacing.xl || destino.top > alturaTela - spacing.xl;

  const abaixo = !alvoForaDaTela && alvo.y < alturaTela / 2;
  let tooltipTop: number | undefined;
  let tooltipBottom: number | undefined;

  if (alvoForaDaTela) {
    tooltipTop = Math.max(spacing.xl, alturaTela / 2 - ALTURA_TOOLTIP_ESTIMADA / 2);
  } else if (abaixo) {
    tooltipTop = Math.min(destino.top + destino.height + spacing.md, alturaTela - ALTURA_TOOLTIP_ESTIMADA - spacing.xl);
  } else {
    tooltipBottom = Math.min(alturaTela - destino.top + spacing.md, alturaTela - ALTURA_TOOLTIP_ESTIMADA - spacing.xl);
  }
  tooltipBottom = tooltipBottom !== undefined ? Math.max(tooltipBottom, spacing.xl) : undefined;

  function avancar() {
    if (ultimo) {
      onFinish();
    } else {
      setPasso((p) => p + 1);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onFinish}>
      <View style={styles.fundo}>
        <View
          style={[
            styles.destaque,
            { left: destino.left, top: destino.top, width: destino.width, height: destino.height },
          ]}
        />

        <Animated.View
          style={[
            styles.tooltip,
            { maxWidth: Math.min(340, larguraJanela - spacing.xl * 2) },
            tooltipTop !== undefined ? { top: tooltipTop } : { bottom: tooltipBottom },
            {
              opacity: anim,
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [abaixo ? -8 : 8, 0] }) }],
            },
          ]}
        >
          <Text style={styles.contador}>{`${passo + 1}/${passosValidos.length}`}</Text>
          <Text style={styles.titulo}>{atual.titulo}</Text>
          <Text style={styles.texto}>{atual.texto}</Text>
          <View style={styles.botoes}>
            <AppPressable onPress={onFinish} hitSlop={8}>
              <Text style={styles.pular}>Pular</Text>
            </AppPressable>
            <AppPressable
              style={({ hovered }) => [styles.proximo, hovered && styles.proximoHover]}
              onPress={avancar}
            >
              <Text style={styles.proximoTexto}>{ultimo ? 'Concluir' : 'Próximo'}</Text>
            </AppPressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(4,20,24,0.75)' },
  destaque: {
    position: 'absolute',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: theme.accent2,
  },
  tooltip: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  contador: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  titulo: { color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular, marginTop: spacing.xs },
  texto: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: 20, fontFamily: fonts.light, marginBottom: spacing.sm },
  botoes: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pular: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.light },
  proximo: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: spacing.lg },
  proximoHover: { opacity: 0.88 },
  proximoTexto: { color: theme.paper, fontSize: type.apoio, fontFamily: fonts.regular },
});
