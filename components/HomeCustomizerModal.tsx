import { useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import AppModal from './AppModal';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, radius, spacing, type, lh, fonts, touchTarget, hitSlopPara } from '@/lib/theme';
import {
  HOME_BLOCK_DESCRIPTIONS,
  HOME_BLOCK_ICONS,
  HOME_BLOCK_LABELS,
  layoutDoPreset,
  type HomeBlockConfig,
  type HomePreset,
} from '@/lib/home-layout';
import { blocoSobOsDedos, passoDeRolagem, trocarPosicoes, type AreaDoBloco } from '@/lib/reordenar-blocos';
import AppPressable from './AppPressable';
import ToggleSwitch from './ToggleSwitch';
import Sheet from './Sheet';

const PRESETS: { key: HomePreset; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'completo', label: 'Completo', icon: 'grid-outline' },
  { key: 'essencial', label: 'Essencial', icon: 'flash-outline' },
  { key: 'metas', label: 'Metas & Limites', icon: 'trophy-outline' },
];

/* Faixa, dentro da lista, em que o dedo arrastando faz ela rolar sozinha. A
   janela é menor que a lista, e sem isto não dá para levar o último bloco até
   o primeiro. Usa o alvo de toque do app como medida. */
const BORDA_AUTO_ROLAGEM = touchTarget;
/* Pixels por quadro na rolagem automática, no máximo (dedo encostado na borda). */
const VELOCIDADE_AUTO_ROLAGEM = 8;
/* Deslocamento do dedo abaixo do qual soltar a alça conta como TOQUE. */
const LIMIAR_DE_TOQUE = 8;

