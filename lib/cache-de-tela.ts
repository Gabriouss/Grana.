import AsyncStorage from '@react-native-async-storage/async-storage';
import { idDoUsuarioLocal } from './sessao-offline';

/**
 * Cache de leitura por tela, para o app inteiro continuar servindo enquanto
 * não há rede.
 *
 * ── Por que existe ─────────────────────────────────────────────────────────
 *
 * `lib/offline-cache.ts` resolveu isso só para lançamentos, e só a tela de
 * Lançamentos consumia. Auditado em 10/09/2026, sem rede as outras cinco telas
 * (Início, Crédito, Boletos, Gráficos, Desafios) caíam num `catch` que fazia
 * `setError(...)` e desenhava uma linha de texto sobre nada. A pior era a
 * Início, que é a tela que abre e onde mora o "Livre para Gastar".
 *
 * ── Por que envolve os BUSCADORES, e não as telas ──────────────────────────
 *
 * São 43 chamadas de `fetch*` espalhadas pelas telas. Dar cache a cada uma
 * seria a mesma correção escrita cinco vezes, e a sexta tela nasceria sem —
 * que é exatamente como a situação atual apareceu. Envolvendo o buscador, o
 * ponto por onde todas passam, a tela não precisa saber que existe cache.
 *
 * ── A regra que este arquivo NÃO quebra ────────────────────────────────────
 *
 * Só erro de REDE cai para o cache. Falha permanente (RPC que não existe,
 * coluna removida, RLS negando) continua estourando, alto. A regra 9 do
 * AGENTS.md nasceu de um `catch` que transformou um `PGRST202` em estado
 * benigno e deixou o lançamento por voz fora do ar por dias; devolver dado
 * velho no lugar de um erro permanente é o mesmo defeito com outra roupa.
 */

/**
 * Separa "sem conexão" de erro de verdade (validação, RLS, sessão expirada).
 *
 * Morava em `offline-cache.ts`. Mudou de casa para quebrar um ciclo de import:
 * `data.ts` passou a depender deste arquivo, e `offline-cache.ts` já dependia
 * de `data.ts`. `offline-cache.ts` reexporta daqui, então nenhum chamador
 * precisou mudar.
 *
 * O supabase-js repassa a falha crua do `fetch` do RN quando não há rede, e
 * essas são as mensagens que aparecem nesse caso — sem checagem nativa de
 * conectividade à disposição, é o sinal mais confiável sem módulo nativo novo.
 */
export function isLikelyNetworkError(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e ?? '').toLowerCase();
  return msg.includes('network') || msg.includes('fetch') || msg.includes('conex') || msg.includes('timeout');
}

const PREFIXO = 'grana:cache:tela:';

type Registro<T> = { userId: string; dados: T; guardadoEm: string };

/**
 * Id do usuário pela sessão LOCAL.
 *
 * `getUser` bate no servidor para validar; num módulo cujo propósito inteiro é
 * funcionar sem rede, usar `getUser` seria a piada pronta. Mas `getSession`
 * também não é a leitura de disco que este comentário afirmava ser: com o
 * token de acesso vencido ele tenta RENOVAR antes de responder, e sem rede a
 * renovação falha e a resposta vem vazia. O efeito era exatamente o oposto do
 * propósito do módulo — passado o prazo do token, o cache de TODAS as telas
 * ficava ilegível e ilegravel justamente por falta de internet, com os dados
 * intactos no disco a um `getItem` de distância. Corrigido em 11/09/2026.
 *
 * A queda para o disco não afrouxa nada: o id só decide de quem é o cache
 * local, e toda leitura do servidor continua passando pelo RLS.
 */
const idDoUsuario = idDoUsuarioLocal;

export async function guardarTela<T>(nome: string, dados: T): Promise<void> {
  try {
    const userId = await idDoUsuario();
    if (!userId) return;
    const registro: Registro<T> = { userId, dados, guardadoEm: new Date().toISOString() };
    await AsyncStorage.setItem(PREFIXO + nome, JSON.stringify(registro));
  } catch {
    /* Best-effort: aparelho sem espaço volta ao comportamento antigo (tela
       vazia sem rede), que é degradação conhecida, não quebra nova. */
  }
}

/** Devolve o guardado, e só se pertencer a ESTA conta. */
export async function lerTela<T>(nome: string): Promise<{ dados: T; guardadoEm: string } | null> {
  try {
    const userId = await idDoUsuario();
    if (!userId) return null;
    const bruto = await AsyncStorage.getItem(PREFIXO + nome);
    if (!bruto) return null;
    const registro = JSON.parse(bruto) as Registro<T> | null;
    /* Trocar de conta no mesmo aparelho não pode mostrar o dinheiro da conta
       anterior. Mesmo cuidado de `entitlement-cache.ts`. */
    if (!registro || registro.userId !== userId) return null;
    return { dados: registro.dados, guardadoEm: registro.guardadoEm };
  } catch {
    return null;
  }
}

