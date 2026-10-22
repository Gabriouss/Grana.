import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, radius, sombras, spacing, theme, type } from '@/lib/theme';
import { useBreakpoint } from '@/lib/breakpoints';
import { useReducedMotion } from '@/lib/motion';
import AppPressable from '@/components/AppPressable';
import { FALAS_NARRADOR, type FalaNarrador } from '@/lib/narrador-landing';

/**
 * Granabô narrador da landing (autor, 21/10/2026). Fica no canto inferior
 * esquerdo, do lado oposto ao "Explorar", e troca de fala conforme a seção que
 * está no meio da tela. As falas moram em lib/narrador-landing.ts.
 *
 * Tocar no mascote recolhe ou abre o balão; a escolha fica neste navegador. Com
 * Reduce Motion a fala troca sem a entrada animada.
 */
const IMAGENS: Record<FalaNarrador['imagem'], number> = {
  feliz: require('../assets/granabo/granabo-feliz.png'),
  pensando: require('../assets/granabo/granabo-pensando.png'),
  piscando: require('../assets/granabo/granabo-piscando.png'),
  saudacao: require('../assets/granabo/granabo-saudacao.webp'),
};
const CHAVE_RECOLHIDO = 'grana-narrador-recolhido';

function lerRecolhido(): boolean {
  try { return window.localStorage.getItem(CHAVE_RECOLHIDO) === '1'; } catch { return false; }
}
function gravarRecolhido(v: boolean) {
  try { window.localStorage.setItem(CHAVE_RECOLHIDO, v ? '1' : '0'); } catch { /* sem armazenamento: vale só nesta visita */ }
}

let estiloInjetado = false;
function injetarEstilo() {
  if (estiloInjetado || typeof document === 'undefined') return;
  estiloInjetado = true;
  const tag = document.createElement('style');
  tag.textContent = '@keyframes granaboNarradorFala { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: none; } }';
  document.head.appendChild(tag);
}

export default function GranaboNarrador() {
  const { largura } = useBreakpoint();
  const compacto = largura < 700;
  const reduzirMovimento = useReducedMotion();
  const [fala, setFala] = useState<FalaNarrador | null>(null);
  const [recolhido, setRecolhido] = useState(false);

  useEffect(() => {
    setRecolhido(lerRecolhido());
    injetarEstilo();
    if (typeof IntersectionObserver === 'undefined') return;
    const visiveis = new Map<string, number>();
    /* A faixa do meio da tela decide: a seção que a cruza é a que a pessoa está lendo. */
    const observador = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) visiveis.set(e.target.id, e.intersectionRatio);
        else visiveis.delete(e.target.id);
      }
      const atual = [...visiveis].sort((a, b) => b[1] - a[1])[0]?.[0];
      setFala(FALAS_NARRADOR.find((f) => f.secao === atual) ?? null);
    }, { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.01] });
    /* As seções montam depois do primeiro quadro (RevealOnScroll, Dobra): tenta de novo até achar todas. */
    let tentativas = 0;
    const procurar = () => {
      let faltando = 0;
      for (const f of FALAS_NARRADOR) {
        const el = document.getElementById(f.secao);
        if (el) observador.observe(el); else faltando++;
      }
      if (faltando && ++tentativas < 10) setTimeout(procurar, 800);
    };
    procurar();
    return () => observador.disconnect();
  }, []);

  if (!fala) return null;
  const alternar = () => setRecolhido((v) => { gravarRecolhido(!v); return !v; });
  const tamanho = compacto ? 72 : 104;

  return (
    <View style={[styles.raiz, compacto && styles.raizCompacta]} role="complementary" aria-label="Granabô, o assistente do Grana.">
      <AppPressable
        onPress={alternar}
        accessibilityRole="button"
        accessibilityLabel={recolhido ? 'Mostrar o que o Granabô está dizendo' : 'Recolher a fala do Granabô'}
        style={styles.mascote}
      >
        <Image source={IMAGENS[fala.imagem]} style={{ width: tamanho, height: tamanho }} accessibilityIgnoresInvertColors />
      </AppPressable>
      {!recolhido && (
        <View
          key={fala.secao}
          style={[styles.balao, compacto && styles.balaoCompacto, (reduzirMovimento ? null : { animation: 'granaboNarradorFala 260ms cubic-bezier(0.22, 1, 0.36, 1) both' }) as any]}
          aria-live="polite"
        >
          <Text style={[styles.texto, compacto && styles.textoCompacto]}>{fala.texto}</Text>
          <AppPressable onPress={alternar} accessibilityRole="button" accessibilityLabel="Recolher a fala do Granabô" style={styles.fechar} hitSlop={8}>
            <Ionicons name="close" size={14} color={theme.inkSoft} />
          </AppPressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { ...({ position: 'fixed' } as any), left: spacing.xl, bottom: spacing.xl, zIndex: 40, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, maxWidth: 380 },
  raizCompacta: { left: spacing.lg, bottom: spacing.xl, maxWidth: '72%' as any },
  mascote: { borderRadius: 999 },
  balao: {
    flexShrink: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs,
    paddingVertical: spacing.sm, paddingLeft: spacing.md, paddingRight: spacing.sm, marginBottom: spacing.md,
    backgroundColor: theme.paperRaised, borderWidth: 1, borderColor: theme.ruleStrong,
    borderRadius: radius.lg, borderBottomLeftRadius: radius.sm, boxShadow: sombras.cardHeroi,
  } as any,
  balaoCompacto: { paddingVertical: spacing.xs, marginBottom: spacing.sm },
  texto: { flexShrink: 1, color: theme.ink, fontFamily: fonts.light, fontSize: type.nota, lineHeight: 21, ...({ textWrap: 'balance' } as any) },
  textoCompacto: { fontSize: type.micro, lineHeight: 17 },
  fechar: { padding: 2, marginTop: 1 },
});
