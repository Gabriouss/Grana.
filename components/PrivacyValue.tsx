import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { usePrivacy } from '@/lib/privacy-context';
import { fonts, theme } from '@/lib/theme';

/**
 * Modo privacidade — o valor volta a aparecer BORRADO, sem o vazamento que
 * fez o blur ser removido antes.
 *
 * ── Por que o blur sozinho não servia ───────────────────────────────────────
 *
 * A primeira versão aplicava `filter: blur(7px)` no próprio valor. Visualmente
 * era o que se queria, mas o número real continuava ali: dava para ler no
 * inspetor, selecionar e copiar, ouvir pelo leitor de tela, e recuperar
 * inteiro desligando o CSS. Por isso virou `••••` — seguro, e sem graça.
 *
 * ── Como as duas coisas convivem agora ──────────────────────────────────────
 *
 * O valor real simplesmente NÃO É RENDERIZADO quando o modo está ligado. No
 * lugar dele entra um número falso e fixo (`MASCARA`), e é esse falso que
 * recebe o blur. Quem inspecionar, copiar ou desligar o CSS encontra
 * "R$ 0.000,00" — nunca o valor da pessoa.
 *
 * A máscara tem largura fixa de propósito: repetir a largura do número real
 * entregaria a ordem de grandeza (a diferença entre R$ 12,50 e R$ 12.500,00 é
 * visível mesmo borrada), que é justamente o que alguém olhando a tela por
 * cima do ombro quer saber.
 *
 * ── Tipografia ─────────────────────────────────────────────────────────────
 *
 * A máscara é injetada DENTRO do elemento filho, por `cloneElement`, em vez de
 * substituí-lo por um `<Text>` próprio. Assim ela herda o `style` que a tela
 * já definiu — tamanho, cor, `tabular-nums` — e o borrão fica com a cara de um
 * valor borrado em qualquer contexto, do total de 32px da Início à legenda de
 * 13px do gráfico. Sem isso, seria preciso passar o tamanho da fonte em cada
 * um dos ~30 pontos de uso.
 *
 * ── Plataformas ────────────────────────────────────────────────────────────
 *
 * `filter: blur()` existe na web e no Android (New Architecture, padrão no SDK
 * 57). O iOS não expõe `filter` no React Native, então lá o desfoque vem de um
 * BlurView por cima. A diferença é só estética: em toda plataforma o que está
 * embaixo do efeito já é o número falso, então nenhuma delas depende do blur
 * para proteger nada.
 */

/** Número falso que aparece no lugar do valor. Nunca derivado do real. */
const MASCARA = 'R$ 0.000,00';

const CSS_BLUR = 'blur(7px)';
const SUPORTA_CSS_BLUR = Platform.OS === 'web' || Platform.OS === 'android';

export default function PrivacyValue({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { hidden } = usePrivacy();

  if (!hidden) {
    return <View style={[styles.base, style]}>{children}</View>;
  }

  /* Todos os pontos de uso passam um `<Text>` único. O fallback existe para
     não quebrar caso algum dia entre outra coisa aqui. */
  const mascarado = isValidElement(children) ? (
    cloneElement(children as ReactElement<{ children?: ReactNode; selectable?: boolean; style?: StyleProp<TextStyle> }>, {
      children: MASCARA,
      selectable: false,
    })
  ) : (
    <Text style={styles.mascaraPadrao}>{MASCARA}</Text>
  );

  return (
    <View
      style={[styles.base, styles.oculto, style]}
      accessible
      accessibilityLabel="Valor oculto"
      /* `no-hide-descendants` no Android e `aria-hidden` na web impedem que o
         leitor de tela leia a máscara — a pessoa ouve "Valor oculto", que é a
         informação verdadeira, e não um R$ 0.000,00 que não existe. */
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <View
        style={[[styles.camada, SUPORTA_CSS_BLUR && ({ filter: CSS_BLUR } as ViewStyle)], { pointerEvents: 'none' }]}
      >
        {mascarado}
      </View>
      {!SUPORTA_CSS_BLUR && (
        <BlurView intensity={26} tint="dark" style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}  />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { position: 'relative' },
  /* Sem `overflow: hidden`: o borrão precisa vazar um pouco além do texto pra
     parecer desfoque, e não um retângulo recortado. */
  oculto: { justifyContent: 'center' },
  camada: { ...({ userSelect: 'none' } as ViewStyle) },
  mascaraPadrao: { color: theme.inkFaint, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
});
