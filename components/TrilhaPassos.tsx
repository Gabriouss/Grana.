import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts as uiFonts, radius, spacing, theme, type } from '@/lib/theme';
import { corDaCategoria } from '@/lib/chart-colors';
import { UI_OUT, useEntradaNaTela } from '@/lib/motion';

const fonts = { regular: uiFonts.brandRegular, light: uiFonts.brandLight };

type Passo = {
  cena: 'colar' | 'lugares';
  titulo: string;
  texto: string;
};

const ENTRADA = Easing.bezier(...UI_OUT);

/* O mesmo lançamento nos dois passos: o que foi colado no primeiro é o que
   aparece no celular e no computador no segundo. */
const COR_ALIMENTACAO = corDaCategoria('Alimentação');

/* `ativo` falso só quando a trilha foi escondida para a encenação (ver
   `useEntradaNaTela`); `instantaneo` verdadeiro mostra o estado final. */
type Cena = { ativo: boolean; instantaneo: boolean };

/** Esconde, mostra direto ou encena, conforme o gatilho. */
function useEncenacao(ativo: boolean, instantaneo: boolean, etapas: [Animated.Value, number][]) {
  useEffect(() => {
    if (!ativo || instantaneo) {
      etapas.forEach(([valor]) => valor.setValue(ativo ? 1 : 0));
      return;
    }
    const sequencia = Animated.sequence(
      etapas.map(([valor, duracao]) => Animated.timing(valor, { toValue: 1, duration: duracao, easing: ENTRADA, useNativeDriver: true }))
    );
    sequencia.start();
    return () => sequencia.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, instantaneo]);
}

/**
 * Cada passo mostra o mecanismo ACONTECENDO, não um ícone que repete a
 * palavra do título. Ícone de balãozinho ao lado de "Fale com o Granabô"
 * não acrescenta informação nenhuma; uma mensagem virando lançamento
 * categorizado, sim.
 *
 * Dimensionadas pro card compacto primeiro (≈350px de largura no celular):
 * tudo que precisa caber, cabe lá, e sobra folga no amplo.
 *
 * ── A sequência (o momento de autoria desta dobra) ──────────────────────
 * A cena inteira nascia montada de uma vez — texto, seta e lançamento já
 * visíveis juntos, o que conta a promessa da dobra sem NUNCA mostrar o
 * mecanismo acontecendo. Agora, uma vez que a trilha entra na tela: o texto
 * colado chega (280ms), a seta acende (140ms) e só então o lançamento
 * categorizado materializa (320ms), com o ponto de categoria chegando por
 * último — é a peça que prova que a categorização foi automática, não só que
 * "um lançamento apareceu". Roda uma vez só. O repouso é o estado final: a
 * cena só some para encenar enquanto a trilha ainda está fora da tela.
 *
 * ── Por que colar, e não falar (13/09/2026) ─────────────────────────────
 * Até 13/09 esta cena era uma MENSAGEM de fala ("almoço 32 no mercado") e o
 * passo dizia "Fale com o Granabô". A estrutura de 13 blocos do autor tirou a
 * voz deste bloco de propósito: é o bloco da solução NA WEB, e o lançamento
 * por voz não funciona no Firefox. A voz foi para o bloco "E no seu bolso",
 * do celular. Colar o texto é o que funciona em qualquer navegador — é a
 * `PasteReceiptModal`, aberta pela Início, que identifica valor, categoria e
 * tipo e mostra o resultado para conferir antes de salvar.
 *
 * O texto colado tem a cara de CAMPO (borda, ícone de área de transferência),
 * e não de bolha de conversa, para não ser lido como o chat do Granabô.
 */
