import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Flag } from './feature-flags-regras';

const CHAVE = 'grana:cache:flags';
let gravacoes = Promise.resolve();

/**
 * Último mapa de interruptores remotos que o servidor confirmou.
 *
 * ── Por que existe ─────────────────────────────────────────────────────────
 *
 * `ligado()` falha ABERTA de propósito: chave que o app não conhece é tratada
 * como ligada, para um servidor fora do ar não desligar o produto inteiro.
 * Só que o mapa começa vazio e só é preenchido por uma ida à rede — então,
 * SEM INTERNET, toda chave vira desconhecida e **todo interruptor remoto volta
 * a ligado**.
 *
 * Isso não é hipótese. Em 11/09/2026, num teste em modo avião, o app ofereceu
 * "Lançar pelo WhatsApp — Abrir o WhatsApp e vincular" na Início e no Perfil,
 * um canal que está desligado justamente por estar banido na Meta. A pessoa
 * offline recebe a promessa que a pessoa online não recebe, e é a offline que
 * tem menos como descobrir que não funciona. O mesmo valeria para
 * `assinatura_checkout`: um checkout instável, desligado remotamente por
 * alguém, reaparece para quem está sem rede.
 *
 * Guardar o último mapa conhecido resolve sem abrir mão da falha aberta: ela
 * continua valendo para quem nunca conseguiu ler as flags (instalação nova,
 * primeiro uso), que é o caso em que desligar tudo seria pior.
 *
 * Não é segredo — é a configuração pública do produto, a mesma que qualquer
 * aparelho logado lê. Adulterar isto num aparelho com root liga uma tela que
 * o servidor continua recusando.
 */
export async function guardarFlags(flags: Record<string, Flag>): Promise<void> {
  let bruto: string;
  try {
    // Captura o mapa aceito agora, antes de esperar uma gravação anterior.
    bruto = JSON.stringify(flags);
  } catch (erro) {
    console.warn('[flags] não foi possível preparar os interruptores para guardar', (erro as { name?: string })?.name ?? 'erro');
    return;
  }
  const gravar = async () => {
    try {
      await AsyncStorage.setItem(CHAVE, bruto);
    } catch (erro) {
      // Best-effort: sem cache o comportamento volta a ser o antigo (falha
      // aberta), que é degradação conhecida. Ainda assim, deixa recibo.
      console.warn('[flags] não foi possível guardar os interruptores', (erro as { name?: string })?.name ?? 'erro');
    }
  };
  // O storage não cancela um setItem já iniciado. A escrita seguinte espera
  // a anterior terminar, para a confirmação nova ficar por último no disco.
  const gravacao = gravacoes.then(gravar, gravar);
  gravacoes = gravacao;
  await gravacao;
}

/** O mapa guardado, ou `null` quando nunca houve leitura boa neste aparelho. */
export async function lerFlagsGuardadas(): Promise<Record<string, Flag> | null> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE);
    if (!bruto) return null;
    const mapa = JSON.parse(bruto) as Record<string, Flag> | null;
    /* Objeto vazio conta como ausência: guardar `{}` e devolvê-lo faria o app
       achar que leu a configuração quando não leu nada. */
    if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa) || Object.keys(mapa).length === 0) {
      return null;
    }
    return mapa;
  } catch (erro) {
    console.warn('[flags] cache de interruptores ilegível', (erro as { name?: string })?.name ?? 'erro');
    return null;
  }
}
