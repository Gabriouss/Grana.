import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, spacing, theme } from '@/lib/theme';
import { useBreakpoint } from '@/lib/breakpoints';
import MolduraNavegador from '@/components/MolduraNavegador';
import PainelWebAmpliado from '@/components/PainelWebAmpliado';
import AppPressable from '@/components/AppPressable';

const SRC = '/telas/inicio-web.png?v=20260925';
const LEGENDA = 'Painel web do Grana. mostrando Livre para Gastar, comprometimento futuro e gastos por categoria de uma conta de exemplo';

/**
 * A captura do painel web, dentro de uma moldura de navegador.
 *
 * As legendas contextuais continuam fora da captura para manter a composição
 * limpa. O link para a imagem em tamanho real existe para toque, teclado e
 * leitura ampliada; no desktop, o ponteiro amplia o painel a 70% da tela
 * (PainelWebAmpliado.web.tsx).
 */
export default function PainelWebDestaque({ compacto = false }: { compacto?: boolean }) {
  const { largura } = useBreakpoint();
  const larguraMoldura = compacto ? Math.min(largura - 64, 460) : 660;
  const camadaRef = useRef<HTMLDivElement | null>(null);
  const [aberta, setAberta] = useState(false);

  /* Sem hover no compacto: lá o ponteiro não existe, e um estado que só se
     alcança com mouse não deve sequer ser montado. Com Reduce Motion a
     ampliação continua (é leitura, não enfeite), só sem a animação. */
  const permiteZoom = !compacto && Platform.OS === 'web';

  // O ponteiro que sai do painel para a própria ampliação não fecha nada.
  function saiuDoPainel(e: { nativeEvent?: MouseEvent }) {
    const destino = e.nativeEvent?.relatedTarget as Node | null | undefined;
    if (destino && camadaRef.current?.contains(destino)) return;
    setAberta(false);
  }

  useEffect(() => {
    if (!aberta) return;
    const fechar = () => setAberta(false);
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    // Fecha no gesto de rolar, não no evento `scroll`: a página tem rolagem programática
    // (snap, parallax) que dispararia o fechamento sem ninguém mexer.
    window.addEventListener('keydown', tecla);
    window.addEventListener('wheel', fechar, { passive: true });
    window.addEventListener('touchmove', fechar, { passive: true });
    return () => {
      window.removeEventListener('keydown', tecla);
      window.removeEventListener('wheel', fechar);
      window.removeEventListener('touchmove', fechar);
    };
  }, [aberta]);

  return (
    <View style={[styles.raiz, { width: larguraMoldura + 2 }]}>
      <View {...(permiteZoom ? { onMouseEnter: () => setAberta(true), onMouseLeave: saiuDoPainel } : null)}>
        <MolduraNavegador src={SRC} legenda={LEGENDA} largura={larguraMoldura} inclinada={!compacto} />
      </View>
      {permiteZoom && (
        <PainelWebAmpliado src={SRC} legenda={LEGENDA} aberta={aberta} aoSair={() => setAberta(false)} camadaRef={camadaRef} />
      )}
      <AppPressable
        href={SRC}
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
