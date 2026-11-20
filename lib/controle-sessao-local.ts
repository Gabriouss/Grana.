import type { Session } from '@supabase/supabase-js';

export type GavetaSessao = {
  getItem(chave: string): string | null | Promise<string | null>;
  setItem(chave: string, valor: string): void | Promise<void>;
  removeItem(chave: string): void | Promise<void>;
};
export type GeracaoSessao = { id: string; identidade: string | null };

export function identidadeLocal(sessao: Session): string {
  try {
    const parte = sessao.access_token.split('.')[1];
    const jwt = JSON.parse(atob(parte.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof jwt.session_id === 'string') return JSON.stringify([sessao.user.id, jwt.session_id]);
  } catch { /* Legado: a mesma comparação local já usada por sessao-offline. */ }
  return JSON.stringify([sessao.user.id, sessao.refresh_token]);
}

/** Prazo de espera; a operação subjacente mantém seu próprio slot/fila. */
export async function ateSessao<T>(operacao: PromiseLike<T> | T, fim: number): Promise<T> {
  if (!Number.isFinite(fim)) return await operacao;
  if (Date.now() >= fim) {
    Promise.resolve(operacao).catch(() => {});
    throw new Error('Prazo da persistência da sessão esgotado.');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operacao),
      new Promise<never>((_, rejeitar) => {
        timer = setTimeout(() => rejeitar(new Error('Persistência da sessão não respondeu.')), Math.max(0, fim - Date.now()));
      }),
    ]);
  } finally { clearTimeout(timer); }
}

