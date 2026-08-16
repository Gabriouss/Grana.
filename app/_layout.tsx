import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '@/lib/auth-context';
import { PrivacyProvider } from '@/lib/privacy-context';
import { DemoProvider } from '@/lib/demo-context';
import { theme } from '@/lib/theme';
import WebPhoneFrame from '@/components/WebPhoneFrame';

export default function RootLayout() {
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

