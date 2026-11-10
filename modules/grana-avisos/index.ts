import { Platform, requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Leitura de avisos do banco (só Android). Sem o módulo (iOS, web, Expo Go),
 * `avisosDisponivel` é false e nenhuma função lança por isso.
 */
type NativeGranaAvisos = {
  estado(): string;
  recuperarConexao(): string;
  addListener?(evento: string, fn: () => void): { remove(): void };
  definirDono(dono: string | null): void;
  garantirListaInicial(pacotes: string[]): void;
  listarApps(): string;
  definirApp(pacote: string, ligado: boolean): void;
  lerDiario(): Promise<string>;
  apagarDiario(): Promise<void>;
  limparTudo(): Promise<void>;
  abrirAcesso(): void;
  definirAceite(aceito: boolean): void;
  abrirInformacoesDoApp(): void;
};

const nativo = requireOptionalNativeModule<NativeGranaAvisos>('GranaAvisos');

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
export function definirDonoAvisos(dono: string | null): void {
  nativo?.definirDono(dono);
}
export function garantirListaInicialAvisos(pacotes: string[]): void {
  nativo?.garantirListaInicial(pacotes);
}
export function listarAppsAvisos(): AppQueNotificou[] {
  return nativo ? JSON.parse(nativo.listarApps()) : [];
}
export function definirAppAvisos(pacote: string, ligado: boolean): void {
  nativo?.definirApp(pacote, ligado);
}
/** Rejeita se a leitura falhar: erro de disco não é a mesma coisa que diário vazio. */
export async function lerDiarioAvisos(): Promise<LeituraDoDiario> {
  if (!nativo) return { itens: [], ilegiveis: 0 };
  return JSON.parse(await nativo.lerDiario());
}
export async function apagarDiarioAvisos(): Promise<void> {
  await nativo?.apagarDiario();
}
export async function limparTudoAvisos(): Promise<void> {
  await nativo?.limparTudo();
}
export function abrirAcessoAvisos(): void {
  nativo?.abrirAcesso();
}
export function definirAceiteAvisos(aceito: boolean): void {
  nativo?.definirAceite(aceito);
}
export function abrirInformacoesDoAppAvisos(): void {
  nativo?.abrirInformacoesDoApp();
}
