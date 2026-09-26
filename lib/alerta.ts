import type { AlertButton, AlertOptions } from 'react-native';

export type AlertaPedido = {
  id: number;
  title: string | null | undefined;
  message?: string | null;
  buttons: AlertButton[];
  options?: AlertOptions;
};

type Listener = () => void;

let proximoId = 1;
let fila: AlertaPedido[] = [];
const listeners = new Set<Listener>();

function avisarMudanca() {
  for (const listener of listeners) listener();
}

export function assinarAlertas(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function obterAlertaAtual() {
  return fila[0];
}

function removerAlerta(pedido: AlertaPedido) {
  if (fila[0]?.id !== pedido.id) return false;
  fila = fila.slice(1);
  avisarMudanca();
  return true;
}

/** Fecha o alerta sem escolher uma ação, como voltar, Escape ou tocar fora. */
export function dispensarAlerta(id: number) {
  const pedido = fila[0];
  if (!pedido || pedido.id !== id) return false;
  if (!removerAlerta(pedido)) return false;
  pedido.options?.onDismiss?.();
  return true;
}

/** Escolhe um botão exatamente uma vez e libera o próximo alerta da fila. */
export function pressionarAlerta(id: number, indice: number) {
  const pedido = fila[0];
  if (!pedido || pedido.id !== id) return false;
  const botao = pedido.buttons[indice];
  if (!botao) return false;
  if (!removerAlerta(pedido)) return false;
  botao.onPress?.();
  pedido.options?.onDismiss?.();
  return true;
}

/**
 * Substituto visual do Alert.alert. A assinatura segue a do React Native para
 * que a migração altere só a origem do import, sem reescrever os fluxos.
 */
export const Alert = {
  alert(
    title: string | null | undefined,
    message?: string | null,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ) {
    fila = [
      ...fila,
      {
        id: proximoId++,
        title,
        message,
        buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
        options,
      },
    ];
    avisarMudanca();
  },
};
