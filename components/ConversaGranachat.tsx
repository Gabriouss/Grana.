import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, radius, spacing, fonts, type, lh, sombras } from '@/lib/theme';
import AppPressable from '@/components/AppPressable';
import { EXEMPLO_CONVERSA, EXEMPLO_LIVRE, emReais } from '@/lib/exemplo-landing';

/**
 * Demonstração do Granachat, a janela de conversa com o Granabô.
 *
 * Nasceu como citação de uma conversa de WhatsApp e mudou de assunto junto
 * com o produto: aquele canal foi desligado, e o assistente agora vive
 * dentro do app. Com isso caiu também a exceção de paleta que o componente
 * tinha — as cores literais do WhatsApp só se justificavam enquanto isto
 * citava a interface de outra empresa. Agora é o Grana. mostrando o Grana.,
 * então usa os tokens do tema como qualquer outra peça.
 *
 * **A conversa se encena sozinha, uma vez.** Até 13/09/2026 a janela abria
 * com um balão de saudação e um vão escuro embaixo, e só enchia se a pessoa
 * clicasse num atalho, coisa que a maioria não faz. O autor apontou a dobra
 * como vazia. Agora, quando a janela entra na tela, as quatro trocas da
 * estrutura de 13 blocos acontecem em sequência, e param. Os atalhos
 * continuam clicáveis para repetir qualquer uma; um clique encerra a
 * encenação na hora. Com "reduzir movimento", as quatro já nascem na janela.
 *
 * As respostas seguem o FORMATO da Edge Function `assistente-financeiro`
 * (frase curta, valor embutido, período citado, fatura pelo ciclo do cartão,
 * nenhum julgamento), conferido contra o prompt e as ferramentas publicadas
 * em 13/09/2026. Os números são do mesmo mês fictício das capturas, em
 * `lib/exemplo-landing.ts`. Se o comportamento do assistente mudar lá, isto
 * precisa acompanhar.
 */

type Balao = { id: number; de: 'pessoa' | 'bot'; texto: string };

/** Um atalho = uma troca completa (pergunta da pessoa, resposta do Granabô). */
type Comando = {
  rotulo: string;
  icone: keyof typeof Ionicons.glyphMap;
  envio: string;
  resposta: string;
};

const { mes, alimentacao, contas, contaMaisProxima, fatura } = EXEMPLO_CONVERSA;

export const COMANDOS_GRANABO: Comando[] = [
  {
    /* "Por categoria", e não "Gasto por categoria": com 151px o rótulo longo
       só cabia no atalho a partir de 1024px de janela (medido). */
    rotulo: 'Por categoria',
    icone: 'pie-chart-outline',
    envio: 'Quanto gastei em Alimentação este mês?',
    resposta: `Em ${mes} você gastou ${emReais(alimentacao)} em Alimentação.`,
  },
  {
    rotulo: 'Quanto sobra',
    icone: 'wallet-outline',
    envio: 'Quanto sobra pra gastar até o fim do mês?',
    resposta:
      `Você tem ${emReais(EXEMPLO_LIVRE.livreNoTotal)} livre para gastar em ${mes}. ` +
      `Com ${EXEMPLO_LIVRE.diasRestantes} dias restantes, isso dá ${emReais(EXEMPLO_LIVRE.porDia)} por dia.`,
  },
  {
    rotulo: 'Contas do mês',
    icone: 'receipt-outline',
    envio: 'Tenho contas pra pagar este mês?',
    resposta:
      `Você tem ${contas.quantidade} contas pendentes em ${mes}, somando ${emReais(contas.total)}. ` +
      `A mais próxima é o ${contaMaisProxima.nome}, de ${emReais(contaMaisProxima.valor)}, que vence dia ${contaMaisProxima.dia}.`,
  },
  {
    rotulo: 'Fatura do cartão',
    icone: 'card-outline',
    envio: 'Quanto está a fatura do Nubank?',
    resposta: `A fatura de setembro do ${fatura.cartao} está em ${emReais(fatura.valor)}, no ciclo de ${fatura.ciclo}.`,
  },
];

const SAUDACAO: Balao = {
  id: 0,
  de: 'bot',
  texto: 'Oi! Sou o Granabô. Consulto os seus lançamentos e respondo com os números.',
};

/* Tempo que o bot "pensa" antes de responder. O suficiente pra parecer uma
   consulta acontecendo, sem virar espera. */
const ESPERA_RESPOSTA_MS = 700;
/* Na encenação: pausa antes da primeira pergunta e tempo de leitura depois de
   cada resposta. 2,4s dá para ler a resposta mais longa (~25 palavras) sem a
   próxima pergunta atropelar. */
const ESPERA_INICIO_MS = 500;
const LEITURA_MS = 2400;

