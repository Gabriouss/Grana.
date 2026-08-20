import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { Alert } from './alert';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { traduzirErroAuth, type ErroAuth } from './auth-errors';

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: ErroAuth | null }>;
  signUp: (email: string, password: string) => Promise<{ error: ErroAuth | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  /** Dispara o e-mail com o link para definir uma senha nova. */
  recuperarSenha: (email: string) => Promise<{ error: ErroAuth | null }>;
  /** Grava a senha nova. Só funciona com a sessão temporária que o link de recuperação cria. */
  definirNovaSenha: (senha: string) => Promise<{ error: ErroAuth | null }>;
  /**
   * true entre abrir o link de recuperação e salvar a senha nova. O link
   * autentica de verdade — sem esta marca a pessoa cairia direto na Início,
   * logada, e a senha continuaria a antiga, que é justamente a que ela não
   * lembra. O layout raiz usa isto para exigir a troca antes de seguir.
   */
  emRecuperacao: boolean;
  cancelarRecuperacao: () => void;
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
  const [emRecuperacao, setEmRecuperacao] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((evento, newSession) => {
      setSession(newSession);
      /* Na web o cliente do Supabase consome a URL sozinho (detectSessionInUrl)
         e avisa aqui qual e-mail originou a sessão. PASSWORD_RECOVERY é o
         único caso em que estar logado NÃO significa que a pessoa pode seguir
         para o app: ela chegou por um link justamente porque não sabe a senha. */
      if (evento === 'PASSWORD_RECOVERY') setEmRecuperacao(true);
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
      if (error) {
        Alert.alert('Não foi possível entrar', traduzirErroAuth(error)?.mensagem ?? error.message);
        return;
      }
      /* No nativo não há detectSessionInUrl, então PASSWORD_RECOVERY nunca é
         emitido — o tipo vem no próprio fragmento do link. */
      if (url.includes('type=recovery')) setEmRecuperacao(true);
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
    emRecuperacao,
    cancelarRecuperacao: () => setEmRecuperacao(false),
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: traduzirErroAuth(error) };
    },
    async recuperarSenha(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: Linking.createURL('/'),
      });
      return { error: traduzirErroAuth(error) };
    },
    async definirNovaSenha(senha) {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (!error) setEmRecuperacao(false);
      return { error: traduzirErroAuth(error) };
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
      return { error: traduzirErroAuth(error), needsEmailConfirmation: !error && !data.session };
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
