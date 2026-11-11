import { createContext, use, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { vincularAssinaturasPendentes } from './assinatura';
import { useSession } from './auth-context';
import { estadoAposFalha, guardarAcesso, lerAcessoGuardado, prazoOfflineAindaVale } from './entitlement-cache';
import { isLikelyNetworkError } from './offline-cache';
import { supabase } from './supabase';
import { MODO_TESTE } from './modo-teste';
import { sincronizarAvisosAssinatura } from './notifications';
import { AppState } from 'react-native';
import { assinarLeituraEsvaziou } from './cache-de-tela';
import { avisarAcessoNegado, criarVigiaDoAcesso } from './vigia-acesso';

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

/* Modo teste da landing: acesso liberado só dentro do teste, que não toca o servidor. */
const ACESSO_TESTE: EstadoAcesso = { enforced: false, active: true, allowed: true, status: 'teste', access_until: null, grace_until: null };

class PrazoDoAcesso extends Error { constructor() { super('confirmação de acesso não respondeu no prazo'); this.name = 'TimeoutError'; } }
async function esperarAcessoAte<T>(operacao: () => PromiseLike<T>, fim: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (Date.now() >= fim) throw new PrazoDoAcesso();
    return await Promise.race([
      Promise.resolve().then(operacao),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PrazoDoAcesso()), fim - Date.now()); }),
    ]);
  } finally { clearTimeout(timer); }
}

export function useEntitlement() {
  const value = use(EntitlementContext);
  if (!value) throw new Error('useEntitlement precisa estar dentro de EntitlementProvider');
  if (MODO_TESTE) return { ...value, estado: ACESSO_TESTE, carregando: false, modoOffline: false };
  return value;
}

