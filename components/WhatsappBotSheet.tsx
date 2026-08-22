import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Alert } from '@/lib/alert';
import AppPressable from '@/components/AppPressable';
import Sheet from '@/components/Sheet';
import { createWhatsappPairing, fetchWhatsappLink } from '@/lib/data';
import { abrirConversaDoBot, abrirPareamentoNoWhatsapp, numeroVinculadoParaExibir } from '@/lib/whatsapp';
import { useAguardarVinculoWhatsapp } from '@/hooks/useAguardarVinculoWhatsapp';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import type { WhatsappLink } from '@/lib/types';

export { abrirConversaDoBot };

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
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [falhouAoCarregar, setFalhouAoCarregar] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMostrandoExplicacao(explicar);
    setCopiado(false);
    setCarregando(true);
    setFalhouAoCarregar(false);
    fetchWhatsappLink()
      .then((l) => setLink(l))
      /* A falha precisa ficar marcada, e não virar "não tem vínculo": o
         preparo automático logo abaixo chama createWhatsappPairing, que
         começa APAGANDO o vínculo anterior. Tratar erro de rede como ausência
         desligaria o WhatsApp de quem já usava, calado. */
      .catch(() => {
        setLink(null);
        setFalhouAoCarregar(true);
      })
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const verificado = !!link?.verified;

  /* Código pronto assim que o sheet abre, e não ao tocar no botão: na web,
     `Linking.openURL` vira `window.open`, que o navegador só libera durante o
     clique. Esperar a rede antes de abrir faria o bloqueador de pop-up comer
     a aba sem avisar ninguém. */
  useEffect(() => {
    if (!visible || carregando || falhouAoCarregar || link || salvando) return;
    void gerarCodigo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, carregando, falhouAoCarregar, link]);

  /* Enquanto o código está na tela o app confere sozinho — a pessoa manda a
     mensagem, volta, e já está vinculado. */
  useAguardarVinculoWhatsapp(visible && !!link && !link.verified, setLink);

  async function continuar() {
    setMostrandoExplicacao(false);
    onExplicacaoVista();
    if (verificado) {
      onClose();
      await abrirConversaDoBot();
    } else if (link) {
      await abrirPareamentoNoWhatsapp(link.pairing_code);
    }
  }

  async function gerarCodigo() {
    setSalvando(true);
    try {
      setLink(await createWhatsappPairing());
    } catch {
      /* Sem código não dá pra parear, mas o sheet continua útil: o estado de
         carregando some e a tela mostra o caminho manual. */
    } finally {
      setSalvando(false);
    }
  }

  async function copiarCodigo() {
    if (!link) return;
    await Clipboard.setStringAsync(link.pairing_code);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
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
              <Ionicons name="logo-whatsapp" size={19} color={theme.paper} />
              <Text style={styles.botaoTexto}>{verificado ? 'Abrir conversa' : 'Abrir o WhatsApp e vincular'}</Text>
            </AppPressable>
          </>
        ) : verificado ? (
          <>
            <Text style={styles.texto}>
              {numeroVinculadoParaExibir(link!.phone)
                ? `${numeroVinculadoParaExibir(link!.phone)} está vinculado.`
                : 'Seu número está vinculado.'}{' '}
              É só mandar mensagem.
            </Text>
            <AppPressable
              style={({ hovered }) => [styles.botao, hovered && styles.botaoHover]}
              onPress={async () => {
                onClose();
                await abrirConversaDoBot();
              }}
            >
              <Ionicons name="logo-whatsapp" size={19} color={theme.paper} />
              <Text style={styles.botaoTexto}>Abrir conversa</Text>
            </AppPressable>
          </>
        ) : link ? (
          <>
            {/* Um toque: a conversa do Grana. abre com o código já escrito, e
                o vínculo é do número que enviar. Nada de digitar o próprio
                telefone, salvar contato ou copiar código na mão. */}
            <AppPressable
              style={({ hovered }) => [styles.botao, hovered && styles.botaoHover]}
              onPress={() => abrirPareamentoNoWhatsapp(link.pairing_code)}
              accessibilityRole="button"
              accessibilityLabel="Abrir a conversa do Grana. no WhatsApp com o código já escrito"
            >
              <Ionicons name="logo-whatsapp" size={19} color={theme.paper} />
              <Text style={styles.botaoTexto}>Abrir o WhatsApp e vincular</Text>
            </AppPressable>

            <View style={styles.esperando}>
              <ActivityIndicator size="small" color={theme.inkFaint} />
              <Text style={styles.esperandoTexto}>
                A mensagem já vai escrita — é só enviar. Eu confirmo aqui sozinho.
              </Text>
            </View>

            <Text style={styles.alternativa}>Ou mande este código para o Grana.:</Text>
            <AppPressable
              style={({ hovered }) => [styles.caixaCodigo, hovered && styles.botaoHover]}
              onPress={copiarCodigo}
              accessibilityRole="button"
              accessibilityLabel={`Copiar o código ${link.pairing_code}`}
            >
              <Text style={styles.codigo}>{link.pairing_code}</Text>
              <View style={styles.copiar}>
                <Ionicons
                  name={copiado ? 'checkmark' : 'copy-outline'}
                  size={15}
                  color={copiado ? theme.accent2 : theme.inkFaint}
                />
                <Text style={[styles.copiarTexto, copiado && { color: theme.accent2 }]}>
                  {copiado ? 'Copiado' : 'Copiar'}
                </Text>
              </View>
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
        ) : falhouAoCarregar ? (
          /* Sem saber se já existe vínculo, preparar um código novo apagaria
             um que talvez esteja lá. Melhor pedir pra tentar de novo. */
          <>
            <Text style={styles.texto}>
              Não consegui checar seu vínculo agora. Confira a conexão e tente de novo.
            </Text>
            <AppPressable
              style={({ hovered }) => [styles.botaoSecundario, hovered && styles.botaoHover]}
              onPress={() => {
                setFalhouAoCarregar(false);
                setCarregando(true);
                fetchWhatsappLink()
                  .then((l) => setLink(l))
                  .catch(() => {
                    setLink(null);
                    setFalhouAoCarregar(true);
                  })
                  .finally(() => setCarregando(false));
              }}
            >
              <Text style={styles.botaoSecundarioTexto}>Tentar de novo</Text>
            </AppPressable>
          </>
        ) : (
          <ActivityIndicator color={theme.ink} style={{ marginVertical: spacing.lg }} />
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: theme.paper,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  codigo: {
    color: theme.accent2,
    fontSize: type.valor,
    fontFamily: fonts.regular,
    letterSpacing: 6,
  },
  copiar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  copiarTexto: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.light },
  esperando: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  esperandoTexto: {
    color: theme.inkFaint,
    fontSize: type.legenda,
    lineHeight: 17,
    fontFamily: fonts.light,
    flex: 1,
  },
  alternativa: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, marginTop: spacing.xs },
  /* Verde do WhatsApp: é a única cor emprestada de outra marca no app, e aqui
     ela informa — diz pra onde o toque leva antes de a pessoa ler o rótulo. */
  botao: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: '#25D366',
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    gap: spacing.sm,
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
