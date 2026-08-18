import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDemo } from './demo-context';
import { DEMO_WALLETS } from './demo-data';
import { fetchWallets, calcularSaldosWallets } from './wallets';
import { fetchTransactions } from './data';
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
  loading: boolean;
  setActiveWalletId: (id: string) => void;
  refreshWallets: () => Promise<void>;
  updateSaldosComTransacoes: (txs: Transaction[]) => void;
};

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { isDemoMode } = useDemo();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [activeWalletId, setActiveWalletIdState] = useState<string>('total');
  const [loading, setLoading] = useState(true);
  const [saldos, setSaldos] = useState<{ porCarteira: Record<string, number>; total: number }>({
    porCarteira: {},
    total: 0,
  });

  const loadWallets = useCallback(async () => {
    try {
      if (isDemoMode) {
        setWallets(DEMO_WALLETS);
        return;
      }
      const list = await fetchWallets();
      setWallets(list);
    } catch (e) {
      console.warn('Erro ao carregar carteiras no contexto:', e);
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

  const updateSaldosComTransacoes = useCallback(
    (txs: Transaction[]) => {
      const calculados = calcularSaldosWallets(wallets, txs);
      setSaldos(calculados);
    },
    [wallets]
  );

  return (
    <WalletContext.Provider
      value={{
        wallets,
        activeWalletId,
        activeWallet,
        activeWalletName,
        activeWalletColor,
        saldos,
        loading,
        setActiveWalletId,
        refreshWallets: loadWallets,
        updateSaldosComTransacoes,
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
