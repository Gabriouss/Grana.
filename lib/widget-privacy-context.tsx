import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type WidgetPrivacyContextValue = { valoresVisiveis: boolean; toggle: () => void };

const WidgetPrivacyContext = createContext<WidgetPrivacyContextValue | null>(null);

const CHAVE = 'grana_widget_valores_visiveis';

/**
 * Controla se os widgets Android (Livre para Gastar, Cofrinho, Próximo
 * Compromisso) mostram valor em R$ na tela inicial — separado do
 * `PrivacyProvider` de propósito.
 *
 * O modo privacidade do app (`usePrivacy`) protege contra alguém olhando por
 * cima do ombro ENQUANTO a pessoa usa o app, e nasce desligado porque esse é
 * um incômodo ocasional. Um widget fica exposto o tempo todo, pra qualquer
 * um que pegue o aparelho, sem precisar abrir nada — é uma ameaça diferente,
 * e por isso tem o padrão oposto: nasce OCULTO, e a pessoa precisa optar
 * explicitamente por mostrar valor ali. Sem essa separação, todo widget de
 * resumo nascia mostrando saldo/fatura reais até a pessoa lembrar de ligar
 * uma configuração pensada para outro cenário.
 */
export function useWidgetPrivacy() {
  const value = use(WidgetPrivacyContext);
  if (!value) throw new Error('useWidgetPrivacy precisa estar dentro de um <WidgetPrivacyProvider />');
  return value;
}

export function WidgetPrivacyProvider({ children }: PropsWithChildren) {
  const [valoresVisiveis, setValoresVisiveisState] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CHAVE).then((v) => {
      if (v === '1') setValoresVisiveisState(true);
    });
  }, []);

  function setValoresVisiveis(value: boolean) {
    setValoresVisiveisState(value);
    AsyncStorage.setItem(CHAVE, value ? '1' : '0');
  }

  return (
    <WidgetPrivacyContext value={{ valoresVisiveis, toggle: () => setValoresVisiveis(!valoresVisiveis) }}>
      {children}
    </WidgetPrivacyContext>
  );
}
