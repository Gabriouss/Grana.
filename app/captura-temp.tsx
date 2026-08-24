import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useDemo } from '@/lib/demo-context';
import { WalletProvider } from '@/lib/wallet-context';
import Inicio from './(app)/index';
import Lancamentos from './(app)/lancamentos';
import Graficos from './(app)/graficos';
import Contas from './(app)/contas';
import Credito from './(app)/credito';

/**
 * ANDAIME TEMPORÁRIO — apagar depois de capturar as telas.
 *
 * Só existe pra tirar screenshot das telas REAIS do app pra landing page.
 * Não é rota de produto: fica fora de qualquer `Stack.Protected` e liga o
 * modo de exemplo, que curto-circuita o Supabase por completo (as telas
 * passam a ler de lib/demo-data.ts), então roda sem login e sem rede.
 *
 * Uso: /captura-temp?tela=inicio|lancamentos|graficos|contas|credito
 */
const TELAS: Record<string, React.ComponentType> = {
  inicio: Inicio,
  lancamentos: Lancamentos,
  graficos: Graficos,
  contas: Contas,
  credito: Credito,
};

export default function CapturaTemp() {
  const { enableDemoMode, isDemoMode } = useDemo();
  const { tela } = useLocalSearchParams<{ tela?: string }>();

  useEffect(() => {
    enableDemoMode();
  }, [enableDemoMode]);

  if (!isDemoMode) return null;

  const Tela = TELAS[tela ?? 'inicio'] ?? Inicio;
  return (
    <WalletProvider>
      <View style={{ flex: 1 }}>
        <Tela />
      </View>
    </WalletProvider>
  );
}