function CenaColar({ ativo, instantaneo }: Cena) {
  const mensagem = useRef(new Animated.Value(1)).current;
  const seta = useRef(new Animated.Value(1)).current;
  const lancamento = useRef(new Animated.Value(1)).current;
  const ponto = useRef(new Animated.Value(1)).current;
  useEncenacao(ativo, instantaneo, [[mensagem, 280], [seta, 140], [lancamento, 320], [ponto, 180]]);

  return (
    <View style={styles.cena}>
      <Animated.View
        style={[
          styles.textoColado,
          { opacity: mensagem, transform: [{ translateY: mensagem.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }, { scale: mensagem.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] },
        ]}
      >
        <Ionicons name="clipboard-outline" size={13} color={theme.inkFaint} aria-hidden />
        <Text style={styles.textoColadoConteudo} numberOfLines={1}>Pix enviado · R$ 32,00 · Mercado Bom Preço</Text>
      </Animated.View>
      <Animated.View style={[styles.setaCena, { opacity: seta }]} aria-hidden>
        <Ionicons name="arrow-down" size={14} color={theme.accent2} />
      </Animated.View>
      <Animated.View
        style={[
          styles.lancamentoCena,
          { opacity: lancamento, transform: [{ translateY: lancamento.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }, { scale: lancamento.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] },
        ]}
      >
        <Animated.View style={[styles.pontoCategoria, { backgroundColor: COR_ALIMENTACAO, transform: [{ scale: ponto }] }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.lancamentoTitulo}>Mercado Bom Preço</Text>
          <Text style={styles.lancamentoMeta}>Alimentação</Text>
        </View>
        <Text style={styles.lancamentoValor}>− R$ 32,00</Text>
      </Animated.View>
    </View>
  );
}

/**
 * Continuidade, não mecanismo: o MESMO lançamento do passo anterior chegando
 * primeiro no celular e, com uma pausa curta, no computador — é o "aparece
 * nos dois lugares" da copy virando algo que se vê acontecer.
 *
 * Até 17/09/2026 os dois aparelhos eram contornos grossos com linhas cinza de
 * esqueleto e uma barra de menta. O autor apontou que aquilo não tinha a cara
 * do Grana.: ao lado do passo 1, que mostra um lançamento de verdade, lia como
 * ícone genérico. Agora as molduras seguem `MolduraCelular` e
 * `MolduraNavegador` (vidro `mockupTela`, borda de 1px) e o conteúdo é o
 * lançamento, com o ponto da categoria. O celular mostra só o valor porque o
 * nome não cabe legível naquela largura, e os dois aparelhos passam do pé da
 * cena (cortados pelo `overflow`), como quem entra no quadro: a cena tem
 * altura fixa, e um celular inteiro nela seria estreito demais até para o
 * valor.
 */
function CenaLugares({ ativo, instantaneo }: Cena) {
  const noCelular = useRef(new Animated.Value(1)).current;
  const noNavegador = useRef(new Animated.Value(1)).current;
  useEncenacao(ativo, instantaneo, [[noCelular, 260], [noNavegador, 260]]);

  const chegada = (valor: Animated.Value) => ({
    opacity: valor,
    transform: [{ translateY: valor.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
  });

  return (
    <View style={[styles.cena, styles.cenaLugares]}>
      <View style={styles.celular}>
        <View style={styles.celularTela}>
          <View style={styles.celularCamera} />
          <Animated.View style={[styles.miniLancamento, styles.miniLancamentoCelular, chegada(noCelular)]}>
            <View style={[styles.pontoCategoria, { backgroundColor: COR_ALIMENTACAO }]} />
            <Text style={styles.miniValor} numberOfLines={1}>R$ 32,00</Text>
          </Animated.View>
        </View>
      </View>
      <View style={styles.navegador}>
        <View style={styles.navegadorBarra}>
          <View style={styles.navegadorPonto} />
          <View style={styles.navegadorPonto} />
          <View style={styles.navegadorPonto} />
        </View>
        <View style={styles.navegadorTela}>
          <Animated.View style={[styles.miniLancamento, chegada(noNavegador)]}>
            <View style={[styles.pontoCategoria, { backgroundColor: COR_ALIMENTACAO }]} />
            <View style={styles.miniTextos}>
              <Text style={styles.miniTitulo} numberOfLines={1}>Mercado Bom Preço</Text>
              <Text style={styles.miniValor} numberOfLines={1}>− R$ 32,00</Text>
            </View>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

/* Dois passos, não três: o passo que os concorrentes colocam primeiro
   ("conecte seu banco") não existe aqui por decisão de produto, e inventar
   um terceiro só pra encher a trilha seria enfeite. */
const PASSOS: Passo[] = [
  {
    cena: 'colar',
    titulo: 'Cole o texto da compra',
    texto: 'Copie o comprovante do Pix, a fatura ou o recibo e cole no Grana. Ele identifica o valor, a categoria e o tipo para você conferir.',
  },
  {
    cena: 'lugares',
    titulo: 'Confira onde quiser',
    texto: 'O lançamento aparece no computador e no celular, pronto pra você ajustar se precisar.',
  },
];

export default function TrilhaPassos({ compacto = false }: { compacto?: boolean }) {
  const { ref, ativo, instantaneo } = useEntradaNaTela('0px 0px 15% 0px');
  return (
    <View ref={ref} style={styles.raiz}>
      <View style={[styles.passos, compacto && styles.passosCompactos]}>
        {PASSOS.map((passo) => (
          <View key={passo.titulo} style={styles.passo}>
            {passo.cena === 'colar' ? <CenaColar ativo={ativo} instantaneo={instantaneo} /> : <CenaLugares ativo={ativo} instantaneo={instantaneo} />}
            <Text style={styles.tituloPasso}>{passo.titulo}</Text>
            <Text style={styles.textoPasso}>{passo.texto}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { width: '100%', marginTop: spacing.xxl },
  passos: { flexDirection: 'row', gap: spacing.xl, alignItems: 'stretch' },
  passosCompactos: { flexDirection: 'column', gap: spacing.lg },
  passo: {
    flex: 1,
    minWidth: 0,
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paperRaised,
  },
  /* A cena tem altura fixa nos dois cards pra que título e texto comecem na
     mesma linha de base, mesmo com conteúdos internos diferentes. */
  cena: {
    height: 128,
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  cenaLugares: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', gap: spacing.md, paddingBottom: 0 },
  /* Campo, não bolha: borda tracejada fina de área de colar, ícone de área de
     transferência à esquerda, largura inteira. Uma bolha com canto cortado
     (o desenho anterior) lê como mensagem de chat. */
  textoColado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.ruleStrong,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  textoColadoConteudo: { flex: 1, minWidth: 0, color: theme.inkSoft, fontSize: type.nota, fontFamily: fonts.light },
  setaCena: { alignSelf: 'center' },
  lancamentoCena: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  pontoCategoria: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  lancamentoTitulo: { color: theme.ink, fontSize: type.legenda, fontFamily: fonts.regular },
  lancamentoMeta: { color: theme.inkFaint, fontSize: type.micro, fontFamily: fonts.light },
  lancamentoValor: { color: theme.ink, fontSize: type.legenda, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  /* Celular e navegador desenhados em CSS, sem asset — as mesmas receitas de
     `MolduraCelular` e `MolduraNavegador`, em miniatura. Os dois esticam até
     a altura da cena, sem altura escrita à mão. */
  /* A margem negativa leva a borda de baixo para fora da cena. */
  celular: { width: 88, marginBottom: -radius.lg, padding: 3, borderRadius: 16, borderWidth: 1, borderColor: theme.ruleStrong, backgroundColor: theme.mockupTela },
  celularTela: { flex: 1, alignItems: 'center', gap: spacing.xs, padding: spacing.xs, borderRadius: 13, backgroundColor: theme.paper },
  celularCamera: { width: 14, height: 3, borderRadius: 2, backgroundColor: theme.mockupTela },
  navegador: { flex: 1, maxWidth: 220, marginBottom: -radius.lg, borderRadius: 10, borderWidth: 1, borderColor: theme.ruleStrong, backgroundColor: theme.paperRaised, overflow: 'hidden' },
  navegadorBarra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 5,
    backgroundColor: theme.mockupTela,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  navegadorPonto: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.rule },
  navegadorTela: { flex: 1, padding: spacing.sm, backgroundColor: theme.paper },
  /* O lançamento em miniatura, com a mesma superfície de `lancamentoCena`.
     Texto a 10px, como o endereço da `MolduraNavegador`: é desenho de tela,
     não leitura corrida. */
  miniLancamento: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 5,
    borderRadius: 6,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  miniLancamentoCelular: { gap: 3, paddingHorizontal: 3 },
  miniTextos: { flex: 1, minWidth: 0 },
  miniTitulo: { color: theme.ink, fontSize: 10, lineHeight: 14, fontFamily: fonts.regular },
  miniValor: { color: theme.inkSoft, fontSize: 10, lineHeight: 14, fontFamily: fonts.light, fontVariant: ['tabular-nums'] },
  tituloPasso: { color: theme.ink, fontSize: type.corpo, lineHeight: type.corpo * 1.3, fontFamily: fonts.regular },
  textoPasso: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: type.apoio * 1.5, fontFamily: fonts.light },
});
