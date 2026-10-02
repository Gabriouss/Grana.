import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react';

type FaixaTopoContextValue = {
  visivel: boolean;
  faixas: ReadonlyMap<string, number>;
  registrar: (id: string, visivel: boolean, ordem: number) => void;
};

const contexto = createContext<FaixaTopoContextValue>({
  visivel: false,
  faixas: new Map(),
  registrar: () => {},
});

/** Estado compartilhado das faixas globais que ficam acima da navegação. */
export function FaixaTopoProvider({ children }: { children: ReactNode }) {
  const [faixas, setFaixas] = useState<Map<string, number>>(() => new Map());
  const registrar = useCallback((id: string, visivel: boolean, ordem: number) => {
    setFaixas((atuais) => {
      const proximas = new Map(atuais);
      const mudou = visivel ? proximas.get(id) !== ordem : proximas.delete(id);
      if (!mudou) return atuais;
      if (visivel) proximas.set(id, ordem);
      return proximas;
    });
  }, []);
  const valor = useMemo(() => ({ visivel: faixas.size > 0, faixas, registrar }), [faixas, registrar]);
  return <contexto.Provider value={valor}>{children}</contexto.Provider>;
}

export function useFaixaTopoVisivel() {
  return useContext(contexto).visivel;
}

/** Registra presença e devolve se esta faixa deve ocupar o inset do topo.
 * `ordem` acompanha a posição na árvore: atualização (0), falas (1).
 * Assim, dispensar a primeira transfere o inset para a seguinte. */
export function usePublicarFaixaTopo(visivel: boolean, ordem = 0) {
  const { registrar, faixas } = useContext(contexto);
  const id = useId();
  useEffect(() => {
    registrar(id, visivel, ordem);
    return () => registrar(id, false, ordem);
  }, [id, registrar, visivel, ordem]);
  return ![...faixas.values()].some((outraOrdem) => outraOrdem < ordem);
}
