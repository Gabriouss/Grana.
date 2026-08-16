import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '@/lib/auth-context';
import { PrivacyProvider } from '@/lib/privacy-context';
import { DemoProvider } from '@/lib/demo-context';
import { theme } from '@/lib/theme';
import WebPhoneFrame from '@/components/WebPhoneFrame';

/* Segura o splash nativo (o logotipo em gradiente, configurado pelo plugin
   expo-splash-screen no app.json) até a Neue Machina estar carregada. Sem
   isso o app aparecia por um instante com a fonte do sistema e trocava
   depois. Vai no escopo global, sem await, como manda a doc do SDK 57. */
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
            <StatusBar style="light" />
            <WebPhoneFrame>
              <RootNavigator />
            </WebPhoneFrame>
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

