import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '@/components/ScreenHeader';
import AppPressable from '@/components/AppPressable';
import { useTabBarInset } from '@/lib/tab-bar';
import { colunaConteudo } from '@/lib/breakpoints';
import { theme, spacing, radius, fonts, type, lh, screenRhythm } from '@/lib/theme';
import {
  fetchMensagens,
  enviarPergunta,
  type MensagemAssistente,
  type MensagemLocal,
} from '@/lib/assistente';

/**
 * Tela do Granabô, o assistente do Grana.
 *
 * Chat real com histórico persistido, campo de texto livre e bolhas de
 * mensagem. A conversa passa pela Edge Function `assistente-financeiro`
 * que usa tool calling via Groq para consultar dados financeiros reais
 * antes de responder.
 */
export default function AssistenteScreen() {
  const { paddingConteudo } = useTabBarInset();
  const [mensagens, setMensagens] = useState<MensagemLocal[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  /* ── Carregar histórico ao abrir ──────────────────────────────────── */
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const dados = await fetchMensagens(50);
        if (cancelado) return;
        setMensagens(
          dados.map((m: MensagemAssistente) => ({
            id: m.id,
            papel: m.papel,
            texto: m.texto,
            ferramenta_usada: m.ferramenta_usada,
            criado_em: m.criado_em,
          }))
        );
      } catch (err) {
        console.error('[AssistenteScreen] erro ao carregar histórico:', err);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  /* ── Scroll pro fim quando chega mensagem nova ────────────────────── */
  const scrollParaFim = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  useEffect(() => {
    if (mensagens.length > 0) scrollParaFim();
  }, [mensagens.length, scrollParaFim]);

  /* ── Enviar pergunta ──────────────────────────────────────────────── */
  const enviar = useCallback(async () => {
    const pergunta = texto.trim();
    if (!pergunta || enviando) return;

    setTexto('');
    Keyboard.dismiss();

    const idPergunta = `local-${Date.now()}`;
    const idResposta = `local-${Date.now() + 1}`;

    // Adiciona a pergunta do usuário e um placeholder de "pensando"
    const novaPergunta: MensagemLocal = {
      id: idPergunta,
      papel: 'usuario',
      texto: pergunta,
      ferramenta_usada: null,
      criado_em: new Date().toISOString(),
    };

    const placeholderResposta: MensagemLocal = {
      id: idResposta,
      papel: 'assistente',
      texto: '',
      ferramenta_usada: null,
      criado_em: new Date().toISOString(),
      carregando: true,
    };

    setMensagens((prev) => [...prev, novaPergunta, placeholderResposta]);
    setEnviando(true);

    try {
      // Monta histórico recente para contexto
      const historicoParaEnviar = mensagens
        .filter((m) => !m.carregando && !m.erro)
        .slice(-10)
        .map((m) => ({ papel: m.papel, texto: m.texto }));

      const resultado = await enviarPergunta(pergunta, historicoParaEnviar);

      setMensagens((prev) =>
        prev.map((m) =>
          m.id === idResposta
            ? {
                ...m,
                texto: resultado.resposta,
                ferramenta_usada: resultado.ferramenta,
                carregando: false,
              }
            : m
        )
      );
    } catch (err) {
      const mensagemErro = err instanceof Error ? err.message : 'Algo deu errado. Tenta de novo.';
      setMensagens((prev) =>
        prev.map((m) =>
          m.id === idResposta
            ? {
                ...m,
                texto: mensagemErro,
                carregando: false,
                erro: mensagemErro,
              }
            : m
        )
      );
    } finally {
      setEnviando(false);
    }
  }, [texto, enviando, mensagens]);

  /* ── Render de cada mensagem ──────────────────────────────────────── */
  const renderMensagem = useCallback(({ item }: { item: MensagemLocal }) => {
    const isUser = item.papel === 'usuario';

    if (item.carregando) {
      return (
        <View style={[styles.bolhaWrap, styles.bolhaWrapAssistente]}>
          <View style={[styles.bolha, styles.bolhaAssistente]}>
            <View style={styles.pensando}>
              <ActivityIndicator size="small" color={theme.accent2} />
              <Text style={styles.pensandoTexto}>Granabô está pensando…</Text>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.bolhaWrap, isUser ? styles.bolhaWrapUsuario : styles.bolhaWrapAssistente]}>
        {!isUser && (
          <View style={styles.avatarBot}>
            <Ionicons name="sparkles" size={14} color={theme.paper} />
          </View>
        )}
        <View
          style={[
            styles.bolha,
            isUser ? styles.bolhaUsuario : styles.bolhaAssistente,
            item.erro ? styles.bolhaErro : null,
          ]}
        >
          <Text style={[styles.bolhaTexto, isUser ? styles.bolhaTextoUsuario : styles.bolhaTextoAssistente]}>
            {item.texto}
          </Text>
        </View>
      </View>
    );
  }, []);

  /* ── Tela vazia (sem histórico) ──────────────────────────────────── */
  const renderVazio = useCallback(
    () =>
      carregando ? null : (
        <View style={styles.vazio}>
          <View style={styles.vazioIcone}>
            <Ionicons name="sparkles" size={28} color={theme.paper} />
          </View>
          <Text style={styles.vazioTitulo}>Olá! Eu sou o Granabô</Text>
          <Text style={styles.vazioTexto}>
            Pergunte sobre suas finanças: quanto gastou em uma categoria, como está o crédito, boletos
            pendentes, ou quanto ainda dá pra gastar no mês.
          </Text>
          <View style={styles.sugestoes}>
            {SUGESTOES.map((s) => (
              <AppPressable
                key={s}
                style={styles.chipSugestao}
                onPress={() => { setTexto(s); inputRef.current?.focus(); }}
              >
                <Text style={styles.chipTexto}>{s}</Text>
              </AppPressable>
            ))}
          </View>
        </View>
      ),
    [carregando]
  );

  return (
    <SafeAreaView style={styles.tela} edges={['top']}>
      <ScreenHeader eyebrow="Assistente" title="Granabô" />

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={mensagens}
          renderItem={renderMensagem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listaConteudo,
            colunaConteudo,
            mensagens.length === 0 && styles.listaVazia,
          ]}
          ListEmptyComponent={renderVazio}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollParaFim}
        />

        {/* Campo de entrada */}
        <View style={[styles.inputWrap, { paddingBottom: Math.max(paddingConteudo, spacing.lg) }]}>
          <View style={[styles.inputRow, colunaConteudo]}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={texto}
              onChangeText={setTexto}
              placeholder="Pergunte ao Granabô…"
              placeholderTextColor={theme.inkFaint}
              multiline
              maxLength={500}
              editable={!enviando}
              returnKeyType="send"
              blurOnSubmit
              onSubmitEditing={enviar}
            />
            <AppPressable
              onPress={enviar}
              style={[styles.botaoEnviar, (!texto.trim() || enviando) && styles.botaoEnviarDesabilitado]}
              disabled={!texto.trim() || enviando}
              accessibilityLabel="Enviar mensagem"
            >
              {enviando ? (
                <ActivityIndicator size="small" color={theme.paper} />
              ) : (
                <Ionicons name="arrow-up" size={20} color={theme.paper} />
              )}
            </AppPressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ── Sugestões de perguntas para tela vazia ──────────────────────────────── */

