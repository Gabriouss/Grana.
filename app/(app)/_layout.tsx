import { useCallback, useEffect, useRef, useState, type ComponentProps, type RefObject } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import TabBlurTarget, { type RegisterTabBlur, type TabBlurRef } from '@/components/TabBlurTarget';
import TabBarBlur from '@/components/TabBarBlur';
import { acaoParaParams, parseDeepLink } from '@/lib/deep-links';
import { theme, spacing } from '@/lib/theme';
import { useTabBarInset } from '@/lib/tab-bar';
import { useBreakpoint } from '@/lib/breakpoints';
import { WalletProvider } from '@/lib/wallet-context';
import AppPressable from '@/components/AppPressable';
import SideNav, { type ItemNav } from '@/components/SideNav';
import Granachat from '@/components/Granachat';
import { useReducedMotion } from '@/lib/motion';

/* expo-router não reexporta o tipo de `tabBar` publicamente (ele vive numa
   cópia interna do react-navigation dentro do próprio pacote) — em vez de um
   import profundo e frágil, o tipo é extraído da própria prop do `<Tabs>`. */
type TabBarProps = NonNullable<ComponentProps<typeof Tabs>['tabBar']> extends (props: infer P) => any ? P : never;

/* As SEIS rotas da barra. O par outline/preenchido existe porque o estado
   ativo não pode depender só de cor: preenchimento é a segunda pista, e é a
   que continua legível pra quem não distingue bem menta de cinza-esverdeado.
   O Granachat não está aqui de propósito — ele não é rota, é uma janela
   flutuante, e entra injetado no meio da fileira (ver `BotaoGranabo`).
   Nomenclatura: **Granabô** é o assistente (o personagem, e o que a copy
   mostra); **Granachat** é a janela de conversa com ele. */
