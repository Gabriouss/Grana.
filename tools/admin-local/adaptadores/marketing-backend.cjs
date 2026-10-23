'use strict';
// Servidor Node: senha+TOTP/CSRF do painel em loopback. Nenhum JWT humano
// ou configuração de transporte/destinatário vem do navegador.
const config = require('../config.cjs');
const { carregar } = require('./_contratos-marketing.cjs');
const { ErroMarketing } = require('../marketing/catalogo.cjs');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONFIG_REMOTA = ['EXPO_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_MARKETING_USER_ID'];

function criarBackend({ configuracao = config, rede = fetch, cliente: criarCliente, relogio = () => new Date(), log = linha => console.error(linha) } = {}) {
  const env = nome => configuracao.ler(nome) || undefined;
  const meta = carregar('supabase/functions/_shared/admin-meta.ts').criarOperacaoMeta(env, rede);
  const analytics = carregar('supabase/functions/_shared/admin-analytics.ts').criarOperacaoAnalytics(env, rede);
  const simulacao = carregar('supabase/functions/_shared/admin-publicacoes-simulacao.ts').operacaoPublicacoesSimulacao;
  const notificacoes = carregar('supabase/functions/_shared/admin-marketing.ts').operacaoMarketing;
  let cliente;
  function remoto() {
    const faltantes = CONFIG_REMOTA.filter(k => !env(k));
    if (faltantes.length) return { status: 'indisponivel', motivo: 'configuracao-remota-ausente', faltantes };
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(env(CONFIG_REMOTA[0])) || !UUID.test(env(CONFIG_REMOTA[2]))) {
      return { status: 'indisponivel', motivo: 'configuracao-remota-invalida' };
    }
    if (!cliente) {
      const factory = criarCliente || require('@supabase/supabase-js').createClient;
      cliente = factory(env(CONFIG_REMOTA[0]), env(CONFIG_REMOTA[1]), {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (url, init) => rede(url, { ...init, redirect: 'error' }) },
      });
    }
    return null;
  }
  async function executar(op, corpo, exigeRemoto = false) {
    let pedido;
    try { pedido = op.validar(corpo); } catch { throw new ErroMarketing('pedido-invalido', 'Pedido de marketing inválido.', 400); }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      if (exigeRemoto) { const falta = remoto(); if (falta) return falta; }
      const r = await op.executar(cliente, pedido, { userId: env('ADMIN_MARKETING_USER_ID'), agora: relogio(), signal: controller.signal });
      return r.dados;
    } catch {
      // Mensagens do SDK/rede podem conter segredo ou dados de terceiros.
      log('[painel] marketing-fonte-indisponivel');
      throw new ErroMarketing('fonte-indisponivel', 'Fonte indisponível. Confira configuração, permissões e aplicação da fundação. Nenhum resultado foi presumido.', 503);
    } finally { clearTimeout(timer); }
  }
  return {
    meta: (p = {}) => executar(meta, { recurso: 'meta-leitura', ...p }),
    analytics: (janela = 'semana-anterior') => executar(analytics, { recurso: 'analytics-leitura', janela }),
    simulacao: async p => ({ ...await executar(simulacao, p, true), modo: 'simulacao' }),
    notificacoes: p => executar(notificacoes, p, true),
    publicacoes: criarPublicacoesReais({ env, remoto, cliente: () => cliente, relogio, log,
      rede: (url, init) => rede(url, { ...init, redirect: 'error' }) }),
  };
}

/* Agendamento REAL. A operação e o importador são os do módulo remoto (mesmo código da
   Edge Function), carregados aqui com service_role SÓ depois dos gates locais (sessão
   pareada, TOTP recente, CSRF, Origin), como o contrato e5.real.v1 permite. Nunca cai
   no simulador e nunca presume conta, capacidade ou sucesso. */
