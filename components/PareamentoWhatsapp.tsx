import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import AppPressable from '@/components/AppPressable';
import { abrirPareamentoNoWhatsapp, NUMERO_BOT_EXIBICAO } from '@/lib/whatsapp';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';

/* O cartão de vínculo do WhatsApp, um só para as três telas que o mostram
 * (estreia, sheet do app e Perfil). Três cópias do mesmo cartão é como as
 * telas divergem: uma ganha um ajuste, as outras não, e a pessoa vê
 * instruções diferentes pro mesmo passo dependendo de onde entrou.
 *
 * ── Por que o texto é assim ────────────────────────────────────────────────
 *
 * Este é o único momento do app em que a pessoa precisa SAIR dele pra
 * terminar uma tarefa, e sair é onde se desiste. Então cada dúvida possível é
 * respondida antes de aparecer:
 *
 *  - "o que vai acontecer se eu tocar?" — dito antes do botão, não depois.
 *  - "e agora, travou?" — a espera é declarada como espera POR VOCÊ, não como
 *    carregamento. Um spinner sozinho lê como "o app está pensando", e a
 *    pessoa fica olhando em vez de agir. Por isso um relógio e uma frase, não
 *    um spinner.
 *  - "preciso apertar algo quando voltar?" — dito que não: a tela muda
 *    sozinha.
 *  - "e se eu não uso WhatsApp neste aparelho?" — o caminho manual mostra o
 *    código E o número, os dois copiáveis. Antes dizia "mande este código
 *    para o Grana." sem dizer para ONDE: quem estava no computador sem
 *    WhatsApp Web ficava sem saída nenhuma.
 */

type Props = {
  codigo: string;
  /** Texto do topo. O padrão serve pra estreia; o Perfil usa um mais curto. */
  chamada?: string;
};

export default function PareamentoWhatsapp({ codigo, chamada }: Props) {
  const [copiado, setCopiado] = useState<'codigo' | 'numero' | null>(null);

  async function copiar(valor: string, qual: 'codigo' | 'numero') {
    await Clipboard.setStringAsync(valor);
    setCopiado(qual);
    setTimeout(() => setCopiado(null), 2000);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.chamada}>{chamada ?? 'Falta um passo, e ele é rápido.'}</Text>

      <AppPressable
        style={({ hovered }) => [styles.botao, hovered && styles.botaoHover]}
        onPress={() => abrirPareamentoNoWhatsapp(codigo)}
        accessibilityRole="button"
        accessibilityLabel="Abrir a conversa do Grana. no WhatsApp com a mensagem já escrita"
      >
        <Ionicons name="logo-whatsapp" size={20} color="#fff" />
        <Text style={styles.botaoTexto}>Abrir a conversa no WhatsApp</Text>
      </AppPressable>

      {/* O que vai acontecer, dito ANTES de a pessoa decidir tocar. */}
      <Text style={styles.oQueAcontece}>
        A mensagem já vai escrita. Você só toca em <Text style={styles.enfase}>enviar</Text>.
      </Text>

      <View style={styles.espera}>
        <Ionicons name="time-outline" size={16} color={theme.accent2} />
        <Text style={styles.esperaTexto}>
          Estou esperando sua mensagem. Quando ela chegar, esta tela muda sozinha — não precisa
          voltar aqui e apertar nada.
        </Text>
      </View>

      <View style={styles.divisor}>
        <View style={styles.linha} />
        <Text style={styles.divisorTexto}>ou faça na mão</Text>
        <View style={styles.linha} />
      </View>

      <LinhaCopiavel
        rotulo="Mande este código"
        valor={codigo}
        destaque
        copiado={copiado === 'codigo'}
        onCopiar={() => copiar(codigo, 'codigo')}
      />
      {!!NUMERO_BOT_EXIBICAO && (
        <LinhaCopiavel
          rotulo="Para este número"
          valor={NUMERO_BOT_EXIBICAO}
          copiado={copiado === 'numero'}
          onCopiar={() => copiar(NUMERO_BOT_EXIBICAO, 'numero')}
        />
      )}
    </View>
  );
}

function LinhaCopiavel({
  rotulo,
  valor,
  destaque,
  copiado,
  onCopiar,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
  copiado: boolean;
  onCopiar: () => void;
}) {
  return (
    <View style={styles.linhaCopia}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rotulo}>{rotulo}</Text>
        <Text style={[styles.valor, destaque && styles.valorDestaque]}>{valor}</Text>
      </View>
      <AppPressable
        style={({ hovered }) => [styles.copiar, hovered && styles.copiarHover]}
        onPress={onCopiar}
        accessibilityRole="button"
        accessibilityLabel={`Copiar ${rotulo.toLowerCase()}: ${valor}`}
      >
        <Ionicons
          name={copiado ? 'checkmark' : 'copy-outline'}
          size={15}
          color={copiado ? theme.accent2 : theme.inkSoft}
        />
        <Text style={[styles.copiarTexto, copiado && { color: theme.accent2 }]}>
          {copiado ? 'Copiado' : 'Copiar'}
        </Text>
      </AppPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  chamada: { color: theme.ink, fontSize: type.corpo, lineHeight: 20, fontFamily: fonts.regular },
  /* Verde do WhatsApp: única cor emprestada de outra marca no app, e aqui ela
     informa — diz pra onde o toque leva antes de a pessoa ler o rótulo. */
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#25D366',
    borderRadius: radius.md,
    paddingVertical: 15,
    marginTop: spacing.xs,
  },
  botaoHover: { opacity: 0.9 },
  botaoTexto: { color: '#fff', fontSize: type.corpo, fontFamily: fonts.regular },
  oQueAcontece: {
    color: theme.inkSoft,
    fontSize: type.apoio,
    lineHeight: 18,
    fontFamily: fonts.light,
    textAlign: 'center',
  },
  enfase: { color: theme.ink, fontFamily: fonts.regular },
  espera: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: theme.paper,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  esperaTexto: { flex: 1, color: theme.inkSoft, fontSize: type.legenda, lineHeight: 17, fontFamily: fonts.light },
  divisor: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  linha: { flex: 1, height: 1, backgroundColor: theme.rule },
  divisorTexto: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  linhaCopia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: theme.paper,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.rule,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  rotulo: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  valor: { color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  valorDestaque: { fontSize: type.titulo, letterSpacing: 4, color: theme.accent2 },
  copiar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  copiarHover: { borderColor: theme.ruleStrong },
  copiarTexto: { color: theme.inkSoft, fontSize: type.legenda, fontFamily: fonts.light },
});
