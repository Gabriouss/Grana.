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
import { esquecerLancamentosLocais } from './offline-cache';
import { limparSnapshotWidgets } from './widgets-home-sync';
import { sairDaConta } from './sair-da-conta';

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
/** Domínios do App Link (assetlinks.json em public/.well-known/), pelos quais
 *  o MESMO link de callback pode chegar ao app sem passar pelo navegador.
 *  `www` é o que aparece de fato nos e-mails: o domínio nu redireciona pra
 *  `www` (308, na borda do Vercel) antes de qualquer JS rodar, então
 *  `window.location.origin` — usado por `Linking.createURL` na web — já é
 *  sempre `www` no momento em que alguém chama `signUp`. O domínio nu fica
 *  como reforço (funciona na verificação do Android quando o aparelho segue
 *  o redirecionamento, a partir do Android 12), não como caminho principal. */
const DOMINIOS_APP_LINK = ['www.granaponto.com.br', 'granaponto.com.br'];

/** Exportada só para o teste em __tests__/app-links-callback.cjs poder chamar
 *  a lógica real de classificação sem montar a árvore de contexto/hooks. */
export function extrairCallbackSeguro(
  url: string
): { code: string; recuperacao: boolean; flowId?: string; viaAppLink: boolean } | { erro: string } | null {
  const parsed = Linking.parse(url);
  const schemeNativo = parsed.scheme === SCHEME_NATIVO || (__DEV__ && parsed.scheme === 'exp');
  const viaAppLink = parsed.scheme === 'https' && DOMINIOS_APP_LINK.includes(parsed.hostname ?? '');
  if ((!schemeNativo && !viaAppLink) || parsed.path !== ROTA_CALLBACK) return null;

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
    viaAppLink,
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

      /* App Link (https://granaponto.com.br/auth/callback) do cadastro feito
         pela web: o code_verifier do PKCE fica gravado no navegador que
         chamou signUp, e o app nativo nunca tem acesso a ele — trocar o
         código por aqui falharia sempre. O e-mail já está confirmado no
         servidor (é o Supabase que gera esse link só depois da confirmação);
         só falta avisar a pessoa e mandá-la pro login. Recuperação de senha
         não entra aqui: continua tentando a troca, porque não é este ajuste
         que resolve esse caso. */
      if (resultado.viaAppLink && !resultado.recuperacao) {
        Alert.alert('E-mail confirmado', 'Entre com seu e-mail e senha');
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
    /* A sequência e os prazos moram em lib/sair-da-conta.ts: cada limpeza tem
       prazo próprio e a sessão sai sempre (achado A64, 19/09/2026). */
    async signOut() {
      await sairDaConta({
        idDoUsuario: async () => (await supabase.auth.getSession()).data.session?.user.id ?? null,
        limparVozesDaConta: async (userId) => {
          const { limparVozesDaConta } = await import('./widget-voz-pendentes');
          await limparVozesDaConta(userId);
        },
        /* Some da tela inicial antes de a sessão ser removida: nenhuma conta
           seguinte pode herdar o saldo, boleto ou cofrinho da anterior. */
        limparWidgets: limparSnapshotWidgets,
        /* O acesso guardado para uso offline sai junto: sair é deliberado, e
           nenhuma conta seguinte pode entrar no app pelo prazo da anterior. */
        esquecerAcesso,
        /* E o cache de leitura das telas: deixar extrato, boleto e meta de
           alguém no disco depois de a pessoa sair é guardar dado financeiro
           sem razão nenhuma para tê-lo. */
        esquecerTelas,
        esquecerLancamentosLocais,
        removerPush: removerPushHabitoAntesDeSair,
        signOutNoServidor: async () => {
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
        },
        esquecerSessaoDoDisco,
        aplicarSaida: () => aplicarSessao(null, false),
      });
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}
