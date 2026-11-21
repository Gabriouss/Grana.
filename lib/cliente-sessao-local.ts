import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { Alert } from './alerta';
import { ateSessao, criarControleSessaoLocal, type GavetaSessao, type GeracaoSessao } from './controle-sessao-local';

type Cliente = Pick<SupabaseClient, 'auth' | 'removeAllChannels'>;
type Ouvinte = (evento: AuthChangeEvent, sessao: Session | null) => void | Promise<void>;
type Entrada = 'signInWithPassword' | 'signUp' | 'exchangeCodeForSession';
type RespostaEntrada = { data: { session: Session | null }; error: unknown };

/** Export continua sendo o cliente REAL; troca preserva assinantes pela ponte. */
export function criarClienteSessaoLocal<ClienteDaFabrica extends Cliente>(
  gaveta: GavetaSessao,
  chave: string,
  fabrica: (storage: GavetaSessao, sdkKey: string, detectarUrl: boolean) => ClienteDaFabrica,
) {
  const controle = criarControleSessaoLocal(gaveta, chave);
  const ouvintes = new Set<Ouvinte>();
  let proximoOuvinte = 0;
  let avisarTroca = (_cliente: ClienteDaFabrica) => {};
  type Instancia = {
    sdk: ClienteDaFabrica; origem: Promise<GeracaoSessao>; ponte: { unsubscribe(): void };
    originais: Record<Entrada, (...args: unknown[]) => Promise<RespostaEntrada>>;
    resetSenha: Cliente['auth']['resetPasswordForEmail'];
    evento: AuthChangeEvent; auto: boolean; numero: number; publicacaoAuto?: Promise<void>;
  };
  let vigente: Instancia;
  const log = (texto: string) => console.warn('[sessao] ' + texto);
  function emitir(evento: AuthChangeEvent, sessao: Session | null) {
    for (const ouvir of ouvintes) {
      try { Promise.resolve(ouvir(evento, sessao)).catch(() => log('assinante de autenticação falhou')); }
      catch { log('assinante de autenticação falhou'); }
    }
  }
  function retirar(instancia: Instancia) {
    instancia.ponte.unsubscribe();
    Promise.resolve(instancia.sdk.auth.stopAutoRefresh()).catch(() => log('não foi possível parar a renovação antiga'));
    Promise.resolve(instancia.sdk.removeAllChannels()).catch(() => log('não foi possível fechar canais antigos'));
  }
  function ativar(instancia: Instancia) {
    const anterior = vigente;
    vigente = instancia;
    avisarTroca(instancia.sdk);
    if (anterior && anterior !== instancia) retirar(anterior);
    Promise.resolve(instancia.sdk.auth.startAutoRefresh()).catch(() => log('não foi possível iniciar a renovação atual'));
  }
  function reciboSaida() {
    try {
      Alert.alert('Saída não confirmada neste aparelho',
        'Bloqueamos o acesso por enquanto, mas não conseguimos salvar a saída neste aparelho. Tente novamente antes de fechar o Grana.');
    } catch { log('não foi possível mostrar a falha de persistência da saída'); }
  }
  function iniciarSaidaLocal(sessao?: Session | null) {
    const instancia = vigente;
    const saida = controle.iniciarSaida();
    const credencial = sessao ? Promise.resolve(sessao) : saida.origem.then(g => controle.lerCredencial(g));
    credencial.catch(() => {});
    Promise.resolve(instancia.sdk.auth.stopAutoRefresh()).catch(() => log('não foi possível parar a renovação da saída'));
    // Marca começa junto das limpezas existentes; não soma novo prazo ao logout.
    void saida.resultado.then(async persistida => {
      if (!persistida) {
        log('saída local sem confirmação durável');
        const atual = controle.correnteNoProcesso();
        if (saida.atual() || !atual) reciboSaida();
        else {
          const origem = await saida.origem.catch(() => null);
          if (!origem || origem.id === atual.id) reciboSaida();
        }
      }
    });
    return {
      atual: saida.atual,
      confirmar: async () => {
        if (!await saida.resultado) throw new Error('Saída não confirmada neste aparelho.');
      },
      async servidor() {
        const s = await credencial;
        if (!s) return;
        // Mesma chamada do _signOut instalado; evita remoção compartilhada depois da rede.
        const { error } = await ateSessao(instancia.sdk.auth.admin.signOut(s.access_token, 'local'), Date.now() + 4_000);
        if (error) throw error;
      },
      async limpar() {
        const g = await saida.origem;
        const confirmada = await saida.resultado;
        try { await ateSessao(controle.limpar(g), Date.now() + 2_000); }
        catch (erro) {
          if (confirmada && saida.atual()) {
            try { Alert.alert('Saída salva neste aparelho', 'Seu acesso foi encerrado neste aparelho. A limpeza dos dados antigos ficou pendente.'); }
            catch { log('não foi possível mostrar a limpeza pendente da saída'); }
          }
          throw erro;
        }
        finally { if (!confirmada) throw new Error('Saída não confirmada neste aparelho.'); }
      },
    };
  }
  async function confirmarAuto(instancia: Instancia, s: Session) {
    if (!instancia.publicacaoAuto) {
      instancia.publicacaoAuto = instancia.origem.then(g => controle.publicar(g, s, instancia.numero)).then(() => {
        if (!controle.intencaoAtual(instancia.numero)) return;
        ativar(instancia);
        instancia.auto = false;
        emitir(instancia.evento, s);
      });
    }
    await instancia.publicacaoAuto;
  }
  async function entrar(metodo: Entrada, args: unknown[]): Promise<RespostaEntrada> {
    const numero = controle.iniciarEntrada();
    const instancia = construir(Promise.resolve(controle.nova()), false, numero);
    try {
      const resposta = await instancia.originais[metodo](...args);
      if (resposta.error || !resposta.data.session) { retirar(instancia); return resposta; }
      await controle.publicar(await instancia.origem, resposta.data.session, numero);
      if (!controle.intencaoAtual(numero)) throw new Error('Entrada substituída.');
      ativar(instancia);
      emitir(instancia.evento, resposta.data.session);
      return resposta;
    } catch (erro) { retirar(instancia); throw erro; }
  }
  function construir(origem: Promise<GeracaoSessao>, auto: boolean, numero: number): Instancia {
    // Chave de broadcast também é exclusiva; nenhuma aba/SDK antigo injeta A no slot B.
    const sdkKey = `${chave}:runtime:${controle.nova().id}`;
    const sdk = fabrica(controle.adapter(origem, sdkKey), sdkKey, auto);
    const originais = Object.fromEntries((['signInWithPassword', 'signUp', 'exchangeCodeForSession'] as const)
      .map(metodo => [metodo, sdk.auth[metodo].bind(sdk.auth)])) as unknown as Instancia['originais'];
    const instancia = { sdk, origem, originais, auto, numero, evento: 'SIGNED_IN' as AuthChangeEvent } as Instancia;
    const getSession = sdk.auth.getSession.bind(sdk.auth);
    const getUser = sdk.auth.getUser.bind(sdk.auth);
    instancia.resetSenha = sdk.auth.resetPasswordForEmail.bind(sdk.auth);
    const onAuth = sdk.auth.onAuthStateChange.bind(sdk.auth);
    instancia.ponte = onAuth((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') instancia.evento = evento;
      // Nunca aguarda auth dentro do callback/lock do SDK.
      void Promise.resolve().then(async () => {
        if (s && instancia.auto && (evento === 'SIGNED_IN' || evento === 'PASSWORD_RECOVERY')) {
          await confirmarAuto(instancia, s); return;
        }
        if (instancia !== vigente || evento === 'INITIAL_SESSION') return;
        const g = await origem;
        if (s && await controle.admite(g, s) && instancia === vigente) emitir(evento, s);
        else if (!s && evento === 'SIGNED_OUT' && instancia === vigente) {
          iniciarSaidaLocal(); emitir(evento, null);
        }
      }).catch(() => log('evento de autenticação não confirmado localmente'));
    }).data.subscription;
    sdk.auth.getSession = (async () => {
      const resposta = await getSession();
      if (instancia.auto && resposta.data.session) await confirmarAuto(instancia, resposta.data.session);
      if (!await controle.admite(await origem, resposta.data.session)) return { data: { session: null }, error: null };
      return resposta;
    }) as Cliente['auth']['getSession'];
    sdk.auth.getUser = (async (...args: Parameters<Cliente['auth']['getUser']>) => {
      const g = await origem;
      if (!await controle.admite(g)) return { data: { user: null }, error: null };
      const resposta = await getUser(...args);
      const local = await controle.lerCredencial(g);
      if (!local || resposta.data.user?.id !== local.user.id || !await controle.admite(g, local)) return { data: { user: null }, error: null };
      return resposta;
    }) as Cliente['auth']['getUser'];
    sdk.auth.onAuthStateChange = ((ouvir: Ouvinte) => {
      ouvintes.add(ouvir);
      void Promise.resolve().then(async () => {
        const origemDaAssinatura = vigente;
        const resposta = await origemDaAssinatura.sdk.auth.getSession();
        if (origemDaAssinatura === vigente && ouvintes.has(ouvir)) await ouvir('INITIAL_SESSION', resposta.data.session);
      }).catch(() => log('assinante inicial sem confirmação local'));
      return { data: { subscription: { id: String(++proximoOuvinte), callback: ouvir, unsubscribe: () => { ouvintes.delete(ouvir); } } } };
    }) as Cliente['auth']['onAuthStateChange'];
    sdk.auth.signInWithPassword = ((...args) => entrar('signInWithPassword', args)) as Cliente['auth']['signInWithPassword'];
    sdk.auth.signUp = ((...args) => entrar('signUp', args)) as Cliente['auth']['signUp'];
    sdk.auth.exchangeCodeForSession = ((...args) => entrar('exchangeCodeForSession', args)) as Cliente['auth']['exchangeCodeForSession'];
    sdk.auth.resetPasswordForEmail = (async (...args: Parameters<Cliente['auth']['resetPasswordForEmail']>) => {
      // Pedir recuperação depois de logout não reabre o slot revogado.
      const fluxo = construir(Promise.resolve(controle.nova()), false, 0);
      try { return await fluxo.resetSenha(...args); } finally { retirar(fluxo); }
    }) as Cliente['auth']['resetPasswordForEmail'];
    sdk.auth.signOut = (async (options?: { scope?: string }) => {
      if (instancia !== vigente) return { error: null };
      if (options?.scope && options.scope !== 'local') throw new Error('Saída neste aparelho exige escopo local.');
      const saida = iniciarSaidaLocal();
      emitir('SIGNED_OUT', null);
      const resultados = await Promise.allSettled([saida.servidor(), saida.limpar()]);
      for (const r of resultados) if (r.status === 'rejected') log('etapa da saída local falhou');
      await saida.confirmar();
      return { error: null };
    }) as Cliente['auth']['signOut'];
    return instancia;
  }
  let auto = false;
  try {
    const local = globalThis.location;
    auto = !!local && /^\/auth\/(callback|recuperar)\/?$/.test(local.pathname) && new URL(local.href).searchParams.has('code');
  } catch { log('não foi possível classificar retorno de autenticação'); }
  vigente = construir(auto ? Promise.resolve(controle.nova()) : controle.inicial, auto, auto ? controle.iniciarEntrada() : 0);
  return {
    get cliente() { return vigente.sdk; }, controle, iniciarSaidaLocal,
    aoTrocar(ouvir: (cliente: ClienteDaFabrica) => void) { avisarTroca = ouvir; },
  };
}
