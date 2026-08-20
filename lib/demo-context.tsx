import { createContext, use, useState, type PropsWithChildren } from 'react';

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
  const [isDemoMode, setIsDemoMode] = useState(false);

  const value: DemoContextValue = {
    isDemoMode,
    toggleDemoMode: () => setIsDemoMode((prev) => !prev),
    enableDemoMode: () => setIsDemoMode(true),
    disableDemoMode: () => setIsDemoMode(false),
  };

  return <DemoContext value={value}>{children}</DemoContext>;
}
