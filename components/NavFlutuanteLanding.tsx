import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, fonts, type, lh } from '@/lib/theme';
import { CORTES } from '@/lib/breakpoints';
import { useReducedMotion } from '@/lib/motion';
import AppPressable from './AppPressable';

const ID_PAINEL = 'nav-secoes-painel';
const ID_PRIMEIRO_ITEM = 'nav-secoes-primeiro-item';
const ID_GATILHO = 'nav-secoes-gatilho';

export default function NavFlutuanteLanding({
  itens,
  onNavigate,
}: {
  itens: readonly { rotulo: string; href: string; icone: keyof typeof Ionicons.glyphMap }[];
  onNavigate: (href: string, evento: { preventDefault?: () => void }) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const progresso = useRef(new Animated.Value(0)).current;
  const menuJaAbriu = useRef(false);
  const reduzirMovimento = useReducedMotion();
  const largura = useWindowDimensions().width;
  const ehAmplo = largura >= CORTES.amplo;
  const ehCompacto = largura < CORTES.medio;

  useEffect(() => {
    if (reduzirMovimento) {
      progresso.setValue(aberto ? 1 : 0);
      return;
    }
    Animated.timing(progresso, {
      toValue: aberto ? 1 : 0,
      duration: aberto ? 180 : 130,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [aberto, progresso, reduzirMovimento]);

  /* O painel é montado sob demanda. Depois que o DOM recebe os links, move o
     foco para o primeiro; ao fechar, devolve ao disparador. Sem isso o link
     focado era desmontado e o navegador caía em <body>.

     `preventScroll` porque `focus()` sem ele pede ao navegador que role para
     trazer o elemento focado à vista, e aqui isso só poderia desfazer a
     navegação que a pessoa acabou de escolher. Medido neste componente o
     foco não move a rolagem, já que o gatilho é `position: fixed`; a opção
     fica como garantia de que continue assim se o botão sair do canto. */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof window === 'undefined') return;

    if (aberto) {
      menuJaAbriu.current = true;
      const quadro = window.requestAnimationFrame(() => {
        (document.getElementById(ID_PRIMEIRO_ITEM) as HTMLElement | null)?.focus({ preventScroll: true });
      });
      return () => window.cancelAnimationFrame(quadro);
    }

    if (menuJaAbriu.current) {
      const quadro = window.requestAnimationFrame(() => {
        (document.getElementById(ID_GATILHO) as HTMLElement | null)?.focus({ preventScroll: true });
      });
      return () => window.cancelAnimationFrame(quadro);
    }
  }, [aberto]);

  /* Escape fecha, como qualquer menu suspenso. */
  useEffect(() => {
    if (!aberto || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aberto]);

  const rotacao = progresso.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });
  const deslocamento = progresso.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <>
      {/* Véu: existe só para capturar o toque fora e fechar. Transparente,
          porque escurecer a página seria tratar uma navegação como se fosse um
          diálogo que exige decisão. */}
      {aberto && <Pressable style={styles.veu} onPress={() => setAberto(false)} accessibilityLabel="Fechar menu de seções" />}

      <View style={[styles.ancora, ehCompacto && styles.ancoraCompacta, { pointerEvents: 'box-none' }]} >
        {aberto && (
          <Animated.View
            nativeID={ID_PAINEL}
            /* Sobe alguns pixels enquanto aparece, saindo de perto do botão que
               o abriu. O deslocamento é pequeno de propósito: o painel nasce
               colado no gatilho e a origem do movimento já é lida ali.

               `translateY` não atrapalha o toque durante a animação: o
               navegador testa o clique na caixa já transformada, então o que
               se vê e o que recebe o dedo são a mesma coisa em qualquer quadro. */
            style={[styles.painel, { opacity: progresso, transform: [{ translateY: deslocamento }] }]}
            role="navigation"
            accessibilityLabel="Seções da página"
          >
            {itens.map((item, indice) => (
              <AppPressable
                key={item.href}
                nativeID={indice === 0 ? ID_PRIMEIRO_ITEM : undefined}
                href={item.href}
                scaleOnPress={false}
                onPress={(evento) => {
                  onNavigate(item.href, evento);
                  setAberto(false);
                }}
                style={({ hovered }) => [styles.item, hovered && styles.itemHover]}
              >
                <Ionicons name={item.icone} size={17} color={theme.accent2} aria-hidden />
                <Text style={styles.itemTexto}>{item.rotulo}</Text>
              </AppPressable>
            ))}
          </Animated.View>
        )}

        <AppPressable
          nativeID={ID_GATILHO}
          onPress={() => setAberto((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={aberto ? 'Fechar menu de seções' : 'Abrir menu de seções'}
          accessibilityState={{ expanded: aberto }}
          aria-controls={ID_PAINEL}
          aria-expanded={aberto}
          style={({ hovered }) => [styles.botao, ehCompacto && styles.botaoCompacto, ehAmplo && styles.botaoAmplo, hovered && styles.botaoHover]}
        >
          <View style={styles.botaoConteudo}>
            <Animated.View style={{ transform: [{ rotate: rotacao }] }}>
              <Ionicons name={aberto ? 'close' : 'menu'} size={22} color={theme.paper} aria-hidden />
            </Animated.View>
            {ehAmplo ? <Text style={styles.botaoTexto}>{aberto ? 'Fechar' : 'Explorar'}</Text> : null}
          </View>
        </AppPressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  /* `fixed`, não `absolute`: o botão precisa ficar parado no canto enquanto a
     página rola. Só existe na web, que é onde esta tela roda. */
  veu: { ...({ position: 'fixed' } as any), top: 0, left: 0, right: 0, bottom: 0, zIndex: 48 },
  ancora: {
    ...({ position: 'fixed' } as any),
    right: spacing.xl,
    bottom: spacing.xl,
    alignItems: 'flex-end',
    zIndex: 49,
  },
  ancoraCompacta: { right: spacing.xs, bottom: spacing.sm },
  painel: {
    marginBottom: spacing.md,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: 6,
    gap: 2,
    minWidth: 208,
    ...({ boxShadow: '0 18px 44px -14px rgba(0,0,0,0.65)' } as any),
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    ...({ textDecorationLine: 'none' } as any),
  },
  itemHover: { backgroundColor: theme.paper },
  itemTexto: { color: theme.ink, fontSize: type.apoio, lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.light },
  botao: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...({ boxShadow: '0 10px 30px -8px rgba(31,169,141,0.75)', transitionProperty: 'box-shadow, transform', transitionDuration: '180ms' } as any),
  },
  botaoCompacto: { width: 44, height: 44, borderRadius: 22 },
  botaoAmplo: { width: 128, borderRadius: radius.pill },
  botaoConteudo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  botaoTexto: { color: theme.paper, fontSize: type.apoio, fontFamily: fonts.regular },
  botaoHover: {
    ...({ boxShadow: '0 14px 38px -6px rgba(31,169,141,0.95)', transform: [{ translateY: -2 }] } as any),
  },
});
