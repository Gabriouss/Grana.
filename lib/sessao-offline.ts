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
 * Prazo padrão de `idDoUsuarioLocal` (V19, 15/10/2026). Sem rede e com o token
 * vencido, o `getSession()` do auth-js 2.112 refaz a renovação com espera
 * crescente (200 ms, 400 ms… até 12,8 s) até perto de 30 s: medido 25,4 s com
 * o supabase-js real (`__tests__/sessao-sem-rede-prazo.cjs`). Era esse o
 * spinner de 15 a 20 s de Débito e Pix sem rede, porque a tela pergunta o dono
 * da fila e do cache sem prazo. Com sessão válida o `getSession()` responde da
 * memória e o prazo não pesa; renovando com rede, cair no disco devolve o
 * mesmo id.
 */
export const PRAZO_DONO_PADRAO_MS = 2_000;

/** A consulta que estourou o prazo e ainda não terminou, ou null. */
let consultaPendurada: Promise<unknown> | null = null;

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
export async function idDoUsuarioLocal(prazoMs: number = PRAZO_DONO_PADRAO_MS): Promise<string | null> {
  /* Uma consulta anterior já estourou o prazo e a renovação ainda não acabou:
     perguntar de novo só esperaria o prazo outra vez pelo mesmo resultado. */
  if (!consultaPendurada) {
    try {
      const { data } = await sessaoDoCliente(prazoMs);
      if (data.session?.user?.id) return data.session.user.id;
    } catch {
      // Segue para o disco: é exatamente para isto que ele existe.
    }
  }
  return (await lerSessaoDoDisco())?.user?.id ?? null;
}

/**
 * A sessão está presa renovando (B5, 16/10/2026): uma consulta já estourou o
 * prazo e ainda não terminou. Enquanto isso, toda consulta do supabase-js
 * também espera essa renovação antes de sair, então quem tem dado no disco
 * não deve esperar a rede.
 */
export function sessaoEstaTravada(): boolean {
  return consultaPendurada !== null;
}

/**
 * `getSession()` com prazo (07/10/2026).
 *
 * Com o token vencido, `getSession()` RENOVA antes de responder. Sem rede
 * boa, a renovação só desiste depois de umas duas tentativas de 20 s
 * (`PRAZO_PEDIDO_MS`), isto é, uns 40 s. A tarefa do widget tem 120 s de
 * vida e faz essa pergunta mais de uma vez; nenhuma delas cabia nos prazos
 * de 15 s da transcrição e da gravação. Quem passa `prazoMs` espera só isso
 * e cai para o registro do aparelho, que responde na hora. A renovação
 * continua por conta própria, e quem não passa prazo se comporta como antes.
 */
export function sessaoDoCliente(prazoMs?: number): ReturnType<typeof supabase.auth.getSession> {
  const consulta = supabase.auth.getSession();
  if (prazoMs === undefined) return consulta;
  let corte: ReturnType<typeof setTimeout> | undefined;
  const estouro = new Promise<never>((_, rejeitar) => {
    corte = setTimeout(() => {
      consultaPendurada = consulta;
      const soltar = () => { if (consultaPendurada === consulta) consultaPendurada = null; };
      consulta.then(soltar, soltar);
      rejeitar(new Error('sessão não respondeu no prazo'));
    }, Math.max(1, prazoMs));
  });
  // A consulta abandonada não pode virar rejeição sem dono.
  consulta.catch(() => {});
  return Promise.race([consulta, estouro]).finally(() => clearTimeout(corte)) as ReturnType<typeof supabase.auth.getSession>;
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
export async function tokenDeAcessoLocal(prazoMs?: number): Promise<string | null> {
  try {
    const { data } = await sessaoDoCliente(prazoMs);
    if (data.session?.access_token) return data.session.access_token;
  } catch {
    // Segue para o disco.
  }
  return (await lerSessaoDoDisco())?.access_token ?? null;
}