/** Some com tudo — usar ao sair da conta. */
export async function esquecerTelas(): Promise<void> {
  try {
    const chaves = await AsyncStorage.getAllKeys();
    const nossas = chaves.filter((k) => k.startsWith(PREFIXO));
    if (nossas.length > 0) await AsyncStorage.multiRemove(nossas);
  } catch {
    /* idem */
  }
}

/* ── Sinal de "estou servindo dado velho" ───────────────────────────────────
   A tela precisa poder dizer isso a quem está olhando. Sem o sinal, o app
   mostraria saldo de ontem com a mesma cara de saldo de agora, que é pior do
   que mostrar erro: some o dado E some o aviso de que ele está velho. */

/* O MOTIVO importa tanto quanto o fato. Até 12/09/2026 havia um booleano só,
   e a faixa dizia "Sem conexão" nos dois casos. Filmado nesse dia: celular com
   Wi-Fi e 5G, todas as requisições chegando ao servidor e voltando com 200, e o
   app afirmando que não havia internet. A rede estava LENTA (quase 30 segundos
   até a requisição sair do aparelho), não ausente. Dizer "sem conexão" a quem
   está conectado faz a pessoa desconfiar do próprio celular em vez do app. */
export type MotivoOffline = 'sem-rede' | 'lento';

let motivoAtual: MotivoOffline | null = null;
const ouvintes = new Set<(offline: boolean) => void>();

export function estaServindoDoCache(): boolean {
  return motivoAtual !== null;
}

/** Por que a tela está no dado guardado: rede falhou, ou só demorou. */
export function motivoDoModoOffline(): MotivoOffline | null {
  return motivoAtual;
}

