import { useEffect, useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts as uiFonts, radius, spacing, theme, type } from '@/lib/theme';
import { useBreakpoint } from '@/lib/breakpoints';
import { useReducedMotion } from '@/lib/motion';
import MolduraNavegador from '@/components/MolduraNavegador';

const fonts = { regular: uiFonts.brandRegular, light: uiFonts.brandLight };

type Balao = {
  rotulo: string;
  texto: string;
  /** Posição em porcentagem da moldura, não pixel — o balão acompanha o
      redimensionamento do painel em vez de vazar da borda numa largura
      diferente da que foi desenhada. */
  top: string;
  lado: 'esquerda' | 'direita';
  /** Segundos do ciclo de flutuação e do atraso pra começar — cada balão
      recebe um par ÚNICO (nunca dois iguais, nunca sincronizado com a
      moldura por baixo): é o que faz a composição inteira não "respirar"
      junto, técnica documentada no teardown da Dinzo (seção 4). */
  duracaoS: number;
  atrasoS: number;
};

const BALOES: Balao[] = [
  { rotulo: 'LIVRE PARA GASTAR', texto: 'Calculado sozinho, todo dia', top: '18%', lado: 'esquerda', duracaoS: 5.4, atrasoS: 0 },
  { rotulo: 'COMPROMETIMENTO FUTURO', texto: 'Fatura e parcelas dos próximos 6 meses', top: '58%', lado: 'direita', duracaoS: 6, atrasoS: 0.6 },
];

function BalaoFlutuante({ balao }: { balao: Balao }) {
  const reduzirMovimento = useReducedMotion();
  const idBruto = useId();
  const prefixo = `painelBalao_${idBruto.replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    if (reduzirMovimento) return;
    const tag = document.createElement('style');
    tag.textContent = `
      @keyframes ${prefixo} {
        0%, 100% { transform: translate3d(0, 0, 0); }
        50% { transform: translate3d(0, -7px, 0); }
      }
    `;
    document.head.appendChild(tag);
    return () => {
      document.head.removeChild(tag);
    };
  }, [prefixo, reduzirMovimento]);

  const animacao = reduzirMovimento
    ? null
    : ({
        animationName: prefixo,
        animationDuration: `${balao.duracaoS}s`,
        animationDelay: `${balao.atrasoS}s`,
        animationTimingFunction: 'ease-in-out',
        animationIterationCount: 'infinite',
      } as any);

  return (
    <View
      aria-hidden
      style={[
        styles.balao,
        balao.lado === 'esquerda' ? styles.balaoEsquerda : styles.balaoDireita,
        { top: balao.top },
        animacao,
      ]}
    >
      <Text style={styles.balaoRotulo}>{balao.rotulo}</Text>
      <Text style={styles.balaoTexto}>{balao.texto}</Text>
    </View>
  );
}

/**
 * Composição completa da dobra "painel web": a moldura de navegador com a
 * tela real do Grana. dentro, mais os balões de anotação — que existem só
 * aqui (não fazem parte de `MolduraNavegador`) porque dependem de onde
 * exatamente cada dado real aparece NESTA captura, não são um recurso
 * genérico da moldura.
 */
export default function PainelWebDestaque({ compacto = false }: { compacto?: boolean }) {
  const { largura } = useBreakpoint();
  // Empilhado (`compacto`) cobre de celular estreito (390px) até 1279px de
  // janela — um número fixo só ficaria bom numa dessas pontas. 64 é a
  // margem horizontal da seção (`faixaCompacta`, 32px de cada lado); o teto
  // de 460 evita que a moldura vire um retângulo enorme e vazio nas larguras
  // médias (768-1279), sem crescer sem limite. Achado real: com 300 fixo, a
  // moldura ficava minúscula e sobrava muito breu embaixo dela nessa faixa
  // (autor: "tela muito pequena na versão mobile, ficou péssimo").
  const larguraMoldura = compacto ? Math.min(largura - 64, 460) : 660;
  return (
    // Largura explícita, batendo com a da moldura (+2 da borda de 1px de
    // cada lado) — sem isso `raiz` esticava pra preencher a seção inteira
    // (comportamento padrão de cross-axis num flex column), e os balões
    // com `left`/`right` negativo ficavam relativos à SEÇÃO, não à
    // moldura, saindo pela borda do viewport em vez de abraçar o painel.
    <View style={[styles.raiz, { width: larguraMoldura + 2, alignSelf: 'center' }]}>
      <MolduraNavegador
        src="/telas/inicio-web.png"
        legenda="Painel web do Grana. mostrando Livre para Gastar, comprometimento futuro e gastos por categoria de uma conta de exemplo"
        largura={larguraMoldura}
        inclinada={!compacto}
      />
      {!compacto && BALOES.map((balao) => <BalaoFlutuante key={balao.rotulo} balao={balao} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  // `position:relative` só no amplo: no compacto os balões saem (ver JSX),
  // então não precisa reservar espaço extra em volta da moldura.
  raiz: { position: 'relative', alignItems: 'center' },
  balao: {
    position: 'absolute',
    width: 172,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    ...({ boxShadow: '0 12px 30px -10px rgba(0,0,0,0.6)' } as any),
  },
  balaoEsquerda: { left: -40 },
  balaoDireita: { right: -40 },
  balaoRotulo: { color: theme.accent2, fontSize: type.micro, lineHeight: type.micro * 1.4, fontFamily: fonts.regular, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  balaoTexto: { color: theme.inkSoft, fontSize: type.legenda, lineHeight: type.legenda * 1.35, fontFamily: fonts.light },
});
