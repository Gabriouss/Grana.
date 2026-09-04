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
};

const nativo = requireOptionalNativeModule<NativeGranaVoiceWidget>('GranaVoiceWidget');

export type EstadoWidgetVoz = 'ocioso' | 'ouvindo' | 'processando';

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
export function quantidadeInstalada(): number {
  if (!nativo) return 0;
  try {
    return nativo.quantidadeInstalada();
  } catch {
    return 0;
  }
}

/** O launcher desta pessoa aceita "adicionar widget" por botão? */
export function podeFixar(): boolean {
  if (!nativo) return false;
  try {
    return nativo.podeFixar();
  } catch {
    return false;
  }
}

/** Pede ao launcher pra adicionar o widget. `false` = não deu, oriente o gesto manual. */
export function fixarNaTelaInicial(): boolean {
  if (!nativo) return false;
  try {
    return nativo.fixarNaTelaInicial();
  } catch {
    return false;
  }
}