const ICONS: Record<string, { off: keyof typeof Ionicons.glyphMap; on: keyof typeof Ionicons.glyphMap }> = {
  index: { off: 'home-outline', on: 'home' },
  lancamentos: { off: 'wallet-outline', on: 'wallet' },
  credito: { off: 'card-outline', on: 'card' },
  contas: { off: 'receipt-outline', on: 'receipt' },
  graficos: { off: 'bar-chart-outline', on: 'bar-chart' },
  desafios: { off: 'trophy-outline', on: 'trophy' },
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
function FloatingTabBar({ state, descriptors, navigation, blurTarget, chatAberto, onAlternarChat }:
  TabBarProps & { blurTarget: RefObject<View | null> | null; chatAberto: boolean; onAlternarChat: () => void }) {
  const { margem } = useTabBarInset();

  return (
    <View style={[styles.floatWrap, { pointerEvents: 'box-none' }]}>
      <View style={[styles.tabBar, { marginBottom: margem }]}>
        {/* O vidro mora numa camada própria, recortada na pílula, em vez de ser
            o fundo do container. Duas razões, as duas visíveis: (1) o container
            tinha `backgroundColor` semiopaco E a camada de vidro repetia o mesmo
            tom por cima — somadas davam ~88% de opacidade, e o desfoque existia
            mas não tinha o que mostrar, que era o sintoma de "o blur não borra
            nada"; agora o tom sai só daqui, uma vez. (2) recortar aqui deixa o
            container com `overflow: visible`, sem o qual o botão central
            elevado seria cortado pela borda da pílula. */}
        <View style={styles.vidro} pointerEvents="none">
          {Platform.OS === 'web' ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                styles.webGlass,
                /* `saturate` compensa a lavagem de cor que todo desfoque grande
                   provoca: sem ele o que passa por trás chega acinzentado. */
                { backdropFilter: 'blur(14px) saturate(180%)' } as any,
              ]}
            />
          ) : (
            <>
              <TabBarBlur key={state.routes[state.index].key} target={blurTarget} />
              {/* O `tint="dark"` do BlurView é neutro: sozinho, a barra fica
                  cinza no meio de um app que é petróleo em todo o resto. Este
                  véu devolve a cor da marca sem fechar o desfoque. */}
              <View style={[StyleSheet.absoluteFill, styles.tintaNativa]} />
            </>
          )}
        </View>

        {/* Fio de luz na aresta superior: é o que faz a peça ler como material
            com espessura, e não como um retângulo pintado. Fica acima do vidro
            e abaixo dos ícones, na borda que pega a luz. */}
        <View style={styles.brilhoSuperior} pointerEvents="none" />

        {/* O botão do Granabô é o único item da barra que NÃO é rota: ele abre
            o Granachat por cima da tela atual. Por isso entra injetado no meio
            da fileira (índice 3 de 0..6) em vez de sair de `state.routes` —
            trocar de tela pra perguntar sobre o que está na tela seria perder
            justamente o contexto que motivou a pergunta. */}
        {state.routes
          .filter((route) => ICONS[route.name])
          .flatMap((route, posicao) => {
            const index = state.routes.indexOf(route);
            const { options } = descriptors[route.key];
            const focused = state.index === index;
            const label = options.title ?? route.name;

            function onPress() {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }

            const destaque =
              posicao === 3 ? (
                <BotaoGranabo key="granabo" ativo={chatAberto} onPress={onAlternarChat} />
              ) : null;

            return [
              destaque,
              <TabButton
                key={route.key}
                icones={ICONS[route.name]}
                focused={focused}
                label={label}
                onPress={onPress}
              />,
            ];
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
  icones,
  focused,
  label,
  onPress,
}: {
  icones: { off: keyof typeof Ionicons.glyphMap; on: keyof typeof Ionicons.glyphMap };
  focused: boolean;
  label: string;
  onPress: () => void;
}) {
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const reduzirMovimento = useReducedMotion();

  useEffect(() => {
    if (reduzirMovimento) {
      progress.setValue(focused ? 1 : 0);
      return;
    }
    /* Criticamente amortecida (`bounciness: 0`): a troca de aba não é um gesto
       com inércia, é um toque discreto — sobressalto aqui vira ruído. O quique
       fica reservado pro que o dedo de fato arremessa. */
    Animated.spring(progress, {
      toValue: focused ? 1 : 0,
      useNativeDriver: Platform.OS !== 'web',
      speed: 16,
      bounciness: 0,
    }).start();
  }, [focused, progress, reduzirMovimento]);

  const color = focused ? theme.accent2 : theme.inkFaint;

  return (
    <AppPressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={label}
      style={styles.tabItem}
      scaleOnPress={false}
      /* O ripple era `transparent` — o retângulo padrão do sistema vazava por
         cima da pílula circular ativa (o "quadrado grosseiro" ao trocar de
         aba). Zerar resolvia o visual removendo o retorno tátil que todo
         usuário de Android espera de um toque. `borderless` + `radius` recorta
         o ripple no mesmo círculo da pílula: some o vazamento E o feedback
         volta. */
      android_ripple={{ color: theme.hover, borderless: true, radius: 20 }}
    >
      <View style={styles.iconWrap}>
        <Animated.View
          style={[
            styles.iconWrapActive,
            { opacity: progress, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] },
          ]}
        />
        <Ionicons name={focused ? icones.on : icones.off} size={21} color={color} />
      </View>
    </AppPressable>
  );
}

/**
 * O botão do Granabô: o único destino que não é uma aba comum.
 *
 * Ele é a ação primária da barra, então segue a regra que o resto do produto
 * já usa pra ação primária (menta sólida, tinta petróleo por cima) em vez de
 * inventar um tratamento próprio. O que o diferencia é a elevação: o disco
 * ultrapassa a aresta superior da pílula, e é essa saliência — não a cor
 * sozinha — que o marca como "o de fora da fileira" mesmo pra quem vê a barra
 * em escala de cinza.
 */
function BotaoGranabo({ ativo, onPress }: { ativo: boolean; onPress: () => void }) {
  const pressao = useRef(new Animated.Value(0)).current;
  const reduzirMovimento = useReducedMotion();

  const animarPara = (valor: number) => {
    if (reduzirMovimento) {
      pressao.setValue(valor);
      return;
    }
    Animated.spring(pressao, {
      toValue: valor,
      useNativeDriver: Platform.OS !== 'web',
      speed: 20,
      bounciness: 0,
    }).start();
  };

  return (
    <AppPressable
      onPress={onPress}
      /* Resposta no toque, não na soltura: a escala começa a ceder no
         `pressIn`. Esperar o `onPress` pra dar sinal é o que faz um botão
         parecer morto por 100ms. */
      onPressIn={() => animarPara(1)}
      onPressOut={() => animarPara(0)}
      /* `button`, não `tab`: ele não leva a uma tela, abre uma janela sobre a
         atual. `expanded` é o que conta pro leitor de tela que a conversa
         está aberta — e que tocar de novo fecha. */
      accessibilityRole="button"
      accessibilityState={{ expanded: ativo }}
      accessibilityLabel={ativo ? 'Fechar conversa com o Granabô' : 'Abrir conversa com o Granabô'}
      style={styles.destaqueSlot}
      scaleOnPress={false}
      android_ripple={{ color: 'rgba(5,34,41,0.16)', borderless: true, radius: 37 }}
    >
      <Animated.View
        style={[
          styles.destaqueDisco,
          { transform: [{ scale: pressao.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) }] },
        ]}
      >
        <Ionicons name="sparkles" size={26} color={theme.paper} />
      </Animated.View>
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
      if (acao.tipo === 'add-credit') {
        router.push('/(app)/credito?novaCompra=1');
        return;
      }
      if (acao.tipo === 'add-bill') {
        router.push('/(app)/contas?novaConta=1');
        return;
      }
      if (acao.tipo === 'bills') {
        router.push('/(app)/contas');
        return;
      }
      router.push({ pathname: '/(app)/', params: acaoParaParams(acao) });
    }

    Linking.getInitialURL().then(tratar);
    const sub = Linking.addEventListener('url', ({ url }) => tratar(url));
    return () => sub.remove();
  }, [router]);
}

