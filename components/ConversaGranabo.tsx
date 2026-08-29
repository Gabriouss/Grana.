import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';

/**
 * Mock da conversa com o Granabô, o assistente do Grana. no WhatsApp.
 *
 * Por que um mock e não uma captura: não existe screenshot de conversa em
 * `public/telas/` (só Início, Gráficos e Conquistas), e print de conversa real
 * exporia um número e dados de alguém. Reconstruir a partir dos tokens é o
 * mesmo caminho que `LandingHeroDemo` já usa para as telas do app.
 *
 * As respostas do bot aqui são fiéis ao que a Edge Function realmente faz:
 * ela registra o lançamento e também responde consultas de total por categoria
 * (ver `registrarLancamento` e `responderConsulta` em
 * `supabase/functions/whatsapp-webhook/index.ts`). A segunda troca existe de
 * propósito: mostra o Granabô devolvendo mais do que recebeu, que é o que
 * prova o valor do canal em vez de só confirmar o registro.
 *
 * Valores fictícios, nunca de conta real (regra de marketing do projeto).
 */

type Balao = { de: 'pessoa' | 'bot'; texto: string; hora: string };

const CONVERSA: Balao[] = [
  { de: 'pessoa', texto: 'Granabô, gastei 32 no mercado', hora: '19:04' },
  {
    de: 'bot',
    texto: 'Pronto! Registrei R$ 32,00 em Alimentação. Quer ajustar alguma coisa?',
    hora: '19:04',
  },
  { de: 'pessoa', texto: 'quanto já gastei em alimentação esse mês?', hora: '19:05' },
  {
    de: 'bot',
    texto: 'Em Alimentação você tem R$ 412,80 lançados em agosto.',
    hora: '19:05',
  },
];

export default function ConversaGranabo({ compacto }: { compacto?: boolean }) {
  return (
    <View style={[styles.janela, compacto && styles.janelaCompacta]}>
      <View style={styles.cabecalho}>
        <View style={styles.avatar} aria-hidden>
          <Ionicons name="logo-whatsapp" size={16} color={theme.paper} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nome}>Granabô</Text>
          <Text style={styles.status}>assistente do Grana.</Text>
        </View>
      </View>

      <View style={styles.corpo}>
        {CONVERSA.map((b, i) => (
          <View
            key={i}
            style={[styles.balao, b.de === 'pessoa' ? styles.balaoPessoa : styles.balaoBot]}
          >
            <Text style={styles.baloTexto}>{b.texto}</Text>
            <Text style={styles.hora}>{b.hora}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  janela: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: theme.rule,
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
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  /* Verde do WhatsApp: a única cor de terceiro permitida na paleta, e só
     porque o elemento representa literalmente o WhatsApp — mesma exceção já
     documentada em DESIGN.md. */
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  status: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  corpo: { padding: spacing.lg, gap: spacing.sm },
  balao: { maxWidth: '86%', borderRadius: radius.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  balaoPessoa: { alignSelf: 'flex-end', backgroundColor: theme.accentDeep },
  balaoBot: { alignSelf: 'flex-start', backgroundColor: theme.paper, borderWidth: 1, borderColor: theme.rule },
  baloTexto: { color: theme.ink, fontSize: type.apoio, lineHeight: type.apoio * 1.45, fontFamily: fonts.light },
  hora: { color: theme.inkSoft, fontSize: type.micro, fontFamily: fonts.light, alignSelf: 'flex-end', marginTop: 2 },
});
