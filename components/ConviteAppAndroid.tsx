import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, radius, spacing, fonts, type, lh } from '@/lib/theme';
import { obterUrlDownloadAndroid } from '@/lib/download-app';
import AppModal from './AppModal';
import AppPressable from './AppPressable';
import AccessibleModalPanel from './AccessibleModalPanel';

/**
 * Convite para baixar o aplicativo Android, na primeira vez que a pessoa entra
 * pela web.
 *
 * Existe porque quem compra não tem, hoje, nenhum caminho até o APK depois de
 * entrar: o e-mail da Cakto leva a `/ativar`, `/ativar` leva ao cadastro, e o
 * cadastro entrega a versão web sem nunca dizer que existe aplicativo. O link
 * para `/baixar` só vivia no rodapé da landing, que ninguém revisita depois de
 * comprar.
 *
 * Só na WEB de propósito: dentro do aplicativo instalado, oferecer o download
 * do próprio aplicativo é ruído. E só quando existe endereço de distribuição
 * configurado (`EXPO_PUBLIC_ANDROID_DOWNLOAD_URL`) — sem ele não há o que
 * oferecer, e um pop-up que não leva a lugar nenhum é pior que silêncio.
 *
 * Aparece UMA vez por navegador, como o `NovidadesModal` e o `AvisoFlagModal`,
 * pela mesma dispensa em AsyncStorage. Não coordena com esses dois porque eles
 * são, na prática, do aplicativo instalado: o `UpdateBanner` é Android puro e
 * as novidades de versão nunca disparam na primeira abertura.
 */

const CHAVE_VISTO = 'grana_convite_app_android_v1';

export default function ConviteAppAndroid() {
  const [visivel, setVisivel] = useState(false);
  const urlDownload = obterUrlDownloadAndroid();

  useEffect(() => {
    if (Platform.OS !== 'web' || !urlDownload) return;
    let cancelado = false;

    AsyncStorage.getItem(CHAVE_VISTO)
      .then((visto) => {
        if (!cancelado && !visto) setVisivel(true);
      })
      /* Armazenamento indisponível (navegador com dados de site bloqueados)
         não pode virar pop-up em toda navegação: sem conseguir lembrar que já
         mostrou, a escolha honesta é não mostrar. */
      .catch(() => {});

    return () => {
      cancelado = true;
    };
  }, [urlDownload]);

  if (!visivel || !urlDownload) return null;

  async function dispensar() {
    setVisivel(false);
    try {
      await AsyncStorage.setItem(CHAVE_VISTO, '1');
    } catch {
      /* Falhou em lembrar: o convite volta na próxima entrada. Incômodo
         pequeno, e melhor que perder a única chance de avisar do aplicativo. */
    }
  }

  async function baixar() {
    await dispensar();
    try {
      await Linking.openURL(urlDownload!);
    } catch {
      /* O sistema recusou abrir o endereço. `/baixar` continua no rodapé da
         landing e na tela de ativação, então o caminho não morre aqui. */
    }
  }

  return (
    <AppModal visible transparent onRequestClose={dispensar}>
      <Pressable style={styles.scrim} onPress={dispensar}>
        <AccessibleModalPanel ativo onClose={dispensar} style={styles.sheet}>
          <View style={styles.icone}>
            <Ionicons name="phone-portrait-outline" size={22} color={theme.accent2} />
          </View>

          <Text style={styles.eyebrow}>Grana. para Android</Text>
          <Text style={styles.titulo}>Leve o Grana. no bolso.</Text>

          <Text style={styles.mensagem}>
            Sua conta é a mesma nos dois lugares. No aplicativo você ganha o lançamento por voz, a foto da
            nota fiscal e os widgets na tela inicial do celular.
          </Text>

          <AppPressable
            style={({ hovered }) => [styles.botao, hovered && { opacity: 0.88 }]}
            onPress={baixar}
          >
            <Ionicons name="download-outline" size={18} color={theme.paper} />
            <Text style={styles.botaoTexto}>Baixar aplicativo</Text>
          </AppPressable>

          <AppPressable
            style={({ hovered }) => [styles.botaoSecundario, hovered && styles.botaoSecundarioHover]}
            onPress={dispensar}
          >
            <Text style={styles.botaoSecundarioTexto}>Continuar no navegador</Text>
          </AppPressable>
        </AccessibleModalPanel>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    maxHeight: '80%',
  },
  icone: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: theme.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  eyebrow: {
    color: theme.inkFaint,
    fontSize: type.legenda,
    lineHeight: lh(type.legenda, 'apoio'),
    letterSpacing: 0.5,
    fontFamily: fonts.light,
  },
  titulo: {
    color: theme.ink,
    fontSize: type.titulo,
    fontFamily: fonts.light,
    lineHeight: lh(type.titulo, 'titulo'),
    marginBottom: spacing.sm,
  },
  mensagem: {
    color: theme.inkSoft,
    fontSize: type.apoio,
    lineHeight: lh(type.apoio, 'corpo'),
    fontFamily: fonts.light,
    marginBottom: spacing.md,
  },
  botao: {
    backgroundColor: theme.ink,
    borderRadius: radius.md,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  botaoTexto: { color: theme.paper, fontSize: type.apoio, fontFamily: fonts.regular },
  botaoSecundario: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  botaoSecundarioHover: { backgroundColor: theme.paper },
  botaoSecundarioTexto: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.light },
});
