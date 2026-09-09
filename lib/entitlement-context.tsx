import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { vincularAssinaturasPendentes } from './assinatura';
import { useSession } from './auth-context';
import { guardarAcesso, lerAcessoGuardado, prazoOfflineAindaVale } from './entitlement-cache';
import { isLikelyNetworkError } from './offline-cache';
import { supabase } from './supabase';

export type EstadoAcesso = {
  enforced: boolean;
  active: boolean;
  allowed: boolean;
  status: string | null;
  access_until: string | null;
  grace_until: string | null;
};

type EntitlementContextValue = {
  estado: EstadoAcesso | null;
  carregando: boolean;
  sincronizacao: {
    atencao: boolean;
    mensagem: string | null;
  };
  /** O acesso atual veio do cache porque a rede falhou, não do servidor. */
  modoOffline: boolean;
  recarregar: () => Promise<void>;
};

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function useEntitlement() {
  const value = use(EntitlementContext);
  if (!value) throw new Error('useEntitlement precisa estar dentro de EntitlementProvider');
  return value;
}

export function EntitlementProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const [estado, setEstado] = useState<EstadoAcesso | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [modoOffline, setModoOffline] = useState(false);
  const [sincronizacao, setSincronizacao] = useState<EntitlementContextValue['sincronizacao']>({
    atencao: false,
    mensagem: null,
  });

  const recarregar = useCallback(async () => {
    if (!session) {
      setEstado(null);
      setModoOffline(false);
      setSincronizacao({ atencao: false, mensagem: null });
      setCarregando(false);
      return;
    }
    /* Não limpa o cache aqui: `session` também é nula no instante anterior à
       restauração da sessão salva, e apagar neste ponto esvaziaria o cache em
       todo início frio — justamente quando ele é necessário. Quem apaga é o
       `signOut`, que sabe que a saída foi deliberada. */

    setCarregando(true);
    try {
      const vinculo = await vincularAssinaturasPendentes();
      setSincronizacao({
        atencao: vinculo.houveFalha,
        mensagem: vinculo.houveFalha
          ? vinculo.tokenPendente
            ? 'Ainda não conseguimos confirmar o vínculo desta compra. Tente verificar novamente em instantes.'
            : 'Não conseguimos confirmar sua assinatura agora. Tente verificar novamente em instantes.'
          : null,
      });
      const { data, error } = await supabase.rpc('obter_estado_acesso');
      if (error) throw error;
      const confirmado = data as unknown as EstadoAcesso;
      setEstado(confirmado);
      setModoOffline(false);
      await guardarAcesso(session.user.id, confirmado);
    } catch (error) {
      const semRede = isLikelyNetworkError(error);
      console.error('[entitlement] não foi possível confirmar o acesso', {
        message: error instanceof Error ? error.message : 'erro desconhecido',
        /* Separar os dois casos é o ponto: falta de rede é temporária e o
           cache cobre; qualquer outra falha é defeito, e defeito não pode
           virar acesso liberado em silêncio. */
        causa: semRede ? 'sem rede' : 'falha permanente',
      });

      /* Sem rede, vale a palavra mais recente do próprio servidor, até o prazo
         que ele mesmo prometeu. Sem isto, quem paga e abre o app no metrô caía
         na tela de venda — e o cache de lançamentos e a fila de voz, que
         funcionam offline, ficavam inalcançáveis atrás de um portão que
         exigia estar online para abrir. */
      const guardado = semRede ? await lerAcessoGuardado(session.user.id) : null;
      if (guardado && prazoOfflineAindaVale(guardado)) {
        setEstado(guardado);
        setModoOffline(true);
        setSincronizacao({ atencao: false, mensagem: null });
        return;
      }

      setSincronizacao({
        atencao: true,
        mensagem: 'Não conseguimos confirmar seu acesso agora. Tente verificar novamente em instantes.',
      });
      /* Falha fechada: sem prazo válido guardado, o backend aplica a mesma
         regra no RLS, então liberar a navegação aqui só produziria telas
         vazias e tentativas negadas. */
      setEstado({
        enforced: true,
        active: false,
        allowed: false,
        status: null,
        access_until: null,
        grace_until: null,
      });
      setModoOffline(false);
    } finally {
      setCarregando(false);
    }
  }, [session]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return (
    <EntitlementContext value={{ estado, carregando, sincronizacao, modoOffline, recarregar }}>
      {children}
    </EntitlementContext>
  );
}
