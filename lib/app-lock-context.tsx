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
const PRAZO_PREPARACAO_MS = 5_000;
const PRAZO_AUTENTICACAO_MS = 60_000;
const PRAZO_CANCELAMENTO_MS = 2_000;

function noPrazo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('prazo_do_bloqueio')), ms);
    promessa.then(
      valor => { clearTimeout(timer); resolve(valor); },
      erro => { clearTimeout(timer); reject(erro); },
    );
  });
}

type ConfirmacaoNativa = {
  promessa: ReturnType<typeof LocalAuthentication.authenticateAsync>;
  pendente: boolean;
  cancelamento: { promessa: Promise<void>; concluido: boolean } | null;
};

/* Estado do módulo, inclusive entre remontagens do provider. A confirmação e
   seu pedido de cancelamento são duas chamadas independentes. Uma Promise
   pendente não prova que o Android encerrou a outra chamada. */
let confirmacaoNativa: ConfirmacaoNativa | null = null;

function liberarSeTerminou(alvo: ConfirmacaoNativa) {
  if (!alvo.pendente && (!alvo.cancelamento || alvo.cancelamento.concluido) && confirmacaoNativa === alvo) {
    confirmacaoNativa = null;
  }
}

function reciboDaAnterior(alvo: ConfirmacaoNativa): string {
  return alvo.pendente
    ? 'A confirmação anterior ainda não terminou no aparelho. Termine ou cancele por lá. Se não responder, feche completamente o Grana. e abra de novo.'
    : 'A confirmação anterior terminou, mas o aparelho não confirmou o cancelamento. Feche completamente o Grana. e abra de novo.';
}

class ConfirmacaoAnteriorPendente extends Error {
  constructor(readonly recibo: string) { super('confirmacao_anterior_pendente'); }
}

function cancelarNativo(alvo: ConfirmacaoNativa | null): Promise<void> {
  // Uma tentativa velha nunca cancela o prompt que tomou seu lugar.
  if (!alvo || confirmacaoNativa !== alvo) return Promise.resolve();
  if (Platform.OS !== 'android') {
    return noPrazo(alvo.promessa.then(() => undefined, () => undefined), PRAZO_CANCELAMENTO_MS);
  }
  if (!alvo.cancelamento) {
    const tarefa = Promise.resolve().then(() => LocalAuthentication.cancelAuthenticate());
    const cancelamento = { promessa: tarefa, concluido: false };
    alvo.cancelamento = cancelamento;
    void tarefa.then(
      () => { cancelamento.concluido = true; liberarSeTerminou(alvo); },
      () => { cancelamento.concluido = true; liberarSeTerminou(alvo); registrarFalha('o aparelho recusou o cancelamento'); },
    );
  }
  return noPrazo(Promise.all([
    alvo.cancelamento.promessa,
    alvo.promessa.then(() => undefined, () => undefined),
  ]).then(() => undefined), PRAZO_CANCELAMENTO_MS);
}

async function aguardarAnterior(): Promise<void> {
  const anterior = confirmacaoNativa;
  if (!anterior) return;
  // Um só prazo total. Rejeições terminadas já têm recibo na tentativa de
  // origem; não são chamadas nativas que ainda possam executar mais tarde.
  const chamadas = [anterior.promessa.then(() => undefined, () => undefined)];
  if (anterior.cancelamento) chamadas.push(anterior.cancelamento.promessa.then(() => undefined, () => undefined));
  try { await noPrazo(Promise.all(chamadas), PRAZO_CANCELAMENTO_MS); }
  catch { if (confirmacaoNativa) throw new ConfirmacaoAnteriorPendente(reciboDaAnterior(confirmacaoNativa)); }
  liberarSeTerminou(anterior);
  if (confirmacaoNativa) throw new ConfirmacaoAnteriorPendente(reciboDaAnterior(confirmacaoNativa));
}

function abrirConfirmacao(promptMessage: string): ConfirmacaoNativa {
  if (confirmacaoNativa) throw new ConfirmacaoAnteriorPendente(reciboDaAnterior(confirmacaoNativa));
  const alvo: ConfirmacaoNativa = {
    pendente: true, cancelamento: null,
    promessa: Promise.resolve().then(() => LocalAuthentication.authenticateAsync({
      promptMessage, cancelLabel: 'Cancelar', disableDeviceFallback: false,
    })),
  };
  confirmacaoNativa = alvo;
  void alvo.promessa.then(
    resultado => {
      alvo.pendente = false;
      // Estes erros podem deixar o estado nativo precisando de limpeza.
      // Registra a barreira ANTES de outra tentativa poder ocupar o módulo.
      if (confirmacaoNativa === alvo && !resultado.success &&
        (resultado.error === 'app_cancel' || resultado.error === 'invalid_context')) {
        void cancelarNativo(alvo).catch(() => registrarFalha('cancelamento da confirmação não respondeu'));
      }
      liberarSeTerminou(alvo);
    },
    () => {
      alvo.pendente = false;
      if (confirmacaoNativa === alvo) {
        void cancelarNativo(alvo).catch(() => registrarFalha('cancelamento da confirmação não respondeu'));
      }
      liberarSeTerminou(alvo);
    },
  );
  return alvo;
}

