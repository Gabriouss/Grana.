import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '@/lib/auth-context';
import { PrivacyProvider } from '@/lib/privacy-context';
import { DemoProvider } from '@/lib/demo-context';
import { theme } from '@/lib/theme';
import { instalarAnelDeFoco } from '@/lib/foco-web';
import { acompanharFocoParaModais } from '@/lib/modal-accessibility';
import { capturarDestinoProtegido, consumirDestinoPosLogin } from '@/lib/destino-pos-login';
import { EntitlementProvider, useEntitlement } from '@/lib/entitlement-context';
import WebPhoneFrame from '@/components/WebPhoneFrame';
import AppLockGate from '@/components/AppLockGate';
import { AppLockProvider } from '@/lib/app-lock-context';
import { ScreenCaptureProvider } from '@/lib/screen-capture-context';
import UpdateBanner from '@/components/UpdateBanner';
// Registra o handler de notificações (lembretes de contas) assim que o app abre.
import '@/lib/notifications';

const FAVICON_SVG = '/favicon.svg?v=grana-gradiente-20260830';
const FAVICON_PNG = '/favicon.png?v=grana-gradiente-20260830';

/* Segura o splash nativo (o logotipo em gradiente, configurado pelo plugin
   expo-splash-screen no app.json) até a Neue Machina estar carregada. Sem
   isso o app aparecia por um instante com a fonte do sistema e trocava
   depois. Vai no escopo global, sem await, como manda a doc do SDK 57. */
SplashScreen.preventAutoHideAsync();
SystemUI.setBackgroundColorAsync(theme.paper);


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

  /* Anel de foco do teclado, só na web. Fora do efeito das fontes de
     propósito: não depende delas e precisa valer desde o primeiro render,
     inclusive na tela de carregamento. */
  useEffect(() => {
    instalarAnelDeFoco();
    acompanharFocoParaModais();
    /* Antes de o roteador reescrever a URL: quem abriu /credito deslogado
       precisa voltar para /credito depois de entrar. */
    capturarDestinoProtegido();
  }, []);

  useEffect(() => {
    if (!fontsLoaded) return;
    /* Neue Machina é a ÚNICA fonte do produto: marca, títulos, corpo,
       controles, campos e dados, em toda plataforma. Este comentário já disse
       o contrário ("corpo/controles usam a fonte do sistema"), sobra de uma
       rodada que trocou o corpo pela fonte do sistema achando que Dynamic Type
       exigia isso, e que foi revertida. Texto de fonte customizada escala
       normalmente; não havia troca a fazer. */
    SplashScreen.hideAsync();
  }, [fontsLoaded]);

  /* `+html.tsx` cobre o export estático, mas o Metro não o injeta no HTML
     inicial durante o desenvolvimento. Manter o Head no layout raiz faz o
     mesmo ícone oficial acompanhar todas as rotas, inclusive a área logada,
     e a versão na URL invalida o favicon antigo que o navegador guarda com
     cache especialmente agressivo. */
  const identidadeWeb = Platform.OS === 'web' ? (
    <Head>
      <link rel="icon" type="image/svg+xml" sizes="any" href={FAVICON_SVG} />
      <link rel="icon" type="image/png" sizes="512x512" href={FAVICON_PNG} />
      <link rel="apple-touch-icon" href={FAVICON_PNG} />
    </Head>
  ) : null;

  if (!fontsLoaded) {
    // O splash nativo ainda está por cima; esta view é só o fundo por baixo
    // dele, na mesma cor, pra não haver um flash claro entre um e outro.
    return (
      <>
        {identidadeWeb}
        <View style={{ flex: 1, backgroundColor: theme.paper }} />
      </>
    );
  }

  return (
    <>
      {identidadeWeb}
      <SafeAreaProvider>
        <SessionProvider>
          <EntitlementProvider>
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
          </EntitlementProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </>
  );
}

function RootNavigator() {
  const { session, isLoading, emRecuperacao } = useSession();
  const { estado: estadoAcesso, carregando: carregandoAcesso } = useEntitlement();
  const router = useRouter();

  /* Link protegido aberto sem sessão vai para o login, não para a página de
     marketing. Sem isto o expo-router caía na landing e o destino sumia. */
  useEffect(() => {
    if (isLoading || session || Platform.OS !== 'web') return;
    if (!capturarDestinoProtegido()) return;
    router.replace('/sign-in');
  }, [isLoading, session, router]);

  /* Já com sessão: volta ao destino que a pessoa tinha pedido. */
  useEffect(() => {
    if (isLoading || !session || emRecuperacao) return;
    const destino = consumirDestinoPosLogin();
    if (destino) router.replace(destino as never);
  }, [isLoading, session, emRecuperacao, router]);

  if (isLoading || (!!session && carregandoAcesso && !estadoAcesso)) {
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
        <Stack.Protected guard={!!session && !emRecuperacao && !!estadoAcesso?.allowed}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!!session && !emRecuperacao && estadoAcesso?.allowed === false}>
          <Stack.Screen name="assinar" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          {/* Primeiro da lista de propósito: sem isso, `/` cai no primeiro
              nome declarado — hoje "sign-in" — em vez da landing page
              (app/index.tsx), que é quem deve receber quem chega de fora. */}
          <Stack.Screen name="index" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="sign-up" />
        </Stack.Protected>
        {/* Sem Stack.Protected de propósito: o link de ativação da compra
            (ver app/ativar.tsx) precisa funcionar tanto logado quanto
            deslogado — os dois casos são tratados dentro da própria tela. */}
        <Stack.Screen name="ativar" />
        {/* Callback PKCE dedicado: recebe somente um código curto e de uso
            único; a troca pela sessão acontece em auth-context. */}
        <Stack.Screen name="auth/callback" />
        {/* Também sem Stack.Protected: Termos, Privacidade e Exclusão de
            dados precisam abrir de qualquer lugar — do cadastro (antes de
            existir conta), do Perfil (já logado), e de fora do app (link do
            checkout da Kiwify, painel da Meta, ficha da Play Store). */}
        <Stack.Screen name="termos" />
        <Stack.Screen name="privacidade" />
        <Stack.Screen name="exclusao-de-dados" />
      </Stack>
    </View>
  );
}

