import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenCapture from 'expo-screen-capture';

/**
 * Bloqueio de captura de tela, agora sob controle da pessoa.
 *
 * Antes era sempre ligado, sem escape. O problema disso num app pessoal é que
 * a mesma proteção que esconde os saldos de quem folheia o alternador de
 * tarefas também impede a dona da conta de printar o próprio orçamento para
 * mandar para alguém — e proteção que atrapalha o uso legítimo é proteção que
 * a pessoa procura um jeito de contornar.
 *
 * Continua LIGADO por padrão: o ganho de segurança vale para quem nunca abre
 * as configurações, que é a maioria. Quem precisa printar desliga uma vez.
 *
 * No Android o FLAG_SECURE também apaga a miniatura do app no alternador de
 * tarefas, então desligar reabre essa janela — o texto na tela avisa disso.
 * No iOS o sistema não permite impedir o print de forma alguma; lá o ajuste
 * não tem efeito e por isso nem aparece.
 */

const CHAVE = 'grana_bloqueio_captura';

type ScreenCaptureValue = {
  /** Se o bloqueio está ativo. */
  bloqueado: boolean;
  /** false na web e no iOS, onde não há como impedir a captura. */
  disponivel: boolean;
  alternar: () => Promise<void>;
};

const ScreenCaptureContext = createContext<ScreenCaptureValue>({
  bloqueado: false,
  disponivel: false,
  alternar: async () => {},
});

export function useScreenCapture() {
  return use(ScreenCaptureContext);
}

/* Só o Android expõe um bloqueio real (FLAG_SECURE). Na web não existe nada
   equivalente, e no iOS o sistema apenas avisa que houve print, sem deixar
   impedir — oferecer o ajuste ali seria prometer o que não se cumpre. */
const DISPONIVEL = Platform.OS === 'android';

export function ScreenCaptureProvider({ children }: PropsWithChildren) {
  const [bloqueado, setBloqueado] = useState(DISPONIVEL);

  const aplicar = useCallback(async (ativar: boolean) => {
    if (!DISPONIVEL) return;
    try {
      if (ativar) await ScreenCapture.preventScreenCaptureAsync();
      else await ScreenCapture.allowScreenCaptureAsync();
    } catch {
      // Sem tratamento: falhar aqui não deve derrubar o app.
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (!DISPONIVEL) return;
      const salvo = await AsyncStorage.getItem(CHAVE);
      // Ausente = nunca configurado = ligado, que é o padrão seguro.
      const ligado = salvo !== '0';
      setBloqueado(ligado);
      await aplicar(ligado);
    })();
  }, [aplicar]);

  const alternar = useCallback(async () => {
    const novo = !bloqueado;
    setBloqueado(novo);
    await AsyncStorage.setItem(CHAVE, novo ? '1' : '0');
    await aplicar(novo);
  }, [bloqueado, aplicar]);

  return (
    <ScreenCaptureContext value={{ bloqueado, disponivel: DISPONIVEL, alternar }}>
      {children}
    </ScreenCaptureContext>
  );
}