export function assinarModoOffline(ouvinte: (offline: boolean) => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

function definirModo(motivo: MotivoOffline | null) {
  if (motivoAtual === motivo) return;
  motivoAtual = motivo;
  for (const ouvinte of ouvintes) ouvinte(motivo !== null);
}

/* ── Dado que chegou atrasado ────────────────────────────────────────────────
   Quando a resposta perde a corrida do prazo mas chega depois com sucesso, a
   tela ainda está mostrando o disco. Antes, o dado novo ia só para o disco e o
   aviso ficava aceso até uma próxima busca vencer o prazo, o que numa rede
   lenta nunca acontece: puxar para atualizar refazia a mesma corrida, perdia
   de novo, e a faixa não saía nunca. Era o laço do vídeo.

   Agora o dado atrasado fica em memória por alguns segundos e as telas são
   avisadas para recarregar. A recarga encontra o dado aqui e devolve na hora,
   sem correr contra rede nenhuma, então ela funciona mesmo que a rede continue
   lenta. */
const VALIDADE_DO_DADO_ATRASADO_MS = 15_000;
const atrasados = new Map<string, { dados: unknown; em: number }>();
const ouvintesDeDadoNovo = new Set<() => void>();
let avisoPendente: ReturnType<typeof setTimeout> | undefined;

export function assinarDadoNovo(ouvinte: () => void): () => void {
  ouvintesDeDadoNovo.add(ouvinte);
  return () => ouvintesDeDadoNovo.delete(ouvinte);
}

function avisarDadoNovo() {
  /* Uma tela abre com várias buscas em paralelo (lançamentos, contas, metas),
     e numa rede lenta as respostas atrasadas chegam quase juntas. Agrupar num
     aviso só evita a tela recarregar três vezes seguidas. */
  if (avisoPendente) clearTimeout(avisoPendente);
  avisoPendente = setTimeout(() => {
    avisoPendente = undefined;
    for (const ouvinte of ouvintesDeDadoNovo) ouvinte();
  }, 250);
}

/**
 * Envolve um buscador para que ele grave o que trouxe e devolva o guardado
 * quando a REDE falhar.
 *
 * `chaveDoArgumento` existe para buscadores que dependem do que recebem —
 * `fetchBills({status})` e `fetchCreditTransactionsForMonth(ano, mes)` devolvem
 * coisas diferentes por argumento, e um cache só sob o nome da função serviria
 * a fatura de março quando a pessoa abrisse abril.
 */
/* Quanto a tela espera a rede antes de servir o que já está no disco.
   Rede AUSENTE devolve erro em milissegundos e nunca chega aqui. Este prazo
   existe para a rede que ACEITA a conexão e não responde — Wi-Fi de hotel,
   portal de captura, sinal de um traço —, em que o `fetch` do React Native
   fica pendurado até o tempo do sistema operacional, de um minuto para cima.
   Sem este corte, um app que tinha os dados no disco ficava a mesma eternidade
   numa tela de carregamento, e a queixa que chegou foi exatamente essa.
   Quatro segundos é folgado para qualquer resposta sadia e curto o bastante
   para não parecer travamento. */
const PRAZO_ATE_SERVIR_DO_CACHE_MS = 4_000;

type Desfecho<T> = { ok: true; dados: T } | { ok: false; erro: unknown };

export function comCacheOffline<A extends unknown[], T>(
  nome: string,
  buscar: (...args: A) => Promise<T>,
  /* `NoInfer` é obrigatório aqui. Sem ele, a seta passada como chave também
     participa da inferência de `A`, e como `(opts) => ...` tem parâmetro
     OBRIGATÓRIO, `fetchTransactions(opts?)` perdia a optionalidade: dez
     chamadas legítimas sem argumento passaram a não compilar. Só o buscador
     decide a forma de `A`. */
  chaveDoArgumento?: (...args: NoInfer<A>) => string
): (...args: A) => Promise<T> {
  return async (...args: A): Promise<T> => {
    const chave = chaveDoArgumento ? `${nome}:${chaveDoArgumento(...args)}` : nome;

    /* Dado que acabou de chegar atrasado: vale mais que qualquer corrida. É o
       que permite à recarga disparada por `avisarDadoNovo` mostrar o dado novo
       e apagar a faixa mesmo com a rede ainda lenta. Não é apagado ao ser
       lido, porque telas diferentes pedem a mesma chave (`fetchTransactions`
       serve Início, Lançamentos e Gráficos). */
    const atrasado = atrasados.get(chave);
    if (atrasado && Date.now() - atrasado.em < VALIDADE_DO_DADO_ATRASADO_MS) {
      definirModo(null);
      return atrasado.dados as T;
    }

    /* Mapear para um objeto, em vez de deixar rejeitar, é o que permite
       correr contra o prazo sem criar rejeição não tratada quando a resposta
       lenta chega depois de a tela já ter sido servida. */
    const pedido: Promise<Desfecho<T>> = buscar(...args).then(
      (dados) => ({ ok: true as const, dados }),
      (erro) => ({ ok: false as const, erro }),
    );

    let cortar: ReturnType<typeof setTimeout> | undefined;
    const prazo = new Promise<'prazo'>((resolve) => {
      cortar = setTimeout(() => resolve('prazo'), PRAZO_ATE_SERVIR_DO_CACHE_MS);
    });
    const primeiro = await Promise.race([pedido, prazo]).finally(() => clearTimeout(cortar));

    if (primeiro !== 'prazo') return concluir(primeiro);

    /* Estourou o prazo. Servir o disco só vale se houver disco: sem nada
       guardado, esperar a resposta de verdade continua sendo melhor que
       inventar uma lista vazia, que diria à pessoa que ela não tem
       lançamento nenhum. */
    const guardado = await lerTela<T>(chave);
    if (!guardado) return concluir(await pedido);

    definirModo('lento');
    /* A resposta continua a caminho. Quando chegar, o dado fresco vai para o
       disco, para a próxima abertura já nascer atual. O aviso de "dado
       velho" NÃO é apagado aqui: a tela em cima da mão de quem lê continua
       mostrando o que veio do disco, e dizer que está atualizada seria
       mentira. Falha permanente que chega atrasada deixa recibo no log, em
       vez de sumir junto com a promessa. */
    void pedido.then(async (tardio) => {
      if (tardio.ok) {
        await guardarTela(chave, tardio.dados);
        atrasados.set(chave, { dados: tardio.dados, em: Date.now() });
        avisarDadoNovo();
        return;
      }
      if (!isLikelyNetworkError(tardio.erro)) {
        console.error('[cache-de-tela] falha permanente depois do prazo', nome, tardio.erro);
      }
    });
    return guardado.dados;

    async function concluir(desfecho: Desfecho<T>): Promise<T> {
      if (desfecho.ok) {
        await guardarTela(chave, desfecho.dados);
        definirModo(null);
        return desfecho.dados;
      }
      if (!isLikelyNetworkError(desfecho.erro)) throw desfecho.erro;
      const doDisco = await lerTela<T>(chave);
      /* Sem nada guardado, o erro de rede segue subindo: a tela mostra "não
         consegui carregar", que é a verdade. Fingir lista vazia diria à
         pessoa que ela não tem lançamento nenhum. */
      if (!doDisco) throw desfecho.erro;
      definirModo('sem-rede');
      return doDisco.dados;
    }
  };
}
