import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import AppPressable from '@/components/AppPressable';
import { useReducedMotion } from '@/lib/motion';

/**
 * Demonstração da conversa com o Granabô, o assistente do Grana. no WhatsApp.
 *
 * Por que uma reconstrução e não uma captura: print de conversa real exporia
 * um número e dados de alguém. Reconstruir a partir dos tokens é o mesmo
 * caminho que o resto da landing já usa para telas do app.
 *
 * **É clicável de propósito.** Antes era uma conversa estática de quatro
 * balões: quem chegava na página lia um exemplo, não experimentava o
 * mecanismo. Agora os chips embaixo disparam o fluxo de verdade — a pessoa
 * testa o produto antes de criar conta, que é a prova mais barata que esta
 * página consegue dar.
 *
 * As respostas do bot são fiéis ao formato REAL da Edge Function
 * (`registrarLancamento` e `responderConsulta` em
 * `supabase/functions/whatsapp-webhook/index.ts`), incluindo emoji e
 * estrutura de frase — não é copy livre de marketing. Se o comportamento
 * do bot mudar lá, isto aqui precisa acompanhar.
 *
 * Valores fictícios, nunca de conta real (regra de marketing do projeto).
 */

type Balao = { id: number; de: 'pessoa' | 'bot'; texto: string; hora: string };

/** Um chip = uma troca completa (o que a pessoa manda, o que o bot devolve). */
type Comando = {
  rotulo: string;
  icone: keyof typeof Ionicons.glyphMap;
  /** O que aparece no balão da pessoa. */
  envio: string;
  /** Resposta do bot, no formato real da Edge Function. */
  resposta: string;
};

const COMANDOS: Comando[] = [
  {
    rotulo: '"almoço 32 no mercado"',
    icone: 'chatbubble-outline',
    envio: 'almoço 32 no mercado',
    // Formato real: whatsapp-webhook/index.ts:1183
    resposta: '✅ Lançamento registrado: R$ 32,00 em Alimentação (almoço no mercado)',
  },
  {
    rotulo: 'Mandar um áudio',
    icone: 'mic-outline',
    envio: '🎙️ Mensagem de voz (0:04)',
    // Áudio acrescenta o eco do que foi transcrito: whatsapp-webhook/index.ts:1200
    resposta:
      '✅ Lançamento registrado: R$ 89,90 em Mercado (compras da semana)\n\n🎙️ Ouvi: "gastei 89 e noventa nas compras da semana"',
  },
  {
    rotulo: '"quanto gastei com Alimentação?"',
    icone: 'help-circle-outline',
    envio: 'quanto gastei com Alimentação?',
    // Formato real: whatsapp-webhook/index.ts:1530
    resposta: '💸 Você gastou R$ 412,80 em Alimentação em agosto.',
  },
];

const SAUDACAO: Balao = {
  id: 0,
  de: 'bot',
  texto: 'Oi! Sou o Granabô. Me conta um gasto que eu organizo pra você. Testa um dos exemplos aí embaixo.',
  hora: '19:03',
};

/** Tempo que o bot "digita" antes de responder — o suficiente pra parecer
    resposta, não instantâneo de máquina, sem virar espera. */
const ESPERA_RESPOSTA_MS = 700;

