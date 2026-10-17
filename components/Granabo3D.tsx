import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { menta, sombras, theme } from '@/lib/theme';
import { useReducedMotion } from '@/lib/motion';

export type EstadoGranabo3D = 'saudacao' | 'repouso' | 'pensando' | 'feliz' | 'inclinado';
export type VarianteGranabo3D = 'hero' | 'botao' | 'avatar' | 'nav';

const ATIVOS_3D: Record<'frente' | 'piscando' | 'inclinado' | 'pensando' | 'feliz' | 'tresQuartos' | 'saudacaoWebp', ImageSourcePropType> = {
  frente: require('@/assets/granabo/granabo-frente.png'),
  piscando: require('@/assets/granabo/granabo-piscando.png'),
  inclinado: require('@/assets/granabo/granabo-inclinado.png'),
  pensando: require('@/assets/granabo/granabo-pensando.png'),
  feliz: require('@/assets/granabo/granabo-feliz.png'),
  tresQuartos: require('@/assets/granabo/granabo-tres-quartos.png'),
  saudacaoWebp: require('@/assets/granabo/granabo-saudacao.webp'),
};

export interface Granabo3DProps {
  /** Tamanho em dp do mascote 3D (largura = altura). */
  tamanho?: number;
  /** Contexto visual onde o mascote aparece. */
  variante?: VarianteGranabo3D;
  /** Expressão/comportamento atual do mascote. */
  estado?: EstadoGranabo3D;
  /** Contador incremental para disparar um pulinho de reação (ex.: toque no mascote). */
  pulsoInteracao?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Mascote Granabô 3D oficial (modelo Blender W3 + boca L3 em Cycles).
 *
 * Sustenta tanto a entrada animada 3D na tela vazia do Granachat quanto as
 * expressões reativas durante a conversa (repouso com piscadas naturais,
 * pensando ao consultar lançamentos e feliz ao responder ou ser acionado),
 * além do botão central elevado da barra de abas e dos avatares de navegação.
 */
export default function Granabo3D({
  tamanho = 64,
  variante = 'avatar',
  estado = 'repouso',
  pulsoInteracao = 0,
  style,
}: Granabo3DProps) {
  const reduzirMovimento = useReducedMotion();
  const [piscando, setPiscando] = useState(false);
  const [inclinadoRepouso, setInclinadoRepouso] = useState(false);
  const [saudacaoEmCurso, setSaudacaoEmCurso] = useState(estado === 'saudacao' && !reduzirMovimento);
  const [quadroEntrada, setQuadroEntrada] = useState<'tresQuartos' | 'frente' | 'piscando' | 'inclinado'>('tresQuartos');

  const flutuacao = useRef(new Animated.Value(0)).current;
  const pulo = useRef(new Animated.Value(0)).current;
  const haloPulso = useRef(new Animated.Value(0)).current;

  /* ── Sequência 3D de saudação (entrada viva ao abrir o chat vazio) ────── */
  useEffect(() => {
    if (estado !== 'saudacao' || reduzirMovimento) {
      setSaudacaoEmCurso(false);
      setQuadroEntrada('inclinado');
      return;
    }
    setSaudacaoEmCurso(true);
    setQuadroEntrada('tresQuartos');

    const t1 = setTimeout(() => setQuadroEntrada('frente'), 380);
    const t2 = setTimeout(() => setQuadroEntrada('piscando'), 920);
    const t3 = setTimeout(() => setQuadroEntrada('inclinado'), 1100);
    const t4 = setTimeout(() => setQuadroEntrada('frente'), 1950);
    const tFim = setTimeout(() => setSaudacaoEmCurso(false), 2350);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(tFim);
    };
  }, [estado, reduzirMovimento]);

  /* ── Piscadas naturais e leve inclinação simpática em repouso ─────────── */
  useEffect(() => {
    if (reduzirMovimento || saudacaoEmCurso || (estado !== 'repouso' && estado !== 'saudacao')) {
      setPiscando(false);
      setInclinadoRepouso(false);
      return;
    }
    // Piscada curta a cada ~3,6s nos modos de destaque (hero e botão)
    const animarPiscada = variante === 'hero' || variante === 'botao';
    if (!animarPiscada) return;

    let tFecha: ReturnType<typeof setTimeout> | null = null;
    let tInclina: ReturnType<typeof setTimeout> | null = null;
    let passo = 0;

    const intervalo = setInterval(() => {
      passo += 1;
      setPiscando(true);
      tFecha = setTimeout(() => {
        setPiscando(false);
        if (variante === 'hero' && passo % 2 === 1) {
          setInclinadoRepouso(true);
          tInclina = setTimeout(() => setInclinadoRepouso(false), 1200);
        }
      }, 150);
    }, 3600);

    return () => {
      clearInterval(intervalo);
      if (tFecha) clearTimeout(tFecha);
      if (tInclina) clearTimeout(tInclina);
    };
  }, [estado, reduzirMovimento, saudacaoEmCurso, variante]);

