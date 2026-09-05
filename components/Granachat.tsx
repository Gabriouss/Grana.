import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import AppPressable from '@/components/AppPressable';
import { useKeyboardHeight } from '@/components/Sheet';
import { useTabBarInset } from '@/lib/tab-bar';
import { theme, spacing, radius, fonts, type, lh, screenRhythm } from '@/lib/theme';
import {
  fetchMensagens,
  enviarPergunta,
  type MensagemAssistente,
  type MensagemLocal,
} from '@/lib/assistente';

/**
 * Granachat: a janela flutuante de conversa com o Granabô.
 *
 * Nomenclatura, porque as duas coisas convivem: **Granabô** é o assistente
 * (o personagem com quem a pessoa fala, e o que aparece na copy da tela);
 * **Granachat** é este recurso, a janela em si. Por isso o cabeçalho diz
 * "Granabô" e o arquivo se chama Granachat.
 *
 * Não é rota: mora no layout das abas e aparece por cima da tela em que a
 * pessoa já estava. O motivo é que perguntar "quanto gastei em Alimentação"
 * quase sempre acontece OLHANDO outra coisa — trocar de tela inteira pra
 * perguntar, e voltar depois, perde o contexto que motivou a pergunta.
 *
 * Fecha por três caminhos, porque janela flutuante que só fecha de um jeito
 * vira armadilha: o X do cabeçalho, o toque no fundo escurecido, e o próprio
 * botão do Granabô na barra (que alterna).
 *
 * A conversa passa pela Edge Function `assistente-financeiro`, que usa tool
 * calling via Groq pra consultar dados financeiros reais antes de responder.
 */
