import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts as uiFonts, radius, spacing, theme, type } from '@/lib/theme';
import AppPressable from '@/components/AppPressable';
import MolduraCelular from '@/components/MolduraCelular';

const fonts = { regular: uiFonts.brandRegular, light: uiFonts.brandLight };

type Tela = { src: string; rotulo: string; legenda: string };

const TELAS: Tela[] = [
  { src: '/telas/inicio-mobile.png', rotulo: 'Início', legenda: 'Tela de Início do Grana. no celular, com Livre para Gastar, cofrinhos e comprometimento futuro' },
  { src: '/telas/lancamentos-mobile.png', rotulo: 'Débito e Pix', legenda: 'Tela de lançamentos do Grana. no celular, com entradas, saídas e busca por categoria' },
  { src: '/telas/credito-mobile.png', rotulo: 'Crédito', legenda: 'Tela de cartões do Grana. no celular, com fatura atual, limite usado e compras parceladas' },
  { src: '/telas/contas-mobile.png', rotulo: 'Boletos', legenda: 'Tela de contas a pagar do Grana. no celular, com vencimento e valor de cada boleto' },
  { src: '/telas/desafios-mobile.png', rotulo: 'Desafios', legenda: 'Tela de Desafios do Grana. no celular, com sequência, Score e progresso de metas' },
];

/**
 * Carrossel navegável dentro de um `MolduraCelular` só — não 5 celulares
 * lado a lado, mas as 5 telas principais do app dentro do MESMO bezel,
 * trocando por controle da pessoa (setas, pílulas com nome, teclado).
 *
 * Vocabulário de controle emprestado de `BeneficiosHorizontais.tsx`
 * (índice/`irParaIndice`/`podeVoltar`/`podeAvancar`, indicador com
 * `accessibilityLiveRegion`, teclado ArrowLeft/ArrowRight) — mas aqui cada
 * tela tem NOME próprio (é uma aba real do app), não é intercambiável como
 * os cards de benefício, então os controles são pílulas rotuladas, não só
 * setas + "N de 5".
 */
export default function CarrosselTelasApp({ compacto = false }: { compacto?: boolean }) {
  const [indice, setIndice] = useState(0);
  const podeVoltar = indice > 0;
  const podeAvancar = indice < TELAS.length - 1;

  const irParaIndice = (proximo: number) => {
    setIndice(Math.min(TELAS.length - 1, Math.max(0, proximo)));
  };

  return (
    <View style={styles.raiz}>
      <View
        style={styles.celularArea}
        {...({
          tabIndex: 0,
          role: 'group',
          'aria-label': 'Telas do aplicativo Grana., use as setas do teclado para navegar',
          onKeyDown: (evento: KeyboardEvent) => {
            if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return;
            evento.preventDefault();
            irParaIndice(indice + (evento.key === 'ArrowRight' ? 1 : -1));
          },
        } as any)}
      >
        <MolduraCelular
          quadros={TELAS.map((t) => ({ src: t.src, legenda: t.legenda }))}
          indiceControlado={indice}
          largura={compacto ? 220 : 260}
        />
        <AppPressable
          onPress={() => irParaIndice(indice - 1)}
          disabled={!podeVoltar}
          accessibilityLabel="Tela anterior"
          style={({ hovered }) => [styles.seta, styles.setaEsquerda, hovered && podeVoltar && styles.setaHover, !podeVoltar && styles.setaDesativada]}
        >
          <Ionicons name="chevron-back" size={18} color={theme.ink} aria-hidden />
        </AppPressable>
        <AppPressable
          onPress={() => irParaIndice(indice + 1)}
          disabled={!podeAvancar}
          accessibilityLabel="Próxima tela"
          style={({ hovered }) => [styles.seta, styles.setaDireita, hovered && podeAvancar && styles.setaHover, !podeAvancar && styles.setaDesativada]}
        >
          <Ionicons name="chevron-forward" size={18} color={theme.ink} aria-hidden />
        </AppPressable>
      </View>

      <Text accessibilityLiveRegion="polite" style={styles.contadorOculto}>
        {TELAS[indice].rotulo}, tela {indice + 1} de {TELAS.length}
      </Text>

      <View style={styles.pilulas}>
        {TELAS.map((tela, i) => (
          <AppPressable
            key={tela.rotulo}
            onPress={() => irParaIndice(i)}
            accessibilityLabel={`Ver tela de ${tela.rotulo}`}
            accessibilityState={{ selected: i === indice }}
            style={({ hovered }) => [styles.pilula, i === indice && styles.pilulaAtiva, hovered && i !== indice && styles.pilulaHover]}
          >
            <Text style={[styles.pilulaTexto, i === indice && styles.pilulaTextoAtivo]}>{tela.rotulo}</Text>
          </AppPressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { alignItems: 'center', gap: spacing.lg },
  celularArea: { position: 'relative', alignItems: 'center' },
  seta: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.rule,
    ...({ transitionProperty: 'border-color, background-color', transitionDuration: '150ms' } as any),
  },
  setaEsquerda: { left: -14 },
  setaDireita: { right: -14 },
  setaHover: { borderColor: theme.accent2, backgroundColor: theme.hover },
  setaDesativada: { opacity: 0.35 },
  // O contador por extenso existe só pra leitor de tela — quem enxerga já
  // vê a pílula ativa; duplicar como texto visível seria redundante.
  contadorOculto: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 },
  pilulas: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs, maxWidth: 320 },
  pilula: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.rule,
    ...({ transitionProperty: 'border-color, background-color', transitionDuration: '150ms' } as any),
  },
  pilulaHover: { borderColor: theme.ruleStrong },
  pilulaAtiva: { backgroundColor: theme.accentDeep, borderColor: theme.accent2 },
  pilulaTexto: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  pilulaTextoAtivo: { color: theme.ink, fontFamily: fonts.regular },
});
