import { Platform, requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Leitura de avisos do banco (só Android). Sem o módulo (iOS, web, Expo Go),
 * `avisosDisponivel` é false e nenhuma função lança por isso.
 */
type NativeGranaAvisos = {
  estado(): string;
  recuperarConexao(): string;
  addListener?(evento: string, fn: () => void): { remove(): void };
  definirDono(dono: string | null): Promise<void>;
  garantirListaInicial(pacotes: string[]): Promise<void>;
  listarApps(): string;
  definirApp(pacote: string, ligado: boolean): Promise<void>;
  lerDiario(): Promise<string>;
  apagarDiario(): Promise<void>;
  limparTudo(): Promise<void>;
  abrirAcesso(): void;
  definirAceite(aceito: boolean): Promise<void>;
  abrirInformacoesDoApp(): void;
};

const nativo = requireOptionalNativeModule<NativeGranaAvisos>('GranaAvisos');

let fila: Promise<unknown> = Promise.resolve();
let donoPedido: string | null | undefined;
let geracao = 0;
let donoConfirmado = -1;

/** A versão muda no pedido de troca, antes de qualquer espera de disco. */
export const sessaoDosAvisos = (): number => geracao;
export const mesmaSessaoDosAvisos = (origem: number): boolean => origem === geracao;

function conferirSessao(origem: number): void {
  if (!mesmaSessaoDosAvisos(origem)) throw new Error('conta_dos_avisos_mudou');
}

function naVez<T>(acao: () => Promise<T>): Promise<T> {
  const resultado = fila.then(acao, acao);
  // A falha volta ao chamador; apenas a continuação da fila é recuperada.
  fila = resultado.catch(() => undefined);
  return resultado;
}

function configurar(acao: () => Promise<void> | undefined): Promise<void> {
  const origem = geracao;
  return naVez(async () => {
    conferirSessao(origem);
    await acao();
    conferirSessao(origem);
  });
}

/** Não troca o diário nativo enquanto uma caixa ainda lê para seu dono.
 * Uma leitura que esperou na fila também não pode começar depois da troca. */
export function naContaDosAvisos<T>(dono: string, ler: () => Promise<T>): Promise<T> {
  const origem = geracao;
  return naVez(async () => {
    conferirSessao(origem);
    if (donoPedido !== dono || donoConfirmado !== origem) throw new Error('dono_dos_avisos_nao_confirmado');
    const resultado = await ler();
    conferirSessao(origem);
    return resultado;
  });
}

export const avisosDisponivel = Platform.OS === 'android' && !!nativo;

export type EstadoAvisos = {
  acesso: boolean;
  aceite: boolean;
  conectado: boolean;
  recuperando: boolean;
  falhaConexao: string | null;
  ultimoSinal: number;
  desconectadoEm: number;
  ultimaFalha: string | null;
};
export type AppQueNotificou = {
  pacote: string;
  nome: string | null;
  ligado: boolean;
  contagem: number;
  ultimo: number;
};
export type AvisoDoDiario = {
  id: string;
  pacote: string;
  chave: string;
  quando: number;
  titulo: string;
  texto: string;
};
export type LeituraDoDiario = { itens: AvisoDoDiario[]; ilegiveis: number };

export function estadoAvisos(): EstadoAvisos {
  if (!nativo) return { acesso: false, aceite: false, conectado: false, recuperando: false, falhaConexao: null, ultimoSinal: 0, desconectadoEm: 0, ultimaFalha: null };
  return JSON.parse(nativo.estado());
}
export function recuperarConexaoAvisos(): EstadoAvisos {
  if (!nativo) return estadoAvisos();
  return JSON.parse(nativo.recuperarConexao());
}
export function observarEstadoAvisos(aoMudar: (estado: EstadoAvisos) => void, aoFalhar?: () => void): () => void {
  const evento = nativo?.addListener?.('estadoAlterado', () => {
    try { aoMudar(estadoAvisos()); }
    catch (erro) {
      console.error('[avisos] conexão não foi lida', erro instanceof Error ? erro.name : 'erro');
      aoFalhar?.();
    }
  });
  return () => evento?.remove();
}
export function definirDonoAvisos(dono: string | null): Promise<void> {
  if (donoPedido !== dono) { donoPedido = dono; geracao++; donoConfirmado = -1; }
  const origem = geracao;
  return configurar(async () => {
    await nativo?.definirDono(dono);
    conferirSessao(origem);
    donoConfirmado = origem;
  });
}
export function garantirListaInicialAvisos(pacotes: string[]): Promise<void> {
  return configurar(() => nativo?.garantirListaInicial(pacotes));
}
export function listarAppsAvisos(): AppQueNotificou[] {
  return nativo ? JSON.parse(nativo.listarApps()) : [];
}
export function definirAppAvisos(pacote: string, ligado: boolean): Promise<void> {
  return configurar(() => nativo?.definirApp(pacote, ligado));
}
/** Rejeita se a leitura falhar: erro de disco não é a mesma coisa que diário vazio. */
export async function lerDiarioAvisos(): Promise<LeituraDoDiario> {
  if (!nativo) return { itens: [], ilegiveis: 0 };
  const origem = geracao;
  if (donoPedido !== undefined && donoConfirmado !== origem) throw new Error('dono_dos_avisos_nao_confirmado');
  const resultado = JSON.parse(await nativo.lerDiario());
  conferirSessao(origem);
  return resultado;
}
export async function apagarDiarioAvisos(): Promise<void> {
  await configurar(() => nativo?.apagarDiario());
}
export async function limparTudoAvisos(): Promise<void> {
  donoPedido = undefined;
  donoConfirmado = -1;
  geracao++;
  await configurar(() => nativo?.limparTudo());
}
export function abrirAcessoAvisos(): void {
  nativo?.abrirAcesso();
}
export function definirAceiteAvisos(aceito: boolean): Promise<void> {
  return configurar(() => nativo?.definirAceite(aceito));
}
export function abrirInformacoesDoAppAvisos(): void {
  nativo?.abrirInformacoesDoApp();
}