/** Sem SDK/React: todas as credenciais e operações antigas ficam ligadas ao slot. */
export function criarControleSessaoLocal(gaveta: GavetaSessao, chave: string) {
  const chaveAtiva = `${chave}:geracao-ativa`;
  const revogadas = new Set<string>();
  let bloqueada = false;
  let intencao = 0;
  let ativa: GeracaoSessao | null = null;
  let publicacao: Promise<unknown> = Promise.resolve();
  const inicial = Promise.resolve().then(async () => {
    const bruto = await gaveta.getItem(chaveAtiva);
    if (bruto === null) return { id: 'legado', identidade: null };
    const valor = JSON.parse(bruto) as GeracaoSessao;
    if (!valor || !/^g-[a-f0-9]{32}$/.test(valor.id) || typeof valor.identidade !== 'string') throw new Error('Controle da sessão ilegível.');
    return valor;
  }).then(g => { if (!ativa) ativa = g; return g; });
  // O boot pode ser observado só depois de o SDK terminar de inicializar.
  inicial.catch(() => {});

  const slot = (g: GeracaoSessao, logica: string) => g.id === 'legado' ? logica : `${chave}:slot:${g.id}:${logica}`;
  const marca = (g: GeracaoSessao) => `${chave}:saida:${g.id}`;
  const fimLocal = () => Date.now() + 2_000;
  // A leitura a frio atravessa AsyncStorage e SecureStore dentro do total da abertura.
  const fimLeitura = () => Date.now() + 10_000;
  const corrente = () => ativa ? Promise.resolve(ativa) : inicial;
  const nova = (): GeracaoSessao => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return { id: 'g-' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''), identidade: null };
  };

  async function revogada(g: GeracaoSessao, fim: number): Promise<boolean> {
    if (revogadas.has(g.id)) return true;
    const valor = await ateSessao(Promise.resolve().then(() => gaveta.getItem(marca(g))), fim);
    if (valor !== null && valor !== '1') throw new Error('Marca de saída ilegível.');
    if (valor === '1') revogadas.add(g.id);
    return revogadas.has(g.id);
  }
  async function admite(g: GeracaoSessao, sessao?: Session | null, fim = fimLeitura()): Promise<boolean> {
    if (bloqueada || (await ateSessao(corrente(), fim)).id !== g.id || await revogada(g, fim)) return false;
    if (bloqueada || ativa?.id !== g.id) return false;
    return !sessao || g.identidade === null || g.identidade === identidadeLocal(sessao);
  }
  async function lerCredencial(g: GeracaoSessao, fim = fimLocal()): Promise<Session | null> {
    const bruto = await ateSessao(Promise.resolve().then(() => gaveta.getItem(slot(g, chave))), fim);
    if (!bruto) return null;
    const s = JSON.parse(bruto) as Session;
    if (!s || typeof s.access_token !== 'string' || typeof s.refresh_token !== 'string' || typeof s.user?.id !== 'string') throw new Error('Credencial local ilegível.');
    return s;
  }
  async function revogar(g: GeracaoSessao): Promise<void> {
    revogadas.add(g.id);
    const fim = fimLocal();
    await ateSessao(Promise.resolve().then(() => gaveta.setItem(marca(g), '1')), fim);
    if (await ateSessao(Promise.resolve().then(() => gaveta.getItem(marca(g))), fim) !== '1') throw new Error('Não foi possível confirmar a saída no aparelho.');
  }
  const iniciarSaida = () => {
    const origem = corrente();
    const numero = ++intencao;
    bloqueada = true;
    const persistencia = origem.then(revogar);
    // Falha é consumida por confirmar; não há rejeição abandonada durante as limpezas.
    const resultado = ateSessao(persistencia, fimLocal()).then(() => true, () => false);
    return { origem, numero, resultado, atual: () => numero === intencao };
  };

  async function publicar(g: GeracaoSessao, s: Session, numero: number): Promise<void> {
    const anterior = publicacao;
    const trabalho = anterior.catch(() => {}).then(async () => {
      if (numero !== intencao || revogadas.has(g.id)) throw new Error('Entrada substituída por outra intenção.');
      const guardada = await lerCredencial(g, Number.POSITIVE_INFINITY);
      if (!guardada || identidadeLocal(guardada) !== identidadeLocal(s)) throw new Error('A entrada não foi persistida.');
      g.identidade = identidadeLocal(s);
      const valor = JSON.stringify(g);
      // Fila conserva a promessa REAL: timeout de quem espera não libera escrita antiga.
      await gaveta.setItem(chaveAtiva, valor);
      if (await gaveta.getItem(chaveAtiva) !== valor || numero !== intencao || revogadas.has(g.id)) throw new Error('A entrada não foi confirmada no aparelho.');
      ativa = g;
      bloqueada = false;
    });
    publicacao = trabalho;
    try { await ateSessao(trabalho, fimLocal()); }
    catch (erro) {
      // Mesmo uma publicação que termine tarde continua revogada por sua própria chave.
      revogadas.add(g.id);
      void revogar(g).catch(() => console.warn('[sessao] entrada não confirmada; marca de revogação indisponível'));
      throw erro;
    }
  }

  function adapter(origem: Promise<GeracaoSessao>, sdkKey: string) {
    const logica = (key: string) => key.startsWith(sdkKey) ? chave + key.slice(sdkKey.length) : key;
    const fluxo = (key: string) => /-code-verifier$/.test(key);
    const indiceFluxo = (key: string) => key === `${chave}-flows-code-verifier`;
    const referenciaFluxo = (key: string) => `${chave}:origem-pkce:${key.slice(chave.length)}`;
    const verificadoresLidos = new Map<string, { chaveFisica: string; valor: string }>();
    return {
      async getItem(key: string): Promise<string | null> {
        const fim = fimLeitura(), g = await ateSessao(origem, fim), nome = logica(key);
        if (nome === chave) {
          // Cliente novo ainda sem publicação pode carregar somente o próprio slot.
          if (revogadas.has(g.id) || await revogada(g, fim)) return null;
          const s = await lerCredencial(g, fim);
          if (await revogada(g, fim)) return null;
          return s ? JSON.stringify(s) : null;
        }
        const lido = verificadoresLidos.get(nome);
        if (lido) {
          const atual = await ateSessao(Promise.resolve().then(() => gaveta.getItem(lido.chaveFisica)), fim);
          return atual === lido.valor ? atual : null;
        }
        const slotProprio = slot(g, nome);
        let chaveFisica = slotProprio;
        let valor = await ateSessao(Promise.resolve().then(() => gaveta.getItem(chaveFisica)), fim);
        if (valor === null && fluxo(nome) && !indiceFluxo(nome)) {
          const ref = await ateSessao(Promise.resolve().then(() => gaveta.getItem(referenciaFluxo(nome))), fim);
          if (ref) {
            const id = JSON.parse(ref) as string;
            if (id !== 'legado' && !/^g-[a-f0-9]{32}$/.test(id)) throw new Error('Origem PKCE ilegível.');
            chaveFisica = slot({ id, identidade: null }, nome);
          } else if (g.id !== 'legado') {
            // Verifier do app instalado antes da migração, inclusive link já enviado.
            chaveFisica = nome;
          }
          if (chaveFisica !== slotProprio) {
            valor = await ateSessao(Promise.resolve().then(() => gaveta.getItem(chaveFisica)), fim);
            if (valor !== null) {
              const anterior = verificadoresLidos.get(nome);
              if (anterior) return anterior.chaveFisica === chaveFisica && anterior.valor === valor ? valor : null;
              // A segunda leitura do SDK para limpeza deve mirar o verifier da troca.
              verificadoresLidos.set(nome, { chaveFisica, valor });
            }
          }
        }
        return valor;
      },
      async setItem(key: string, value: string): Promise<void> {
        const fim = fimLocal(), g = await ateSessao(origem, fim), nome = logica(key);
        if (await revogada(g, fim)) throw new Error('Sessão revogada não pode gravar credenciais.');
        await ateSessao(Promise.resolve().then(() => gaveta.setItem(slot(g, nome), value)), fim);
        verificadoresLidos.delete(nome);
        if (fluxo(nome) && !indiceFluxo(nome)) await ateSessao(Promise.resolve().then(() => gaveta.setItem(referenciaFluxo(nome), JSON.stringify(g.id))), fim);
      },
      async removeItem(key: string): Promise<void> {
        const fim = fimLocal(), g = await ateSessao(origem, fim);
        const nome = logica(key);
        const lido = verificadoresLidos.get(nome);
        if (lido) {
          const atual = await ateSessao(Promise.resolve().then(() => gaveta.getItem(lido.chaveFisica)), fim);
          if (atual === lido.valor) {
            await ateSessao(Promise.resolve().then(() => gaveta.removeItem(lido.chaveFisica)), fim);
          }
          verificadoresLidos.delete(nome);
          return;
        }
        // Nenhum apontador global é removido por um cliente/SDK antigo.
        await ateSessao(Promise.resolve().then(() => gaveta.removeItem(slot(g, nome))), fim);
      },
    };
  }
  const leituraAtual: GavetaSessao = {
    async getItem(key) {
      const fim = fimLeitura(), g = await ateSessao(corrente(), fim);
      if (!await admite(g, undefined, fim)) return null;
      const valor = await ateSessao(Promise.resolve().then(() => gaveta.getItem(slot(g, key))), fim);
      if (key === chave && valor) {
        const s = JSON.parse(valor) as Session;
        if (!await admite(g, s, fim)) return null;
      }
      return await admite(g, undefined, fim) ? valor : null;
    },
    async setItem(key, value) {
      const g = await corrente();
      if (!await admite(g)) throw new Error('Sessão indisponível.');
      await gaveta.setItem(slot(g, key), value);
    },
    async removeItem(key) {
      const g = await corrente();
      await gaveta.removeItem(slot(g, key));
    },
  };
  return {
    inicial, corrente, nova, adapter, admite, publicar, iniciarSaida, lerCredencial, leituraAtual,
    correnteNoProcesso: () => ativa,
    iniciarEntrada: () => ++intencao,
    intencaoAtual: (numero: number) => numero === intencao,
    async limpar(g: GeracaoSessao) { await gaveta.removeItem(slot(g, chave)); },
  };
}
