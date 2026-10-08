import { reciboLocal } from './admin-web';

// O mesmo prazo cobre todas as etapas de um gesto. O SDK Auth não recebe
// AbortSignal: descartamos sua resposta tardia e não iniciamos a próxima etapa.
export function criarPrazoAdmin(ms = 15_000) {
  const fim = Date.now() + ms;
  let encerrado = false;
  return {
    encerrar() { encerrado = true; },
    async aguardar<T>(iniciar: () => Promise<T>): Promise<T> {
      const restante = fim - Date.now();
      const erro = () => reciboLocal('prazo', 'A resposta demorou demais. Tente de novo.');
      if (encerrado || restante <= 0) throw erro();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([Promise.resolve().then(() => {
          if (encerrado) throw erro();
          return iniciar();
        }), new Promise<never>((_, reject) => {
          timer = setTimeout(() => { encerrado = true; reject(erro()); }, restante);
        })]);
      } finally { clearTimeout(timer); }
    },
  };
}
export type PrazoAdmin = ReturnType<typeof criarPrazoAdmin>;