/* Destinos da barra lateral, na mesma ordem da barra do celular — trocar de
   formato de navegação não deveria trocar a ordem mental dos destinos.
   "Perfil" continua no rodapé, separado, porque é configuração e não um
   destino de uso diário. */
const ITENS_LATERAIS: ItemNav[] = [
  { rota: 'index', rotulo: 'Início', icone: 'home-outline' },
  { rota: 'lancamentos', rotulo: 'Débito e Pix', icone: 'wallet-outline' },
  { rota: 'credito', rotulo: 'Crédito', icone: 'card-outline' },
  { rota: 'assistente', rotulo: 'Granabô', icone: 'sparkles-outline' },
  { rota: 'contas', rotulo: 'Boletos', icone: 'receipt-outline' },
  { rota: 'graficos', rotulo: 'Gráficos', icone: 'bar-chart-outline' },
  { rota: 'desafios', rotulo: 'Desafios', icone: 'trophy-outline' },
];

const RODAPE_LATERAL: ItemNav[] = [{ rota: 'perfil', rotulo: 'Perfil', icone: 'person-circle-outline' }];

export default function AppTabsLayout() {
  useAtalhosDeepLink();

  return (
    <WalletProvider>
      <AbasEmJavaScript />
    </WalletProvider>
  );
}

/**
 * Navegação desenhada em JavaScript — barra flutuante no compacto, trilho
 * lateral a partir de 768px.
 *
 * Já existiu uma variante com `expo-router/unstable-native-tabs` (abas de
 * verdade do sistema, UIKit/Navigation Bar) em builds reais, com esta barra
 * reservada só pra web e Expo Go. Foi abandonada: a API é experimental (o
 * próprio nome já avisa) e, quando o componente Fabric falha ao (re)montar,
 * NADA renderiza e NENHUM erro sobe pro JavaScript — tela branca muda. Já
 * aconteceu duas vezes, a segunda numa build de release de verdade, bem no
 * momento em que o Android recria a Activity ao voltar do desbloqueio por
 * digital. Preferível perder um pouco do acabamento nativo (ripple/Material
 * puro) a correr esse risco de novo — esta barra em JS agora é usada em
 * QUALQUER runtime não-web: build de release, dev build e Expo Go. */
