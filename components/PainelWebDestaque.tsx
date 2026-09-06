import { createElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, theme, type } from '@/lib/theme';
import { useBreakpoint } from '@/lib/breakpoints';
import MolduraNavegador from '@/components/MolduraNavegador';

/** Legendas fora da captura, sem cobrir os dados que explicam. */
export default function PainelWebDestaque({ compacto = false }: { compacto?: boolean }) {
  const { largura } = useBreakpoint();
  const larguraMoldura = compacto ? Math.min(largura - 64, 460) : 660;
  return (
    <View style={[styles.raiz, { width: larguraMoldura + 2 }]}>
      <MolduraNavegador
        src="/telas/inicio-web.png?v=20260905"
        legenda="Painel web do Grana. mostrando Livre para Gastar, comprometimento futuro e gastos por categoria de uma conta de exemplo"
        largura={larguraMoldura}
        inclinada={!compacto}
      />
      <View style={styles.legendas}>
        <Text style={styles.texto}>Livre para Gastar: sua estimativa diária na coluna da esquerda.</Text>
        <Text style={styles.texto}>Comprometimento futuro: faturas e parcelas no gráfico central.</Text>
      </View>
      {createElement('a', {
        href: '/telas/inicio-web.png?v=20260905', target: '_blank', rel: 'noopener noreferrer',
        style: { color: theme.accent2, minHeight: 44, display: 'flex', alignItems: 'center', fontFamily: fonts.brandRegular, fontSize: 14 },
      }, 'Ampliar painel (nova aba)')}
    </View>
  );
}
const styles = StyleSheet.create({
  raiz: { alignItems: 'center', alignSelf: 'center', gap: spacing.md },
  legendas: { width: '100%', gap: spacing.sm, paddingTop: spacing.lg },
  texto: { color: theme.inkSoft, fontSize: type.legenda, lineHeight: type.legenda * 1.5, fontFamily: fonts.brandLight },
});
