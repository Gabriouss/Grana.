import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from '@/lib/alert';
import AppPressable from '@/components/AppPressable';
import Sheet from '@/components/Sheet';
import { createWhatsappPairing, fetchWhatsappLink } from '@/lib/data';
import { formatarTelefoneBR, telefoneBRValido, telefoneE164BR } from '@/lib/format';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import type { WhatsappLink } from '@/lib/types';

/* Atalho para o bot de lançamento por WhatsApp.
 *
 * O destino depende do estado do vínculo, e QUEM DECIDE É O APP, não uma
 * pergunta ao usuário: `whatsapp_links.verified` já diz se o número está
 * verificado. Perguntar "você já verificou?" erraria nos dois sentidos —
 * quem verificou há meses não lembra e seria mandado pra um pareamento
 * desnecessário, e quem acha que verificou cairia no WhatsApp pra receber
 * "este número não está vinculado", que é um beco sem saída com cara de bug.
 *
 * A explicação do que é o bot aparece só na estreia. Repetir todo dia um
 * aviso que a pessoa já leu é pedágio, não ajuda.
 */

const NUMERO_BOT = process.env.EXPO_PUBLIC_WHATSAPP_NUMBER ?? '';

const CHAVE_EXPLICACAO = '@grana_whatsapp_explicado';

/** A explicação do bot é de estreia: quem já leu vai direto ao destino. */
export async function jaViuExplicacaoDoBot(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CHAVE_EXPLICACAO)) === '1';
  } catch {
    return false;
  }
}

export async function marcarExplicacaoDoBotVista(): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE_EXPLICACAO, '1');
  } catch {
    // Preferência de conveniência: se o armazenamento falhar, a explicação
    // aparece de novo — irritante, não quebrado.
  }
}

/** wa.me exige só dígitos, com DDI e sem sinais. */
function linkDoBot(): string {
  const digitos = NUMERO_BOT.replace(/\D/g, '');
  return digitos ? `https://wa.me/${digitos}` : '';
}

export async function abrirConversaDoBot(): Promise<void> {
  const url = linkDoBot();
  if (!url) {
    Alert.alert('Número indisponível', 'O número do WhatsApp do Grana. não está configurado neste app.');
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Não foi possível abrir o WhatsApp', `Procure pelo número ${NUMERO_BOT} no seu WhatsApp.`);
  }
}

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Mostra a explicação antes de seguir (só na primeira vez). */
  explicar: boolean;
  onExplicacaoVista: () => void;
};