function registrarFalha(etapa: string) {
  console.error(`[bloqueio] ${etapa}`);
}

type AppLockValue = {
  /** Se a trava está ligada nas preferências. */
  ativo: boolean;
  /** true quando a trava está ligada e ainda não foi vencida nesta abertura. */
  bloqueado: boolean;
  /** false em aparelho sem leitor ou sem biometria cadastrada, e na web. */
  disponivel: boolean;
  /** false enquanto a leitura assíncrona do AsyncStorage não terminou — usado
      pra cobrir a tela durante esse instante, já que `bloqueado` começa falso
      por padrão e só vira true depois de saber se a trava está ligada. */
  pronto: boolean;
  autenticando: boolean;
  erro: string | null;
  alternar: () => Promise<void>;
  desbloquear: () => Promise<boolean>;
};

const AppLockContext = createContext<AppLockValue>({
  ativo: false,
  bloqueado: false,
  disponivel: false,
  pronto: false,
  autenticando: false,
  erro: null,
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
  /* Na web já nasce pronto: não há trava num navegador (`checarDisponibilidade`
     devolve false sempre), e a cobertura opaca do `AppLockGate` enquanto o
     efeito abaixo não roda saía no HTML do servidor por cima da landing, que
     ficava invisível até o JavaScript chegar (A3, 24/10/2026). */
  const [pronto, setPronto] = useState(Platform.OS === 'web');
  const [autenticando, setAutenticando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const saiuEm = useRef<number | null>(null);
  const vivo = useRef(true);
  const ativoAtual = useRef(false);
  const preparado = useRef(Platform.OS === 'web');
  const carregamento = useRef<Promise<boolean | null> | null>(null);
  const recuperacao = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tentativa = useRef<{
    promessa: Promise<boolean>;
    nativa: ConfirmacaoNativa | null;
    terminar: (sucesso: boolean, mensagem?: string) => void;
  } | null>(null);

  const preparar = useCallback((): Promise<boolean | null> => {
    if (Platform.OS === 'web') return Promise.resolve(false);
    if (carregamento.current) return carregamento.current;
    const tarefa = (async () => {
      setPronto(false);
      setErro(null);
      try {
        const [disp, salvo] = await noPrazo(
          Promise.all([checarDisponibilidade(), AsyncStorage.getItem(CHAVE)]), PRAZO_PREPARACAO_MS,
        );
        if (!vivo.current) return null;
        const ligado = salvo === '1' && disp;
        ativoAtual.current = ligado;
        preparado.current = true;
        setDisponivel(disp);
        setAtivo(ligado);
        setBloqueado(ligado);
        setPronto(true);
        return ligado;
      } catch {
        if (!vivo.current) return null;
        registrarFalha('não foi possível conferir a proteção');
        preparado.current = false;
        // Preferência desconhecida não pode liberar o conteúdo financeiro.
        setBloqueado(true);
        setPronto(true);
        setErro('Não consegui conferir a proteção. Toque em Desbloquear para tentar de novo.');
        return null;
      }
    })();
    carregamento.current = tarefa;
    void tarefa.then(() => { if (carregamento.current === tarefa) carregamento.current = null; });
    return tarefa;
  }, []);

  const interromper = useCallback((mensagem: string) => {
    const anterior = tentativa.current;
    if (!anterior) return;
    anterior.terminar(false, mensagem);
    void cancelarNativo(anterior.nativa).catch(() => {
      registrarFalha('cancelamento da confirmação não respondeu');
      if (vivo.current && !tentativa.current && anterior.nativa && confirmacaoNativa === anterior.nativa) {
        setErro(reciboDaAnterior(anterior.nativa));
      }
    });
  }, []);

  useEffect(() => {
    vivo.current = true;
    void preparar();
    return () => {
      vivo.current = false;
      if (recuperacao.current !== null) clearTimeout(recuperacao.current);
      interromper('A confirmação foi interrompida. Tente de novo.');
    };
  }, [preparar, interromper]);

  /* Rebloqueia ao voltar do segundo plano depois da carência. O timestamp é
     gravado na saída, não na volta: medir na volta não diria há quanto tempo
     o app ficou fora. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') {
        const saida = saiuEm.current;
        const pendente = tentativa.current;
        if (ativoAtual.current && saida !== null && Date.now() - saida > CARENCIA_MS && !pendente) {
          setBloqueado(true);
        }
        /* A senha do aparelho também volta por esta Activity. Dar tempo para
           seu resultado chegar, em vez de cancelar uma confirmação válida.
           Se a promessa antiga persistir, o botão recupera sem matar o app. */
        if (saida !== null && pendente) {
          if (recuperacao.current !== null) clearTimeout(recuperacao.current);
          recuperacao.current = setTimeout(() => {
            recuperacao.current = null;
            if (tentativa.current === pendente) interromper('A confirmação foi interrompida. Toque em Desbloquear para tentar de novo.');
          }, 250);
        }
        saiuEm.current = null;
      } else if (estado === 'background') {
        if (recuperacao.current !== null) clearTimeout(recuperacao.current);
        recuperacao.current = null;
        saiuEm.current = Date.now();
      }
    });
    return () => sub.remove();
  }, [interromper]);

  const autenticar = useCallback((promptMessage: string): Promise<boolean> => {
    if (tentativa.current) return tentativa.current.promessa;
    let resolver!: (sucesso: boolean) => void;
    const promessa = new Promise<boolean>(resolve => { resolver = resolve; });
    const operacao = {
      promessa,
      nativa: null as ConfirmacaoNativa | null,
      terminar(sucesso: boolean, mensagem?: string) {
        if (tentativa.current !== operacao) return;
        tentativa.current = null;
        clearTimeout(timer);
        if (vivo.current) {
          setAutenticando(false);
          setErro(mensagem ?? null);
        }
        resolver(sucesso && vivo.current);
      },
    };
    tentativa.current = operacao;
    setAutenticando(true);
    setErro(null);
    const timer = setTimeout(() => {
      registrarFalha('confirmação excedeu o prazo');
      interromper('A confirmação demorou demais. Toque em Desbloquear para tentar de novo.');
    }, PRAZO_AUTENTICACAO_MS);
    void (async () => {
      try {
        await aguardarAnterior();
        if (tentativa.current !== operacao) return;
        operacao.nativa = abrirConfirmacao(promptMessage);
        const resultado = await operacao.nativa.promessa;
        if (tentativa.current !== operacao) return;
        if (resultado.success) operacao.terminar(true);
        else {
          registrarFalha('confirmação não foi concluída');
          operacao.terminar(false, 'A confirmação não foi concluída. Toque em Desbloquear para tentar de novo.');
          if (resultado.error === 'app_cancel' || resultado.error === 'invalid_context') {
            void cancelarNativo(operacao.nativa).catch(() => {
              registrarFalha('cancelamento da confirmação não respondeu');
              if (vivo.current && !tentativa.current && operacao.nativa && confirmacaoNativa === operacao.nativa) {
                setErro(reciboDaAnterior(operacao.nativa));
              }
            });
          }
        }
      } catch (erro) {
        if (tentativa.current !== operacao) return;
        registrarFalha('não foi possível abrir a confirmação');
        operacao.terminar(false, erro instanceof ConfirmacaoAnteriorPendente
          ? erro.recibo : 'Não consegui abrir a confirmação do aparelho. Toque em Desbloquear para tentar de novo.');
        if (operacao.nativa) void cancelarNativo(operacao.nativa).catch(() => {
          registrarFalha('cancelamento da confirmação não respondeu');
          if (vivo.current && !tentativa.current && operacao.nativa && confirmacaoNativa === operacao.nativa) {
            setErro(reciboDaAnterior(operacao.nativa));
          }
        });
      }
    })();
    return promessa;
  }, [interromper]);

  const desbloquear = useCallback(async () => {
    if (!preparado.current) {
      const ligado = await preparar();
      if (ligado === null) return false;
      if (!ligado) return true;
    }
    const sucesso = await autenticar('Desbloqueie o Grana.');
    if (sucesso && vivo.current) setBloqueado(false);
    return sucesso;
  }, [preparar, autenticar]);

  const alternar = useCallback(async () => {
    if (!disponivel) return;
    if (ativo) {
      /* Desligar a trava é, em si, uma ação protegida: sem exigir a
         autenticação aqui, quem pegasse o aparelho desbloqueado simplesmente
         desligaria a proteção. */
      if (!await autenticar('Confirme para desativar o bloqueio')) return;
      await AsyncStorage.setItem(CHAVE, '0');
      ativoAtual.current = false;
      setAtivo(false);
      setBloqueado(false);
      return;
    }
    await AsyncStorage.setItem(CHAVE, '1');
    ativoAtual.current = true;
    setAtivo(true);
  }, [ativo, disponivel, autenticar]);

  return (
    <AppLockContext value={{ ativo, bloqueado, disponivel, pronto, autenticando, erro, alternar, desbloquear }}>
      {children}
    </AppLockContext>
  );
}
