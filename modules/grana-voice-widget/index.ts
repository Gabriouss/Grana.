import { Platform, requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Widget 1x1 de lançamento por voz (só Android).
 *
 * `requireOptionalNativeModule` e não `requireNativeModule`: no iOS, na web e
 * dentro do Expo Go o módulo simplesmente não existe, e um require obrigatório
 * derrubaria qualquer tela que importasse este arquivo. Sem módulo, todas as
 * funções abaixo respondem "não dá" em vez de lançar.
 */
type NativeGranaVoiceWidget = {
  estadoAtual(): string;
  definirEstado(estado: string): void;
  quantidadeInstalada(): number;
  podeFixar(): boolean;
  fixarNaTelaInicial(): boolean;
  quantidadeInstaladaPorTipo(tipo: string): number;
  fixarPorTipo(tipo: string): boolean;
  atualizarSnapshot(json: string): void;
  limparSnapshot(): void;
  garantirUsuario(userId: string): void;
  definirPrivacidade(hidden: boolean): void;
  redesenharTodos(): void;
};

const nativo = requireOptionalNativeModule<NativeGranaVoiceWidget>('GranaVoiceWidget');

/**
 * `atencao` é o único estado que NÃO se resolve sozinho: falta algo que só
 * uma tela concede (hoje, permissão de notificação). Ele fica na tela inicial
 * até alguém tocar, e o toque abre o app em vez do microfone.
 */
export type EstadoWidgetVoz = 'ocioso' | 'ouvindo' | 'processando' | 'atencao';
export type TipoWidget = 'voz' | 'livre' | 'central' | 'compromisso' | 'cofrinho';

/** O widget existe nesta plataforma/build? */
export const widgetDisponivel = Platform.OS === 'android' && nativo != null;

export function estadoAtual(): EstadoWidgetVoz {
  if (!nativo) return 'ocioso';
  try {
    return (nativo.estadoAtual() as EstadoWidgetVoz) ?? 'ocioso';
  } catch {
    return 'ocioso';
  }
}

/** Devolve o widget ao desenho de repouso (ou ao estado que se queira mostrar). */
export function definirEstado(estado: EstadoWidgetVoz): void {
  if (!nativo) return;
  try {
    nativo.definirEstado(estado);
  } catch {
    // Widget removido da tela inicial no meio do caminho — não é erro.
  }
}

/** Quantas cópias do widget estão na tela inicial. */
export function quantidadeInstalada(tipo: TipoWidget = 'voz'): number {
  if (!nativo) return 0;
  try {
    return tipo === 'voz' ? nativo.quantidadeInstalada() : nativo.quantidadeInstaladaPorTipo(tipo);
  } catch {
    return 0;
  }
}

/** O launcher desta pessoa aceita "adicionar widget" por botão? */
export function podeFixar(_tipo: TipoWidget = 'voz'): boolean {
  if (!nativo) return false;
  try {
    return nativo.podeFixar();
  } catch {
    return false;
  }
}

/** Pede ao launcher pra adicionar o widget. `false` = não deu, oriente o gesto manual. */
export function fixarNaTelaInicial(tipo: TipoWidget = 'voz'): boolean {
  if (!nativo) return false;
  try {
    return tipo === 'voz' ? nativo.fixarNaTelaInicial() : nativo.fixarPorTipo(tipo);
  } catch {
    return false;
  }
}

export function atualizarSnapshot(snapshot: unknown): void {
  if (!nativo) return;
  try {
    nativo.atualizarSnapshot(JSON.stringify(snapshot));
  } catch {
    // O último snapshot válido continua sendo melhor que trocar por zeros.
  }
}

export function limparSnapshot(): void {
  if (!nativo) return;
  try {
    nativo.limparSnapshot();
  } catch {}
}

/** Remove o snapshot somente se ele pertencer a outra conta. */
export function garantirUsuario(userId: string): void {
  if (!nativo) return;
  try {
    nativo.garantirUsuario(userId);
  } catch {}
}

/** Privacidade é independente da rede: esconder precisa ser imediato. */
export function definirPrivacidade(hidden: boolean): void {
  if (!nativo) return;
  try {
    nativo.definirPrivacidade(hidden);
  } catch {}
}

export function redesenharTodos(): void {
  if (!nativo) return;
  try {
    nativo.redesenharTodos();
  } catch {}
}
