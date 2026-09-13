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

const semBarraFinal = (caminho: string) => caminho.replace(/\/+(?=\?|$)/, '') || '/';

/**
 * Decide se o layout deve navegar até o destino guardado, e para onde.
 *
 * Existe por causa de um laço infinito visto em produção na web em
 * 13/09/2026, em TODA tela logada: recarregar `/perfil` piscava sem fim e
 * disparava, medido em 9 segundos contra a produção, 557 chamadas a
 * `vincular_assinatura_automatica`, 273 a `obter_estado_acesso` e 278 a
 * `feature_flags`.
 *
 * O círculo: `capturarDestinoProtegido` roda em TODA montagem da raiz, logado
 * ou não, e grava `/perfil`. Quando a sessão aparece, o layout consumia o
 * destino e fazia `router.replace('/perfil')` — só que nesse instante o estado
 * de acesso ainda não tinha chegado e o grupo que contém `/perfil` estava
 * FECHADO. Navegar para uma rota de grupo fechado faz o roteador cair de novo,
 * a raiz remonta, a montagem grava `/perfil` outra vez, e recomeça. Cada volta
 * remontava sessão, flags e acesso, e cada um fazia a sua chamada.
 *
 * Provado desligando só o `replace`: as mesmas 9 segundos caíram para 2, 1 e
 * 1 chamadas, e a tela carregou em 1,4s. Mas a pessoa terminava em `/`, que é
 * o problema que este destino existe para resolver. Então a regra não é
 * apagar a navegação, é dispará-la na hora certa:
 *
 * 1. **Área logada fechada: não consome.** O destino continua guardado para a
 *    próxima avaliação, e nada navega. É a regra que quebra o laço.
 * 2. **Destino igual ao caminho atual: não navega.** Trocar a rota pela mesma
 *    rota não leva a lugar nenhum e só arrisca remontar.
 * 3. Fora isso, devolve o destino.
 */
export function restaurarDestino({
  areaLogadaAberta,
  caminhoAtual,
  consumir,
}: {
  /** O grupo de telas logadas já está disponível (acesso confirmado e liberado)? */
  areaLogadaAberta: boolean;
  /** `pathname + search` de agora. */
  caminhoAtual: string;
  /** Lê e apaga o destino guardado. Só é chamado se a área estiver aberta. */
  consumir: () => string | null;
}): string | null {
  if (!areaLogadaAberta) return null;
  const guardado = consumir();
  if (!guardado || !ehRotaProtegida(guardado)) return null;
  if (semBarraFinal(guardado) === semBarraFinal(caminhoAtual)) return null;
  return guardado;
}
