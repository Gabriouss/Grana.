import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react';

type FaixaTopoContextValue = {
  visivel: boolean;
  registrar: (id: string, visivel: boolean) => void;
};

const contexto = createContext<FaixaTopoContextValue>({
  visivel: false,
  registrar: () => {},
});

/** Estado compartilhado das faixas globais que ficam acima da navegação. */
export function FaixaTopoProvider({ children }: { children: ReactNode }) {
  const [faixas, setFaixas] = useState<Set<string>>(() => new Set());
  const registrar = useCallback((id: string, visivel: boolean) => {
    setFaixas((atuais) => {
      const proximas = new Set(atuais);
      const mudou = visivel ? !proximas.has(id) : proximas.delete(id);
      if (!mudou) return atuais;
      if (visivel) proximas.add(id);
      return proximas;
    });
  }, []);
  const valor = useMemo(() => ({ visivel: faixas.size > 0, registrar }), [faixas, registrar]);
  return <contexto.Provider value={valor}>{children}</contexto.Provider>;
}

export function useFaixaTopoVisivel() {
  return useContext(contexto).visivel;
}

/** Registra uma faixa global sem permitir que duas faixas se desliguem entre si. */
export function usePublicarFaixaTopo(visivel: boolean) {
  const { registrar } = useContext(contexto);
  const id = useId();
  useEffect(() => {
    registrar(id, visivel);
    return () => registrar(id, false);
  }, [id, registrar, visivel]);
}
