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
};

/* Sem recorte real (buraco/máscara) no fundo escurecido — a borda de
   destaque já comunica "olha aqui" sem precisar de máscara SVG pra só 5
   passos. Fica como possível melhoria futura (react-native-svg já está
   instalado no projeto), não necessária agora. */
const FOLGA_DESTAQUE = 6;

export default function HomeTourOverlay({ visible, steps, targets, onFinish }: Props) {
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

  // Abaixo do alvo se houver espaço, senão acima — heurística simples pra 5
  // pontos fixos, não um sistema de posicionamento genérico.
  const abaixo = alvo.y < alturaTela / 2;
  const tooltipTop = abaixo ? destino.top + destino.height + spacing.md : undefined;
  const tooltipBottom = abaixo ? undefined : alturaTela - destino.top + spacing.md;

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
