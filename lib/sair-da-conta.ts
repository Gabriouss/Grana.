/**
 * A sequência de "Sair da conta", separada do contexto de autenticação para
 * poder ser testada com etapas que travam.
 *
 * ── Por que existe ──────────────────────────────────────────────────────────
 *
 * Até 19/09/2026 o `signOut` esperava, uma depois da outra e sem prazo, a
 * limpeza das vozes pendentes, o acesso guardado, o cache das telas e a
 * remoção do token push, e só no fim apagava a sessão. A remoção do token entra
 * na mesma fila do registro do push, que pode estar parada esperando o pedido
 * de permissão de notificação; bastou uma etapa não voltar para o botão "Sair"
 * fechar o diálogo e não fazer nada, nem depois de reabrir o app (achado A64
 * da auditoria no emulador).
 *
 * ── A regra ─────────────────────────────────────────────────────────────────
 *
 * Sair é deliberado e tem de acontecer sempre. Tudo antes de apagar a sessão
 * é cortesia: roda em paralelo, cada etapa com prazo próprio, e falha ou
 * demora vira log, nunca bloqueio. O que apaga a sessão do aparelho e tira a
 * pessoa da conta roda no `finally`, sem depender de nada acima.
 *
 * Pior caso: um prazo para a limpeza e outro para o servidor, em série. Com o
 * padrão de 4 s, a pessoa sai em no máximo 8 s, e a tela mostra que está
 * saindo durante esse tempo.
 */

export const PRAZO_ETAPA_SAIDA_MS = 4000;

export type EtapasDeSaida = {
  /** Dono da sessão atual, para limpar só as vozes dele. */
  idDoUsuario: () => Promise<string | null>;
  limparVozesDaConta: (userId: string) => Promise<void>;
  /** Síncrona: o widget some da tela inicial antes de qualquer espera. */
  limparWidgets: () => void;
  esquecerAcesso: () => Promise<void>;
  esquecerTelas: () => Promise<void>;
  /** O cache de leitura dos lançamentos, que vive fora do cache de telas. */
  esquecerLancamentosLocais: () => Promise<void>;
  /** Precisa do token ainda válido, por isso roda antes do `signOut` do servidor. */
  removerPush: () => Promise<void>;
  signOutNoServidor: () => Promise<void>;
  /** Estas duas são a saída de verdade. */
  esquecerSessaoDoDisco: () => Promise<void>;
  aplicarSaida: () => void;
  avisar?: (mensagem: string, erro: unknown) => void;
};

class PrazoEsgotado extends Error {
  constructor(etapa: string, ms: number) {
    super(`${etapa} não terminou em ${ms} ms`);
    this.name = 'PrazoEsgotado';
  }
}

/** Espera `promessa` até `ms`; estourar o prazo ou falhar vira aviso, nunca exceção. */
async function comPrazo<T>(
  etapa: string,
  promessa: () => Promise<T>,
  ms: number,
  avisar: (mensagem: string, erro: unknown) => void
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promessa(),
      new Promise<never>((_, rejeitar) => {
        timer = setTimeout(() => rejeitar(new PrazoEsgotado(etapa, ms)), ms);
      }),
    ]);
  } catch (erro) {
    avisar(`[sair] ${etapa} falhou ou demorou; a saída continua`, erro);
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function sairDaConta(etapas: EtapasDeSaida, prazoMs = PRAZO_ETAPA_SAIDA_MS): Promise<void> {
  const avisar = etapas.avisar ?? ((mensagem, erro) => console.warn(mensagem, erro));
  try {
    try {
      etapas.limparWidgets();
    } catch (erro) {
      avisar('[sair] limpar os widgets falhou; a saída continua', erro);
    }

    const userId = await comPrazo('ler o dono da sessão', etapas.idDoUsuario, prazoMs, avisar);
    await Promise.all([
      userId
        ? comPrazo('limpar as vozes pendentes', () => etapas.limparVozesDaConta(userId), prazoMs, avisar)
        : Promise.resolve(),
      comPrazo('esquecer o acesso guardado', etapas.esquecerAcesso, prazoMs, avisar),
      comPrazo('esquecer o cache das telas', etapas.esquecerTelas, prazoMs, avisar),
      comPrazo('esquecer os lançamentos guardados', etapas.esquecerLancamentosLocais, prazoMs, avisar),
      comPrazo('remover o token push', etapas.removerPush, prazoMs, avisar),
    ]);
    await comPrazo('sair no servidor', etapas.signOutNoServidor, prazoMs, avisar);
  } finally {
    /* Apagar o registro do disco aqui NÃO é redundância com o signOut do
       servidor. O `signOut` do auth-js começa chamando `getSession()` por
       dentro; sem rede e com o token vencido ele recebe o erro da renovação,
       devolve esse erro e volta sem apagar nada. E se ele travar, o prazo
       acima já soltou a espera. */
    try {
      await comPrazo('apagar a sessão do aparelho', etapas.esquecerSessaoDoDisco, prazoMs, avisar);
    } finally {
      etapas.aplicarSaida();
    }
  }
}
