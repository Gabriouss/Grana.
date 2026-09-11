import { createContext, use, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useSession } from './auth-context';
import { guardarFlags, lerFlagsGuardadas } from './flags-cache';
import { supabase } from './supabase';
import { COLUNAS_FLAG, efetivamenteLigado, type ChaveFlag, type Flag } from './feature-flags-regras';

/**
 * Provider dos interruptores remotos. A REGRA de ligado/desligado mora em
 * `feature-flags-regras.ts`, que não importa React nem React Native para
 * poder ser testada em node puro — aqui fica só o que precisa do React.
 *
 * Falha ABERTA: ver o cabeçalho de `feature-flags-regras.ts`.
 */

export { efetivamenteLigado, COLUNAS_FLAG } from './feature-flags-regras';
export type { ChaveFlag, Flag, Severidade } from './feature-flags-regras';

type FlagsContextValue = {
  /** `true` quando a funcionalidade pode ser usada. Falha ABERTA. */
  ligado: (chave: ChaveFlag) => boolean;
  /** A linha inteira, para quem precisa do texto do aviso. */
  flag: (chave: ChaveFlag) => Flag | null;
  /** Flags desligados COM mensagem — a fila do pop-up de aviso. */
  avisosAtivos: Flag[];
  recarregar: () => Promise<void>;
};

const FlagsContext = createContext<FlagsContextValue | null>(null);

export function useFlags() {
  const value = use(FlagsContext);
  if (!value) throw new Error('useFlags precisa estar dentro de FlagsProvider');
  return value;
}

export function FlagsProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const [flags, setFlags] = useState<Record<string, Flag>>({});

  const recarregar = useCallback(async () => {
    if (!session) return;
    try {
      const { data, error } = await supabase.from('feature_flags').select(COLUNAS_FLAG);
      if (error) throw error;
      const mapa: Record<string, Flag> = {};
      for (const linha of (data ?? []) as Flag[]) mapa[linha.key] = linha;
      setFlags(mapa);
      void guardarFlags(mapa);
    } catch {
      /* FALHA ABERTA — ver o cabeçalho do arquivo. Sem resposta, o mapa fica
         como está e `ligado()` devolve true para chave desconhecida.

         Quem cobre o buraco que isso abria sem rede é o cache lido no efeito
         abaixo: sem ele, o mapa ficava VAZIO offline e todo interruptor
         remoto voltava a ligado — inclusive o do WhatsApp, um canal desligado
         por estar banido na Meta e que reapareceu num teste em modo avião. */
    }
  }, [session]);

  /* O último mapa confirmado entra ANTES da rede, e só enquanto não houver
     resposta boa. Offline é ele que decide; online ele é sobrescrito em
     seguida pelo mapa fresco. A falha aberta continua valendo para quem nunca
     conseguiu ler as flags neste aparelho, que é quando desligar tudo seria
     pior que o contrário. */
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const guardado = await lerFlagsGuardadas();
      if (!vivo || !guardado) return;
      setFlags((atual) => (Object.keys(atual).length > 0 ? atual : guardado));
    })();
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  /* Recarrega ao voltar do background. Sem isto, quem deixa o app aberto no
     bolso só veria o flag mudar na próxima abertura fria — e o valor de um
     interruptor remoto é justamente alcançar as pessoas rápido. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') recarregar();
    });
    return () => sub.remove();
  }, [recarregar]);

  const valor = useMemo<FlagsContextValue>(() => {
    const versao = Constants.expoConfig?.version ?? '0.0.0';
    const plataforma = Platform.OS;
    const avaliar = (f: Flag) => efetivamenteLigado(f, versao, plataforma);

    return {
      ligado: (chave) => {
        const f = flags[chave];
        return f ? avaliar(f) : true; // chave desconhecida = ligada
      },
      flag: (chave) => flags[chave] ?? null,
      avisosAtivos: Object.values(flags).filter((f) => !avaliar(f) && !!f.mensagem),
      recarregar,
    };
  }, [flags, recarregar]);

  return <FlagsContext value={valor}>{children}</FlagsContext>;
}
