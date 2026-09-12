import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts as uiFonts, radius, spacing, theme, type } from '@/lib/theme';
import { UI_OUT, useReducedMotion } from '@/lib/motion';

const fonts = { regular: uiFonts.brandRegular, light: uiFonts.brandLight };

type Passo = {
  cena: 'fala' | 'lugares';
  titulo: string;
  texto: string;
};

const ENTRADA = Easing.bezier(...UI_OUT);

/**
 * Dispara uma vez, quando a trilha entra na tela — mesma técnica de
 * `RevealOnScroll` (IntersectionObserver + checagem de
 * `prefers-reduced-motion`/`AccessibilityInfo`), reduzida ao essencial
 * porque aqui não há variante nem atraso configurável: um `boolean` que
 * nasce falso e vira verdadeiro uma única vez.
 *
 * Não reaproveita `RevealOnScroll` porque este não é um fade de entrada —
 * é o gatilho de uma SEQUÊNCIA coreografada (mensagem → seta → lançamento)
 * que mora dentro da própria cena, já dentro do `ScrollLinkedView` que faz
 * a dobra inteira crescer ao rolar.
 */
function useEntrouNaTela() {
  const ref = useRef<View>(null);
  const [entrou, setEntrou] = useState(() =>
    Platform.OS !== 'web' ||
    typeof window === 'undefined' ||
    typeof IntersectionObserver === 'undefined' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );

  useEffect(() => {
    if (entrou || Platform.OS !== 'web' || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;

    let cancelado = false;
    let observador: IntersectionObserver | undefined;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((reduzir) => {
        if (cancelado) return;
        if (reduzir) {
          setEntrou(true);
          return;
        }
        const no = ref.current as unknown as HTMLElement | null;
        if (!no) {
          setEntrou(true);
          return;
        }
        const obs = new IntersectionObserver(
          ([entrada]) => {
            if (entrada.isIntersecting) {
              setEntrou(true);
              obs.disconnect();
            }
          },
          { rootMargin: '0px 0px 15% 0px', threshold: 0 }
        );
        observador = obs;
        obs.observe(no);
      })
      .catch(() => setEntrou(true));

    // Desconecta em qualquer saída: componente desmontado antes de a
    // promessa resolver, ou antes de a trilha chegar a entrar na tela. Sem
    // isto o `IntersectionObserver` seguiria observando um nó já removido
    // do DOM até a página inteira ser descartada.
    return () => {
      cancelado = true;
      observador?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, entrou };
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
 * A cena inteira nascia montada de uma vez — mensagem, seta e lançamento
 * já visíveis juntos, o que conta a promessa da dobra ("você fala e o
 * Grana. organiza") sem NUNCA mostrar o mecanismo acontecendo. Agora, uma
 * vez que a trilha entra na tela: a mensagem chega (280ms), a seta acende
 * (140ms) e só então o lançamento categorizado materializa (320ms), com o
 * ponto de categoria chegando por último — é a peça que prova que a
 * categorização foi automática, não só que "um lançamento apareceu".
 * Roda uma vez só; sem `prefers-reduced-motion` tudo nasce no estado final.
 */
function CenaFala({ iniciar }: { iniciar: boolean }) {
  const reduzirMovimento = useReducedMotion();
  const mensagem = useRef(new Animated.Value(iniciar ? 1 : 0)).current;
  const seta = useRef(new Animated.Value(iniciar ? 1 : 0)).current;
  const lancamento = useRef(new Animated.Value(iniciar ? 1 : 0)).current;
  const ponto = useRef(new Animated.Value(iniciar ? 1 : 0)).current;

  useEffect(() => {
    if (!iniciar) return;
    if (reduzirMovimento) {
      [mensagem, seta, lancamento, ponto].forEach((valor) => valor.setValue(1));
      return;
    }
    const sequencia = Animated.sequence([
      Animated.timing(mensagem, { toValue: 1, duration: 280, easing: ENTRADA, useNativeDriver: true }),
      Animated.timing(seta, { toValue: 1, duration: 140, easing: ENTRADA, useNativeDriver: true }),
      Animated.timing(lancamento, { toValue: 1, duration: 320, easing: ENTRADA, useNativeDriver: true }),
      Animated.timing(ponto, { toValue: 1, duration: 180, easing: ENTRADA, useNativeDriver: true }),
    ]);
    sequencia.start();
    return () => sequencia.stop();
  }, [iniciar, reduzirMovimento, mensagem, seta, lancamento, ponto]);

  return (
    <View style={styles.cena}>
      <Animated.View
        style={[
          styles.mensagemEnviada,
          { opacity: mensagem, transform: [{ translateY: mensagem.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }, { scale: mensagem.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] },
        ]}
      >
        <Text style={styles.mensagemTexto}>almoço 32 no mercado</Text>
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
        <Animated.View style={[styles.pontoCategoria, { backgroundColor: '#bb6b60', transform: [{ scale: ponto }] }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.lancamentoTitulo}>Almoço no mercado</Text>
          <Text style={styles.lancamentoMeta}>Alimentação</Text>
        </View>
        <Text style={styles.lancamentoValor}>− R$ 32,00</Text>
      </Animated.View>
    </View>
  );
}

/**
 * Continuidade, não mecanismo: a MESMA `linhaDestacada` chegando primeiro
 * no celular e, com uma pausa curta, no computador — é o "aparece nos dois
 * lugares" da copy virando algo que se vê acontecer, em vez de dois
 * aparelhos desenhados lado a lado que só por coincidência têm uma linha
 * colorida igual.
 */
function CenaLugares({ iniciar }: { iniciar: boolean }) {
  const reduzirMovimento = useReducedMotion();
  const noCelular = useRef(new Animated.Value(iniciar ? 1 : 0)).current;
  const noNavegador = useRef(new Animated.Value(iniciar ? 1 : 0)).current;

  useEffect(() => {
    if (!iniciar) return;
    if (reduzirMovimento) {
      noCelular.setValue(1);
      noNavegador.setValue(1);
      return;
    }
    const sequencia = Animated.sequence([
      Animated.timing(noCelular, { toValue: 1, duration: 260, easing: ENTRADA, useNativeDriver: true }),
      Animated.timing(noNavegador, { toValue: 1, duration: 260, easing: ENTRADA, useNativeDriver: true }),
    ]);
    sequencia.start();
    return () => sequencia.stop();
  }, [iniciar, reduzirMovimento, noCelular, noNavegador]);

  // O estilo original descansa em opacity 0,75 (mais sutil que o resto da
  // cena) — a interpolação precisa terminar ali, não em 1, senão a linha
  // fica mais forte do que o desenho original pedia assim que a sequência
  // termina.
  const linhaAnimada = (valor: Animated.Value) => [
    styles.linhaDestacada,
    {
      opacity: valor.interpolate({ inputRange: [0, 1], outputRange: [0, 0.75] }),
      transform: [{ scaleX: valor.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
    },
  ];

  return (
    <View style={[styles.cena, styles.cenaLugares]}>
      <View style={styles.celular}>
        <View style={styles.celularTela}>
          <View style={styles.linhaFalsa} />
          <View style={[styles.linhaFalsa, styles.linhaCurta]} />
          <Animated.View style={linhaAnimada(noCelular)} />
        </View>
      </View>
      <View style={styles.navegador}>
        <View style={styles.navegadorBarra}>
          <View style={styles.navegadorPonto} />
          <View style={styles.navegadorPonto} />
          <View style={styles.navegadorPonto} />
        </View>
        <View style={styles.navegadorTela}>
          <View style={styles.linhaFalsa} />
          <Animated.View style={linhaAnimada(noNavegador)} />
          <View style={[styles.linhaFalsa, styles.linhaCurta]} />
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
    cena: 'fala',
    titulo: 'Fale com o Granabô',
    texto: 'Fale direto no aplicativo. O Grana. identifica o valor, a descrição e a categoria para você conferir.',
  },
  {
    cena: 'lugares',
    titulo: 'Confira onde quiser',
    texto: 'O lançamento aparece no celular e no computador, pronto pra você ajustar se precisar.',
  },
];

export default function TrilhaPassos({ compacto = false }: { compacto?: boolean }) {
  const { ref, entrou } = useEntrouNaTela();
  return (
    <View ref={ref} style={styles.raiz}>
      <View style={[styles.passos, compacto && styles.passosCompactos]}>
        {PASSOS.map((passo) => (
          <View key={passo.titulo} style={styles.passo}>
            {passo.cena === 'fala' ? <CenaFala iniciar={entrou} /> : <CenaLugares iniciar={entrou} />}
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
  cenaLugares: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  mensagemEnviada: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    backgroundColor: theme.accentDeep,
    borderRadius: radius.md,
    borderTopRightRadius: 2,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  mensagemTexto: { color: theme.ink, fontSize: type.nota, fontFamily: fonts.light },
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
  /* Celular e navegador desenhados em CSS, sem asset — mesma receita das
     molduras que a landing já usa, reduzida ao tamanho de miniatura. */
  celular: { width: 46, height: 84, borderRadius: 10, borderWidth: 2, borderColor: theme.ruleStrong, padding: 4, justifyContent: 'center' },
  celularTela: { flex: 1, borderRadius: 5, backgroundColor: theme.paperRaised, padding: 5, gap: 4, justifyContent: 'center' },
  navegador: { flex: 1, maxWidth: 150, height: 84, borderRadius: 8, borderWidth: 2, borderColor: theme.ruleStrong, overflow: 'hidden' },
  navegadorBarra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    height: 14,
    backgroundColor: theme.paperRaised,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  navegadorPonto: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.rule },
  navegadorTela: { flex: 1, padding: 8, gap: 5, justifyContent: 'center' },
  linhaFalsa: { height: 4, borderRadius: 2, backgroundColor: theme.rule },
  linhaCurta: { width: '60%' },
  /* A linha destacada é o MESMO lançamento aparecendo nos dois lugares — é o
     que a copy promete, e sem ela os dois aparelhos seriam só decoração. */
  linhaDestacada: { height: 5, borderRadius: 2, backgroundColor: theme.accent2, opacity: 0.75 },
  tituloPasso: { color: theme.ink, fontSize: type.corpo, lineHeight: type.corpo * 1.3, fontFamily: fonts.regular },
  textoPasso: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: type.apoio * 1.5, fontFamily: fonts.light },
});
