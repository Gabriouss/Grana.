import { Platform } from 'react-native';
import { Redirect } from 'expo-router';

/**
 * Porta de entrada do teste interativo da landing (lib/modo-teste.ts). Abrir esta
 * rota marca a janela como teste; a partir daí o app real roda com a conta
 * fictícia, sem login e sem rede, e a Início é a primeira tela.
 *
 * Fora da web, ou se a marca não pegou, volta para a landing (ou o login, no
 * nativo), sem abrir nada da área logada.
 */
export default function Experimentar() {
  if (Platform.OS !== 'web') return <Redirect href="/sign-in" />;
  // A landing (`/`) fica fechada pela guarda com a sessão de teste; o grupo é nomeado.
  return <Redirect href="/(app)" />;
}
