import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '@/lib/theme';
import { useBreakpoint } from '@/lib/breakpoints';
import { useReducedMotion } from '@/lib/motion';
import MolduraNavegador from '@/components/MolduraNavegador';

/* Quanto o painel cresce sob o ponteiro. 1.06 é aproximação: é perceptível
   como "aproximou" sem empurrar a composição, que é o limite prático aqui,
   porque a moldura vive dentro de uma dobra de altura fixa. */
const ESCALA_HOVER = 1.06;

/**
 * A captura do painel web, dentro de uma moldura de navegador.
 *
 * Duas coisas saíram daqui em 13/09/2026, a pedido do autor: as duas legendas
 * que explicavam onde olhar na imagem ("Livre para Gastar: sua estimativa
 * diária na coluna da esquerda" e a do comprometimento futuro), e o link
 * "Ampliar painel (nova aba)". No lugar do link, a imagem cresce sob o
 * ponteiro.
 *
 * **O que se perdeu junto, e vale saber:** o link era o único jeito de ver a
 * captura em tamanho real, e continuava funcionando no teclado e no toque. O
 * zoom de ponteiro não atende nenhum dos dois. A imagem segue com texto
 * alternativo descritivo em `MolduraNavegador`, que é o que sustenta a
 * compreensão de quem não usa mouse; o zoom é reforço, não a informação.
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
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { alignItems: 'center', alignSelf: 'center', gap: spacing.md },
});
