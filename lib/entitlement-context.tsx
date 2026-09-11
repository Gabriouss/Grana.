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
  const { session, sessaoNaoConfirmada } = useSession();
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

    /* Antes de gastar rede: se já existe palavra do servidor guardada e ela
       ainda vale, ela entra AGORA e a confirmação segue por trás. Sem isto o
       app inteiro ficava numa tela de carregamento até a rede responder — e
       `app/_layout.tsx` só desenha as telas depois que este estado existe.
       Com rede ausente o `fetch` falha rápido, mas com rede que aceita a
       conexão e não responde (Wi-Fi de hotel, portal de captura, sinal fraco)
       a espera vai ao tempo do sistema operacional, de um minuto para cima.
       Quem paga e abre o app no metrô não pode olhar para um `spinner` desse
       tamanho tendo o acesso guardado a um `AsyncStorage` de distância. */
    const adiantado = await lerAcessoGuardado(session.user.id);
    if (adiantado && prazoOfflineAindaVale(adiantado)) {
      setEstado(adiantado);
      setModoOffline(true);
      setCarregando(false);
    }

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
      /* `sessaoNaoConfirmada` entra na mesma conta que a falta de rede porque a
         causa é a mesma: a sessão veio do disco, o token de acesso está
         vencido, e enquanto a renovação não passa o PostgREST responde 401 —
         que não parece erro de rede nenhum. Sem isto, o instante em que a
         internet volta (antes de o cliente renovar, até um minuto depois)
         jogaria na tela de assinatura quem está com a assinatura em dia. Não é
         afrouxamento: o servidor continua recusando tudo, e o acesso exibido
         segue limitado ao prazo que o próprio servidor já havia prometido. */
      const semRede = isLikelyNetworkError(error) || sessaoNaoConfirmada;
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
  }, [session, sessaoNaoConfirmada]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return (
    <EntitlementContext value={{ estado, carregando, sincronizacao, modoOffline, recarregar }}>
      {children}
    </EntitlementContext>
  );
}
