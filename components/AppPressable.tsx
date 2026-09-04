import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, View, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '@/lib/motion';

type HoverState = { pressed: boolean; hovered: boolean };

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle> | ((state: HoverState) => StyleProp<ViewStyle>);
  /** Ativa o leve "encolher" de toque (padrão true). Desative se o alvo não pode oscilar de tamanho. */
  scaleOnPress?: boolean;
  /** Só web: repassado até o `View` por baixo do Pressable, que o
      react-native-web reconhece e usa pra renderizar o nó como uma tag `<a
      href>` de verdade (mantendo todo o resto do componente — estilo função,
      hover, encolher no toque) em vez de um `<div>` clicável só por JS. Sem
      efeito nenhum no nativo (a prop não é lida) — não precisa de guarda de
      Platform aqui, quem decide passar ou não é a tela que usa. */
  href?: string;
  /** Só web: atributos do link externo renderizado pelo react-native-web. */
  target?: '_self' | '_blank' | '_parent' | '_top';
  rel?: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * No navegador, Pressable sozinho não dá nenhuma pista visual ao passar o
 * mouse por cima — só existe feedback de "pressed" (clique/toque). Este
 * wrapper acrescenta um estado "hovered" real via onHoverIn/onHoverOut
 * (eventos que só disparam com mouse; inofensivos e ignorados em toque
 * ou nativo) para as telas poderem estilizar o hover. No iOS/Android,
 * "hovered" nunca vira true, então o visual e o comportamento continuam
 * idênticos a um Pressable comum.
 *
 * Também aplica um encolher sutil (1 -> 0.96) no press-in/press-out em
 * todo o app pro toque parecer "premium" em vez de trocar de estilo sem
 * transição nenhuma. No nativo isso usa Animated (spring). Na web, em vez
 * de embrulhar o Pressable com Animated.createAnimatedComponent — o que
 * faz o react-native-web vazar a prop interna `collapsable` do Animated
 * pra um atributo DOM inválido e disparar um erro visível na tela — a
 * escala é uma transform estática ligada ao estado `pressed`, suavizada
 * por uma transição CSS (`transitionProperty`), que o react-native-web
 * já traduz nativamente.
 */
/**
 * Traduz `accessibilityState` para atributos `aria-*`.
 *
 * O react-native-web encaminha `aria-checked`, `aria-selected`,
 * `aria-expanded`, `aria-disabled` e `aria-busy` como props diretas, e NÃO
 * lê o objeto `accessibilityState` do React Native. O resultado, medido na
 * tela de cadastro, era um `role="checkbox"` que nunca emitia `aria-checked`,
 * nem marcado nem desmarcado: quem usa leitor de tela ouvia "caixa de seleção"
 * sem o estado, bem no aceite dos Termos.
 *
 * A tradução aqui cobre de uma vez os 16 arquivos que dependiam só do objeto,
 * em vez de exigir que cada tela lembre de passar as duas formas.
 */
function ariaDoEstado(estado: PressableProps['accessibilityState']) {
  if (!estado) return null;
  const aria: Record<string, boolean> = {};
  if (typeof estado.checked === 'boolean') aria['aria-checked'] = estado.checked;
  if (typeof estado.selected === 'boolean') aria['aria-selected'] = estado.selected;
  if (typeof estado.expanded === 'boolean') aria['aria-expanded'] = estado.expanded;
  if (typeof estado.disabled === 'boolean') aria['aria-disabled'] = estado.disabled;
  if (typeof estado.busy === 'boolean') aria['aria-busy'] = estado.busy;
  return aria;
}

/**
 * Devolve o `hitSlop` na web.
 *
 * O `Pressable` do react-native-web ignora `hitSlop` por completo: a prop só
 * existe no `Touchable` antigo. São 65 usos no app, e há componente cujo
 * desenho depende dela, como o `HeaderAction`, um círculo de 36px que só
 * alcança os 48dp do Android por causa do acréscimo.
 *
 * A compensação é um filho absoluto com deslocamento negativo. Fica fora do
 * fluxo, então não mexe em `flexDirection` nem `gap` do conteúdo, é
 * transparente, e o clique nela sobe para o Pressable. O comportamento passa a
 * ser o mesmo do nativo, inclusive a sobreposição entre vizinhos muito
 * próximos, que o `hitSlop` também produz lá.
 */
