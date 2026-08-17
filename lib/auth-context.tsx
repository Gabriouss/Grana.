import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';
import { Alert, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useSession() {
  const value = use(AuthContext);
  if (!value) {
    throw new Error('useSession precisa estar dentro de um <SessionProvider />');
  }
  return value;
}

/**
 * Extrai access_token/refresh_token do fragmento de uma URL de callback do
 * Supabase (ex.: `granaapp:///#access_token=...&refresh_token=...&type=signup`).
 *
 * O Supabase manda os tokens no FRAGMENTO (depois do #), não na query string
 * — por isso não dá para usar `Linking.parse()`, que só lê query params.
 * Também é onde vem `error_description` quando o link expirou ou já foi
 * usado, daí os dois casos de retorno.
 */
function extrairTokensDoCallback(
  url: string
): { access_token: string; refresh_token: string } | { erro: string } | null {
  const hashIdx = url.indexOf('#');
  if (hashIdx === -1) return null;

  const params = new URLSearchParams(url.slice(hashIdx + 1));
  const erro = params.get('error_description');
  if (erro) return { erro: erro.replace(/\+/g, ' ') };

  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (access_token && refresh_token) return { access_token, refresh_token };

  return null;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  /* Trata o retorno do link de confirmação de e-mail (e de qualquer outro
     e-mail de auth — recuperação de senha, magic link) quando o app é aberto
     via deep link `granaapp://`.
     Só roda no nativo: na web o próprio cliente Supabase já faz isso sozinho
     via `detectSessionInUrl` (lib/supabase.ts), e rodar os dois ao mesmo
     tempo processaria a mesma URL duas vezes. */
  useEffect(() => {
    if (Platform.OS === 'web') return;

    async function tratarUrl(url: string | null) {
      if (!url) return;
      const resultado = extrairTokensDoCallback(url);
      if (!resultado) return;

      if ('erro' in resultado) {
        Alert.alert('Não foi possível confirmar', resultado.erro);
        return;
      }

      const { error } = await supabase.auth.setSession(resultado);
      if (error) Alert.alert('Não foi possível entrar', error.message);
      // Em caso de sucesso, onAuthStateChange (acima) já atualiza `session`
      // sozinho — o Stack.Protected do _layout leva a pessoa pro app.
    }

    // Abertura a frio: o app nem estava rodando quando o link foi tocado.
    Linking.getInitialURL().then(tratarUrl);
    // App já aberto em segundo plano quando o link é tocado.
    const sub = Linking.addEventListener('url', ({ url }) => tratarUrl(url));
    return () => sub.remove();
  }, []);

  const value: AuthContextValue = {
    session,
    isLoading,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ? error.message : null };
    },
    async signUp(email, password) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          /* Sem isso, o Supabase usa a Site URL padrão do painel — que pode
             estar apontando pra qualquer coisa, inclusive um domínio morto.
             `Linking.createURL('/')` gera o endereço certo pra cada
             plataforma sozinho: `granaapp:///` no nativo, e a origem atual
             (`http://localhost:8099/`, ou o domínio de produção quando
             existir) na web. Ainda assim essa URL precisa estar cadastrada
             em Authentication → URL Configuration → Redirect URLs no painel
             do Supabase, ou a confirmação é recusada mesmo assim. */
          emailRedirectTo: Linking.createURL('/'),
        },
      });
      return { error: error ? error.message : null, needsEmailConfirmation: !error && !data.session };
    },
    async signOut() {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Erro ao deslogar no Supabase:', err);
      } finally {
        setSession(null);
      }
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}