const PRAZO_REAL_MS = 12_000;
const PRAZO_PREVIA_MS = 120_000; // captura + upload privado de até 64 MB antes da prévia
// Mesmo contrato do preparo Graph e da elegibilidade SQL. O manifesto é da captura
// real, após a conversão PNG→JPEG; rejeita antes de RPC/assinatura/upload privado.
function midiaCompativel(dados, rede, formato) {
  const midias = dados?.midias;
  const imagem = m => m?.tipo === 'imagem' && ['image/jpeg', 'image/png'].includes(m.mime);
  const video = m => m?.tipo === 'video' && m.mime === 'video/mp4';
  return ['instagram', 'facebook'].includes(rede) && ['feed', 'carrossel', 'reels', 'stories'].includes(formato)
    && Array.isArray(midias) && midias.length >= 1 && midias.length <= 10
    && midias.every(m => imagem(m) || video(m))
    && (formato === 'carrossel' ? midias.length >= 2 : midias.length === 1)
    && (formato !== 'feed' || imagem(midias[0])) && (formato !== 'reels' || video(midias[0]))
    && (rede !== 'facebook' || formato !== 'carrossel' || midias.every(imagem))
    && (rede !== 'instagram' || (midias.every(m => !imagem(m) || m.mime === 'image/jpeg')
      && (formato !== 'reels' || !dados.capa || dados.capa.mime === 'image/jpeg')));
}
function criarPublicacoesReais({ env, remoto, cliente, relogio, log, rede, estado: estadoInjetado, capturar: capturarInjetado }) {
  const modulo = () => carregar('supabase/functions/_shared/admin-publicacoes-reais.ts');
  let op, importador, estadoLocal, capturador;
  const operacao = () => op || (op = modulo().criarOperacaoPublicacoesReais());
  const imp = () => importador || (importador = modulo().criarImportadorSnapshotReal({ rede }));
  const estado = () => estadoInjetado || estadoLocal || (estadoLocal = require('../marketing/publicacoes-reais-estado.cjs').criarEstado());
  const capturar = (...a) => (capturarInjetado || capturador || (capturador = require('../marketing/snapshot-local.cjs').criarCapturador()))(...a);

  function exigirRemoto() {
    const falta = remoto();
    if (falta) throw new ErroMarketing('configuracao-remota-ausente', 'Publicação real indisponível: configuração remota ausente neste PC. Nada foi agendado.', 503);
  }
  // Preserva o código e o status do módulo remoto (409/404/415/422); o resto é fonte indisponível.
  function traduzir(e, signal) {
    if (e instanceof ErroMarketing) return e;
    let t = null;
    try { t = operacao().tratarErro?.(e) || null; } catch { t = null; }
    if (t) return new ErroMarketing(t.codigo, t.mensagem, t.status);
    if (signal?.aborted) return new ErroMarketing('prazo-esgotado', 'A operação passou do prazo. Consulte pela mesma chave antes de repetir.', 504);
    log('[painel] publicacoes-reais-fonte-indisponivel');
    return new ErroMarketing('fonte-indisponivel', 'Fonte indisponível. Nada foi presumido; confira configuração e aplicação da migration.', 503);
  }
  async function comPrazo(ms, fn) {
    exigirRemoto();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    const ctx = { userId: env('ADMIN_MARKETING_USER_ID'), agora: relogio(), signal: controller.signal };
    try { return await fn(ctx); } catch (e) { throw traduzir(e, controller.signal); } finally { clearTimeout(timer); }
  }
  function validar(pedido) {
    try { return operacao().validar(pedido); } catch (e) {
      let t = null;
      try { t = operacao().tratarErro?.(e) || null; } catch { t = null; }
      throw t && t.status === 400 ? new ErroMarketing(t.codigo, t.mensagem, 400) : new ErroMarketing('pedido-invalido', 'Pedido inválido.', 400);
    }
  }
  const executarOp = (pedido, ctx) => operacao().executar(cliente(), validar(pedido), ctx).then(r => r.dados);
  const lerTudo = stream => new Promise((ok, falha) => {
    const partes = []; stream.on('data', p => partes.push(p)); stream.on('error', falha);
    stream.on('end', () => ok(new Uint8Array(Buffer.concat(partes))));
  });

  async function apresentarPrevia(dados, p, snap) {
    // Mesmo DTO para captura nova e reagendamento de snapshot já aprovado.
    // A RPC devolve destinos com revisões, sem estado/motivos. Nunca repara estado explícito.
    const invalida = () => { throw new ErroMarketing('previa-invalida', 'O servidor não devolveu os destinos validados desta prévia.', 502); };
    if (!Array.isArray(dados.destinos) || dados.destinos.length !== p.destinos.length
      || typeof dados.podeConfirmar !== 'boolean' || !Array.isArray(dados.bloqueios)
      || dados.bloqueios.some(m => typeof m !== 'string') || !snap || !UUID.test(snap.snapshotId || '')
      || !Array.isArray(snap.midias)) invalida();
    const pronta = dados.podeConfirmar && dados.bloqueios.length === 0 && dados.snapshot?.estado === 'pronto';
    const destinos = dados.destinos.map((d, i) => {
      if (!d || typeof d !== 'object') return invalida();
      const alvo = p.destinos[i];
      if (d.contaId !== alvo.contaId || d.rede !== alvo.rede || d.formato !== alvo.formato
        || d.publicarEm !== alvo.publicarEm || d.fuso !== alvo.fuso
        || !Number.isSafeInteger(d.contaRevisao) || d.contaRevisao < 1
        || !Number.isSafeInteger(d.capacidadeRevisao) || d.capacidadeRevisao < 1) return invalida();
      if (Object.hasOwn(d, 'estado') || Object.hasOwn(d, 'motivos')) {
        if (!['pronto', 'bloqueado'].includes(d.estado) || !Array.isArray(d.motivos)
          || d.motivos.some(m => typeof m !== 'string')
          || (d.estado === 'pronto' && (!pronta || d.motivos.length > 0))) return invalida();
        return d;
      }
      return { ...d, estado: pronta ? 'pronto' : 'bloqueado',
        motivos: pronta ? [] : dados.bloqueios.length ? [...dados.bloqueios] : ['previa-bloqueada'] };
    });
    await estado().registrarPrevia({ previaId: dados.previaId, snapshotId: snap.snapshotId,
      midias: snap.midias.length, capa: !!snap.capa, expiraEm: dados.expiraEm });
    const url = indice => `/api/marketing/publicacoes/midia?previaId=${encodeURIComponent(dados.previaId)}&indice=${indice}`;
    return { ...dados, destinos, midiasLocais: snap.midias.map((x, i) => ({ ordem: x.ordem, tipo: x.tipo, mime: x.mime, url: url(i) })),
      capaLocal: snap.capa ? { mime: snap.capa.mime, url: url('capa') } : null };
  }

  const politica = p => Object.fromEntries(['politicaExecucao','capacidadesCliente','consentimentoExecucao'].filter(k => p[k] !== undefined).map(k => [k,p[k]]));
  const api = {
    executar(pedido) {
      return comPrazo(PRAZO_REAL_MS, ctx => executarOp(pedido, ctx));
    },
    /* Prévia: captura os bytes aprovados, importa o snapshot no Storage privado, finaliza
       (o servidor relê e confere), confere de novo o aceite local e só então pede a prévia.
       Upload e verificação terminam ANTES de qualquer confirmação. */
    prever(raiz, p) {
      if (p.jobId !== undefined) {
        // O SQL resolve o snapshot/ator e vincula a prévia ao job e à revisão.
        // Não recaptura a peça nem envia novamente os objetos privados.
        return comPrazo(PRAZO_REAL_MS, async ctx => {
          const dados = await executarOp({ recurso: 'publicacoes-reais', modo: 'real', acao: 'previa',
            jobId: p.jobId, destinos: p.destinos, ...politica(p) }, ctx);
          return apresentarPrevia(dados, p, dados.snapshot);
        });
      }
      return comPrazo(PRAZO_PREVIA_MS, async ctx => {
        const cap = await capturar(raiz, p.pecaId, p.versao, { signal: ctx.signal, jpeg: true });
        try {
          const m = cap.manifesto;
          if (p.destinos.some(d => !midiaCompativel(m, d.rede, d.formato))) {
            throw new ErroMarketing('midia-incompativel', 'A mídia desta peça não é compatível com os destinos selecionados. Escolha os destinos novamente.', 409);
          }
          const ini = await imp().iniciar(cliente(), {
            pecaId: cap.pecaId, versao: cap.versao, aceiteId: cap.aceiteSha256, aceiteRevisao: 1,
            legenda: m.legenda, legendaSha256: m.legendaSha256, titulo: String(cap.titulo || '').slice(0, 200),
            midias: m.midias.map(({ ordem, sha256, tipo, mime, bytes, largura, altura }) => ({ ordem, sha256, tipo, mime, bytes, ...(largura ? { largura, altura } : {}) })),
            capa: m.capa ? { sha256: m.capa.sha256, mime: m.capa.mime, bytes: m.capa.bytes, ...(m.capa.largura ? { largura: m.capa.largura, altura: m.capa.altura } : {}) } : null,
          }, ctx);
          if (ini.estado === 'recebendo') {
            for (const u of [...ini.uploads, ...(ini.capa ? [ini.capa] : [])]) {
              const indice = u.indice === 'capa' ? 'capa' : Number(u.indice);
              await imp().enviar(cliente(), { snapshotId: ini.snapshotId, indice: String(u.indice), bytes: await lerTudo(cap.abrir(indice)) }, ctx);
            }
          } else if (ini.estado !== 'pronto') {
            throw new ErroMarketing('snapshot-indisponivel', 'O snapshot remoto desta peça não está disponível.', 409);
          }
          const snap = await imp().finalizar(cliente(), { snapshotId: ini.snapshotId, revisaoEsperada: ini.revisao }, ctx);
          if (snap?.estado !== 'pronto') throw new ErroMarketing('snapshot-indisponivel', 'O servidor não confirmou o snapshot desta peça.', 409);
          await cap.conferir(); // aceite e versão continuam os mesmos depois do upload
          const dados = await executarOp({ recurso: 'publicacoes-reais', modo: 'real', acao: 'previa',
            snapshotId: snap.snapshotId, snapshotRevisao: snap.revisao, destinos: p.destinos, ...politica(p) }, ctx);
          return await apresentarPrevia(dados, p, snap);
        } finally { await cap.fechar(); }
      });
    },
    async midia(previaId, indice) {
      const p = estado().previa(previaId);
      if (indice === 'capa' ? !p.capa : Number(indice) >= p.midias) throw new ErroMarketing('midia-inexistente', 'Mídia não encontrada nesta prévia.', 404);
      return comPrazo(PRAZO_REAL_MS * 3, async ctx => {
        const r = await imp().midia(cliente(), { snapshotId: p.snapshotId, indice: String(indice) }, ctx);
        return { conteudo: Buffer.from(r.bytes), mime: r.mime };
      });
    },
  };
  return api;
}
let instancia;
const backend = () => instancia || (instancia = criarBackend());
module.exports = { criarBackend, backend, criarPublicacoesReais, CONFIG_REMOTA };
