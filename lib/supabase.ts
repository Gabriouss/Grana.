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
export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    storage: Platform.OS === 'web' ? globalThis.localStorage : new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    /* O link de confirmação de e-mail devolve o usuário com access_token e
       refresh_token no fragmento (#) da URL de redirecionamento. Na web isso
       é `window.location.hash`, e o próprio supabase-js sabe extrair dali e
       chamar setSession — daí ligar aqui. No nativo não existe URL de
       navegador para detectar (RN não tem window.location); lá quem trata o
       deep link é o listener em lib/auth-context.tsx, manualmente. */
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
