import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
import { fetchTransactions, fetchSaldosPorCarteira, fetchEntradasPorCarteira } from './data';
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

  const loadWallets = useCallback(async () => {
    try {
      if (isDemoMode) {
        setWallets(DEMO_WALLETS);
        return DEMO_WALLETS;
      }
      const list = await fetchWallets();
      setWallets(list);
      return list;
    } catch (e) {
      console.warn('Erro ao carregar carteiras no contexto:', e);
      return [];
    } finally {
      setLoading(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved) {
        setActiveWalletIdState(saved);
      }
    });
  }, []);

  const setActiveWalletId = useCallback((id: string) => {
    setActiveWalletIdState(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
  }, []);

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
    if (activeWalletId === 'total') return null;
    return wallets.find((w) => w.id === activeWalletId) || null;
  }, [wallets, activeWalletId]);

  const activeWalletName = useMemo(() => {
    if (activeWalletId === 'total') return 'Total';
    return activeWallet ? activeWallet.name : 'Principal';
  }, [activeWalletId, activeWallet]);

  const activeWalletColor = useMemo(() => {
    if (activeWalletId === 'total') return '#1fa98d';
    return activeWallet ? activeWallet.color : '#1fa98d';
  }, [activeWalletId, activeWallet]);

  /* O modo de exemplo e a sessão offline, que não têm uma RPC confirmada
     disponível, somam percorrendo a lista já carregada em memória. */
  const updateSaldosComTransacoes = useCallback(
    (txs: Transaction[]) => {
      const calculados = calcularSaldosWallets(wallets, txs);
      setSaldos(calculados);
    },
    [wallets]
  );

  /**
   * Pede o saldo ao banco.
   *
   * Uma linha por carteira, em vez do histórico inteiro: é o que impede o
   * saldo de ser calculado sobre as 1000 linhas que o PostgREST devolve no
   * máximo. Também é barato o bastante para rodar depois de cada alteração.
   */
  const refreshSaldos = useCallback(async (walletsAtualizadas?: Wallet[]) => {
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
    try {
      const agregado = await fetchSaldosPorCarteira();
      setSaldos(calcularSaldosComAgregado(baseWallets, agregado));
    } catch (e) {
      console.warn('Erro ao carregar saldos:', e);
    }
  }, [authLoading, isDemoMode, sessaoNaoConfirmada, session, wallets]);

  /* Mesmo par soma-em-memória/soma-no-banco de `updateSaldosComTransacoes` e
     `refreshSaldos`, para o seletor de carteira (regra 20): entradas, não
     saldo, e sem `initial_balance`. */
  const updateEntradasComTransacoes = useCallback(
    (txs: Transaction[]) => {
      setEntradas(calcularEntradasWallets(wallets, txs));
    },
    [wallets]
  );

  const refreshEntradas = useCallback(async (walletsAtualizadas?: Wallet[]) => {
    if (isDemoMode) return;
    if (authLoading || !session || sessaoNaoConfirmada) return;
    const baseWallets = walletsAtualizadas ?? wallets;
    if (baseWallets.length === 0) return;
    try {
      const agregado = await fetchEntradasPorCarteira();
      setEntradas(calcularEntradasComAgregado(baseWallets, agregado));
    } catch (e) {
      console.warn('Erro ao carregar entradas por carteira:', e);
    }
  }, [authLoading, isDemoMode, sessaoNaoConfirmada, session, wallets]);

  return (
    <WalletContext.Provider
      value={{
        wallets,
        activeWalletId,
        activeWallet,
        activeWalletName,
        activeWalletColor,
        saldos,
        entradas,
        loading,
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
