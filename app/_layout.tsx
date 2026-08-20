import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '@/lib/auth-context';
import { PrivacyProvider } from '@/lib/privacy-context';
import { DemoProvider } from '@/lib/demo-context';
import { theme } from '@/lib/theme';
import WebPhoneFrame from '@/components/WebPhoneFrame';
import AppLockGate from '@/components/AppLockGate';
import { AppLockProvider } from '@/lib/app-lock-context';
import { ScreenCaptureProvider } from '@/lib/screen-capture-context';
import UpdateBanner from '@/components/UpdateBanner';
// Registra o handler de notificações (lembretes de contas) assim que o app abre.
import '@/lib/notifications';

/* Segura o splash nativo (o logotipo em gradiente, configurado pelo plugin
   expo-splash-screen no app.json) até a Neue Machina estar carregada. Sem
   isso o app aparecia por um instante com a fonte do sistema e trocava
   depois. Vai no escopo global, sem await, como manda a doc do SDK 57. */
SplashScreen.preventAutoHideAsync();


export default function RootLayout() {
  /* Bloqueia captura de tela. No Android isso liga o FLAG_SECURE, que além de
     impedir o print também apaga a miniatura do app no alternador de tarefas —
     que é onde os saldos vazavam para quem só pegasse o celular na mão. No iOS
     o sistema não deixa impedir o print; lá o hook apenas detecta.

     É sempre ligado, como nos apps de banco. Se um dia a pessoa precisar
     printar o próprio orçamento, o caminho é transformar isto num ajuste no
     Perfil — não em remover a proteção. */
  const [fontsLoaded] = useFonts({
    'NeueMachina-Light': require('../assets/fonts/NeueMachina-Light.otf'),
    'NeueMachina-Regular': require('../assets/fonts/NeueMachina-Regular.otf'),
  });

  useEffect(() => {
    if (!fontsLoaded) return;
    /* Aqui havia um `Text.defaultProps.style = [{ fontFamily: ... }]` para
       aplicar a fonte da marca em todo <Text> de uma vez. Não funcionava: o
       React 19 REMOVEU defaultProps de componentes de função, e o <Text> do
       React Native é um deles — a linha não tinha efeito nenhum desde a
       migração. O sintoma media-se no navegador: 74 elementos caíam na fonte
       do sistema e o "Grana." saía em Times New Roman.
       A fonte agora é declarada explicitamente em cada estilo de texto
       (fonts.regular / fonts.light), que é também o que o design system
       exige — ver o memory tipografia-apenas-light-e-regular. */
    SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    // O splash nativo ainda está por cima; esta view é só o fundo por baixo
    // dele, na mesma cor, pra não haver um flash claro entre um e outro.
    return <View style={{ flex: 1, backgroundColor: theme.paper }} />;
  }

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <PrivacyProvider>
          <DemoProvider>
            <AppLockProvider>
              <ScreenCaptureProvider>
              <StatusBar style="light" />
              {/* A trava fica por fora do WebPhoneFrame: cobrir só o miolo
                  deixaria a moldura da web visível, e por dentro dela o
                  conteúdo continuaria montado sob uma cobertura parcial. */}
              <AppLockGate>
                <WebPhoneFrame>
                  <RootNavigator />
                </WebPhoneFrame>
              </AppLockGate>
              </ScreenCaptureProvider>
            </AppLockProvider>
          </DemoProvider>
        </PrivacyProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { session, isLoading, emRecuperacao } = useSession();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.paper, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.ink} />
      </View>
    );
  }

  /* Stack.Protected (padrão atual do expo-router) em vez de redirect manual
     via useEffect+useSegments: evita o "flash" de uma tela não autorizada
     antes do redirect disparar, porque a tela protegida nunca chega a
     montar quando o guard está fechado. */
  return (
    <View style={{ flex: 1 }}>
      {/* Só na área logada: avisar de atualização antes do login seria
          atrito sem propósito pra quem ainda nem entrou no app. */}
      {session && <UpdateBanner />}
      <Stack screenOptions={{ headerShown: false }}>
        {/* O link de recuperação autentica de verdade — sem este guard a
            pessoa cairia direto na Início, logada, com a senha antiga (a que
            esqueceu) continuando ativa. `emRecuperacao` prende a navegação
            aqui até `definirNovaSenha` ter sucesso (ver lib/auth-context.tsx). */}
        <Stack.Protected guard={!!session && emRecuperacao}>
          <Stack.Screen name="nova-senha" />
        </Stack.Protected>
        <Stack.Protected guard={!!session && !emRecuperacao}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="sign-up" />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

