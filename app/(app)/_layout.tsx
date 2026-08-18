import { useEffect, useRef, type ComponentProps, type RefObject } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { BlurView, BlurTargetView } from 'expo-blur';
import { acaoParaParams, parseDeepLink } from '@/lib/deep-links';
import { theme, spacing } from '@/lib/theme';
import { WalletProvider } from '@/lib/wallet-context';
import AppPressable from '@/components/AppPressable';
// noop: força recarga do bundle no Expo Go após correções da auditoria

/* expo-router não reexporta o tipo de `tabBar` publicamente (ele vive numa
   cópia interna do react-navigation dentro do próprio pacote) — em vez de um
   import profundo e frágil, o tipo é extraído da própria prop do `<Tabs>`. */
type TabBarProps = NonNullable<ComponentProps<typeof Tabs>['tabBar']> extends (props: infer P) => any ? P : never;

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline',
  lancamentos: 'wallet-outline',
  credito: 'card-outline',
  contas: 'receipt-outline',
  desafios: 'trophy-outline',
};

/**
 * Barra flutuante "vidro líquido", 100% customizada em vez de estilizar a
 * BottomTabBar padrão do React Navigation via tabBarStyle/tabBarItemStyle.
 * A versão anterior (só com tabBarStyle) ficava com os ícones em alturas
 * levemente diferentes entre si — a barra padrão reserva espaço para rótulo
 * mesmo com tabBarShowLabel:false, e cada plataforma resolve esse espaço
 * residual de um jeito, o que "desalinha" os ícones. Desenhando a barra do
 * zero (uma `View` em linha, todos os itens com a mesma altura fixa e
 * `alignItems:'center'`), o alinhamento deixa de depender de nenhum cálculo
 * interno de terceiros.
 */
function FloatingTabBar({ state, descriptors, navigation, blurTarget }: TabBarProps & { blurTarget: RefObject<View | null> }) {
  return (
    <View pointerEvents="box-none" style={styles.floatWrap}>
      <View style={styles.tabBar}>
        {Platform.OS === 'web' ? (
          <View style={[StyleSheet.absoluteFill, styles.webGlass, { backdropFilter: 'blur(16px)' } as any]} />
        ) : (
          <BlurView
            intensity={50}
            tint="dark"
            style={StyleSheet.absoluteFill}
            /* No Android, blurMethod por padrão é 'none' — só um véu
               semitransparente, sem desfoque de verdade. 'dimezisBlurView'
               liga o blur nativo real, mas desde a v55 do expo-blur ele só
               funciona apontando pra um BlurTargetView explícito via
               `blurTarget` — sem isso, o método fica ligado e mesmo assim
               não borra nada (era exatamente o sintoma visto). */
            blurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
            blurTarget={Platform.OS === 'android' ? blurTarget : undefined}
          />
        )}

        {state.routes
          .filter((route) => ICONS[route.name])
          .map((route) => {
            const index = state.routes.indexOf(route);
            const { options } = descriptors[route.key];
            const focused = state.index === index;

            function onPress() {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }

            return (
              <TabButton
                key={route.key}
                icon={ICONS[route.name]}
                focused={focused}
                label={options.title ?? route.name}
                onPress={onPress}
              />
            );
          })}
      </View>
    </View>
  );
}

/**
 * Um botão de aba, com a pílula ativa animada (fade + escala) em vez de
 * aparecer/sumir de uma vez, e o ripple do Android desligado — sem isso o
 * Pressable desenha um destaque retangular padrão do sistema por cima da
 * pílula circular, que é o "quadrado grosseiro" visto ao trocar de aba.
 */
function TabButton({
  icon,
  focused,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  label: string;
  onPress: () => void;
}) {
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(progress, { toValue: focused ? 1 : 0, useNativeDriver: true, speed: 14, bounciness: 6 }).start();
  }, [focused]);

  const color = focused ? theme.accent2 : theme.inkFaint;

  return (
    <AppPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={label}
      style={styles.tabItem}
      scaleOnPress={false}
      android_ripple={{ color: 'transparent' }}
    >
      <View style={styles.iconWrap}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.iconWrapActive,
            { opacity: progress, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
          ]}
        />
        <Ionicons name={icon} size={22} color={color} />
      </View>
    </AppPressable>
  );
}

/**
 * Roteia os deep links de atalho (grana://add-tx, scan-qr, safe-to-spend) para
 * a Home, que é quem tem os modais de lançamento e de leitura de nota.
 * Fica aqui, dentro da área logada, e não no layout raiz: um atalho só faz
 * sentido depois da sessão existir, e o layout raiz já usa o mesmo canal de
 * Linking para os links de confirmação de e-mail (parseDeepLink devolve null
 * para esses, então os dois convivem sem disputar a URL).
 */
function useAtalhosDeepLink() {
  const router = useRouter();

  useEffect(() => {
    function tratar(url: string | null) {
      if (!url) return;
      const acao = parseDeepLink(url);
      if (!acao) return;
      router.push({ pathname: '/(app)/', params: acaoParaParams(acao) });
    }

    Linking.getInitialURL().then(tratar);
    const sub = Linking.addEventListener('url', ({ url }) => tratar(url));
    return () => sub.remove();
  }, [router]);
}

export default function AppTabsLayout() {
  const blurTarget = useRef<View>(null);
  useAtalhosDeepLink();

  return (
    <WalletProvider>
      <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
        <Tabs
          tabBar={(props) => <FloatingTabBar {...props} blurTarget={blurTarget} />}
          screenOptions={{ headerShown: false }}
        >
          <Tabs.Screen name="index" options={{ title: 'Início' }} />
          <Tabs.Screen name="lancamentos" options={{ title: 'Débito e Pix' }} />
          <Tabs.Screen name="credito" options={{ title: 'Crédito' }} />
          <Tabs.Screen name="contas" options={{ title: 'Boletos' }} />
          <Tabs.Screen name="desafios" options={{ title: 'Desafios' }} />
          <Tabs.Screen
            name="graficos"
            options={{
              href: null,
            }}
          />
          <Tabs.Screen
            name="perfil"
            options={{
              href: null, // Acessível pelo avatar no topo da Home
            }}
          />
        </Tabs>
      </BlurTargetView>
    </WalletProvider>
  );
}

const styles = StyleSheet.create({
  floatWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    /* Sem alignItems:'center' de propósito: o padrão (stretch) faz a barra
       ocupar a largura toda deste wrapper, e o marginHorizontal abaixo
       recorta exatamente a mesma margem lateral usada pelo conteúdo das
       telas (spacing.xl) — mesma largura dos cards, não uma pílula
       pequena centralizada por porcentagem arbitrária. */
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginHorizontal: spacing.xl,
    marginBottom: 30,
    height: 68,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(175,255,227,0.22)',
    backgroundColor: 'rgba(5,34,41,0.65)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
    overflow: 'hidden',
  },
  tabItem: {
    flex: 1,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webGlass: {
    backgroundColor: 'rgba(5,34,41,0.65)',
  },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    borderRadius: 22,
    backgroundColor: 'rgba(174,255,227,0.16)',
  },
});
