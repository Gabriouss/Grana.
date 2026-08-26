import { useEffect, useId, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { theme, spacing, fonts, type } from '@/lib/theme';

type Props = { itens: string[] };

/* px por milissegundo — bem lento, é textura de fundo, não algo pra ler
   correndo. Numa faixa de ~1600px de conteúdo isso dá uns 40s por volta. */
const VELOCIDADE = 0.04;

/* Espaço fino (NBSP), não espaço comum: dois nós de texto (dois <Text>)
   grudados sem nada entre eles no DOM colapsam espaço em branco na borda de
   um jeito inconsistente com o resto do texto. NBSP nunca colapsa, então o
   padrão fica idêntico em toda a faixa, inclusive nas emendas entre cópias. */
const SEPARADOR = '   ·   ';

/**
 * Faixa de texto rolando horizontalmente, em loop contínuo — mesma ideia das
 * faixas de confiança em landing pages de evento (Agent Lab, Human Academy)
 * que o autor apontou como referência, incluindo o comportamento que a
 * referência tem e esta faixa não tinha: nenhum fim aparente, nunca.
 *
 * CSS @keyframes puro, não `Animated.loop`: o loop via `Animated` andava uma
 * volta inteira e TRAVAVA no fim (`translateX(-largura)` parado pra sempre)
 * em vez de reiniciar — bug do restart interno do `Animated.loop` no
 * react-native-web. `animation-iteration-count: infinite` no CSS deixa o
 * próprio navegador cuidar do loop.
 *
 * **Por que N cópias, não 2.** Com só 2 cópias, o truque "anda -50% da
 * largura do trilho" só é sem costura quando UMA cópia já é mais larga que a
 * tela. Numa tela larga (desktop, > 900px) a janela mostra mais do que uma
 * cópia de uma vez: no instante do reset, a cópia 2 acabou de chegar em
 * x=0 mas não tem mais nada depois dela pra preencher o resto da tela até a
 * borda direita — um vão em branco que, ao reiniciar, "salta" de volta pra
 * cópia 1. Foi exatamente o bug relatado (referência: a faixa do
 * agent.humanacademy.ai nunca mostra um fim). A correção: gerar `copias`
 * cópias suficientes pra a faixa inteira sempre cobrir pelo menos 2 telas de
 * largura — não importa quão larga a janela seja, sempre há conteúdo real
 * esperando entrar pela direita antes do reset, então o reset nunca é
 * visível. A distância do loop é `-100/copias %` (não um valor em px medido
 * em JS): cai sempre exatamente numa borda entre duas cópias idênticas,
 * então o "salto" do reset é indistinguível de continuar andando — e não
 * depende de qual fonte estava carregada no instante em que o layout foi
 * medido (timing de carregamento de fonte varia entre navegadores; um valor
 * em px travado nesse instante ficava errado depois que a fonte trocava).
 */
export default function TrustMarquee({ itens }: Props) {
  const [reduzirMovimento, setReduzirMovimento] = useState(false);
  const [larguraUmaCopia, setLarguraUmaCopia] = useState(0);
  const { width: larguraJanela } = useWindowDimensions();
  const idBruto = useId();
  const nomeKeyframe = `trustMarquee_${idBruto.replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    let ativo = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => ativo && setReduzirMovimento(v))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  const textoBase = itens.join(SEPARADOR);

  // Reduced motion: uma cópia só, parada — nunca deixar a faixa duplicada
  // congelada, que pareceria bug (texto repetido sem razão aparente).
  if (reduzirMovimento) {
    return (
      <View style={styles.faixa}>
        <Text style={styles.texto}>{textoBase}</Text>
      </View>
    );
  }

  /* Cada cópia (exceto a última) termina com o separador, pra costura entre
     duas cópias ler como mais um "·" da lista, não como um vão em branco. */
  const textoLoop = `${textoBase}${SEPARADOR}`;

  // Antes da primeira medição real, um chute generoso (6) evita mostrar um
  // vão em branco por uma fração de segundo logo no load.
  const copias =
    larguraUmaCopia > 0 ? Math.max(2, Math.ceil((larguraJanela * 2) / larguraUmaCopia) + 1) : 6;

  return <TrustMarqueeFaixa nomeKeyframe={nomeKeyframe} copias={copias} larguraUmaCopia={larguraUmaCopia} textoLoop={textoLoop} onMedir={setLarguraUmaCopia} />;
}

function TrustMarqueeFaixa({
  nomeKeyframe,
  copias,
  larguraUmaCopia,
  textoLoop,
  onMedir,
}: {
  nomeKeyframe: string;
  copias: number;
  larguraUmaCopia: number;
  textoLoop: string;
  onMedir: (largura: number) => void;
}) {
  useEffect(() => {
    const tag = document.createElement('style');
    tag.textContent = `@keyframes ${nomeKeyframe} { from { transform: translateX(0); } to { transform: translateX(-${100 / copias}%); } }`;
    document.head.appendChild(tag);
    return () => {
      document.head.removeChild(tag);
    };
  }, [nomeKeyframe, copias]);

  /* A duração é o tempo pra andar UMA cópia (`larguraUmaCopia`), não a tira
     inteira — como o keyframe anda exatamente `1/copias` do trilho a cada
     iteração, a velocidade visual (px/ms) fica igual não importa quantas
     cópias existam. Chute de 1600px até a primeira medição real, só pra não
     deixar a faixa parada esperando o `onLayout`. */
  const duracaoSegundos = (larguraUmaCopia || 1600) / VELOCIDADE / 1000;

  return (
    <View style={styles.faixa}>
      <View
        style={[
          styles.trilho,
          {
            animationName: nomeKeyframe,
            animationDuration: `${duracaoSegundos}s`,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
          } as any,
        ]}
      >
        {Array.from({ length: copias }, (_, i) => (
          <Text
            key={i}
            style={styles.textoLoop}
            onLayout={i === 0 ? (e) => onMedir(e.nativeEvent.layout.width) : undefined}
            aria-hidden={i > 0}
          >
            {textoLoop}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  faixa: {
    backgroundColor: theme.paperRaised,
    paddingVertical: spacing.md,
    overflow: 'hidden',
  },
  // `flexShrink: 0` nos filhos — sem isso, numa tela mais estreita que o
  // texto inteiro, o flexbox encolhia as cópias pra caber na viewport,
  // cortando o texto em vez de deixar o trilho mais largo que a tela (que é
  // o ponto: ele desliza por baixo via translateX).
  //
  // `width: 'max-content'` no PRÓPRIO trilho é o que faz `-N%` no
  // `translateX` significar alguma coisa: um `flexDirection: 'row'` sem
  // largura explícita vira `display: flex` no navegador, que por padrão
  // ESTICA pra caber na largura do pai — então a % da animação calculava
  // em cima da largura da JANELA, não da soma real das cópias (que pode ser
  // bem maior). Sem isso o loop andava só uma fração do que devia e
  // "saltava" de volta antes de completar uma cópia inteira.
  trilho: { flexDirection: 'row', flexShrink: 0, ...({ width: 'max-content' } as any) },
  texto: {
    flexShrink: 0,
    color: theme.inkSoft,
    fontSize: type.legenda,
    fontFamily: fonts.light,
    textTransform: 'uppercase',
    letterSpacing: 1,
    ...({ whiteSpace: 'nowrap' } as any),
  },
  // Igual a `texto`, mas sem `marginRight`: o separador "·" que fecha cada
  // cópia já está dentro da própria string (`textoLoop`), então um gap
  // extra aqui duplicaria o espaçamento só nas costuras.
  //
  // Nenhum dos dois usa `numberOfLines` — ele implica truncamento
  // (`-webkit-line-clamp` + reticência automática do navegador) baseado na
  // largura JÁ RENDERIZADA do elemento; um zoom de conferência pegou essa
  // reticência cortando um trecho inteiro do meio da faixa, um bug bem mais
  // sério que qualquer desalinho de espaçamento. `whiteSpace: nowrap` já
  // garante uma linha só, sem precisar de nenhuma lógica de corte.
  textoLoop: {
    flexShrink: 0,
    color: theme.inkSoft,
    fontSize: type.legenda,
    fontFamily: fonts.light,
    textTransform: 'uppercase',
    letterSpacing: 1,
    ...({ whiteSpace: 'nowrap' } as any),
  },
});
