import { Platform } from 'react-native';

/**
 * Guarda o destino de um link protegido aberto por quem ainda não entrou.
 *
 * O problema que isto resolve: as rotas internas ficam atrás de
 * `Stack.Protected guard={!session}` (ver app/_layout.tsx). Com a sessão
 * fechada, elas não montam e o expo-router cai no primeiro nome declarado,
 * que é a landing page. Medido em sessão deslogada, `/lancamentos`,
 * `/credito` e `/perfil` terminavam todos em `/`, sem nenhum parâmetro de
 * retorno: um link compartilhado ou um favorito para uma tela interna perdia
 * o contexto, e a pessoa precisava achar "Entrar" e navegar de novo até onde
 * queria estar.
 *
 * A captura é feita cedo, ainda no primeiro quadro da web, porque o roteador
 * reescreve a URL para `/` logo em seguida. O valor vive no
 * `sessionStorage` para sobreviver à navegação até o login e a um refresh,
 * e é consumido uma única vez quando a área logada monta.
 */

const CHAVE = 'grana:destino-pos-login';

/** Rotas que só existem com sessão aberta. Espelha `Stack.Protected` no
 *  app/_layout.tsx: se uma tela entrar ou sair de lá, entra ou sai daqui. */
const ROTAS_PROTEGIDAS = ['/lancamentos', '/credito', '/contas', '/desafios', '/graficos', '/perfil'];

function armazenamento(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    /* Navegador com armazenamento bloqueado. Sem destino guardado, o
       comportamento volta a ser o de antes, que é aceitável. */
    return null;
  }
}

/** É uma rota interna que exige sessão? */
export function ehRotaProtegida(caminho: string): boolean {
  const limpo = caminho.split('?')[0].replace(/\/+$/, '') || '/';
  return ROTAS_PROTEGIDAS.includes(limpo);
}

/**
 * Lê a URL pedida e guarda se for uma rota protegida. Devolve o destino
 * guardado, ou null quando não havia nada a guardar.
 */
export function capturarDestinoProtegido(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const caminho = window.location.pathname + window.location.search;
  if (!ehRotaProtegida(caminho)) return null;
  armazenamento()?.setItem(CHAVE, caminho);
  return caminho;
}

/** Devolve o destino guardado e o apaga, para não repetir o desvio depois. */
export function consumirDestinoPosLogin(): string | null {
  if (Platform.OS !== 'web') return null;
  const loja = armazenamento();
  const valor = loja?.getItem(CHAVE) ?? null;
  loja?.removeItem(CHAVE);
  return valor && ehRotaProtegida(valor) ? valor : null;
}