  /* ── Flutuação 3D contínua (hero e botão) e pulso de consulta ─────────── */
  useEffect(() => {
    if (reduzirMovimento) {
      flutuacao.setValue(0);
      haloPulso.setValue(0);
      return;
    }

    const deveFlutuar = variante === 'hero' || variante === 'botao' || estado === 'pensando';
    if (!deveFlutuar) {
      flutuacao.setValue(0);
      return;
    }

    const duracaoCiclo = estado === 'pensando' ? 900 : variante === 'hero' ? 2200 : 2600;
    const loopFlutuacao = Animated.loop(
      Animated.sequence([
        Animated.timing(flutuacao, {
          toValue: 1,
          duration: duracaoCiclo,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(flutuacao, {
          toValue: 0,
          duration: duracaoCiclo,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    loopFlutuacao.start();

    return () => loopFlutuacao.stop();
  }, [estado, flutuacao, haloPulso, reduzirMovimento, variante]);

  /* ── Pulinho quando fica feliz ou recebe toque interativo ─────────────── */
  useEffect(() => {
    if (reduzirMovimento) {
      pulo.setValue(0);
      return;
    }
    if (estado !== 'feliz' && pulsoInteracao === 0) return;

    pulo.setValue(0);
    Animated.sequence([
      Animated.timing(pulo, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.spring(pulo, {
        toValue: 0,
        speed: 16,
        bounciness: 8,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, [estado, pulo, pulsoInteracao, reduzirMovimento]);

  /* ── Escolha da pose 3D do Blender ────────────────────────────────────── */
  const fonteImagem: ImageSourcePropType = (() => {
    if (saudacaoEmCurso) {
      // Na web o WebP animado 3D roda direto com todos os 36 quadros de Cycles;
      // no nativo ou fallback, a sequência de poses 3D sincronizada garante o giro + piscada.
      if (Platform.OS === 'web') return ATIVOS_3D.saudacaoWebp;
      return ATIVOS_3D[quadroEntrada];
    }
    if (estado === 'pensando') return ATIVOS_3D.pensando;
    if (estado === 'feliz' || pulsoInteracao > 0 && piscando) return ATIVOS_3D.feliz;
    if (estado === 'inclinado') return ATIVOS_3D.inclinado;
    if (piscando) return ATIVOS_3D.piscando;
    if (inclinadoRepouso) return ATIVOS_3D.inclinado;
    if (estado === 'saudacao') return ATIVOS_3D.inclinado;
    return ATIVOS_3D.frente;
  })();

  const amplitudeY = variante === 'hero' ? -6 : variante === 'botao' ? -2.5 : -2;
  const deslocamentoY = Animated.add(
    flutuacao.interpolate({ inputRange: [0, 1], outputRange: [0, amplitudeY] }),
    pulo.interpolate({ inputRange: [0, 1], outputRange: [0, variante === 'hero' ? -10 : -5] })
  );
  const escala = pulo.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.06, 1.03],
  });

  const escalaSombra = flutuacao.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.82],
  });
  const opacidadeSombra = flutuacao.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0.28],
  });

  const diametroEsfera = variante === 'botao' ? tamanho : tamanho;
  const raio = diametroEsfera / 2;

  return (
    <View
      style={[
        styles.container,
        { width: tamanho, height: variante === 'hero' ? tamanho + 18 : tamanho },
        style,
      ]}
      pointerEvents="none"
    >
      {/* Halo luminoso menta de fundo no modo hero */}
      {variante === 'hero' && (
        <Animated.View
          style={[
            styles.haloHero,
            {
              width: tamanho * 1.18,
              height: tamanho * 1.18,
              borderRadius: (tamanho * 1.18) / 2,
              opacity: flutuacao.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.9] }),
              transform: [{ scale: flutuacao.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.05] }) }],
            },
          ]}
        />
      )}

      {/* Esfera 3D com núcleo escuro e iluminação Cycles */}
      <Animated.View
        style={[
          styles.esferaWrap,
          {
            width: diametroEsfera,
            height: diametroEsfera,
            borderRadius: raio,
            transform: reduzirMovimento
              ? []
              : [{ translateY: deslocamentoY }, { scale: escala }],
          },
          variante === 'botao' && styles.esferaBotao,
          variante === 'avatar' && styles.esferaAvatar,
        ]}
      >
        {/* Pedestal esférico escuro interno: impede vazamento da linha da barra
            pelos recortes laterais do G e realça o vidro escuro 3D do núcleo */}
        <View
          style={[
            styles.nucleoFundo,
            {
              width: diametroEsfera * 0.86,
              height: diametroEsfera * 0.86,
              borderRadius: (diametroEsfera * 0.86) / 2,
            },
            variante === 'botao' && styles.nucleoFundoBotao,
          ]}
        />
        <Image
          source={fonteImagem}
          style={{
            width: diametroEsfera * 1.06,
            height: diametroEsfera * 1.06,
          }}
          resizeMode="contain"
          fadeDuration={0}
          accessible={false}
        />
      </Animated.View>

      {/* Sombra projetada no chão para o palco 3D do modo hero */}
      {variante === 'hero' && (
        <Animated.View
          style={[
            styles.sombraChao,
            {
              width: tamanho * 0.58,
              height: Math.max(8, Math.round(tamanho * 0.09)),
              borderRadius: tamanho * 0.3,
              opacity: reduzirMovimento ? 0.45 : opacidadeSombra,
              transform: reduzirMovimento ? [] : [{ scaleX: escalaSombra }],
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloHero: {
    position: 'absolute',
    top: 2,
    backgroundColor: menta(0.1),
    borderWidth: 1,
    borderColor: menta(0.22),
    ...({ boxShadow: sombras.abaCentral } as any),
  },
  esferaWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  esferaBotao: {
    borderRadius: 999,
    ...({ boxShadow: sombras.abaCentral } as any),
  },
  esferaAvatar: {
    borderRadius: 999,
  },
  nucleoFundo: {
    position: 'absolute',
    backgroundColor: theme.paper,
  },
  nucleoFundoBotao: {
    backgroundColor: '#041c22',
    borderWidth: 1,
    borderColor: menta(0.28),
  },
  sombraChao: {
    marginTop: 4,
    backgroundColor: 'rgba(2, 12, 15, 0.72)',
  },
});
