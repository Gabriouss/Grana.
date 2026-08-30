import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { vincularAssinaturasPendentes } from './assinatura';
import { useSession } from './auth-context';
import { supabase } from './supabase';

export type EstadoAcesso = {
  enforced: boolean;
  active: boolean;
  allowed: boolean;
  status: string | null;
  access_until: string | null;
  grace_until: string | null;
};

type EntitlementContextValue = {
  estado: EstadoAcesso | null;
  carregando: boolean;
  recarregar: () => Promise<void>;
};

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function useEntitlement() {
  const value = use(EntitlementContext);
  if (!value) throw new Error('useEntitlement precisa estar dentro de EntitlementProvider');
  return value;
}

export function EntitlementProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const [estado, setEstado] = useState<EstadoAcesso | null>(null);
  const [carregando, setCarregando] = useState(false);

  const recarregar = useCallback(async () => {
    if (!session) {
      setEstado(null);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    try {
      await vincularAssinaturasPendentes();
      const { data, error } = await supabase.rpc('obter_estado_acesso');
      if (error) throw error;
      setEstado(data as unknown as EstadoAcesso);
    } catch {
      // Falha fechada: o backend aplica a mesma regra no RLS, então liberar a
      // navegação aqui só produziria telas vazias e tentativas negadas.
      setEstado({
        enforced: true,
        active: false,
        allowed: false,
        status: null,
        access_until: null,
        grace_until: null,
      });
    } finally {
      setCarregando(false);
    }
  }, [session]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return (
    <EntitlementContext value={{ estado, carregando, recarregar }}>
      {children}
    </EntitlementContext>
  );
}
