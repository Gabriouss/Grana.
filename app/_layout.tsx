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
import * as ScreenCapture from 'expo-screen-capture';

/* Segura o splash nativo (o logotipo em gradiente, configurado pelo plugin
   expo-splash-screen no app.json) até a Neue Machina estar carregada. Sem
   isso o app aparecia por um instante com a fonte do sistema e trocava
   depois. Vai no escopo global, sem await, como manda a doc do SDK 57. */
SplashScreen.preventAutoHideAsync();

/* O hook usePreventScreenCapture do expo-screen-capture lança na web —
   não existe FLAG_SECURE num navegador. Por isso a chamada é imperativa e
   guardada por plataforma, em vez do hook direto. */
function useProtecaoDeCaptura() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    ScreenCapture.preventScreenCaptureAsync().catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    };
  }, []);
}

export default function RootLayout() {
  /* Bloqueia captura de tela. No Android isso liga o FLAG_SECURE, que além de
     impedir o print também apaga a miniatura do app no alternador de tarefas —
     que é onde os saldos vazavam para quem só pegasse o celular na mão. No iOS
     o sistema não deixa impedir o print; lá o hook apenas detecta.

     É sempre ligado, como nos apps de banco. Se um dia a pessoa precisar
     printar o próprio orçamento, o caminho é transformar isto num ajuste no
     Perfil — não em remover a proteção. */
  useProtecaoDeCaptura();

  const [fontsLoaded] = useFonts({
    'NeueMachina-Light': require('../assets/fonts/NeueMachina-Light.otf'),
    'NeueMachina-Regular': require('../assets/fonts/NeueMachina-Regular.otf'),
  });

  useEffect(() => {
    if (!fontsLoaded) return;
    // Aplica a fonte da marca como padrão em todo <Text> do app, sem precisar
    // editar o fontFamily de cada estilo individualmente — qualquer style que
    // já define fontFamily continua tendo prioridade sobre esse default.
    const TextAny = Text as any;
    TextAny.defaultProps = TextAny.defaultProps || {};
    TextAny.defaultProps.style = [{ fontFamily: 'NeueMachina-Regular' }, TextAny.defaultProps.style];
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
              <StatusBar style="light" />
              {/* A trava fica por fora do WebPhoneFrame: cobrir só o miolo
                  deixaria a moldura da web visível, e por dentro dela o
                  conteúdo continuaria montado sob uma cobertura parcial. */}
              <AppLockGate>
                <WebPhoneFrame>
                  <RootNavigator />
                </WebPhoneFrame>
              </AppLockGate>
            </AppLockProvider>
          </DemoProvider>
        </PrivacyProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { session, isLoading } = useSession();

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
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
    </Stack>
  );
}

