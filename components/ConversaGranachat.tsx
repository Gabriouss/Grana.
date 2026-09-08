import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, radius, spacing, fonts, type, lh } from '@/lib/theme';
import AppPressable from '@/components/AppPressable';
import { useReducedMotion } from '@/lib/motion';

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
 * **É clicável de propósito.** Os chips disparam trocas reais: a pessoa
 * experimenta o mecanismo antes de criar conta, que é a prova mais barata
 * que esta página consegue dar.
 *
 * As respostas imitam o FORMATO real da Edge Function `assistente-financeiro`
 * (frase natural com o valor embutido), verificado contra a função publicada
 * em 05/09/2026. Se o comportamento do assistente mudar lá, isto precisa
 * acompanhar.
 *
 * Valores fictícios, nunca de conta real (regra de marketing do projeto).
 */

type Balao = { id: number; de: 'pessoa' | 'bot'; texto: string };

/** Um chip = uma troca completa (pergunta da pessoa, resposta do Granabô). */
type Comando = {
  rotulo: string;
  icone: keyof typeof Ionicons.glyphMap;
  envio: string;
  resposta: string;
};

const COMANDOS: Comando[] = [
  {
    rotulo: 'Gasto por categoria',
    icone: 'pie-chart-outline',
    envio: 'Quanto gastei em Alimentação?',
    resposta: 'Você gastou R$ 412,80 em Alimentação em setembro.',
  },
  {
    rotulo: 'Quanto posso gastar',
    icone: 'wallet-outline',
    envio: 'Quanto posso gastar?',
    resposta:
      'Você tem R$ 624,00 livre para gastar neste mês. Com 13 dias restantes, isso dá R$ 48,00 por dia.',
  },
  {
    rotulo: 'Boletos do mês',
    icone: 'receipt-outline',
    envio: 'Tenho boletos pra pagar?',
    resposta:
      'Você tem R$ 544,75 em 3 boletos pendentes em setembro. O mais próximo vence dia 12.',
  },
];

const SAUDACAO: Balao = {
  id: 0,
  de: 'bot',
  texto: 'Oi! Sou o Granabô. Pergunte sobre os seus gastos que eu consulto e respondo. Testa um dos exemplos aí embaixo.',
};

/* Tempo que o bot "pensa" antes de responder. O suficiente pra parecer uma
   consulta acontecendo, sem virar espera. */
const ESPERA_RESPOSTA_MS = 700;

export default function ConversaGranachat({ compacto }: { compacto?: boolean }) {
  const [mensagens, setMensagens] = useState<Balao[]>([SAUDACAO]);
  const [pensando, setPensando] = useState(false);
  const proximoId = useRef(1);
  const rolagemRef = useRef<ScrollView>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduzirMovimento = useReducedMotion();

  useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  useEffect(() => {
    rolagemRef.current?.scrollToEnd({ animated: !reduzirMovimento });
  }, [mensagens, pensando, reduzirMovimento]);

  const enviar = (comando: Comando) => {
    if (pensando) return;
    setMensagens((atual) => [...atual, { id: proximoId.current++, de: 'pessoa', texto: comando.envio }]);
    setPensando(true);
    temporizador.current = setTimeout(() => {
      setPensando(false);
      setMensagens((atual) => [...atual, { id: proximoId.current++, de: 'bot', texto: comando.resposta }]);
    }, ESPERA_RESPOSTA_MS);
  };

  return (
    <View style={[styles.janela, compacto && styles.janelaCompacta]}>
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
        style={styles.corpo}
        contentContainerStyle={styles.corpoConteudo}
        role="log"
        aria-live="polite"
        aria-label="Conversa de exemplo com o Granabô"
      >
        {mensagens.map((b) => (
          <View
            key={b.id}
            style={[styles.balao, b.de === 'pessoa' ? styles.balaoPessoa : styles.balaoBot]}
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

      {/* Chips reutilizáveis: travar depois do primeiro uso obrigaria a
          recarregar a página pra demonstrar as outras perguntas. */}
      <View style={styles.chips}>
        {COMANDOS.map((comando) => (
          <AppPressable
            key={comando.rotulo}
            onPress={() => enviar(comando)}
            disabled={pensando}
            accessibilityLabel={`Perguntar: ${comando.envio}`}
            style={({ hovered }) => [
              styles.chip,
              hovered && !pensando && styles.chipHover,
              pensando && styles.chipDesativado,
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
    maxWidth: 380,
    backgroundColor: theme.paper,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    overflow: 'hidden',
    ...({ boxShadow: '0 16px 40px -12px rgba(0,0,0,0.5)' } as any),
  },
  janelaCompacta: { maxWidth: 320 },
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
     resto da dobra pra baixo enquanto a pessoa testa. */
  corpo: { height: 250 },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.rule,
    maxWidth: '100%',
    ...({ transitionProperty: 'border-color, background-color', transitionDuration: '150ms' } as any),
  },
  chipHover: { borderColor: theme.accent2, backgroundColor: theme.hover },
  chipDesativado: { opacity: 0.5 },
  chipTexto: { color: theme.inkSoft, fontSize: type.nota, fontFamily: fonts.light, flexShrink: 1 },
});
