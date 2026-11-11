import { createContext, use, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Alert, Platform } from 'react-native';
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
const CHAVE_NATIVA = 'grana-preferencia-captura';

function avisarFalha(etapa: string, mensagem: string) {
  console.warn(`[ScreenCapture] Falha em ${etapa}.`);
  try {
    Alert.alert('Captura de tela', mensagem);
  } catch {
    console.warn('[ScreenCapture] Falha ao apresentar aviso.');
  }
}

type ScreenCaptureValue = {
  /** true somente após confirmação da chamada nativa. */
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
  const [bloqueado, setBloqueado] = useState(false);
  const confirmado = useRef(false);
  const fila = useRef(Promise.resolve());

  const aplicar = useCallback(async (ativar: boolean) => {
    if (!DISPONIVEL) return;
    try {
      if (ativar) await ScreenCapture.preventScreenCaptureAsync(CHAVE_NATIVA);
      else await ScreenCapture.allowScreenCaptureAsync(CHAVE_NATIVA);
      confirmado.current = ativar;
      setBloqueado(ativar);
      return true;
    } catch {
      confirmado.current = false;
      setBloqueado(false);
      avisarFalha('aplicação nativa', 'Não foi possível confirmar a proteção de captura no Android. Tente ativá-la novamente.');
      // O Expo marca a chave antes de aguardar o Android; limpe a tentativa falha.
      if (ativar) {
        try {
          await ScreenCapture.allowScreenCaptureAsync(CHAVE_NATIVA);
        } catch {
          console.warn('[ScreenCapture] Falha ao limpar tentativa nativa.');
        }
      }
      return false;
    }
  }, []);

  useEffect(() => {
    fila.current = fila.current.then(async () => {
      if (!DISPONIVEL) return;
      // Proteja antes da leitura: armazenamento indisponível não remove o padrão seguro.
      await aplicar(true);
      let salvo: string | null = null;
      try {
        salvo = await AsyncStorage.getItem(CHAVE);
      } catch {
        avisarFalha('leitura local', 'Não foi possível ler sua preferência de captura. O app tentou manter o bloqueio por segurança.');
      }
      if (salvo === '0') await aplicar(false);
    });
  }, [aplicar]);

  const alternar = useCallback(() => {
    fila.current = fila.current.then(async () => {
      if (!DISPONIVEL) return;
      const novo = !confirmado.current;
      if (!await aplicar(novo)) return;
      try {
        await AsyncStorage.setItem(CHAVE, novo ? '1' : '0');
      } catch {
        avisarFalha('escrita local', 'A mudança foi aplicada no Android, mas não foi salva. Confira a preferência ao abrir o app novamente.');
      }
    });
    return fila.current;
  }, [aplicar]);

  return (
    <ScreenCaptureContext value={{ bloqueado, disponivel: DISPONIVEL, alternar }}>
      {children}
    </ScreenCaptureContext>
  );
}