export default function Granachat({
  visivel,
  onFechar,
}: {
  visivel: boolean;
  onFechar: () => void;
}) {
  const { total: alturaBarra } = useTabBarInset();
  /* Medir o teclado na mão em vez de usar KeyboardAvoidingView: desde o SDK 54
     o Expo liga edge-to-edge por padrão, e nesse modo o sistema NÃO
     redimensiona a janela — o KAV não tem o que compensar no Android e acaba
     empilhando folga em cima da que já existe. É a mesma conclusão a que
     `components/Sheet.tsx` chegou, e o hook dele é reaproveitado aqui. */
  const alturaTeclado = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  /* Tudo que envolve o campo de texto é derivado da JANELA e da ESCALA DE
     FONTE do sistema, nunca de um tamanho de aparelho. `useWindowDimensions`
     é reativo: girar a tela, entrar em split view ou mudar o tamanho da letra
     nas configurações reflete aqui sem remontar a tela.

     `fontScale` é o que o usuário escolheu em Acessibilidade. Com letra
     grande, uma caixa de altura fixa corta o texto; a altura mínima e a
     máxima sobem junto pra continuar cabendo o mesmo número de linhas. O
     teto de 1.6 evita que a escala máxima do Android (2x) coma a conversa
     inteira, e o piso de 1 impede que letra menor encolha o alvo de toque. */
  const { width: larguraJanela, height: alturaJanela, fontScale } = useWindowDimensions();
  const escalaTexto = Math.min(Math.max(fontScale, 1), 1.6);
  const alturaMinimaCampo = 44 * escalaTexto;
  /* O teto do campo é medido contra o PAINEL, não contra a janela: agora que
     a janela tem altura própria (3:4), limitar por tela deixaria o campo
     crescer até engolir a conversa dentro de um painel pequeno. Um terço do
     painel garante que sobrem sempre dois terços de conversa. O cálculo real
     fica logo abaixo, junto da geometria, porque depende de `alturaPainel`. */
  /* No Android em edge-to-edge, `endCoordinates.height` mede só o teclado —
     a barra de navegação fica ABAIXO dele e não entra na conta. Sem somar
     esse inset, o campo pousa uns 40px baixo demais e o teclado come a
     borda de baixo da caixa e o botão de enviar. No iOS a altura já vem com
     a faixa do indicador, então somar de novo levantaria demais. */
  const folgaSistema = Platform.OS === 'android' ? insets.bottom : 0;
  /* Dentro do painel, o rodapé só precisa do respiro normal: quem desvia da
     barra de abas e do teclado é o painel inteiro (ver `recuoPainel`). */
  const recuoInferior = spacing.lg;
  /* Onde o painel para, medido em runtime: acima da barra de abas quando o
     teclado está fechado, acima do TECLADO quando ele sobe. Nenhum número de
     aparelho aqui — os dois valores vêm do sistema. */
  const recuoPainel = alturaTeclado > 0
    ? alturaTeclado + folgaSistema + spacing.md
    : alturaBarra + spacing.md;
  /* ── Geometria da janela: 3:4, centralizada, cedendo ao teclado ──────
     A proporção é fixa (3 de largura por 4 de altura), mas o TAMANHO não:
     ele é o maior retângulo 3:4 que cabe na área realmente livre. Essa área
     é medida, nunca presumida — vai do topo seguro até onde o painel precisa
     parar, que é acima da barra de abas com o teclado fechado e acima do
     TECLADO quando ele sobe.

     Centralizar dentro dessa área (e não na janela inteira) é o que faz a
     janela continuar parecendo centrada quando o teclado ocupa metade da
     tela: o eixo de simetria passa a ser o espaço que sobrou, que é o que a
     pessoa enxerga.

     O piso de altura existe pro caso degenerado — paisagem num celular
     pequeno com teclado aberto deixa uma faixa de poucas dezenas de dp, e um
     3:4 obediente ali viraria uma tira inútil. Nesse extremo, é melhor a
     janela encostar no teclado do que sumir. */
  const ALTURA_MINIMA_UTIL = 260;
  const LARGURA_MAXIMA_JANELA = 520;
  const espacoLivre = Math.max(
    ALTURA_MINIMA_UTIL,
    alturaJanela - recuoPainel - insets.top - spacing.lg
  );
  const larguraDisponivel = Math.min(larguraJanela - spacing.md * 2, LARGURA_MAXIMA_JANELA);
  const larguraPainel = Math.min(larguraDisponivel, espacoLivre * (3 / 4));
  const alturaPainel = larguraPainel * (4 / 3);
  const alturaMaximaCampo = Math.min(120 * escalaTexto, alturaPainel / 3);
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
        console.error('[Granachat] erro ao carregar histórico:', err);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  /* ── Teclado sobe junto com a janela ──────────────────────────────
     Não há o que fazer aqui além de escrever (ou tocar numa sugestão), então
     abrir com o teclado fechado só cria um toque a mais. O atraso curto
     existe porque o campo acabou de ser montado: pedir foco no mesmo quadro
     costuma não levantar o teclado no Android. Ao fechar, o teclado desce
     junto — senão ele fica de pé sobre a tela que reaparece. */
  useEffect(() => {
    if (!visivel) {
      Keyboard.dismiss();
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [visivel]);

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
    /* O teclado NÃO desce ao enviar, de propósito. Descer faria o painel
       saltar pra baixo e exigiria um toque a mais pra continuar a conversa —
       o mesmo atrito que abrir com o teclado fechado criava. Chat mantém o
       teclado; quem quer sair toca no X, no fundo ou no botão da barra. */

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
      /* Tocar no botão de enviar desfoca o campo no Android (é um Pressable
         fora dele), e sem devolver o foco a pessoa precisa tocar de novo pra
         fazer a próxima pergunta. Conversa mantém o teclado de pé. */
      inputRef.current?.focus();
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
          <Text
            style={[
              styles.bolhaTexto,
              isUser ? styles.bolhaTextoUsuario : styles.bolhaTextoAssistente,
              item.erro ? styles.bolhaTextoErro : null,
            ]}
          >
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

  if (!visivel) return null;

  return (
    /* Fundo escurecido: toca fora e fecha, como qualquer janela flutuante.
       O painel é um Pressable aninhado com onPress vazio — assim ele consome
       o toque antes de chegar no fundo, e tocar DENTRO do chat nunca fecha.
       Mesmo truque que `components/Sheet.tsx` já usa. */
    <Pressable
      style={[styles.fundo, { paddingTop: insets.top, paddingBottom: recuoPainel }]}
      onPress={onFechar}
      accessible={false}
    >
      {/* Desfoque do que está atrás. Na web é `backdrop-filter`, que é barato
          e sem risco. No nativo é o BlurView do expo-blur.

          Por que aqui é seguro e na barra de abas não era: a barra fica
          montada o tempo TODO, inclusive no instante em que o Android recria
          a Activity ao voltar do desbloqueio por digital — e era exatamente
          aí que o app fechava, com crash nativo sem rastro em JS. Esta camada
          só existe enquanto a conversa está aberta, situação em que a Activity
          não está sendo recriada.

          Ainda assim, o desfoque é ENFEITE: quem resolve a hierarquia é o véu
          escuro por cima. Se o blur não funcionar num aparelho, nada quebra e
          nada fica ilegível. */}
      {Platform.OS === 'web' ? (
        <View style={[styles.veuBlur, { backdropFilter: 'blur(18px) saturate(140%)' } as any]} pointerEvents="none" />
      ) : (
        <BlurView intensity={40} tint="dark" style={styles.veuBlur} pointerEvents="none" />
      )}
      <View style={styles.veu} pointerEvents="none" />
      <Pressable
        style={[styles.painel, { width: larguraPainel, height: alturaPainel }]}
        onPress={() => {}}
        accessibilityViewIsModal
        role="dialog"
      >
        <View style={styles.cabecalho}>
          <View style={styles.cabecalhoTextos}>
            <Text style={styles.cabecalhoEyebrow}>Assistente</Text>
            <Text style={styles.cabecalhoTitulo} numberOfLines={1}>Granabô</Text>
          </View>
          <AppPressable
            onPress={onFechar}
            style={styles.botaoFechar}
            accessibilityLabel="Fechar conversa"
            hitSlop={10}
          >
            <Ionicons name="close" size={20} color={theme.inkSoft} />
          </AppPressable>
        </View>

        <View style={styles.corpo}>
        <FlatList
          ref={flatListRef}
          style={styles.lista}
          data={mensagens}
          renderItem={renderMensagem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listaConteudo,
            mensagens.length === 0 && styles.listaVazia,
          ]}
          ListEmptyComponent={renderVazio}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollParaFim}
        />

        {/* Campo de entrada.

            O recuo de baixo tem dois estados porque o rodapé tem dois donos:
            com o teclado fechado, quem ocupa aquele espaço é a barra de abas
            flutuante (`paddingConteudo`); com o teclado aberto, a barra sai de
            cena e quem ocupa é o teclado. Somar os dois deixa um vão morto do
            tamanho da barra — foi o "tá estranho" desta tela, e é o mesmo
            defeito que `components/Sheet.tsx` já documenta. */}
        <View style={[styles.inputWrap, { paddingBottom: recuoInferior }]}>
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={[styles.input, { minHeight: alturaMinimaCampo, maxHeight: alturaMaximaCampo }]}
              value={texto}
              onChangeText={setTexto}
              placeholder="Pergunte ao Granabô…"
              placeholderTextColor={theme.inkFaint}
              multiline
              maxLength={500}
              editable={!enviando}
              returnKeyType="send"
              /* `submitBehavior="submit"` = envia e MANTÉM o foco. Antes aqui
                 estava `blurOnSubmit`, que faz o oposto: tira o foco ao
                 enviar, e era isso que derrubava o teclado a cada mensagem.
                 (`blurOnSubmit` também está depreciado em favor deste.) */
              submitBehavior="submit"
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
      </View>
      </Pressable>
    </Pressable>
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
  /* Fundo escurecido cobrindo tudo. `zIndex` alto porque o painel precisa
     ficar acima da barra de abas flutuante (que já usa 40 no FAB). */
  /* Escurecimento forte, não médio: a 0.55 o mês, o saldo e os gráficos
     continuavam legíveis atrás e disputavam a atenção com a conversa. A
     hierarquia aqui precisa ser absoluta — enquanto o chat está aberto, ele é
     a única coisa que importa. A 0.86 o que está atrás vira contexto, não
     leitura.

     O desfoque entra como CAMADA SEPARADA por cima disto (ver `<BlurView>` no
     componente). A ordem importa: o escurecimento sozinho já resolve a
     hierarquia, então se o blur nativo não estiver disponível no aparelho, o
     resultado continua correto em vez de depender dele. */
  fundo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
    paddingHorizontal: spacing.md,
    /* Centro do ESPAÇO LIVRE, não da janela: o `paddingBottom` aplicado no
       componente já desconta a barra de abas ou o teclado, então centralizar
       aqui posiciona a janela no meio do que a pessoa efetivamente vê. */
    justifyContent: 'center',
    alignItems: 'center',
  },
  veuBlur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  veu: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(2,14,17,0.86)',
  },
  /* O painel NÃO tem altura fixa: cresce com o conteúdo até o teto de 78% da
     janela. Numa tela pequena ele ocupa quase tudo; numa grande, fica sendo
     uma janela mesmo. `flexShrink` deixa o teclado espremê-lo sem estourar. */
  painel: {
    backgroundColor: theme.paper,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    overflow: 'hidden',
    ...({ boxShadow: '0 18px 40px -10px rgba(0,0,0,0.6)' } as any),
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: screenRhythm.padding,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  cabecalhoTextos: { flexShrink: 1, minWidth: 0 },
  cabecalhoEyebrow: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    color: theme.accent2,
    letterSpacing: 0.5,
  },
  cabecalhoTitulo: {
    fontFamily: fonts.regular,
    fontSize: type.titulo,
    lineHeight: lh(type.titulo, 'titulo'),
    color: theme.ink,
  },
  /* 44 fixo: piso de alvo de toque, mesmo critério do botão de enviar. */
  botaoFechar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  /* `flex: 1`, não `flexShrink: 1`. Com o painel tendo altura fixa (3:4), um
     corpo que só encolhe se dimensiona pelo CONTEÚDO e deixa toda a sobra
     morta embaixo do campo — que era exatamente o vão relatado: a proporção
     aumentou a caixa, mas o conteúdo continuou do mesmo tamanho. Ocupando o
     que sobra, a lista cresce e o campo desce pro fim do painel. */
  corpo: { flex: 1 },
  /* A lista toma a altura entre o cabeçalho e o campo. Sem isto ela mediria
     pelo conteúdo, e uma conversa curta deixaria o campo flutuando no meio. */
  lista: { flex: 1 },
  listaConteudo: {
    paddingHorizontal: screenRhythm.padding,
    /* Folga maior em cima que embaixo: a primeira bolha encostava no fio do
       cabeçalho, e é ela que o olho encontra primeiro ao abrir a tela. */
    paddingTop: spacing.xl,
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
  /* Falha do assistente NÃO é alarme. `theme.danger` é o coral reservado a
     coisa destrutiva (excluir conta, fatura atrasada), e o DESIGN.md é
     explícito: vermelho não existe no vocabulário da marca. Uma resposta que
     não veio é só uma resposta que não veio — o balão fica recuado e a tinta
     mais baixa, no mesmo tom calmo do resto. */
  bolhaErro: {
    backgroundColor: 'transparent',
    borderColor: theme.rule,
    borderStyle: 'dashed',
  },
  bolhaTextoErro: {
    color: theme.inkSoft,
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
  /* `minHeight`/`maxHeight` NÃO ficam aqui: dependem da escala de fonte e da
     altura da janela, que só existem em tempo de execução (ver o componente). */
  input: {
    flex: 1,
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
  /* 44 fixo aqui é proposital, ao contrário do campo ao lado: 44dp é o piso
     de alvo de toque das duas plataformas, e dp já é independente de
     densidade — num aparelho de 3x ele sai com o mesmo tamanho FÍSICO que num
     de 2x. Crescer com `fontScale` seria errado: o botão carrega um ícone,
     não texto, e quem aumentou a letra não pediu um botão maior. */
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
