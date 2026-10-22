import { createContext, use, useState, type PropsWithChildren } from 'react';
import { MODO_TESTE } from './modo-teste';

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
  // No modo teste da landing os dados de exemplo são a própria conta, e não se desligam.
  const [isDemoMode, setIsDemoMode] = useState(MODO_TESTE);

  const value: DemoContextValue = {
    isDemoMode,
    toggleDemoMode: () => setIsDemoMode((prev) => MODO_TESTE || !prev),
    enableDemoMode: () => setIsDemoMode(true),
    disableDemoMode: () => setIsDemoMode(MODO_TESTE),
  };

  return <DemoContext value={value}>{children}</DemoContext>;
}