/* Entrada curta de cada fala (opacidade e 6px), uma vez, quando o balão
   monta. Mesmo padrão das outras animações da landing (MolduraNavegador,
   TrustMarquee): `@keyframes` injetado à parte e `animationName` num objeto
   FORA do `StyleSheet.create`, cujo validador rejeita a propriedade. */
const KEYFRAMES_BALAO = 'granabo-balao-entra';
const balaoEntrando = {
  animationName: KEYFRAMES_BALAO,
  animationDuration: '260ms',
  animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
  animationFillMode: 'both',
} as any;

function conversaCompleta(): Balao[] {
  const baloes: Balao[] = [SAUDACAO];
  COMANDOS_GRANABO.forEach((c, i) => {
    baloes.push({ id: i * 2 + 1, de: 'pessoa', texto: c.envio });
    baloes.push({ id: i * 2 + 2, de: 'bot', texto: c.resposta });
  });
  return baloes;
}

export default function ConversaGranachat({ compacto }: { compacto?: boolean }) {
  const [mensagens, setMensagens] = useState<Balao[]>([SAUDACAO]);
  const [pensando, setPensando] = useState(false);
  const [atalhoAtivo, setAtalhoAtivo] = useState<number | null>(null);
  /* A região só vira `aria-live` depois que a pessoa usa um atalho: sem isso
     um leitor de tela anunciaria as oito falas da encenação sem ninguém ter
     perguntado nada. */
  const [interagiu, setInteragiu] = useState(false);
  const proximoId = useRef(COMANDOS_GRANABO.length * 2 + 1);
  const janelaRef = useRef<View>(null);
  const rolagemRef = useRef<ScrollView>(null);
  const temporizadores = useRef<ReturnType<typeof setTimeout>[]>([]);
  const observadorRef = useRef<IntersectionObserver | undefined>(undefined);
  const [semAnimacao, setSemAnimacao] = useState(false);

  const agendar = (fn: () => void, ms: number) => {
    temporizadores.current.push(setTimeout(fn, ms));
  };
  const cancelarAgendados = () => {
    temporizadores.current.forEach(clearTimeout);
    temporizadores.current = [];
  };

  useEffect(() => cancelarAgendados, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || semAnimacao) return;
    const tag = document.createElement('style');
    tag.textContent = `@keyframes ${KEYFRAMES_BALAO} { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }`;
    document.head.appendChild(tag);
    return () => {
      document.head.removeChild(tag);
    };
  }, [semAnimacao]);

  useEffect(() => {
    rolagemRef.current?.scrollToEnd({ animated: !semAnimacao });
  }, [mensagens, pensando, semAnimacao]);

  /* Encenação: começa quando metade da janela está visível, roda uma vez. */
  useEffect(() => {
    let cancelado = false;
    let observador: IntersectionObserver | undefined;

    const encenar = () => {
      let t = ESPERA_INICIO_MS;
      COMANDOS_GRANABO.forEach((comando, i) => {
        agendar(() => {
          setAtalhoAtivo(i);
          setMensagens((atual) => [...atual, { id: i * 2 + 1, de: 'pessoa', texto: comando.envio }]);
          setPensando(true);
        }, t);
        t += ESPERA_RESPOSTA_MS;
        agendar(() => {
          setPensando(false);
          setMensagens((atual) => [...atual, { id: i * 2 + 2, de: 'bot', texto: comando.resposta }]);
        }, t);
        t += LEITURA_MS;
      });
      agendar(() => setAtalhoAtivo(null), t - LEITURA_MS + 1200);
    };

    const semObservador =
      Platform.OS !== 'web' || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined';
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((reduzir) => {
        if (cancelado) return;
        if (reduzir || semObservador) {
          setSemAnimacao(true);
          setMensagens(conversaCompleta());
          return;
        }
        const no = janelaRef.current as unknown as HTMLElement | null;
        if (!no) {
          setMensagens(conversaCompleta());
          return;
        }
        observador = new IntersectionObserver(
          ([entrada]) => {
            if (entrada.isIntersecting) {
              observador?.disconnect();
              encenar();
            }
          },
          { threshold: 0.5 }
        );
        observadorRef.current = observador;
        observador.observe(no);
      })
      .catch(() => setMensagens(conversaCompleta()));

    return () => {
      cancelado = true;
      observador?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enviar = (comando: Comando, indice: number) => {
    if (pensando) return;
    /* Quem clicou assumiu a conversa: a encenação para, inclusive a que ainda
       nem começou (janela com menos da metade na tela). */
    observadorRef.current?.disconnect();
    cancelarAgendados();
    setInteragiu(true);
    setAtalhoAtivo(indice);
    setMensagens((atual) => [...atual, { id: proximoId.current++, de: 'pessoa', texto: comando.envio }]);
    setPensando(true);
    agendar(() => {
      setPensando(false);
      setMensagens((atual) => [...atual, { id: proximoId.current++, de: 'bot', texto: comando.resposta }]);
    }, ESPERA_RESPOSTA_MS);
  };

  return (
    <View ref={janelaRef} style={[styles.janela, compacto && styles.janelaCompacta]}>
      <View style={styles.cabecalho}>
        <View style={styles.avatar} aria-hidden>
          <Ionicons name="sparkles" size={15} color={theme.paper} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Conversa de exemplo</Text>
          <Text style={styles.nome}>Granabô</Text>
        </View>
      </View>

      <ScrollView
        ref={rolagemRef}
        style={[styles.corpo, compacto && styles.corpoCompacto]}
        contentContainerStyle={styles.corpoConteudo}
        role="log"
        aria-live={interagiu ? 'polite' : 'off'}
        aria-label="Conversa de exemplo com o Granabô"
      >
        {mensagens.map((b) => (
          <View
            key={b.id}
            style={[styles.balao, b.de === 'pessoa' ? styles.balaoPessoa : styles.balaoBot, !semAnimacao && balaoEntrando]}
          >
            <Text style={b.de === 'pessoa' ? styles.textoPessoa : styles.textoBot}>{b.texto}</Text>
          </View>
        ))}
        {pensando && (
          <View style={[styles.balao, styles.balaoBot]}>
            <Text style={styles.pensandoTexto}>consultando os dados de exemplo…</Text>
          </View>
        )}
      </ScrollView>

      {/* Atalhos reutilizáveis: travar depois do primeiro uso obrigaria a
          recarregar a página pra demonstrar as outras perguntas. Em 2×2, e não
          em fileira que quebra sozinha, para os quatro terem o mesmo peso. No
          celular, uma coluna: em duas, cada atalho ficava com 87 a 102px de
          texto e três dos quatro rótulos saíam cortados (medido a 360 e 390px).
          Sem `numberOfLines`: faltando espaço, o rótulo quebra, nunca vira
          reticências. */}
      <View style={styles.chips}>
        {COMANDOS_GRANABO.map((comando, i) => (
          <AppPressable
            key={comando.rotulo}
            onPress={() => enviar(comando, i)}
            disabled={pensando}
            accessibilityLabel={`Perguntar: ${comando.envio}`}
            style={({ hovered }) => [
              styles.chip,
              compacto && styles.chipCompacto,
              atalhoAtivo === i && styles.chipAtivo,
              hovered && !pensando && styles.chipHover,
              pensando && atalhoAtivo !== i && styles.chipDesativado,
            ]}
          >
            <Ionicons name={comando.icone} size={14} color={theme.accent2} aria-hidden />
            <Text style={styles.chipTexto}>{comando.rotulo}</Text>
          </AppPressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  janela: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: theme.paper,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    overflow: 'hidden',
    ...({ boxShadow: sombras.cardPersuasao } as any),
  },
  janelaCompacta: { maxWidth: '100%' },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.accent2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: { color: theme.accent2, fontSize: type.micro, fontFamily: fonts.regular, letterSpacing: 0.5 },
  nome: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  /* Altura fixa: sem isso a janela cresceria a cada troca e empurraria o
     resto da dobra pra baixo. 400 no desktop mostra saudação e as duas
     primeiras trocas inteiras; o resto rola dentro da janela. */
  corpo: { height: 400 },
  corpoCompacto: { height: 340 },
  corpoConteudo: { padding: spacing.md, gap: spacing.sm },
  balao: {
    maxWidth: '88%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
  },
  balaoPessoa: { alignSelf: 'flex-end', backgroundColor: theme.accentDeep, borderBottomRightRadius: spacing.xs },
  balaoBot: {
    alignSelf: 'flex-start',
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.rule,
    borderBottomLeftRadius: spacing.xs,
  },
  textoPessoa: { color: theme.ink, fontSize: type.nota, lineHeight: lh(type.nota, 'corpo'), fontFamily: fonts.light },
  textoBot: { color: theme.ink, fontSize: type.nota, lineHeight: lh(type.nota, 'corpo'), fontFamily: fonts.light },
  pensandoTexto: { color: theme.inkFaint, fontSize: type.nota, fontFamily: fonts.light },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: theme.paperRaised,
    borderTopWidth: 1,
    borderTopColor: theme.rule,
  },
  chip: {
    flexBasis: '40%',
    flexGrow: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.rule,
    ...({ transitionProperty: 'border-color, background-color, opacity', transitionDuration: '150ms' } as any),
  },
  chipCompacto: { flexBasis: '100%' },
  chipAtivo: { borderColor: theme.accent2 },
  chipHover: { borderColor: theme.accent2, backgroundColor: theme.hover },
  chipDesativado: { opacity: 0.5 },
  chipTexto: { color: theme.inkSoft, fontSize: type.nota, fontFamily: fonts.light, flexShrink: 1 },
});