function AbasEmJavaScript() {
  const [targets, setTargets] = useState<Record<string, TabBlurRef>>({});
  const register = useCallback<RegisterTabBlur>((key, target) => {
    setTargets(previous => {
      if (previous[key]?.current === target?.current) return previous;
      const next = { ...previous };
      if (target) next[key] = target;
      else delete next[key];
      return next;
    });
  }, []);
  const { temBarraLateral } = useBreakpoint();
  const [chatAberto, setChatAberto] = useState(false);

  /* `tabBarPosition: 'left'` faz o próprio BottomTabView virar a orientação
     do container para linha e renderizar a barra ANTES das telas — ou seja,
     a lateral entra no fluxo normal e as telas ocupam o que sobra, sem
     posicionamento absoluto nem cálculo de margem manual. */
  return (
    <View style={{ flex: 1 }}>
        <Tabs
          screenLayout={({ children, route }) => (
            <TabBlurTarget routeKey={route.key} register={register}>{children}</TabBlurTarget>
          )}
          detachInactiveScreens
          tabBar={(props) =>
            temBarraLateral ? (
              <SideNav
                itens={ITENS_LATERAIS}
                rodape={RODAPE_LATERAL}
                rotaAtiva={props.state.routes[props.state.index]?.name ?? 'index'}
                onNavegar={(rota) =>
                  rota === 'assistente'
                    ? setChatAberto(true)
                    : props.navigation.navigate(rota as never)
                }
              />
            ) : (
              <FloatingTabBar
                {...props}
                blurTarget={targets[props.state.routes[props.state.index].key] ?? null}
                chatAberto={chatAberto}
                onAlternarChat={() => setChatAberto((v) => !v)}
              />
            )
          }
          screenOptions={{ headerShown: false, freezeOnBlur: true, lazy: true, tabBarPosition: temBarraLateral ? 'left' : 'bottom' }}
        >
          {/* A ordem aqui É a ordem da barra: `state.routes` sai na sequência
              em que as telas são declaradas. `assistente` fica no meio (4ª de
              sete) porque o botão elevado só faz sentido no centro exato. */}
          <Tabs.Screen name="index" options={{ title: 'Início' }} />
          <Tabs.Screen name="lancamentos" options={{ title: 'Débito e Pix' }} />
          <Tabs.Screen name="credito" options={{ title: 'Crédito' }} />
          <Tabs.Screen name="contas" options={{ title: 'Boletos' }} />
          <Tabs.Screen name="graficos" options={{ title: 'Gráficos' }} />
          <Tabs.Screen name="desafios" options={{ title: 'Desafios' }} />
          {/* href: null tira da barra inferior. Perfil continua acessível pelo
              avatar do cabeçalho da Início e pela lateral do desktop. */}
          <Tabs.Screen name="perfil" options={{ href: null }} />
        </Tabs>

        {/* Irmão das abas, não filho de nenhuma tela: assim o Granachat
            sobrevive à troca de aba por baixo dele e some junto com o layout
            no logout, sem cada tela precisar saber que ele existe. */}
        <Granachat visivel={chatAberto} onFechar={() => setChatAberto(false)} />
    </View>
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
    marginHorizontal: spacing.xl,
    /* marginBottom vem do useTabBarInset() — depende da navegação do sistema
       (gesture bar vs. 3 botões), então não pode ser fixo aqui. */
    height: 68,
    borderRadius: 999,
    /* Sem `backgroundColor` e sem `overflow: hidden` de propósito: o tom mora
       na camada `vidro` (senão soma duas vezes e mata o desfoque) e o recorte
       mora nela também (senão o disco elevado do Granabô é cortado). */
    ...({ boxShadow: '0 10px 30px -8px rgba(0,0,0,0.55)' } as any),
  },
  /* Camada única de material: recorta a pílula, carrega o desfoque, o tom e a
     borda. É a peça que dá "espessura" à barra. */
  vidro: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(175,255,227,0.20)',
    overflow: 'hidden',
  },
  /* 0.55 em vez dos 0.65 antigos: o suficiente pra manter o contraste do ícone
     inativo (inkFaint) sobre o que passa por trás, e baixo o bastante pra que
     o desfoque tenha o que mostrar. */
  webGlass: {
    backgroundColor: 'rgba(5,34,41,0.38)',
  },
  tintaNativa: {
    backgroundColor: 'rgba(5,34,41,0.18)',
  },
  /* Só a aresta de cima, com 1px: é onde a luz bate num objeto de vidro
     apoiado sobre o conteúdo. Nas outras três bordas o mesmo fio leria como
     contorno desenhado. */
  brilhoSuperior: {
    position: 'absolute',
    top: 0,
    left: 28,
    right: 28,
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(174,255,227,0.28)',
  },
  tabItem: {
    flex: 1,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    backgroundColor: 'rgba(174,255,227,0.14)',
  },
  /* O slot do destaque não usa `flex: 1`: largura fixa reserva exatamente o
     disco, e os seis irmãos dividem o resto por igual entre si. Com `flex: 1`
     em todos, o disco de 56 espremeria os vizinhos de forma desigual conforme
     a largura da tela. */
  destaqueSlot: {
    width: 78,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destaqueDisco: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.accent2,
    /* Duas sombras: a de menta é o halo que amarra o disco à barra (sem ela o
       disco parece colado por cima), a preta é a que o descola do conteúdo. */
    ...({ boxShadow: '0 6px 18px -4px rgba(174,255,227,0.40), 0 3px 10px rgba(0,0,0,0.45)' } as any),
  },
});
