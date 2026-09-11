import { createContext, use, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { Alert } from './alert';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { traduzirErroAuth, type ErroAuth } from './auth-errors';
import { vincularAssinaturasPendentes } from './assinatura';
import { removerPushHabitoAntesDeSair } from './push-notifications';
import { esquecerAcesso } from './entitlement-cache';
import {
  esquecerSessaoDoDisco,
  lerSessaoDoDisco,
  marcarSessaoNaoConfirmada,
} from './sessao-offline';
import { esquecerTelas } from './cache-de-tela';
import { limparSnapshotWidgets } from './widgets-home-sync';

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
  /**
   * A sessão em uso foi lida do aparelho porque a renovação do token não teve
   * rede. Continua sendo a conta certa, com os dados certos no cache — só que
   * nada que dependa do servidor vai funcionar até a internet voltar.
   */
  sessaoNaoConfirmada: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useSession() {
  const value = use(AuthContext);
  if (!value) {
    throw new Error('useSession precisa estar dentro de um <SessionProvider />');
  }
  return value;
}

const SCHEME_NATIVO = 'com.gabriouss.grana';
const ROTA_CALLBACK = 'auth/callback';

function extrairCallbackSeguro(
  url: string
): { code: string; recuperacao: boolean; flowId?: string } | { erro: string } | null {
  const parsed = Linking.parse(url);
  const schemePermitido = parsed.scheme === SCHEME_NATIVO || (__DEV__ && parsed.scheme === 'exp');
  if (!schemePermitido || parsed.path !== ROTA_CALLBACK) return null;

  const erro = parsed.queryParams?.error_description;
  if (typeof erro === 'string' && erro) {
    return { erro: decodeURIComponent(erro.replace(/\+/g, ' ')) };
  }

  const code = parsed.queryParams?.code;
  if (typeof code !== 'string' || code.length < 10 || code.length > 2048) return null;
  const type = parsed.queryParams?.type;
  const flowId = parsed.queryParams?.sb_flow_id;
  return {
    code,
    recuperacao: type === 'recovery',
    flowId: typeof flowId === 'string' ? flowId : undefined,
  };
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [emRecuperacao, setEmRecuperacao] = useState(false);
  const [sessaoNaoConfirmada, setSessaoNaoConfirmada] = useState(false);
  /* Espelho síncrono do estado acima. O `onAuthStateChange` dispara fora do
     render e precisa decidir na hora se um evento sem sessão deve derrubar a
     sessão do disco — ler o `useState` ali entregaria o valor do render
     anterior. */
  const naoConfirmadaRef = useRef(false);

  const aplicarSessao = useCallback((nova: Session | null, doDisco: boolean) => {
    naoConfirmadaRef.current = doDisco;
    // O mesmo estado precisa alcançar quem não é componente (cache de tela).
    marcarSessaoNaoConfirmada(doDisco);
    setSessaoNaoConfirmada(doDisco);
    setSession(nova);
  }, []);

  /**
   * O Supabase disse que não há sessão. Confere com o disco antes de acreditar.
   *
   * `getSession()` não é leitura de disco: com o token vencido ele tenta
   * renovar primeiro, e sem rede a renovação falha e a resposta vira
   * `session: null` — igualzinho a "nunca houve login". O `auth-js` só APAGA o
   * registro do aparelho quando a recusa é definitiva (refresh token inválido,
   * conta removida); falha de rede ele preserva. Então: registro ainda no
   * disco significa que a conta continua válida e o que faltou foi internet.
   */
  const resolverAusenciaDeSessao = useCallback(
    async (motivo: string) => {
      const guardada = await lerSessaoDoDisco();
      if (!guardada) {
        aplicarSessao(null, false);
        return;
      }
      console.warn('[sessao] seguindo com a sessão guardada no aparelho', {
        motivo,
        venceuEm: guardada.expires_at
          ? new Date(guardada.expires_at * 1000).toISOString()
          : 'sem prazo registrado',
      });
      aplicarSessao(guardada, true);
    },
    [aplicarSessao]
  );

  useEffect(() => {
    let vivo = true;

    void (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!vivo) return;
      if (data.session) {
        aplicarSessao(data.session, false);
        /* Cobre o caso de a assinatura ter sido comprada (ou renovada) DEPOIS
           da última vez que a pessoa logou neste aparelho — sem isto, quem
           abre o app já logado só teria a assinatura vinculada no PRÓXIMO
           login, que pode nunca acontecer num app que guarda sessão. */
        void vincularAssinaturasPendentes();
      } else {
        await resolverAusenciaDeSessao(
          error instanceof Error ? error.message : 'getSession devolveu vazio'
        );
      }
      if (vivo) setIsLoading(false);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((evento, newSession) => {
      if (newSession) {
        /* Qualquer sessão vinda do cliente é sessão confirmada pelo servidor —
           inclusive o TOKEN_REFRESHED que chega sozinho quando a internet
           volta, e que é o que tira o app do modo sem confirmação. */
        aplicarSessao(newSession, false);
      } else if (evento === 'SIGNED_OUT') {
        // Saída deliberada (ou credencial recusada de vez): não há o que salvar.
        aplicarSessao(null, false);
      } else {
        /* Evento sem sessão que NÃO é logout: tipicamente o INITIAL_SESSION
           que o cliente emite para cada assinante novo. Sem esta consulta ao
           disco, ele chegaria depois da leitura de cima e apagaria a sessão
           guardada que acabou de ser adotada. */
        void resolverAusenciaDeSessao(`evento ${evento} sem sessão`);
      }
      /* Na web o cliente do Supabase consome a URL sozinho (detectSessionInUrl)
         e avisa aqui qual e-mail originou a sessão. PASSWORD_RECOVERY é o
         único caso em que estar logado NÃO significa que a pessoa pode seguir
         para o app: ela chegou por um link justamente porque não sabe a senha. */
      if (evento === 'PASSWORD_RECOVERY') setEmRecuperacao(true);
      // Vale tanto pro cadastro quanto pro login: os dois emitem SIGNED_IN.
      if (evento === 'SIGNED_IN') void vincularAssinaturasPendentes();
    });

    return () => {
      vivo = false;
      listener.subscription.unsubscribe();
    };
  }, [aplicarSessao, resolverAusenciaDeSessao]);

  /* Trata o retorno do link de confirmação de e-mail (e de qualquer outro
     e-mail de auth — recuperação de senha, magic link) quando o app é aberto
     pelo callback dedicado do Grana.
     Só roda no nativo: na web o próprio cliente Supabase já faz isso sozinho
     via `detectSessionInUrl` (lib/supabase.ts), e rodar os dois ao mesmo
     tempo processaria a mesma URL duas vezes. */
  useEffect(() => {
    if (Platform.OS === 'web') return;

    async function tratarUrl(url: string | null) {
      if (!url) return;
      const resultado = extrairCallbackSeguro(url);
      if (!resultado) return;

      if ('erro' in resultado) {
        Alert.alert('Não foi possível confirmar', resultado.erro);
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(
        resultado.code,
        resultado.flowId ? { flowId: resultado.flowId } : undefined
      );
      if (error) {
        Alert.alert('Não foi possível entrar', traduzirErroAuth(error)?.mensagem ?? error.message);
        return;
      }
      if (resultado.recuperacao) setEmRecuperacao(true);
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
    sessaoNaoConfirmada,
    cancelarRecuperacao: () => setEmRecuperacao(false),
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: traduzirErroAuth(error) };
    },
    async recuperarSenha(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: Linking.createURL(`/${ROTA_CALLBACK}`),
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
          emailRedirectTo: Linking.createURL(`/${ROTA_CALLBACK}`),
        },
      });
      return { error: traduzirErroAuth(error), needsEmailConfirmation: !error && !data.session };
    },
    async signOut() {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user.id) {
        const { limparVozesDaConta } = await import('./widget-voz-pendentes');
        await limparVozesDaConta(data.session.user.id);
      }
      /* Some da tela inicial antes de a sessão ser removida: nenhuma conta
         seguinte pode herdar o saldo, boleto ou cofrinho da anterior. */
      limparSnapshotWidgets();
      /* O acesso guardado para uso offline sai junto: sair é deliberado, e
         nenhuma conta seguinte pode entrar no app pelo prazo da anterior. */
      await esquecerAcesso();
      /* E o cache de leitura das telas, pelo mesmo motivo levado até o fim: o
         registro é chaveado por usuário e já recusaria conta diferente, mas
         deixar extrato, boleto e meta de alguém no disco depois de a pessoa
         sair é guardar dado financeiro sem razão nenhuma para tê-lo. */
      await esquecerTelas();
      try {
        await removerPushHabitoAntesDeSair();
      } catch (err) {
        console.warn('Erro ao remover o push antes de sair:', err);
      }
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Erro ao deslogar no Supabase:', err);
      } finally {
        /* Apagar o registro do disco aqui NÃO é redundância com o signOut
           acima. O `signOut` do auth-js começa chamando `getSession()` por
           dentro; sem rede e com o token vencido ele recebe o erro da
           renovação, devolve esse erro e volta sem apagar nada. Enquanto
           ninguém lia o disco isso era inofensivo; agora seria o pior defeito
           possível — sair da conta sem internet e o app trazer a pessoa de
           volta na próxima abertura. */
        await esquecerSessaoDoDisco();
        aplicarSessao(null, false);
      }
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}