export default function WhatsappBotSheet({ visible, onClose, explicar, onExplicacaoVista }: Props) {
  const [link, setLink] = useState<WhatsappLink | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mostrandoExplicacao, setMostrandoExplicacao] = useState(explicar);
  const [telefone, setTelefone] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMostrandoExplicacao(explicar);
    setTelefone('');
    setCarregando(true);
    fetchWhatsappLink()
      .then(setLink)
      .catch(() => setLink(null))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const verificado = !!link?.verified;

  async function continuar() {
    setMostrandoExplicacao(false);
    onExplicacaoVista();
    if (verificado) {
      onClose();
      await abrirConversaDoBot();
    }
  }

  async function gerarCodigo() {
    if (!telefoneBRValido(telefone)) {
      Alert.alert('Número inválido', 'Informe o DDD e o número, ex: (11) 91234-5678.');
      return;
    }
    setSalvando(true);
    try {
      setLink(await createWhatsappPairing(telefoneE164BR(telefone)));
    } catch (e: any) {
      Alert.alert('Erro ao gerar código', e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function conferirVinculo() {
    setSalvando(true);
    try {
      const atual = await fetchWhatsappLink();
      setLink(atual);
      if (atual?.verified) {
        onClose();
        Alert.alert('Tudo certo', 'Seu WhatsApp está vinculado. Agora é só mandar seus gastos por lá.');
      } else {
        Alert.alert('Ainda não vinculado', 'Envie o código pelo WhatsApp e toque em conferir de novo.');
      }
    } catch (e: any) {
      Alert.alert('Erro ao conferir', e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Sheet onClose={onClose}>
        <View style={styles.cabecalho}>
          <View style={styles.tituloLinha}>
            <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
            <Text style={styles.titulo}>Lançar pelo WhatsApp</Text>
          </View>
          <AppPressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
            <Ionicons name="close" size={22} color={theme.inkFaint} />
          </AppPressable>
        </View>

        {carregando ? (
          <ActivityIndicator color={theme.ink} style={{ marginVertical: spacing.lg }} />
        ) : mostrandoExplicacao ? (
          <>
            <Text style={styles.texto}>
              O Grana. tem um número de WhatsApp que registra seus gastos por mensagem. Você
              escreve como falaria com uma pessoa, e o lançamento aparece aqui no app.
            </Text>
            <View style={styles.exemplos}>
              <Text style={styles.exemplo}>Almoço 25 reais</Text>
              <Text style={styles.exemplo}>Uber 18 no crédito da C6</Text>
              <Text style={styles.exemplo}>Mercado 230 parcelado em 3x</Text>
            </View>
            <Text style={styles.rodape}>Áudio também funciona — é só mandar um recado falado.</Text>
            <AppPressable style={({ hovered }) => [styles.botao, hovered && styles.botaoHover]} onPress={continuar}>
              <Text style={styles.botaoTexto}>{verificado ? 'Abrir conversa' : 'Vincular meu número'}</Text>
            </AppPressable>
          </>
        ) : verificado ? (
          <>
            <Text style={styles.texto}>Seu número já está vinculado. É só mandar mensagem.</Text>
            <AppPressable
              style={({ hovered }) => [styles.botao, hovered && styles.botaoHover]}
              onPress={async () => {
                onClose();
                await abrirConversaDoBot();
              }}
            >
              <Text style={styles.botaoTexto}>Abrir conversa</Text>
            </AppPressable>
          </>
        ) : link ? (
          <>
            <Text style={styles.texto}>
              Falta um passo: envie o código abaixo para {NUMERO_BOT || 'o número do Grana.'} pelo
              WhatsApp. É assim que o bot descobre que aquele número é seu.
            </Text>
            <View style={styles.caixaCodigo}>
              <Text style={styles.codigo}>{link.pairing_code}</Text>
            </View>
            <AppPressable
              style={({ hovered }) => [styles.botao, hovered && styles.botaoHover]}
              onPress={abrirConversaDoBot}
            >
              <Text style={styles.botaoTexto}>Abrir o WhatsApp para enviar</Text>
            </AppPressable>
            <AppPressable
              style={({ hovered }) => [styles.botaoSecundario, hovered && styles.botaoHover]}
              onPress={conferirVinculo}
              disabled={salvando}
            >
              {salvando ? (
                <ActivityIndicator color={theme.ink} />
              ) : (
                <Text style={styles.botaoSecundarioTexto}>Já enviei — conferir</Text>
              )}
            </AppPressable>
          </>
        ) : (
          <>
            <Text style={styles.texto}>
              Informe o número que você usa no WhatsApp. Geramos um código para você enviar ao
              bot, e é só isso.
            </Text>
            <View style={styles.telefoneLinha}>
              <View style={styles.ddi}>
                <Text style={styles.ddiTexto}>+55</Text>
              </View>
              <TextInput
                style={styles.telefoneCampo}
                placeholder="(11) 91234-5678"
                placeholderTextColor={theme.inkFaint}
                keyboardType="phone-pad"
                value={telefone}
                onChangeText={(t) => setTelefone(formatarTelefoneBR(t))}
                maxLength={16}
              />
            </View>
            <AppPressable
              style={({ hovered }) => [styles.botao, hovered && styles.botaoHover]}
              onPress={gerarCodigo}
              disabled={salvando}
            >
              {salvando ? (
                <ActivityIndicator color={theme.paper} />
              ) : (
                <Text style={styles.botaoTexto}>Gerar código</Text>
              )}
            </AppPressable>
          </>
        )}
      </Sheet>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tituloLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
  texto: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.light, lineHeight: 20 },
  exemplos: {
    gap: 6,
    backgroundColor: theme.paper,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.sm,
  },
  exemplo: { color: theme.accent2, fontSize: type.apoio, fontFamily: fonts.regular },
  rodape: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  caixaCodigo: {
    backgroundColor: theme.paper,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  codigo: {
    color: theme.accent2,
    fontSize: type.valor,
    fontFamily: fonts.regular,
    letterSpacing: 6,
  },
  telefoneLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ddi: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  ddiTexto: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.regular },
  telefoneCampo: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paper,
    color: theme.ink,
    fontSize: type.apoio,
    fontFamily: fonts.regular,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  botao: {
    backgroundColor: theme.ink,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  botaoHover: { opacity: 0.88 },
  botaoTexto: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
  botaoSecundario: {
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.ruleStrong,
  },
  botaoSecundarioTexto: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
});
