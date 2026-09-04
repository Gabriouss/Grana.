import { useEffect, useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts as uiFonts, radius, spacing, theme, type } from '@/lib/theme';
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
 * Indicador de mouse sugerindo interação — um pulso de anel se expandindo
 * e sumindo por trás de um ponto fixo, parecido com o "anel de espera" do
 * teardown da Dinzo (`dz-wa-wait-ring`: `scale 1→1.35, opacity 0.55→0`).
 * Não simula um clique de verdade, só chama atenção pra "isto é
 * clicável" — por isso fica perto do link "Ver todos" da lista de
 * lançamentos, não em cima de um número que a pessoa só lê.
 */
function IndicadorMouse() {
  const reduzirMovimento = useReducedMotion();
  const idBruto = useId();
  const prefixo = `painelMouse_${idBruto.replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    if (reduzirMovimento) return;
    const tag = document.createElement('style');
    tag.textContent = `
      @keyframes ${prefixo} {
        0% { transform: scale(1); opacity: 0.55; }
        100% { transform: scale(1.9); opacity: 0; }
      }
    `;
    document.head.appendChild(tag);
    return () => {
      document.head.removeChild(tag);
    };
  }, [prefixo, reduzirMovimento]);

  return (
    <View aria-hidden style={styles.mousePosicao}>
      <View style={styles.mousePonto} />
      {!reduzirMovimento && (
        <View
          style={[
            styles.mouseAnel,
            {
              animationName: prefixo,
              animationDuration: '1.8s',
              animationTimingFunction: 'ease-out',
              animationIterationCount: 'infinite',
            } as any,
          ]}
        />
      )}
    </View>
  );
}

/**
 * Composição completa da dobra "painel web": a moldura de navegador com a
 * tela real do Grana. dentro, mais os balões de anotação e o indicador de
 * mouse — que existem só aqui (não fazem parte de `MolduraNavegador`
 * porque dependem de onde exatamente cada dado real aparece NESTA
 * captura, não são um recurso genérico da moldura).
 */
export default function PainelWebDestaque({ compacto = false }: { compacto?: boolean }) {
  const larguraMoldura = compacto ? 300 : 560;
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
      />
      {!compacto && BALOES.map((balao) => <BalaoFlutuante key={balao.rotulo} balao={balao} />)}
      {!compacto && <IndicadorMouse />}
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
  mousePosicao: { position: 'absolute', right: '14%', bottom: '20%', width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  mousePonto: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent2 },
  mouseAnel: { position: 'absolute', width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: theme.accent2 },
});
