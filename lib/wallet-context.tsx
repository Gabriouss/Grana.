import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDemo } from './demo-context';
import { useSession } from './auth-context';
import { DEMO_WALLETS } from './demo-data';
import {
  fetchWallets,
  calcularSaldosWallets,
  calcularSaldosComAgregado,
  calcularEntradasWallets,
  calcularEntradasComAgregado,
} from './wallets';
import { fetchSaldosPorCarteira, fetchEntradasPorCarteira } from './data';
import type { Transaction, Wallet } from './types';

const STORAGE_KEY = '@grana_active_wallet_id';

type WalletContextType = {
  wallets: Wallet[];
  activeWalletId: string; // 'total' ou UUID da carteira
  activeWallet: Wallet | null; // null quando 'total'
  activeWalletName: string;
  activeWalletColor: string;
  saldos: {
    porCarteira: Record<string, number>;
    total: number;
  };
  /** Total de entradas por carteira, de todo o período (regra 20) — o que o
      seletor de carteira mostra. Não é saldo: nunca desconta saída nem soma
      `initial_balance`. */
  entradas: {
    porCarteira: Record<string, number>;
    total: number;
  };
  loading: boolean;
  setActiveWalletId: (id: string) => void;
  refreshWallets: () => Promise<Wallet[]>;
  updateSaldosComTransacoes: (txs: Transaction[]) => void;
  /** Recarrega o saldo pelo agregado do banco. Use este no app real. */
  refreshSaldos: (walletsAtualizadas?: Wallet[]) => Promise<void>;
  updateEntradasComTransacoes: (txs: Transaction[]) => void;
  /** Recarrega as entradas por carteira pelo agregado do banco + fila offline. */
  refreshEntradas: (walletsAtualizadas?: Wallet[]) => Promise<void>;
};

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { isDemoMode } = useDemo();
  const { session, isLoading: authLoading, sessaoNaoConfirmada } = useSession();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [activeWalletId, setActiveWalletIdState] = useState<string>('total');
  const [loading, setLoading] = useState(true);
  const [saldos, setSaldos] = useState<{ porCarteira: Record<string, number>; total: number }>({
    porCarteira: {},
    total: 0,
  });
  const [entradas, setEntradas] = useState<{ porCarteira: Record<string, number>; total: number }>({
    porCarteira: {},
    total: 0,
  });
  const dono = isDemoMode ? 'demo' : session?.user.id ?? null;
  const cicloRef = useRef({ dono, carga: 0, saldo: 0, entrada: 0, selecao: 0, vivo: true });
  if (cicloRef.current.dono !== dono) cicloRef.current = { dono, carga: 0, saldo: 0, entrada: 0, selecao: 0, vivo: true };
  const ciclo = cicloRef.current;
  const donoPublicadoRef = useRef<typeof ciclo | null>(null);
  const atual = () => cicloRef.current === ciclo && ciclo.vivo;
  const carteirasAtuais = donoPublicadoRef.current === ciclo ? wallets : [];
  const selecaoAtual = donoPublicadoRef.current === ciclo ? activeWalletId : 'total';
  useEffect(() => {
    ciclo.vivo = true;
    return () => { ciclo.vivo = false; ciclo.carga++; ciclo.saldo++; ciclo.entrada++; ciclo.selecao++; };
  }, [ciclo]);

  const loadWallets = useCallback(async () => {
    if (!atual()) return [];
    const carga = ++ciclo.carga;
    try {
      if (isDemoMode) {
        setWallets(DEMO_WALLETS);
        return DEMO_WALLETS;
      }
      if (authLoading || !dono) return [];
      const list = await fetchWallets();
      if (!atual() || carga !== ciclo.carga) return [];
      setWallets(list);
      return list;
    } catch (e) {
      console.warn('Erro ao carregar carteiras no contexto:', e);
      return [];
    } finally {
      if (atual() && carga === ciclo.carga) setLoading(false);
    }
  }, [isDemoMode, authLoading, ciclo]);

  useEffect(() => {
    donoPublicadoRef.current = ciclo;
    setWallets([]);
    setSaldos({ porCarteira: {}, total: 0 });
    setEntradas({ porCarteira: {}, total: 0 });
    setActiveWalletIdState('total');
    setLoading(true);
  }, [ciclo]);

  useEffect(() => { void loadWallets(); }, [loadWallets]);

  useEffect(() => {
    if (!dono) return;
    const selecao = ciclo.selecao;
    AsyncStorage.getItem(`${STORAGE_KEY}:${dono}`).then((saved) => {
      if (atual() && ciclo.selecao === selecao && saved) {
        setActiveWalletIdState(saved);
      }
    }).catch(() => console.warn('[carteiras] não foi possível ler a seleção'));
  }, [ciclo]);

  const setActiveWalletId = useCallback((id: string) => {
    if (!atual() || !dono) return;
    ciclo.selecao++;
    setActiveWalletIdState(id);
    AsyncStorage.setItem(`${STORAGE_KEY}:${dono}`, id).catch(() => console.warn('[carteiras] não foi possível guardar a seleção'));
  }, [ciclo]);

  /* Se a carteira ativa foi excluída (em outro aparelho, por exemplo), os
     filtros por wallet_id passariam a bater com nada e a tela pareceria
     vazia sem explicação. Assim que a lista carrega, cai de volta pra
     "Total" em vez de ficar presa num id que não existe mais. */
  useEffect(() => {
    if (loading) return;
    if (activeWalletId === 'total') return;
    if (wallets.length === 0) return;
    const aindaExiste = wallets.some((w) => w.id === activeWalletId);
    if (!aindaExiste) {
      setActiveWalletId('total');
    }
  }, [loading, wallets, activeWalletId, setActiveWalletId]);

  const activeWallet = useMemo(() => {
    if (selecaoAtual === 'total') return null;
    return carteirasAtuais.find((w) => w.id === selecaoAtual) || null;
  }, [wallets, selecaoAtual, ciclo]);

  const activeWalletName = useMemo(() => {
    if (selecaoAtual === 'total') return 'Total';
    return activeWallet ? activeWallet.name : 'Principal';
  }, [selecaoAtual, activeWallet]);

  const activeWalletColor = useMemo(() => {
    if (selecaoAtual === 'total') return '#1fa98d';
    return activeWallet ? activeWallet.color : '#1fa98d';
  }, [selecaoAtual, activeWallet]);

  /* O modo de exemplo e a sessão offline, que não têm uma RPC confirmada
     disponível, somam percorrendo a lista já carregada em memória. */
  const updateSaldosComTransacoes = useCallback(
    (txs: Transaction[]) => {
      if (!atual()) return;
      ciclo.saldo++;
      const calculados = calcularSaldosWallets(wallets, txs);
      setSaldos(calculados);
    },
    [wallets, ciclo]
  );

  /**
   * Pede o saldo ao banco.
   *
   * Uma linha por carteira, em vez do histórico inteiro: é o que impede o
   * saldo de ser calculado sobre as 1000 linhas que o PostgREST devolve no
   * máximo. Também é barato o bastante para rodar depois de cada alteração.
   */
  const refreshSaldos = useCallback(async (walletsAtualizadas?: Wallet[]) => {
    if (!atual()) return;
    if (isDemoMode) return;
    /* A Home pode pintar e carregar transações antes de o SessionProvider
       terminar `getSession()`. Chamar a RPC nesse intervalo usa a chave anon
       e o Postgres responde 42501, embora a permissão para `authenticated`
       esteja correta. Sessão lida do disco também não tem JWT confirmado:
       nesse caso a tela usa o cache local até a rede renovar o token. */
    if (authLoading || !session || sessaoNaoConfirmada) return;
    /* Sem a lista de carteiras não dá para distribuir nada: `porCarteira`
       sairia vazio e o total viria certo, porque em `calcularSaldosComAgregado`
       o total soma incondicionalmente e a carteira só recebe se a chave existir.
       O seletor então cai no fallback `?? initial_balance` e mostra R$ 0,00 em
       toda carteira, com o Total correto ao lado — foi exatamente o que o autor
       viu em 08/09/2026, no Expo Go, com o banco íntegro (390 lançamentos, zero
       sem carteira, zero órfão) e o APK exibindo o valor certo no mesmo
       instante.

       É corrida, não dado: este `refreshSaldos` é disparado pelo efeito da
       Início assim que as TRANSAÇÕES chegam (app/(app)/index.tsx), e captura
       `wallets` no closure. Quando a busca de carteiras perde a corrida — mais
       provável no bundle de desenvolvimento, que é mais lento — roda com lista
       vazia. Sair agora não perde a atualização: `wallets` está nas dependências
       do callback, então a identidade dele muda quando a lista chega e o efeito
       roda de novo. */
    const baseWallets = walletsAtualizadas ?? wallets;
    if (baseWallets.length === 0) return;
    const pedido = ++ciclo.saldo;
    try {
      const agregado = await fetchSaldosPorCarteira();
      if (!atual() || ciclo.saldo !== pedido) return;
      setSaldos(calcularSaldosComAgregado(baseWallets, agregado));
    } catch (e) {
      console.warn('Erro ao carregar saldos:', e);
    }
  }, [authLoading, isDemoMode, sessaoNaoConfirmada, session, wallets, ciclo]);

  /* Mesmo par soma-em-memória/soma-no-banco de `updateSaldosComTransacoes` e
     `refreshSaldos`, para o seletor de carteira (regra 20): entradas, não
     saldo, e sem `initial_balance`. */
  const updateEntradasComTransacoes = useCallback(
    (txs: Transaction[]) => {
      if (!atual()) return;
      ciclo.entrada++;
      setEntradas(calcularEntradasWallets(wallets, txs));
    },
    [wallets, ciclo]
  );

  const refreshEntradas = useCallback(async (walletsAtualizadas?: Wallet[]) => {
    if (!atual()) return;
    if (isDemoMode) return;
    if (authLoading || !session || sessaoNaoConfirmada) return;
    const baseWallets = walletsAtualizadas ?? wallets;
    if (baseWallets.length === 0) return;
    const pedido = ++ciclo.entrada;
    try {
      const agregado = await fetchEntradasPorCarteira();
      if (!atual() || ciclo.entrada !== pedido) return;
      setEntradas(calcularEntradasComAgregado(baseWallets, agregado));
    } catch (e) {
      console.warn('Erro ao carregar entradas por carteira:', e);
    }
  }, [authLoading, isDemoMode, sessaoNaoConfirmada, session, wallets, ciclo]);

  return (
    <WalletContext.Provider
      value={{
        wallets: carteirasAtuais,
        activeWalletId: selecaoAtual,
        activeWallet,
        activeWalletName,
        activeWalletColor,
        saldos: donoPublicadoRef.current === ciclo ? saldos : { porCarteira: {}, total: 0 },
        entradas: donoPublicadoRef.current === ciclo ? entradas : { porCarteira: {}, total: 0 },
        loading: donoPublicadoRef.current !== ciclo || loading,
        setActiveWalletId,
        refreshWallets: loadWallets,
        updateSaldosComTransacoes,
        refreshSaldos,
        updateEntradasComTransacoes,
        refreshEntradas,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet deve ser usado dentro de um WalletProvider');
  }
  return context;
}
