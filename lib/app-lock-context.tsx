import { createContext, use, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Bloqueio do app por biometria ou senha do aparelho.
 *
 * Por que existe: a sessão do Supabase é persistente e não expira, então quem
 * pega o celular desbloqueado vê todo o histórico financeiro e ainda consegue
 * disparar ações destrutivas. Ter sessão prova posse do aparelho, não
 * identidade. Este gate reintroduz a prova de identidade na abertura do app e
 * na volta do segundo plano.
 *
 * A trava é opt-in e fica desligada por padrão: ligar sozinho prenderia quem
 * não cadastrou biometria. O estado mora no AsyncStorage e não no servidor —
 * é uma decisão sobre este aparelho, não sobre a conta.
 */

const CHAVE = 'grana_app_lock_ativo';

/* Volta rápida do segundo plano não deve pedir biometria: trocar de app para
   copiar um valor e voltar é fluxo normal, e pedir digital toda vez treina a
   pessoa a desligar a trava. 30s cobre isso sem abrir janela real de risco. */
const CARENCIA_MS = 30_000;

type AppLockValue = {
  /** Se a trava está ligada nas preferências. */
  ativo: boolean;
  /** true quando a trava está ligada e ainda não foi vencida nesta abertura. */
  bloqueado: boolean;
  /** false em aparelho sem leitor ou sem biometria cadastrada, e na web. */
  disponivel: boolean;
  alternar: () => Promise<void>;
  desbloquear: () => Promise<boolean>;
};

const AppLockContext = createContext<AppLockValue>({
  ativo: false,
  bloqueado: false,
  disponivel: false,
  alternar: async () => {},
  desbloquear: async () => false,
});

export function useAppLock() {
  return use(AppLockContext);
}

async function checarDisponibilidade(): Promise<boolean> {
  // Não há Keychain nem leitor biométrico num navegador.
  if (Platform.OS === 'web') return false;
  const temHardware = await LocalAuthentication.hasHardwareAsync();
  if (!temHardware) return false;
  return await LocalAuthentication.isEnrolledAsync();
}

export function AppLockProvider({ children }: PropsWithChildren) {
  const [ativo, setAtivo] = useState(false);
  const [disponivel, setDisponivel] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const saiuEm = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const disp = await checarDisponibilidade();
      setDisponivel(disp);
      const salvo = await AsyncStorage.getItem(CHAVE);
      const ligado = salvo === '1' && disp;
      setAtivo(ligado);
      // Abertura do app já entra bloqueada quando a trava está ligada.
      setBloqueado(ligado);
    })();
  }, []);

  /* Rebloqueia ao voltar do segundo plano depois da carência. O timestamp é
     gravado na saída, não na volta: medir na volta não diria há quanto tempo
     o app ficou fora. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') {
        const saida = saiuEm.current;
        if (ativo && saida !== null && Date.now() - saida > CARENCIA_MS) {
          setBloqueado(true);
        }
        saiuEm.current = null;
      } else if (estado === 'background') {
        saiuEm.current = Date.now();
      }
    });
    return () => sub.remove();
  }, [ativo]);

  const desbloquear = useCallback(async () => {
    const { success } = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Desbloqueie o Grana.',
      cancelLabel: 'Cancelar',
      // Sem isto, quem não conseguir usar a digital fica trancado para fora
      // do próprio app — a senha do aparelho precisa continuar valendo.
      disableDeviceFallback: false,
    });
    if (success) setBloqueado(false);
    return success;
  }, []);

  const alternar = useCallback(async () => {
    if (!disponivel) return;
    if (ativo) {
      /* Desligar a trava é, em si, uma ação protegida: sem exigir a
         autenticação aqui, quem pegasse o aparelho desbloqueado simplesmente
         desligaria a proteção. */
      const { success } = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirme para desativar o bloqueio',
        cancelLabel: 'Cancelar',
      });
      if (!success) return;
      await AsyncStorage.setItem(CHAVE, '0');
      setAtivo(false);
      setBloqueado(false);
      return;
    }
    await AsyncStorage.setItem(CHAVE, '1');
    setAtivo(true);
  }, [ativo, disponivel]);

  return (
    <AppLockContext value={{ ativo, bloqueado, disponivel, alternar, desbloquear }}>
      {children}
    </AppLockContext>
  );
}