function bordasDoHitSlop(hitSlop: PressableProps['hitSlop']) {
  if (hitSlop == null) return null;
  if (typeof hitSlop === 'number') return { top: -hitSlop, bottom: -hitSlop, left: -hitSlop, right: -hitSlop };
  return {
    top: -(hitSlop.top ?? 0),
    bottom: -(hitSlop.bottom ?? 0),
    left: -(hitSlop.left ?? 0),
    right: -(hitSlop.right ?? 0),
  };
}

export default function AppPressable({ style, onHoverIn, onHoverOut, onPressIn, onPressOut, scaleOnPress = true, accessibilityRole, target, rel, ...rest }: Props) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const reduzirMovimento = useReducedMotion();
  const animarPressao = scaleOnPress && !reduzirMovimento;
  const papel = accessibilityRole ?? (rest.href ? 'link' : rest.onPress ? 'button' : undefined);

  useEffect(() => {
    if (reduzirMovimento) scale.setValue(1);
  }, [reduzirMovimento, scale]);

  const merged: HoverState = { pressed, hovered: Platform.OS === 'web' && hovered };
  const resolvedStyle = typeof style === 'function' ? style(merged) : style;

  /* `onHoverIn` também dispara num TOQUE em telemóvel/tablet — o comentário
     acima ("inofensivos e ignorados em toque") era a suposição, mas vários
     navegadores móveis emitem o hover sintético do Pressable ao tocar, e
     como não existe um "mouse saindo" depois de erguer o dedo, `onHoverOut`
     nunca vem: o botão fica preso no estado hover pra sempre (achado real —
     o CTA de conversão travava com o brilho e o reflexo diagonal acesos
     depois de um toque). `(hover: hover) and (pointer: fine)` só é
     verdadeiro com mouse/trackpad de verdade; em toque a checagem barra o
     hover antes de ele entrar no estado. */
  function suportaHoverReal() {
    return typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches === true;
  }

  function handleHoverIn(e: any) {
    if (Platform.OS === 'web' && !suportaHoverReal()) return;
    setHovered(true);
    onHoverIn?.(e);
  }
  function handleHoverOut(e: any) {
    setHovered(false);
    onHoverOut?.(e);
  }
  function handlePressIn(e: GestureResponderEvent) {
    setPressed(true);
    if (animarPressao && Platform.OS !== 'web') {
      Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
    }
    onPressIn?.(e);
  }
  function handlePressOut(e: GestureResponderEvent) {
    setPressed(false);
    if (animarPressao && Platform.OS !== 'web') {
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
    }
    onPressOut?.(e);
  }

  if (Platform.OS === 'web') {
    const alvoDeToque = bordasDoHitSlop(rest.hitSlop);

    /* Barra de espaço nos controles de estado.
     *
     * O react-native-web renderiza o Pressable como `div` com `role`, e trata
     * só o Enter. Para `button` isso passa, mas a convenção ARIA de checkbox,
     * radio e switch é a BARRA DE ESPAÇO, e era ela que faltava: medido na
     * tela de cadastro, o aceite dos Termos não alternava com Space (e a
     * página ainda rolava), só com Enter. Link fica de fora de propósito, que
     * é acionado por Enter e nunca por espaço. */
    const precisaDeEspaco = !rest.href && !!rest.onPress
      && (papel === 'checkbox' || papel === 'radio' || papel === 'switch');
    const aoTeclar = precisaDeEspaco
      ? (evento: any) => {
          if (evento?.key !== ' ' && evento?.key !== 'Spacebar') return;
          evento.preventDefault?.();
          rest.onPress?.(evento);
        }
      : undefined;
    const webTransition: any = animarPressao
      ? {
          transform: [{ scale: pressed ? 0.96 : 1 }],
          transitionProperty: 'transform',
          transitionDuration: '150ms',
          transitionTimingFunction: 'ease-out',
        }
      : null;
    return (
      <Pressable
        {...rest}
        {...(rest.href && (target || rel) ? ({ hrefAttrs: { target, rel } } as any) : null)}
        {...(ariaDoEstado(rest.accessibilityState) as any)}
        {...(aoTeclar ? ({ onKeyDown: aoTeclar } as any) : null)}
        accessibilityRole={papel}
        onHoverIn={handleHoverIn}
        onHoverOut={handleHoverOut}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[resolvedStyle, webTransition]}
      >
        {rest.children as any}
        {alvoDeToque && typeof rest.children !== 'function' ? (
          <View style={[{ position: 'absolute' }, alvoDeToque as any]} aria-hidden />
        ) : null}
      </Pressable>
    );
  }

  return (
    <AnimatedPressable
      {...rest}
      accessibilityRole={papel}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[resolvedStyle, { transform: [{ scale }] }]}
    />
  );
}
