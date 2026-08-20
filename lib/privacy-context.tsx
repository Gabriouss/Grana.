import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type PrivacyContextValue = { hidden: boolean; toggle: () => void };

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

const CHAVE = 'grana_privacy_hidden';

/**
 * Na web, lida de forma SÍNCRONA do localStorage antes da primeira pintura —
 * um `useState(false)` seguido de `AsyncStorage.getItem` num `useEffect`
 * deixaria os valores reais visíveis por um instante a cada F5, exatamente o
 * vazamento que a pessoa está tentando evitar ao ativar o modo privacidade.
 * No nativo não existe "reload" de página, então a leitura assíncrona do
 * AsyncStorage no efeito abaixo é inofensiva.
 */
function lerInicial(): boolean {
  if (Platform.OS !== 'web') return false;
  try {
    return globalThis.localStorage?.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

export function usePrivacy() {
  const value = use(PrivacyContext);
  if (!value) throw new Error('usePrivacy precisa estar dentro de um <PrivacyProvider />');
  return value;
}

export function PrivacyProvider({ children }: PropsWithChildren) {
  const [hidden, setHiddenState] = useState(lerInicial);

  useEffect(() => {
    if (Platform.OS === 'web') return; // já leu de forma síncrona em lerInicial()
    AsyncStorage.getItem(CHAVE).then((v) => {
      if (v === '1') setHiddenState(true);
    });
  }, []);

  function setHidden(value: boolean) {
    setHiddenState(value);
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(CHAVE, value ? '1' : '0');
      } catch {
        // Sem acesso ao localStorage, a preferência só não sobrevive a um reload — não crítico.
      }
    } else {
      AsyncStorage.setItem(CHAVE, value ? '1' : '0');
    }
  }

  return (
    <PrivacyContext value={{ hidden, toggle: () => setHidden(!hidden) }}>{children}</PrivacyContext>
  );
}
