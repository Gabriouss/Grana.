import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { Asset } from 'expo-asset';
import { menta, sombras, theme } from '@/lib/theme';
import { useReducedMotion } from '@/lib/motion';

export type EstadoGranabo3D = 'saudacao' | 'repouso' | 'pensando' | 'feliz' | 'inclinado';
export type VarianteGranabo3D = 'hero' | 'botao' | 'avatar' | 'nav';

type PoseGranabo = 'frente' | 'piscando' | 'inclinado' | 'pensando' | 'feliz' | 'tresQuartos' | 'saudacaoWebp';

const ATIVOS_3D: Record<PoseGranabo, ImageSourcePropType> = {
  frente: require('@/assets/granabo/granabo-frente.png'),
  piscando: require('@/assets/granabo/granabo-piscando.png'),
  inclinado: require('@/assets/granabo/granabo-inclinado.png'),
  pensando: require('@/assets/granabo/granabo-pensando.png'),
  feliz: require('@/assets/granabo/granabo-feliz.png'),
  tresQuartos: require('@/assets/granabo/granabo-tres-quartos.png'),
  saudacaoWebp: require('@/assets/granabo/granabo-saudacao.webp'),
};

/** Duracao do fundido entre expressoes. Piscada fica de fora: ela e um corte de ~150ms por natureza. */
const FUNDIDO_POSE_MS = 120;
/** Quanto a pose "feliz" fica no ar depois de um toque no mascote. */
const FELIZ_APOS_TOQUE_MS = 900;

/**
 * Intervalo ate a proxima piscada: irregular (2,8 a 5,4s) em vez de metronomo de 3,6s,
 * e de vez em quando dupla. Piscada em intervalo fixo e o que mais denuncia "animacao em loop".
 */
function proximoIntervaloDePiscada() {
  return 2800 + Math.random() * 2600;
}

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
    // Piscada curta, em intervalo irregular, nos modos de destaque (hero e botão)
    const animarPiscada = variante === 'hero' || variante === 'botao';
    if (!animarPiscada) return;

    let cancelado = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const agenda = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        if (!cancelado) fn();
      }, ms);
      timers.add(t);
    };
    let passo = 0;

    const piscar = (dupla: boolean) => {
      setPiscando(true);
      agenda(() => {
        setPiscando(false);
        if (dupla) {
          agenda(() => {
            setPiscando(true);
            agenda(() => setPiscando(false), 130);
          }, 170);
        }
      }, 150);
    };

    const proxima = () => {
      agenda(() => {
        passo += 1;
        piscar(Math.random() < 0.18);
        if (variante === 'hero' && passo % 2 === 1) {
          agenda(() => {
            setInclinadoRepouso(true);
            agenda(() => setInclinadoRepouso(false), 1200);
          }, 150);
        }
        proxima();
      }, proximoIntervaloDePiscada());
    };
    proxima();

    return () => {
      cancelado = true;
      timers.forEach(clearTimeout);
      timers.clear();
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

  /* ── Pulinho quando fica feliz ou recebe toque interativo ───────────────
     Nao pula na montagem: item de navegacao que ja nasce ativo (estado feliz)
     pulava a cada troca de tela, sem ninguem ter feito nada. */
  const primeiraRodadaPulo = useRef(true);
  useEffect(() => {
    const montagem = primeiraRodadaPulo.current;
    primeiraRodadaPulo.current = false;
    if (reduzirMovimento) {
      pulo.setValue(0);
      return;
    }
    if (montagem && pulsoInteracao === 0) return;
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

  /* ── Feliz por um instante depois do toque ──────────────────────────────
     Antes a pose "feliz" do toque so aparecia se ele estivesse piscando, ou
     seja, quase nunca: o pulo acontecia com a cara de repouso. */
  const [felizPorToque, setFelizPorToque] = useState(false);
  useEffect(() => {
    if (pulsoInteracao === 0 || reduzirMovimento) return;
    setFelizPorToque(true);
    const t = setTimeout(() => setFelizPorToque(false), FELIZ_APOS_TOQUE_MS);
    return () => clearTimeout(t);
  }, [pulsoInteracao, reduzirMovimento]);

  /* ── Escolha da pose 3D do Blender ────────────────────────────────────── */
  const pose: PoseGranabo = (() => {
    if (saudacaoEmCurso) {
      // Na web o WebP animado 3D roda direto com todos os 36 quadros de Cycles;
      // no nativo ou fallback, a sequência de poses 3D sincronizada garante o giro + piscada.
      if (Platform.OS === 'web') return 'saudacaoWebp';
      return quadroEntrada;
    }
    if (estado === 'pensando') return 'pensando';
    if (estado === 'feliz' || felizPorToque) return 'feliz';
    if (estado === 'inclinado') return 'inclinado';
    if (piscando) return 'piscando';
    if (inclinadoRepouso) return 'inclinado';
    if (estado === 'saudacao') return 'inclinado';
    return 'frente';
  })();

  /* Fundido curto entre expressoes: a pose anterior fica por baixo enquanto a
     nova sobe. Trocar a fonte direto era um corte seco. Piscada e saudacao em
     quadros ficam de fora: sao cortes por natureza. */
  const [poseExibida, setPoseExibida] = useState<PoseGranabo>(pose);
  const [poseAnterior, setPoseAnterior] = useState<PoseGranabo | null>(null);
  const fundido = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (pose === poseExibida) return;
    const corte = reduzirMovimento || pose === 'piscando' || poseExibida === 'piscando' || saudacaoEmCurso;
    if (corte) {
      fundido.stopAnimation();
      fundido.setValue(1);
      setPoseAnterior(null);
      setPoseExibida(pose);
      return;
    }
    setPoseAnterior(poseExibida);
    setPoseExibida(pose);
    fundido.setValue(0);
    Animated.timing(fundido, {
      toValue: 1,
      duration: FUNDIDO_POSE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished) setPoseAnterior(null);
    });
  }, [pose, poseExibida, reduzirMovimento, saudacaoEmCurso, fundido]);

  /* Poses decodificadas antes de precisarem: a primeira piscada ou troca nao
     pisca de verdade. Falha de prefetch nao muda nada, a pose carrega na hora. */
  useEffect(() => {
    (Object.keys(ATIVOS_3D) as PoseGranabo[]).forEach((chave) => {
      if (chave === 'saudacaoWebp') return;
      try {
        Asset.fromModule(ATIVOS_3D[chave] as number).downloadAsync().catch(() => {});
      } catch {
        /* sem prefetch a pose carrega na hora, como antes */
      }
    });
  }, []);

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
        <View style={{ width: diametroEsfera * 1.06, height: diametroEsfera * 1.06 }}>
          {poseAnterior && (
            <Image
              source={ATIVOS_3D[poseAnterior]}
              style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
              resizeMode="contain"
              fadeDuration={0}
              accessible={false}
            />
          )}
          <Animated.Image
            source={ATIVOS_3D[poseExibida]}
            style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', opacity: poseAnterior ? fundido : 1 }]}
            resizeMode="contain"
            fadeDuration={0}
            accessible={false}
          />
        </View>
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