const SUGESTOES = [
  'Quanto gastei em Alimentação?',
  'Como está meu crédito?',
  'Quanto posso gastar?',
  'Resumo do mês',
];

/* ── Estilos ──────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: theme.paper },
  kav: { flex: 1 },
  listaConteudo: {
    paddingHorizontal: screenRhythm.padding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexGrow: 1,
  },
  listaVazia: {
    justifyContent: 'center',
  },

  /* ── Bolhas ──────────────────────────────────────────────────────── */
  bolhaWrap: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  bolhaWrapUsuario: {
    justifyContent: 'flex-end',
  },
  bolhaWrapAssistente: {
    justifyContent: 'flex-start',
  },
  avatarBot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.accent2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  bolha: {
    maxWidth: '78%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  bolhaUsuario: {
    backgroundColor: theme.accentDeep,
    borderBottomRightRadius: spacing.xs,
  },
  bolhaAssistente: {
    backgroundColor: theme.paperRaised,
    borderBottomLeftRadius: spacing.xs,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  bolhaErro: {
    borderColor: theme.danger,
    borderWidth: 1,
  },
  bolhaTexto: {
    fontFamily: fonts.light,
    fontSize: type.corpo,
    lineHeight: lh(type.corpo, 'corpo'),
  },
  bolhaTextoUsuario: {
    color: theme.ink,
  },
  bolhaTextoAssistente: {
    color: theme.ink,
  },
  pensando: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pensandoTexto: {
    fontFamily: fonts.light,
    fontSize: type.apoio,
    color: theme.inkSoft,
    fontStyle: 'italic',
  },

  /* ── Estado vazio ────────────────────────────────────────────────── */
  vazio: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  vazioIcone: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.accent2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  vazioTitulo: {
    fontFamily: fonts.regular,
    fontSize: type.titulo,
    lineHeight: lh(type.titulo, 'titulo'),
    color: theme.ink,
    textAlign: 'center',
  },
  vazioTexto: {
    fontFamily: fonts.light,
    fontSize: type.apoio,
    lineHeight: lh(type.apoio, 'corpo'),
    color: theme.inkSoft,
    textAlign: 'center',
    maxWidth: 340,
  },
  sugestoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chipSugestao: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    backgroundColor: theme.paperRaised,
  },
  chipTexto: {
    fontFamily: fonts.light,
    fontSize: type.nota,
    color: theme.accent2,
  },

  /* ── Input ───────────────────────────────────────────────────────── */
  inputWrap: {
    borderTopWidth: 1,
    borderTopColor: theme.rule,
    backgroundColor: theme.paper,
    paddingTop: spacing.sm,
    paddingHorizontal: screenRhythm.padding,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: theme.rule,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.light,
    fontSize: type.corpo,
    color: theme.ink,
  },
  botaoEnviar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.accent2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoEnviarDesabilitado: {
    opacity: 0.35,
  },
});
