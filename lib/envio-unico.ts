/**
 * Impede dois envios ao mesmo tempo no mesmo formulário.
 *
 * O botão "Entrar" some atrás de `disabled={loading}`, mas o Enter do teclado
 * chama `onSubmitEditing` direto e não passa pelo botão. E `loading` é estado:
 * dois Enter seguidos leem o mesmo valor antigo antes de o React re-renderizar.
 * O ferrolho é uma `useRef` da tela (`trava`), que muda no mesmo instante da
 * chamada e sobrevive às re-renderizações (cada render cria um handler novo, e
 * um ferrolho dentro dele nasceria solto de novo). Solta sempre que o envio
 * termina, inclusive por erro.
 */
export function envioUnico<A extends unknown[]>(
  trava: { current: boolean },
  enviar: (...args: A) => Promise<void>
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    if (trava.current) return;
    trava.current = true;
    try {
      await enviar(...args);
    } finally {
      trava.current = false;
    }
  };
}
