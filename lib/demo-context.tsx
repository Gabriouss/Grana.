import { createContext, use, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

/* Travado ligado na web enquanto a estrutura do site está em obras — pedido
   explícito do autor pra sempre ver dados de exemplo nessa versão nesse
   meio-tempo, em vez de depender de lembrar de ligar o toggle a cada sessão.
   O app nativo não muda (mesmo critério de sempre — ver lib/breakpoints.ts).
   Pra reverter quando a reestruturação terminar, é só apagar esta constante
   e o `|| SEMPRE_DEMO_NA_WEB` das três funções abaixo. */
const SEMPRE_DEMO_NA_WEB = Platform.OS === 'web';

type DemoContextValue = {
  isDemoMode: boolean;
  toggleDemoMode: () => void;
  enableDemoMode: () => void;
  disableDemoMode: () => void;
};

const DemoContext = createContext<DemoContextValue>({
  isDemoMode: false,
  toggleDemoMode: () => {},
  enableDemoMode: () => {},
  disableDemoMode: () => {},
});

export function useDemo() {
  return use(DemoContext);
}

export function DemoProvider({ children }: PropsWithChildren) {
  const [isDemoMode, setIsDemoMode] = useState(SEMPRE_DEMO_NA_WEB);

  const value: DemoContextValue = {
    isDemoMode: isDemoMode || SEMPRE_DEMO_NA_WEB,
    // Trava a desativação na web: alternar ou desligar continua sem efeito
    // enquanto SEMPRE_DEMO_NA_WEB estiver ligado, pra o toggle em Perfil não
    // parecer aceitar o toque e voltar sozinho.
    toggleDemoMode: () => !SEMPRE_DEMO_NA_WEB && setIsDemoMode((prev) => !prev),
    enableDemoMode: () => setIsDemoMode(true),
    disableDemoMode: () => !SEMPRE_DEMO_NA_WEB && setIsDemoMode(false),
  };

  return <DemoContext value={value}>{children}</DemoContext>;
}