export function EntitlementProvider({ children }: PropsWithChildren) {
  const { session, sessaoNaoConfirmada, emRecuperacao, isLoading: carregandoSessao } = useSession();
  const [estado, setEstado] = useState<EstadoAcesso | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [modoOffline, setModoOffline] = useState(false);
  const [sincronizacao, setSincronizacao] = useState<EntitlementContextValue['sincronizacao']>({
    atencao: false,
    mensagem: null,
  });

  /* Identidade ESTÁVEL da pessoa logada, e não o objeto da sessão.
     `lerSessaoDoDisco()` faz `JSON.parse` e devolve um objeto NOVO a cada
     chamada, então usar `session` como dependência fazia uma sessão idêntica
     contar como mudança e disparar uma recarga inteira do acesso. Cada recarga
     é uma janela em que a guarda de `app/_layout.tsx` pode cair e remontar o
     grupo de telas. */
  // No modo teste o acesso vem fixo de `useEntitlement`; o provedor não consulta nada.
  const userId = MODO_TESTE || carregandoSessao || emRecuperacao ? null : session?.user.id ?? null;
  const geracaoRef = useRef({ dono: userId, numero: 0, controle: new AbortController() });
  const donoDoEstadoRef = useRef<typeof geracaoRef.current | null>(null);
  const gravacaoRef = useRef<Promise<void>>(Promise.resolve());
  if (geracaoRef.current.dono !== userId) {
    geracaoRef.current.controle.abort();
    geracaoRef.current = { dono: userId, numero: 0, controle: new AbortController() };
  }
  const ciclo = geracaoRef.current;
  const estadoDoDono = donoDoEstadoRef.current === ciclo ? estado : null;
  useEffect(() => {
    if (ciclo.controle.signal.aborted) ciclo.controle = new AbortController();
    return () => { ciclo.numero++; ciclo.controle.abort(); };
  }, [ciclo]);
  const usuarioDosAvisosRef = useRef(userId);
  usuarioDosAvisosRef.current = userId;
  useEffect(() => {
    if (!MODO_TESTE && (!carregandoSessao || userId)) void sincronizarAvisosAssinatura(userId);
  }, [userId, carregandoSessao]);

  /* Os dois valores abaixo são LIDOS dentro da recarga, nunca dependências
     dela. Como ref, a recarga enxerga sempre o valor do instante em que a
     falha aconteceu (que é o correto) sem ganhar identidade nova a cada
     alternância. `sessaoNaoConfirmada` entrou nas dependências em 9f6412a e é
     o que multiplicou a frequência das recargas na 1.10.1. */
  const naoConfirmadaRef = useRef(sessaoNaoConfirmada);
  naoConfirmadaRef.current = sessaoNaoConfirmada;
  const estadoRef = useRef<EstadoAcesso | null>(null);
  estadoRef.current = estadoDoDono;
  const sessaoAtualRef = useRef(session);
  sessaoAtualRef.current = session;

  const recarregar = useCallback(async () => {
    if (geracaoRef.current !== ciclo || ciclo.controle.signal.aborted) return;
    // Copiar primitivas agora: a sessão global do SDK pode mudar antes mesmo
    // de React renderizar novamente e invalidar o ciclo.
    const donoDaOrigem = sessaoAtualRef.current?.user.id;
    const tokenDaOrigem = sessaoAtualRef.current?.access_token;
    const numero = ++ciclo.numero;
    const atual = () => geracaoRef.current === ciclo && ciclo.numero === numero && !ciclo.controle.signal.aborted;
    const publicar = (novo: EstadoAcesso | null) => {
      donoDoEstadoRef.current = ciclo;
      estadoRef.current = novo;
      setEstado(novo);
    };
    if (!userId) {
      publicar(null);
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

    const fim = Date.now() + 12_000;
    const consulta = new AbortController();
    const interromper = () => consulta.abort();
    ciclo.controle.signal.addEventListener('abort', interromper, { once: true });
    let adiantado: EstadoAcesso | null = null;
    try {
      if (donoDaOrigem !== userId || !tokenDaOrigem) throw new Error('sessão de origem indisponível');

    /* Antes de gastar rede: se já existe palavra do servidor guardada e ela
       ainda vale, ela entra AGORA e a confirmação segue por trás. Sem isto o
       app inteiro ficava numa tela de carregamento até a rede responder — e
       `app/_layout.tsx` só desenha as telas depois que este estado existe.
       Com rede ausente o `fetch` falha rápido, mas com rede que aceita a
       conexão e não responde (Wi-Fi de hotel, portal de captura, sinal fraco)
       a espera vai ao tempo do sistema operacional, de um minuto para cima.
       Quem paga e abre o app no metrô não pode olhar para um `spinner` desse
       tamanho tendo o acesso guardado a um `AsyncStorage` de distância. */
    adiantado = await esperarAcessoAte(() => lerAcessoGuardado(userId), Math.min(fim, Date.now() + 1_000)).catch(() => {
      console.warn('[entitlement] cache indisponível; confirmação pelo servidor');
      return null;
    });
    if (!atual()) return;
    if (adiantado && prazoOfflineAindaVale(adiantado)) {
      publicar(adiantado);
      setModoOffline(true);
      setCarregando(false);
    }

      const vinculo = await esperarAcessoAte(() => vincularAssinaturasPendentes({
        dono: userId, tokenDeAcesso: tokenDaOrigem,
        geracao: ciclo, podeContinuar: () => geracaoRef.current === ciclo,
        sinal: ciclo.controle.signal, fim,
      }), fim);
      if (!atual()) return;
      setSincronizacao({
        atencao: vinculo.houveFalha,
        mensagem: vinculo.houveFalha
          ? vinculo.tokenPendente
            ? 'Ainda não conseguimos confirmar o vínculo desta compra. Tente verificar novamente em instantes.'
            : 'Não conseguimos confirmar sua assinatura agora. Tente verificar novamente em instantes.'
          : null,
      });
      const { data, error } = await esperarAcessoAte(() => {
        if (!atual()) throw new Error('ciclo de acesso interrompido');
        return supabase.rpc('obter_estado_acesso').setHeader('Authorization', `Bearer ${tokenDaOrigem}`).abortSignal(consulta.signal);
      }, fim);
      if (!atual()) return;
      if (error) throw error;
      const confirmado = data as unknown as EstadoAcesso;
      if (!confirmado || typeof confirmado.allowed !== 'boolean' || typeof confirmado.enforced !== 'boolean') throw new Error('resposta de acesso inválida');
      publicar(confirmado);
      setModoOffline(false);
      // Escritas em voo não são canceláveis no AsyncStorage. Enfileirar impede
      // a conclusão atrasada de A de sobrescrever uma gravação posterior de B.
      const gravacao = gravacaoRef.current.then(async () => {
        if (atual()) await guardarAcesso(userId, confirmado);
      });
      gravacaoRef.current = gravacao.catch(() => console.warn('[entitlement] falha ao guardar confirmação'));
      // Falha/hang de persistência não segura a decisão já confirmada.
      await esperarAcessoAte(() => gravacao, fim).catch(() => console.warn('[entitlement] confirmação não persistida no prazo'));
      if (!atual()) return;
      // Só a palavra confirmada do servidor altera a agenda. Cache/falha de rede não reagendam.
      if (usuarioDosAvisosRef.current === userId) void sincronizarAvisosAssinatura(userId, confirmado);
    } catch (error) {
      if (!atual()) return;
      /* `sessaoNaoConfirmada` entra na mesma conta que a falta de rede porque a
         causa é a mesma: a sessão veio do disco, o token de acesso está
         vencido, e enquanto a renovação não passa o PostgREST responde 401 —
         que não parece erro de rede nenhum. Sem isto, o instante em que a
         internet volta (antes de o cliente renovar, até um minuto depois)
         jogaria na tela de assinatura quem está com a assinatura em dia. Não é
         afrouxamento: o servidor continua recusando tudo, e o acesso exibido
         segue limitado ao prazo que o próprio servidor já havia prometido. */
      const semRede = error instanceof PrazoDoAcesso || isLikelyNetworkError(error) || naoConfirmadaRef.current;
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
      const guardado = semRede ? adiantado : null;
      if (guardado && prazoOfflineAindaVale(guardado)) {
        publicar(guardado);
        setModoOffline(true);
        setSincronizacao({ atencao: false, mensagem: null });
        return;
      }

      /* A decisão vive em `entitlement-cache`, num módulo puro e testado,
         porque ela controla uma guarda de navegação: derrubar o acesso aqui
         desmonta o grupo de telas e devolve a pessoa à rota inicial, perdendo
         o que ela estava digitando. Falha passageira preserva o acesso que já
         estava de pé; falha permanente, e só ela, fecha. */
      const proximo = estadoAposFalha({ anterior: estadoRef.current, guardado, semRede });
      const manteveAcesso = proximo.allowed;
      setSincronizacao({
        atencao: !manteveAcesso,
        mensagem: manteveAcesso
          ? null
          : 'Não conseguimos confirmar seu acesso agora. Tente verificar novamente em instantes.',
      });
      publicar(proximo);
      setModoOffline(manteveAcesso);
    } finally {
      consulta.abort();
      ciclo.controle.signal.removeEventListener('abort', interromper);
      if (atual()) setCarregando(false);
    }
  }, [ciclo, userId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  /* Perguntar de novo com o app aberto (lib/vigia-acesso.ts): ao voltar ao
     primeiro plano, no fim do prazo, depois de gravação recusada e quando uma
     tela que tinha dados volta vazia (lib/cache-de-tela.ts). Sem isto,
     a assinatura vencida com o app aberto mostrava as telas zeradas, porque o
     RLS devolve leitura vazia em vez de erro. A recarga vai por ref para a
     vigia não renascer a cada identidade nova de `recarregar`. */
  const recarregarRef = useRef(recarregar);
  recarregarRef.current = recarregar;
  const vigiaRef = useRef<ReturnType<typeof criarVigiaDoAcesso> | null>(null);
  useEffect(() => {
    if (!userId) return;
    const vigia = criarVigiaDoAcesso({
      recarregar: () => recarregarRef.current(),
      ouvirPrimeiroPlano: (fn) => {
        const assinatura = AppState.addEventListener('change', (s) => {
          if (s === 'active') fn();
        });
        return () => assinatura.remove();
      },
      agendar: (fn, ms) => setTimeout(fn, ms),
      cancelar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    });
    vigiaRef.current = vigia;
    vigia.acompanhar(estadoRef.current);
    // Mesmo canal da recusa, com o mesmo intervalo mínimo entre consultas.
    const pararLeitura = assinarLeituraEsvaziou(avisarAcessoNegado);
    return () => {
      pararLeitura();
      vigia.parar();
      vigiaRef.current = null;
    };
  }, [userId]);
  useEffect(() => {
    vigiaRef.current?.acompanhar(estadoDoDono);
  }, [estadoDoDono]);

  return (
    <EntitlementContext value={{ estado: estadoDoDono, carregando: ciclo !== donoDoEstadoRef.current || carregando,
      sincronizacao: donoDoEstadoRef.current === ciclo ? sincronizacao : { atencao: false, mensagem: null },
      modoOffline: donoDoEstadoRef.current === ciclo && modoOffline, recarregar }}>
      {children}
    </EntitlementContext>
  );
}