export default function HomeCustomizerModal({
  visible,
  config,
  onChange,
  onClose,
}: {
  visible: boolean;
  config: HomeBlockConfig[];
  onChange: (novo: HomeBlockConfig[]) => void;
  onClose: () => void;
}) {
  /* Estado do gesto em refs: os responders são criados uma vez por bloco e não
     podem ler valores velhos de um render anterior. Só o que desenha (quem está
     sendo arrastado, quem é o alvo, quem foi escolhido por toque) vai para o
     estado. */
  const configRef = useRef(config);
  configRef.current = config;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const escolhidoRef = useRef<string | null>(null);

  const listaRef = useRef<ScrollView>(null);
  const areas = useRef<Record<string, AreaDoBloco>>({});
  const rolagem = useRef({ y: 0, conteudo: 0, visivel: 0 });
  const gesto = useRef({ chave: '', dedoNaLista0: 0, dedoNaLista: 0, dy: 0, moveu: false, relogio: null as ReturnType<typeof setInterval> | null });
  const responders = useRef<Record<string, ReturnType<typeof PanResponder.create>>>({});

  /* Fechar a janela no meio de um gesto cancela tudo: o relógio da rolagem
     automática para e a lista não reabre presa em "arrastando". Fechar também
     cancela a escolha por toque. */
  useEffect(() => {
    if (!visible) {
      encerrarGesto();
      definirEscolhido(null);
    }
  }, [visible]);

  /* Desmontar com o relógio rodando deixaria um intervalo órfão. */
  useEffect(() => pararAutoRolagem, []);

  function definirEscolhido(chave: string | null) {
    escolhidoRef.current = chave;
    setEscolhido(chave);
  }

  /* Troca as DUAS posições e grava pelo mesmo caminho de sempre (`onChange`). */
  function trocar(chaveA: string, chaveB: string) {
    const novo = trocarPosicoes(configRef.current.map((b) => ({ ...b })), chaveA, chaveB);
    if (novo !== undefined) onChangeRef.current(novo);
  }

  function mover(index: number, direcao: -1 | 1) {
    const atual = configRef.current;
    const alvoIndex = index + direcao;
    if (alvoIndex < 0 || alvoIndex >= atual.length) return;
    trocar(atual[index].key, atual[alvoIndex].key);
  }

  function alternar(index: number) {
    const novo = config.slice();
    novo[index] = { ...novo[index], visible: !novo[index].visible };
    onChange(novo);
  }

  function aplicarPreset(preset: HomePreset) {
    const novoLayout = layoutDoPreset(preset);
    onChange(novoLayout);
  }

  function alvoSobODedo(): string | null {
    const g = gesto.current;
    const sob = blocoSobOsDedos(Object.values(areas.current), g.dedoNaLista, rolagem.current.y, rolagem.current.visivel);
    return sob && sob !== g.chave ? sob : null;
  }

  function pararAutoRolagem() {
    if (gesto.current.relogio) clearInterval(gesto.current.relogio);
    gesto.current.relogio = null;
  }

  function iniciarAutoRolagem() {
    pararAutoRolagem();
    gesto.current.relogio = setInterval(() => {
      const g = gesto.current;
      // Só rola depois que o dedo se mexeu e na direção em que ele foi: segurar
      // um cartão perto da borda, ou arrastá-lo para longe dela, não puxa a lista.
      if (!g.moveu) return;
      const passo = passoDeRolagem(g.dedoNaLista, 0, rolagem.current.visivel, BORDA_AUTO_ROLAGEM, VELOCIDADE_AUTO_ROLAGEM);
      if (passo === 0 || (passo > 0 && g.dy <= 0) || (passo < 0 && g.dy >= 0)) return;
      const r = rolagem.current;
      const proximo = Math.max(0, Math.min(r.y + passo, Math.max(0, r.conteudo - r.visivel)));
      if (proximo === r.y) return;
      r.y = proximo;
      listaRef.current?.scrollTo({ y: proximo, animated: false });
      // A lista andou sob o dedo parado: quem está embaixo dele mudou.
      setAlvo(alvoSobODedo());
    }, 16);
  }

  function encerrarGesto() {
    pararAutoRolagem();
    setArrastando(null);
    setAlvo(null);
  }

  /* Alternativa sem arrastar (WCAG 2.2): toque numa alça escolhe o bloco, toque
     na alça de outro troca os dois, toque na mesma cancela. */
  function aoTocarNaAlca(chave: string) {
    const atual = escolhidoRef.current;
    if (atual === null) return definirEscolhido(chave);
    definirEscolhido(null);
    if (atual !== chave) trocar(atual, chave);
  }

  function responderDe(chave: string) {
    if (!responders.current[chave]) {
      responders.current[chave] = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          /* Nada é medido na tela: a alça fica centralizada no cartão, então o
             dedo começa no meio dele, e daí em diante só o deslocamento `dy`
             importa. Ficar só com medidas da própria lista evita diferença
             de origem entre `pageY` e a janela do Modal no Android. */
          const area = areas.current[chave];
          const inicio = area ? area.topo + area.altura / 2 - rolagem.current.y : 0;
          gesto.current = { ...gesto.current, chave, dedoNaLista0: inicio, dedoNaLista: inicio, dy: 0, moveu: false };
          setArrastando(chave);
          iniciarAutoRolagem();
        },
        onPanResponderMove: (_e, g) => {
          gesto.current.dy = g.dy;
          gesto.current.dedoNaLista = gesto.current.dedoNaLista0 + g.dy;
          if (Math.abs(g.dy) > LIMIAR_DE_TOQUE || Math.abs(g.dx) > LIMIAR_DE_TOQUE) gesto.current.moveu = true;
          if (gesto.current.moveu) setAlvo(alvoSobODedo());
        },
        onPanResponderRelease: () => {
          const { moveu } = gesto.current;
          const destino = moveu ? alvoSobODedo() : null;
          encerrarGesto();
          if (!moveu) return aoTocarNaAlca(chave);
          // Soltar fora de um cartão não muda nada.
          if (destino) trocar(chave, destino);
        },
        onPanResponderTerminate: encerrarGesto,
      });
    }
    return responders.current[chave];
  }

  function aoMedirCartao(chave: string, e: LayoutChangeEvent) {
    const { y, height } = e.nativeEvent.layout;
    areas.current[chave] = { chave, topo: y, altura: height };
  }

  return (
    <AppModal visible={visible} transparent onRequestClose={onClose}>
      <Sheet onClose={onClose} conteudoFixo>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title} accessibilityRole="header">Personalizar Início</Text>
            <Text style={styles.hint}>Escolha quais ferramentas exibir e a ordem do seu painel.</Text>
          </View>
          <AppPressable onPress={onClose} hitSlop={hitSlopPara(22)} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Fechar">
            <Ionicons name="close" size={22} color={theme.inkFaint} />
          </AppPressable>
        </View>

        {/* Presets Rápidos de 1 Toque */}
        <View style={styles.presetSection}>
          <Text style={styles.presetTitle}>Modelos rápidos</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
            {PRESETS.map((p) => (
              <AppPressable
                key={p.key}
                style={styles.presetChip}
                onPress={() => aplicarPreset(p.key)}
              >
                <Text style={styles.presetChipText}>{p.label}</Text>
              </AppPressable>
            ))}
          </ScrollView>
        </View>

        <ScrollView
          ref={listaRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          nestedScrollEnabled
          scrollEnabled={!arrastando}
          scrollEventThrottle={16}
          onScroll={(e) => {
            rolagem.current.y = e.nativeEvent.contentOffset.y;
          }}
          onLayout={(e) => {
            rolagem.current.visivel = e.nativeEvent.layout.height;
          }}
          onContentSizeChange={(_w, h) => {
            rolagem.current.conteudo = h;
          }}
        >
          {config.map((bloco, index) => {
            const iconName = HOME_BLOCK_ICONS[bloco.key] || 'grid-outline';
            const desc = HOME_BLOCK_DESCRIPTIONS[bloco.key] || '';
            const emUso = arrastando === bloco.key || escolhido === bloco.key;

            return (
              <View
                key={bloco.key}
                onLayout={(e) => aoMedirCartao(bloco.key, e)}
                style={[
                  styles.card,
                  !bloco.visible && styles.cardOff,
                  emUso && styles.cardOrigem,
                  alvo === bloco.key && arrastando ? styles.cardAlvo : null,
                ]}
              >
                {/* Alça de reordenar: segurar e arrastar, ou tocar nela e depois
                    na alça de outro bloco. Só ela arrasta; em qualquer outro
                    ponto do cartão o dedo rola a lista. */}
                <View
                  {...responderDe(bloco.key).panHandlers}
                  accessible
                  focusable
                  accessibilityRole="button"
                  accessibilityLabel={`Reordenar ${HOME_BLOCK_LABELS[bloco.key]}`}
                  accessibilityHint="Arraste para mover, ou toque aqui e depois na alça de outro bloco."
                  accessibilityActions={[
                    { name: 'activate' },
                    { name: 'moveUp', label: `Mover ${HOME_BLOCK_LABELS[bloco.key]} para cima` },
                    { name: 'moveDown', label: `Mover ${HOME_BLOCK_LABELS[bloco.key]} para baixo` },
                  ]}
                  onAccessibilityAction={(e) => {
                    const acao = e.nativeEvent.actionName;
                    if (acao === 'activate') aoTocarNaAlca(bloco.key);
                    else if (acao === 'moveUp') mover(index, -1);
                    else if (acao === 'moveDown') mover(index, 1);
                  }}
                  {...(Platform.OS === 'web'
                    ? ({
                        onKeyDown: (e: { key: string; preventDefault: () => void }) => {
                          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            mover(index, e.key === 'ArrowUp' ? -1 : 1);
                          }
                        },
                      } as object)
                    : null)}
                  style={[
                    styles.alca,
                    emUso && styles.alcaAtiva,
                    { cursor: arrastando === bloco.key ? 'grabbing' : 'grab', touchAction: 'none' } as object,
                  ]}
                >
                  <Ionicons name="reorder-two-outline" size={22} color={emUso ? theme.paper : theme.inkFaint} />
                </View>

                {/* Micro-Ícone do Bloco */}
                <View
                  style={[
                    styles.iconWrap,
                    bloco.visible ? styles.iconWrapActive : styles.iconWrapOff,
                  ]}
                >
                  <Ionicons
                    name={iconName}
                    size={18}
                    color={bloco.visible ? theme.accent2 : theme.inkFaint}
                  />
                </View>

                {/* Textos */}
                <View style={styles.textCol}>
                  <Text style={[styles.label, !bloco.visible && styles.labelOff]}>
                    {HOME_BLOCK_LABELS[bloco.key]}
                  </Text>
                  {desc ? (
                    <Text style={styles.desc}>
                      {desc}
                    </Text>
                  ) : null}
                </View>

                {/* Switch Liga/Desliga */}
                <ToggleSwitch
                  value={bloco.visible}
                  onToggle={() => alternar(index)}
                  label={`Mostrar bloco ${HOME_BLOCK_LABELS[bloco.key]}`}
                />
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <AppPressable style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneBtnText}>Concluir personalização</Text>
          </AppPressable>
        </View>
      </Sheet>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    color: theme.ink,
    fontSize: type.titulo, fontFamily: fonts.regular },
  hint: {
    color: theme.inkFaint,
    fontSize: type.nota,
    marginTop: 2, fontFamily: fonts.light },
  closeBtn: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetSection: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  presetTitle: {
    color: theme.inkFaint,
    fontSize: type.legenda,
    letterSpacing: 0.5, fontFamily: fonts.light },
  presetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  presetChip: {
    backgroundColor: 'rgba(31,169,141,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(174,255,227,0.22)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  presetChipText: {
    color: theme.ink,
    fontSize: type.apoio, fontFamily: fonts.regular },
  /* A lista vai de uma borda à outra do painel e o recuo do Sheet
     (`spacing.xl`) vira padding do conteúdo dela: os cartões ficam onde
     estavam, e a faixa lateral, que antes era recuo morto, também rola. */
  list: {
    flexShrink: 1,
    marginHorizontal: -spacing.xl,
  },
  listContent: {
    gap: 8,
    paddingHorizontal: spacing.xl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
  },
  cardOff: {
    opacity: 0.5,
    backgroundColor: 'transparent',
  },
  /* Mesmos sinais do WidgetGrid: o bloco de origem esmaece e o que está sob o
     dedo ganha borda tracejada. A borda passa de 1 para 2 e o padding cede 1
     de cada lado, para nada refluir. */
  cardOrigem: { opacity: 0.45 },
  cardAlvo: {
    borderWidth: 2,
    borderColor: theme.accent2,
    borderStyle: 'dashed',
    paddingHorizontal: spacing.sm + 1,
    paddingVertical: spacing.sm - 1,
  },
  alca: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alcaAtiva: { backgroundColor: theme.accent2 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: 'rgba(31,169,141,0.18)',
  },
  iconWrapOff: {
    backgroundColor: theme.superficieInativa,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: theme.ink,
    fontSize: type.apoio, fontFamily: fonts.regular },
  labelOff: {
    color: theme.inkFaint,
  },
  desc: {
    color: theme.inkFaint,
    fontSize: type.legenda,
    lineHeight: lh(type.legenda, 'apoio'), fontFamily: fonts.light },
  footer: {
    paddingTop: spacing.md,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.rule,
  },
  doneBtn: {
    backgroundColor: theme.accent2,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#052229',
    fontSize: type.corpo, fontFamily: fonts.regular },
});
