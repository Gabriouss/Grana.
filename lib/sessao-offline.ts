import type { Session } from '@supabase/supabase-js';
import { armazenamentoSessao, CHAVE_SESSAO, supabase } from './supabase';

/**
 * A sessão como ela está gravada no aparelho, mesmo com o token de acesso
 * vencido.
 *
 * Por que isto existe: `supabase.auth.getSession()` NÃO é uma leitura de
 * disco. Quando o token de acesso já passou da validade, ele tenta renovar
 * antes de responder, e sem rede essa renovação falha — a resposta então é
 * `session: null`, indistinguível de "nunca houve login". Foi assim que o app
 * mandou para a landing quem estava com a sessão inteira no aparelho, só sem
 * internet; o autor viu isso num lugar sem sinal em 11/09/2026.
 *
 * O `auth-js` só APAGA a sessão do disco quando a renovação falha por motivo
 * definitivo (refresh token recusado, conta removida). Falha de rede é
 * classificada como repetível e o registro fica intacto — verificado no fonte
 * de `_callRefreshToken` da versão 2.112.3. É exatamente esse registro
 * preservado que esta função devolve.
 *
 * O que ISTO NÃO É: uma autorização. O token devolvido continua vencido, e
 * todo pedido ao servidor segue sendo recusado enquanto não houver renovação.
 * Serve para o app saber DE QUEM é o cache que ele já tem no disco e continuar
 * exibindo o que é daquela pessoa — não para liberar nada novo.
 */
export async function lerSessaoDoDisco(): Promise<Session | null> {
  try {
    const bruto = await armazenamentoSessao?.getItem(CHAVE_SESSAO);
    if (!bruto) return null;
    const sessao = JSON.parse(bruto) as Partial<Session> | null;
    /* Mesma checagem mínima que o `auth-js` faz antes de aceitar um registro
       guardado: sem um destes campos não dá para nem identificar a conta nem
       tentar renovar depois, e um registro pela metade viraria uma sessão
       fantasma difícil de explicar. */
    if (
      !sessao ||
      typeof sessao.access_token !== 'string' ||
      typeof sessao.refresh_token !== 'string' ||
      !sessao.user ||
      typeof sessao.user.id !== 'string'
    ) {
      return null;
    }
    return sessao as Session;
  } catch (erro) {
    /* Nunca em silêncio: se a gaveta ficou ilegível (chave do SecureStore
       perdida, JSON truncado), a pessoa vai cair no login sem entender por
       quê, e este log é a única pista de que a causa foi o disco. */
    console.warn('[sessao] registro guardado ilegível', (erro as { name?: string })?.name ?? 'erro');
    return null;
  }
}

/**
 * Apaga a sessão guardada.
 *
 * Obrigatório no `signOut`, não opcional. `supabase.auth.signOut()` começa
 * chamando `getSession()` por dentro; sem rede e com o token vencido ele
 * recebe o erro da renovação, devolve esse erro e **volta sem apagar nada do
 * disco**. Antes de `lerSessaoDoDisco` existir isso era inofensivo, porque
 * ninguém lia o disco. Agora seria o pior defeito possível: sair da conta sem
 * internet e o app trazer a pessoa de volta na próxima abertura.
 */
export async function esquecerSessaoDoDisco(): Promise<void> {
  try {
    await armazenamentoSessao?.removeItem(CHAVE_SESSAO);
  } catch (erro) {
    console.warn('[sessao] não foi possível apagar o registro guardado', (erro as { name?: string })?.name ?? 'erro');
  }
}

/** O token de acesso desta sessão já venceu? */
export function sessaoVencida(sessao: Session | null, agora: number = Date.now()): boolean {
  if (!sessao) return false;
  if (!sessao.expires_at) return false;
  return sessao.expires_at * 1000 <= agora;
}

/* Espelho não-React do mesmo estado que o `useSession` expõe. Módulos que
   rodam fora da árvore de componentes — o cache de tela, a fila de voz —
   precisam saber que a sessão atual não passou pelo servidor, e não têm como
   chamar um hook. Quem escreve é só o `auth-context`. */
let naoConfirmada = false;

export function marcarSessaoNaoConfirmada(valor: boolean): void {
  naoConfirmada = valor;
}

/**
 * A sessão em uso veio do disco e ainda não foi reconfirmada pelo servidor.
 *
 * Traduzindo: dá para ler o que já está no aparelho, não dá para contar com
 * nada que dependa de ida ao servidor.
 */
export function sessaoNaoConfirmada(): boolean {
  return naoConfirmada;
}

/**
 * O id da conta deste aparelho, com ou sem internet.
 *
 * É a pergunta "de quem é este aparelho", e ela tem resposta offline — mas
 * `supabase.auth.getSession()` sozinho não a dá, porque renova antes de
 * responder e devolve vazio quando a renovação não tem rede. Todo lugar que
 * usava só o `getSession()` para descobrir o dono de um cache, de uma fila ou
 * de uma chave local passava a agir como se ninguém estivesse logado assim que
 * o token vencia — e o pior caso não era uma tela vazia, era a fila de voz do
 * widget RECUSANDO guardar a fala ("Entre na conta para salvar o lançamento")
 * e a gravação indo embora.
 *
 * Tenta o cliente primeiro: quando há rede, ele renova e devolve o id já
 * reconfirmado. O disco é a queda, não o caminho principal.
 */
export async function idDoUsuarioLocal(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.id) return data.session.user.id;
  } catch {
    // Segue para o disco: é exatamente para isto que ele existe.
  }
  return (await lerSessaoDoDisco())?.user?.id ?? null;
}

/**
 * O token de acesso mais recente do aparelho, mesmo vencido.
 *
 * Mandar um token vencido ao servidor parece inútil, e seria — se o ponto
 * fosse ser aceito. Não é. O ponto é o DESFECHO quando a tentativa falha: sem
 * token, a camada de voz responde `sem_sessao`, que o widget classifica como
 * falha definitiva e usa para APAGAR o áudio gravado, com uma notificação
 * mandando entrar na conta de novo — impossível justamente para quem está sem
 * internet. Com o token vencido em mãos, a tentativa acontece, o `fetch` falha
 * por falta de rede, o código vira `sem_rede`, e a fala espera na fila até a
 * conexão voltar, que é o comportamento que já existia e funcionava.
 */
export async function tokenDeAcessoLocal(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;
  } catch {
    // Segue para o disco.
  }
  return (await lerSessaoDoDisco())?.access_token ?? null;
}
