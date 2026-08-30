import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import { useTabBarInset } from '@/lib/tab-bar';
import AppPressable from './AppPressable';
import { useReducedMotion } from '@/lib/motion';
import { useModalAccessibility } from '@/lib/modal-accessibility';

export default function FabButton({
  onAddIncome,
  onAddExpense,
  onAddBill,
  onAddCredit,
}: {
  onAddIncome: () => void;
  onAddExpense: () => void;
  /** Omitido em telas que não lidam com contas/boletos (ex: Lançamentos) — o item "Boleto" só aparece quando informado. */
  onAddBill?: () => void;
  /** Abre o lançamento de uma compra no cartão de crédito. Omitido em telas onde não faz sentido. */
  onAddCredit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const painelRef = useRef<View>(null);
  const reduzirMovimento = useReducedMotion();
  const { total: tabBarTotal } = useTabBarInset();
  useModalAccessibility(painelRef, mounted);

  useEffect(() => {
    if (open) {
      setMounted(true);
      if (reduzirMovimento) {
        progress.setValue(1);
        return;
      }
      Animated.spring(progress, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 8 }).start();
    } else if (mounted) {
      if (reduzirMovimento) {
        progress.setValue(0);
        setMounted(false);
        return;
      }
      Animated.timing(progress, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [mounted, open, progress, reduzirMovimento]);

  /* Fecha o menu à força quando a tela perde o foco.
   *
   * Sem isto, um item do menu que NAVEGA (hoje só o "Crédito", que leva pra
   * tela de Cartões) deixava este componente num estado impossível de sair:
   * `setMounted(false)` só acontece no callback da animação de saída, e a
   * navegação parte no mesmo toque. Se o callback não roda — e no nativo ele
   * não roda de forma confiável quando a tela sai de foco no meio da
   * animação — `mounted` fica preso em `true`.
   *
   * O estrago disso é grande porque, com `mounted` verdadeiro, este
   * componente devolve um <Modal> de tela cheia, e no React Native um Modal
   * aparece por cima de TUDO, inclusive de outra tela da pilha. O
   * `Pressable` com `StyleSheet.absoluteFill` lá dentro passa a interceptar
   * cada toque da tela seguinte: a pessoa chega em Cartões e nenhum botão
   * responde, sem nada visível explicando o porquê.
   *
   * A limpeza do `useFocusEffect` roda no blur, ou seja exatamente quando a
   * navegação acontece, e zera os três estados de uma vez. */
  useFocusEffect(
    useCallback(() => {
      return () => {
        setOpen(false);
        setMounted(false);
        progress.setValue(0);
      };
    }, [progress])
  );

  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] });

  const conteudo: ReactNode = (
    <>
      {mounted && (
        <Animated.View
          style={[
            styles.menu,
            {
              opacity: progress,
              transform: [
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
              ],
            },
          ]}
        >
          <AppPressable
            style={({ hovered }) => [styles.menuItem, hovered && styles.menuItemHover]}
            onPress={() => {
              setOpen(false);
              onAddIncome();
            }}
          >
            <Ionicons name="arrow-up-circle-outline" size={18} color={theme.up} />
            <Text style={styles.menuText}>Entrada</Text>
          </AppPressable>

          <AppPressable
            style={({ hovered }) => [styles.menuItem, hovered && styles.menuItemHover]}
            onPress={() => {
              setOpen(false);
              onAddExpense();
            }}
          >
            <Ionicons name="arrow-down-circle-outline" size={18} color={theme.down} />
            <Text style={styles.menuText}>Saída</Text>
          </AppPressable>

          {onAddBill && (
            <AppPressable
              style={({ hovered }) => [styles.menuItem, hovered && styles.menuItemHover]}
              onPress={() => {
                setOpen(false);
                onAddBill?.();
              }}
            >
              <Ionicons name="card-outline" size={18} color={theme.ink} />
              <Text style={styles.menuText}>Boleto</Text>
            </AppPressable>
          )}

          {onAddCredit && (
            <AppPressable
              style={({ hovered }) => [styles.menuItem, hovered && styles.menuItemHover]}
              onPress={() => {
                setOpen(false);
                onAddCredit();
              }}
            >
              <Ionicons name="card" size={18} color={theme.accent2} />
              <Text style={styles.menuText}>Crédito</Text>
            </AppPressable>
          )}
        </Animated.View>
      )}

      <AppPressable
        style={({ hovered }) => [styles.fabBtn, open && styles.fabBtnOpen, hovered && styles.fabBtnHover]}
        onPress={() => setOpen((prev) => !prev)}
        accessibilityRole="button"
        accessibilityLabel="Novo lançamento"
        accessibilityState={{ expanded: open }}
      >
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="add" size={24} color={theme.paper} />
        </Animated.View>
      </AppPressable>
    </>
  );

  const posicaoStyle = [styles.fabContainer, { bottom: tabBarTotal + spacing.md }];

  /* Fechado: o botão vive direto na tela, como um View comum — é só o "+"
     flutuante de sempre. Aberto: o mesmo bloco migra pra dentro de um
     <Modal>, sobre um fundo transparente que cobre a tela inteira e fecha ao
     toque nela.

     Antes o menu não tinha nenhum fundo — só o próprio conteúdo boiando por
     cima da tela, sem nada capturando o toque "de fora" pra fechar. A
     primeira tentativa de corrigir isso envolveu um Pressable extra,
     `flex:1`, só pra blindar o menu contra o fundo — mas `flex:1` faz esse
     blindador esticar pela tela INTEIRA, então ele mesmo passava a capturar
     qualquer toque (inclusive os que deveriam fechar o menu), e nada nunca
     chegava até o fundo. A correção certa: o próprio `fabContainer` — que já
     é do tamanho exato do menu+botão, não da tela — vira o blindador
     (`Pressable` com `onPress` vazio) quando está dentro do Modal. */
  return open || mounted ? (
    <Modal visible transparent animationType="none" onRequestClose={() => setOpen(false)}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)}>
        <Pressable ref={painelRef} style={posicaoStyle} onPress={() => {}} accessibilityViewIsModal role="dialog" focusable>
          {conteudo}
        </Pressable>
      </Pressable>
    </Modal>
  ) : (
    <View style={posicaoStyle}>{conteudo}</View>
  );
}

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    right: 20,
    /* `bottom` vem do useTabBarInset() no JSX: o FAB precisa ficar acima da
       barra flutuante, e a altura dela depende da navegação do sistema. */
    alignItems: 'flex-end',
    zIndex: 40,
  },
  menu: {
    backgroundColor: theme.paperRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: 6,
    marginBottom: 10,
    gap: 4,
    minWidth: 140,
    ...({ boxShadow: '0 6px 14px rgba(0,0,0,0.2)' } as any),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  menuItemHover: { backgroundColor: theme.paper },
  menuText: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  fabBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...({ boxShadow: '0 6px 12px rgba(0,0,0,0.3)' } as any),
  },
  fabBtnOpen: { backgroundColor: theme.inkSoft },
  fabBtnHover: { opacity: 0.9 },
});
