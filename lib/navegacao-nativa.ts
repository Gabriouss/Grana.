import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Se a navegação por abas NATIVA (`expo-router/unstable-native-tabs`) pode
 * ser usada nesta execução.
 *
 * Por que não é só `Platform.OS !== 'web'`: as abas nativas são desenhadas por
 * componentes Fabric compilados do react-native-screens (`RNSTabsHostAndroid`,
 * `RNSTabsScreenIOS` e afins). Eles existem apenas num binário construído com
 * aquele código nativo dentro — ou seja, num development build ou numa build
 * de release do EAS.
 *
 * O Expo Go é um aplicativo pronto, com um conjunto FIXO de módulos nativos
 * compilados por terceiros. Quando o componente pedido não está registrado
 * ali, nada é renderizado e nenhum erro sobe pro JavaScript: a área do
 * conteúdo simplesmente fica em branco. Foi exatamente o sintoma relatado —
 * a trava por digital passava (ela é JS puro) e logo depois a tela ficava
 * branca, porque o que falhava era a casca de navegação por baixo.
 *
 * Daí a checagem ser por AMBIENTE DE EXECUÇÃO, e não por plataforma: o mesmo
 * celular Android roda abas nativas numa build do EAS e precisa da barra em
 * JavaScript quando aberto pelo Expo Go.
 */
export function abasNativasDisponiveis(): boolean {
  if (Platform.OS === 'web') return false;
  return Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}
