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
