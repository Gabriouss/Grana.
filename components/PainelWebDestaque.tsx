import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, radius, spacing, theme } from '@/lib/theme';
import { useBreakpoint } from '@/lib/breakpoints';
import { useReducedMotion } from '@/lib/motion';
import MolduraNavegador from '@/components/MolduraNavegador';
import AppPressable from '@/components/AppPressable';

/* Quanto o painel cresce sob o ponteiro. 1.06 é aproximação: é perceptível
   como "aproximou" sem empurrar a composição, que é o limite prático aqui,
   porque a moldura vive dentro de uma dobra de altura fixa. */
const ESCALA_HOVER = 1.06;

/**
 * A captura do painel web, dentro de uma moldura de navegador.
 *
 * As legendas contextuais continuam fora da captura para manter a composição
 * limpa. O link para a imagem em tamanho real existe para toque, teclado e
 * leitura ampliada; no desktop, o zoom sob o ponteiro continua como reforço
 * visual.
 */
export default function PainelWebDestaque({ compacto = false }: { compacto?: boolean }) {
  const { largura } = useBreakpoint();
  const reduzirMovimento = useReducedMotion();
  const [aproximado, setAproximado] = useState(false);
  const larguraMoldura = compacto ? Math.min(largura - 64, 460) : 660;

  /* Sem hover no compacto: lá o ponteiro não existe, e um estado que só se
     alcança com mouse não deve sequer ser montado. */
  const permiteZoom = !compacto && !reduzirMovimento;

  return (
    <View
      style={[
        styles.raiz,
        { width: larguraMoldura + 2 },
        permiteZoom && ({ transition: 'transform 260ms ease-out' } as any),
        aproximado && { transform: [{ scale: ESCALA_HOVER }] },
      ]}
      {...(permiteZoom
        ? { onMouseEnter: () => setAproximado(true), onMouseLeave: () => setAproximado(false) }
        : null)}
    >
      <MolduraNavegador
        src="/telas/inicio-web.png?v=20260905"
        legenda="Painel web do Grana. mostrando Livre para Gastar, comprometimento futuro e gastos por categoria de uma conta de exemplo"
        largura={larguraMoldura}
        inclinada={!compacto}
      />
      <AppPressable
        href="/telas/inicio-web.png?v=20260905"
        target="_blank"
        rel="noreferrer"
        accessibilityRole="link"
        accessibilityLabel="Abrir o painel web do Grana. em tamanho grande"
        style={({ hovered }) => [styles.linkAmpliar, hovered && styles.linkAmpliarHover]}
      >
        <View style={styles.linkAmpliarTexto}>
          <View style={styles.linkAmpliarPonto} />
          <Text style={styles.linkAmpliarRotulo}>Ver detalhes do painel</Text>
        </View>
      </AppPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { alignItems: 'center', alignSelf: 'center', gap: spacing.md },
  linkAmpliar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    backgroundColor: theme.paperRaised,
  },
  linkAmpliarHover: { borderColor: theme.accent2, backgroundColor: theme.hover },
  linkAmpliarTexto: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  linkAmpliarPonto: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent2 },
  linkAmpliarRotulo: { color: theme.ink, fontSize: 12, fontFamily: fonts.regular },
});
