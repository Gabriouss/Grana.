import { createContext, use, useState, type PropsWithChildren } from 'react';

type PrivacyContextValue = { hidden: boolean; toggle: () => void };

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function usePrivacy() {
  const value = use(PrivacyContext);
  if (!value) throw new Error('usePrivacy precisa estar dentro de um <PrivacyProvider />');
  return value;
}

export function PrivacyProvider({ children }: PropsWithChildren) {
  const [hidden, setHidden] = useState(false);
  return <PrivacyContext value={{ hidden, toggle: () => setHidden((h) => !h) }}>{children}</PrivacyContext>;
}
