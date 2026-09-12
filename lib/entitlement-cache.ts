import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EstadoAcesso } from './entitlement-context';

const CHAVE = 'grana:cache:estado-acesso';

type Guardado = { userId: string; estado: EstadoAcesso; guardadoEm: string };

/**
 * Última resposta boa de `obter_estado_acesso`, por usuário.
 *
 * Existe por um motivo só: sem ela, abrir o app sem internet mandava para a
 * tela de assinatura, porque a verificação de acesso falhava fechada e não
 * tinha nada em que se apoiar. Quem pagou via a tela de venda por estar no
 * metrô. O cache guarda a palavra mais recente do próprio servidor, e é ela
 * que decide o acesso enquanto a rede não volta.
 *
 * Não é segredo (é o estado da assinatura da própria pessoa) e não substitui
 * checagem nenhuma: toda escrita continua passando por `tem_direito_acesso()`
 * no RLS. Adulterar isto num aparelho com root rende, no máximo, navegar
 * offline por um prazo inventado — o servidor segue negando tudo.
 */
export async function guardarAcesso(userId: string, estado: EstadoAcesso): Promise<void> {
  try {
    const registro: Guardado = { userId, estado, guardadoEm: new Date().toISOString() };
    await AsyncStorage.setItem(CHAVE, JSON.stringify(registro));
  } catch (erro) {
    // Best-effort: sem cache o app volta a exigir rede, que é o comportamento
    // antigo — degradação conhecida, não quebra nova. Ainda assim, registra.
    console.warn('[entitlement] não foi possível guardar o acesso', (erro as { name?: string })?.name ?? 'erro');
  }
}

/** Devolve o estado guardado, e só se pertencer a esta conta. */
export async function lerAcessoGuardado(userId: string): Promise<EstadoAcesso | null> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE);
    if (!bruto) return null;
    const registro = JSON.parse(bruto) as Guardado | null;
    // Trocar de conta no mesmo aparelho não pode herdar o acesso da anterior.
    if (!registro || registro.userId !== userId) return null;
    return registro.estado ?? null;
  } catch (erro) {
    console.warn('[entitlement] cache de acesso ilegível', (erro as { name?: string })?.name ?? 'erro');
    return null;
  }
}

/** Some com o cache — usar ao sair da conta. */
export async function esquecerAcesso(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CHAVE);
  } catch (erro) {
    console.warn('[entitlement] não foi possível limpar o acesso guardado', (erro as { name?: string })?.name ?? 'erro');
  }
}

/**
 * O prazo que o servidor já prometeu ainda está de pé?
 *
 * Honra a data que veio do próprio servidor em vez de inventar uma janela de
 * tolerância. Quem cancelou perde o acesso quando o período pago vence, mesmo
 * sem nunca mais abrir o app com internet.
 */
export function prazoOfflineAindaVale(estado: EstadoAcesso | null, agora: number = Date.now()): boolean {
  if (!estado || !estado.allowed) return false;
  // Cobrança desligada no servidor: não há prazo a honrar, o acesso não
  // depende de assinatura nenhuma.
  if (!estado.enforced) return true;
  const limites = [estado.access_until, estado.grace_until]
    .map((data) => (data ? Date.parse(data) : Number.NaN))
    .filter((valor) => Number.isFinite(valor));
  if (limites.length === 0) return false;
  return Math.max(...limites) > agora;
}

/** O estado fechado: sem prova de acesso, o app não navega. */
const ACESSO_NEGADO: EstadoAcesso = {
  enforced: true,
  active: false,
  allowed: false,
  status: null,
  access_until: null,
  grace_until: null,
};

/**
 * O que vale quando a confirmação com o servidor FALHA.
 *
 * Existe porque a resposta dessa pergunta controla, lá em `app/_layout.tsx`,
 * uma guarda de navegação (`Stack.Protected`). Guarda que cai desmonta o grupo
 * de telas inteiro e devolve a pessoa à rota inicial — com o campo que ela
 * estava preenchendo e o teclado junto. Ou seja, um tropeço de um segundo na
 * rede não pode virar "o app me jogou pra tela inicial".
 *
 * A ordem das três regras é o conteúdo desta função:
 *
 * 1. **Concessão guardada que ainda vale manda.** É a palavra mais recente do
 *    próprio servidor, e é para isso que o cache existe.
 * 2. **Falha temporária não derruba acesso que já estava de pé.** Se o app já
 *    tinha confirmado `allowed` neste ciclo de vida e a falha é de rede (ou de
 *    token ainda não renovado), o estado anterior permanece. Trocá-lo pelo
 *    fechado seria transformar falha passageira em estado hostil, que é
 *    exatamente o que a regra 9 do `AGENTS.md` proíbe.
 * 3. **Qualquer outro caso fecha.** Falha permanente, ou primeira execução sem
 *    nada guardado: aí o app realmente não sabe, e fingir que sabe seria pior.
 *    Não é afrouxamento de cobrança em nenhum dos casos — o RLS do servidor
 *    aplica a mesma regra de novo em toda escrita, então o máximo que se ganha
 *    aqui é navegar entre telas que o servidor seguirá recusando.
 */
export function estadoAposFalha({
  anterior,
  guardado,
  semRede,
  agora = Date.now(),
}: {
  /** O último estado que este processo tinha em mãos, se algum. */
  anterior: EstadoAcesso | null;
  /** A concessão lida do disco para este usuário, se alguma. */
  guardado: EstadoAcesso | null;
  /** A falha é passageira (rede, ou token do disco ainda não renovado)? */
  semRede: boolean;
  agora?: number;
}): EstadoAcesso {
  if (guardado && prazoOfflineAindaVale(guardado, agora)) return guardado;
  if (semRede && anterior && prazoOfflineAindaVale(anterior, agora)) return anterior;
  return ACESSO_NEGADO;
}
