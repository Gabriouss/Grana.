import 'react-native-get-random-values';
import * as aesjs from 'aes-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/**
 * expo-secure-store não guarda valores acima de ~2048 bytes, e a sessão do
 * Supabase (access token + refresh token + metadados) costuma passar disso.
 * Este adapter é o padrão oficial da Supabase para Expo: gera uma chave
 * AES-256 por item, guarda só a CHAVE (pequena) no SecureStore, e o valor
 * criptografado (sem limite de tamanho) no AsyncStorage. Nada sensível fica
 * em texto plano em nenhum dos dois.
 */
class LargeSecureStore {
  private async _encrypt(key: string, value: string) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));

    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));

    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async _decrypt(key: string, value: string) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) {
      return null;
    }

    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));

    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) {
      return encrypted;
    }
    return await this._decrypt(key, encrypted);
  }

  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }

  async setItem(key: string, value: string) {
    const encrypted = await this._encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY não configurados. ' +
    'Copie .env.example para .env e preencha com os dados do seu projeto Supabase.'
  );
}

/* expo-secure-store não existe na web (não há Keychain/Keystore num
   navegador) — lá a própria Supabase recomenda usar o localStorage do
   navegador. No nativo (iOS/Android), onde os dados realmente moram no
   aparelho do usuário, seguimos com o LargeSecureStore (criptografado). */
/**
 * Repete uma vez quando o servidor recusa o token por relógio.
 *
 * O `supabase-js` renova o token de acesso sozinho; o GoTrue o emite com
 * `iat` = agora pelo relógio DELE, e o PostgREST que valida roda noutra
 * máquina. Quando esses dois relógios estão a um ou dois segundos de
 * distância, o primeiro pedido feito com um token recém-emitido é recusado
 * com "JWT issued at future" — e o mesmo token passa instantes depois, sem
 * nada ter mudado.
 *
 * O sintoma para quem usa é um erro que aparece sozinho e some ao trocar de
 * janela e voltar (porque voltar refaz o pedido). Como a condição é sabidamente
 * temporária e some com o tempo passando, tentar de novo depois de uma pausa
 * curta é a resposta certa — e é melhor que mostrar à pessoa uma mensagem em
 * inglês sobre JWT, que não sugere nenhuma ação possível.
 *
 * Uma tentativa só, e apenas para este erro: se o token estivesse de fato
 * inválido, repetir em laço só adiaria o erro real e esconderia a causa.
 */
const RECUSA_POR_RELOGIO = /issued at future|jwt.*(not yet valid|iat)/i;

async function fetchComRetentativaDeRelogio(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const resposta = await fetch(input, init);
  if (resposta.status !== 401) return resposta;

  /* O corpo só pode ser lido uma vez; o clone preserva a resposta original
     para quem chamou, caso não seja este caso e ela precise seguir adiante. */
  const copia = resposta.clone();
  let corpo = '';
  try {
    corpo = await copia.text();
  } catch {
    return resposta;
  }
  if (!RECUSA_POR_RELOGIO.test(corpo)) return resposta;

  await new Promise((r) => setTimeout(r, 1200));
  return fetch(input, init);
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  global: { fetch: fetchComRetentativaDeRelogio },
  auth: {
    storage: Platform.OS === 'web' ? globalThis.localStorage : new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    /* PKCE devolve somente um código curto, de uso único e com validade de
       minutos. Access/refresh tokens nunca atravessam a URL do navegador ou
       um custom scheme; o callback troca o código usando o verifier guardado
       localmente por este cliente. */
    flowType: 'pkce',
    detectSessionInUrl: Platform.OS === 'web',
  },
});

/* Supabase só deve tentar renovar o token enquanto o app está em primeiro
   plano — evita chamadas de rede desnecessárias com o app em segundo plano. */
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