export default function ConversaGranabo({ compacto }: { compacto?: boolean }) {
  const [mensagens, setMensagens] = useState<Balao[]>([SAUDACAO]);
  const [digitando, setDigitando] = useState(false);
  const proximoId = useRef(1);
  const rolagemRef = useRef<ScrollView>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduzirMovimento = useReducedMotion();

  useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  // Rola pro fim sempre que entra mensagem nova ou o "digitando" aparece.
  useEffect(() => {
    rolagemRef.current?.scrollToEnd({ animated: !reduzirMovimento });
  }, [mensagens, digitando, reduzirMovimento]);

  const hora = () => {
    const agora = new Date();
    return `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  };

  const enviar = (comando: Comando) => {
    if (digitando) return;
    const marca = hora();
    setMensagens((atual) => [...atual, { id: proximoId.current++, de: 'pessoa', texto: comando.envio, hora: marca }]);
    setDigitando(true);
    temporizador.current = setTimeout(() => {
      setDigitando(false);
      setMensagens((atual) => [...atual, { id: proximoId.current++, de: 'bot', texto: comando.resposta, hora: hora() }]);
    }, ESPERA_RESPOSTA_MS);
  };

  return (
    <View style={[styles.janela, compacto && styles.janelaCompacta]}>
      <View style={styles.cabecalho}>
        <View style={styles.avatar} aria-hidden>
          <Ionicons name="logo-whatsapp" size={16} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nome}>Granabô</Text>
          <Text style={styles.status}>online</Text>
        </View>
      </View>

      <ScrollView
        ref={rolagemRef}
        style={styles.corpo}
        contentContainerStyle={styles.corpoConteudo}
        role="log"
        aria-live="polite"
        aria-label="Conversa de exemplo com o Granabô"
      >
        {mensagens.map((b) => (
          <View key={b.id} style={[styles.balao, b.de === 'pessoa' ? styles.balaoPessoa : styles.balaoBot]}>
            <Text style={styles.baloTexto}>{b.texto}</Text>
            <View style={styles.rodapeBalao}>
              <Text style={styles.hora}>{b.hora}</Text>
              {b.de === 'pessoa' && (
                <Ionicons name="checkmark-done" size={14} color="#53BDEB" aria-hidden style={styles.confirmacao} />
              )}
            </View>
          </View>
        ))}
        {digitando && (
          <View style={[styles.balao, styles.balaoBot, styles.balaoDigitando]}>
            <Text style={styles.digitandoTexto}>digitando…</Text>
          </View>
        )}
      </ScrollView>

      {/* Os chips são reutilizáveis (clicar de novo repete a troca) — travar
          depois do primeiro uso obrigaria a recarregar a página pra
          demonstrar os outros fluxos. */}
      <View style={styles.chips}>
        {COMANDOS.map((comando) => (
          <AppPressable
            key={comando.rotulo}
            onPress={() => enviar(comando)}
            disabled={digitando}
            accessibilityLabel={`Enviar exemplo: ${comando.envio}`}
            style={({ hovered }) => [styles.chip, hovered && !digitando && styles.chipHover, digitando && styles.chipDesativado]}
          >
            <Ionicons name={comando.icone} size={14} color={theme.accent2} aria-hidden />
            <Text style={styles.chipTexto}>{comando.rotulo}</Text>
          </AppPressable>
        ))}
      </View>
    </View>
  );
}

/* Cores literais do WhatsApp, não da paleta do Grana.
 *
 * Esta janela é uma CITAÇÃO da interface de outro produto: repintá-la em
 * petróleo/menta faria a pessoa ter que acreditar que aquilo é um WhatsApp,
 * em vez de reconhecer na hora. É a mesma exceção que o DESIGN.md já abre
 * pro verde #25D366 (permitido porque o elemento representa literalmente o
 * WhatsApp) — aqui ela vale pro conjunto todo da janela, e só dentro dela.
 * Fora deste componente, nenhuma destas cores tem uso.
 */
const WA = {
  fundo: '#EFEAE2', // papel de parede padrão (chapado — o padrão de rabiscos é arte da Meta, não replicada aqui)
  cabecalho: '#F0F2F5',
  balaoRecebido: '#FFFFFF',
  balaoEnviado: '#D9FDD3',
  texto: '#111B21',
  textoFraco: '#667781',
  verde: '#25D366',
  confirmado: '#53BDEB',
  divisor: 'rgba(17,27,33,0.08)',
};

const styles = StyleSheet.create({
  janela: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: WA.fundo,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...({ boxShadow: '0 16px 40px -12px rgba(0,0,0,0.5)' } as any),
  },
  janelaCompacta: { maxWidth: 300 },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: WA.cabecalho,
    borderBottomWidth: 1,
    borderBottomColor: WA.divisor,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: WA.verde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: { color: WA.texto, fontSize: type.apoio, fontFamily: fonts.regular },
  status: { color: WA.textoFraco, fontSize: type.legenda, fontFamily: fonts.light },
  /* Altura fixa: sem isso a janela cresceria a cada troca e empurraria o
     resto da dobra pra baixo enquanto a pessoa testa. */
  corpo: { height: 260, backgroundColor: WA.fundo },
  corpoConteudo: { padding: spacing.md, gap: spacing.sm },
  /* Raio pequeno e assimétrico é o que dá a silhueta do WhatsApp: o canto
     virado pra "ponta" da conversa é quase reto, os outros três arredondados. */
  balao: {
    maxWidth: '85%',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 9,
    ...({ boxShadow: '0 1px 0.5px rgba(11,20,26,0.13)' } as any),
  },
  balaoPessoa: { alignSelf: 'flex-end', backgroundColor: WA.balaoEnviado, borderTopRightRadius: 2 },
  balaoBot: { alignSelf: 'flex-start', backgroundColor: WA.balaoRecebido, borderTopLeftRadius: 2 },
  balaoDigitando: { paddingVertical: 8 },
  digitandoTexto: { color: WA.textoFraco, fontSize: type.nota, fontFamily: fonts.light, fontStyle: 'italic' },
  baloTexto: { color: WA.texto, fontSize: type.apoio, lineHeight: type.apoio * 1.4, fontFamily: fonts.light },
  rodapeBalao: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-end', marginTop: 1 },
  hora: { color: WA.textoFraco, fontSize: type.micro, fontFamily: fonts.light },
  confirmacao: { marginBottom: -1 },
  /* A barra de chips NÃO é WhatsApp: é a camada da landing por cima da
     citação, então volta pros tokens do Grana. — deixá-la bege confundiria
     "isto é o produto de outra empresa" com "isto é o controle da página". */
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.rule,
    ...({ transitionProperty: 'border-color, background-color', transitionDuration: '150ms' } as any),
  },
  chipHover: { borderColor: theme.accent2, backgroundColor: theme.hover },
  chipDesativado: { opacity: 0.5 },
  chipTexto: { color: theme.inkSoft, fontSize: type.nota, fontFamily: fonts.light },
});
