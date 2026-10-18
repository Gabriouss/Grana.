'use strict';
/*
 * Publicação e pausa (E5) no painel local + resolvedor de prévia de conteúdo (16/10/2026).
 *
 *   node __tests__/admin-publicacoes-local.cjs
 *
 * Executa a tela real (tools/admin-local/web/telas/publicacoes.js) contra dublê de DOM/API
 * e valida o resolvedor de prévia local (tools/admin-local/marketing/previa-conteudo.cjs).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
let passou = 0;
const ok = (c, nome) => { assert.ok(c, nome); passou++; };
const igual = (a, b, nome) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), nome); passou++; };

const CHAVE = 'a'.repeat(64);
const ALVO = {
  pecaId: 'b'.repeat(16),
  rede: 'instagram',
  conta: '123456',
  formato: 'feed',
  estrategia: 'executor-remoto',
  horario: '2027-01-01T15:00:00.000Z',
};
const PECA = {
  pecaId: ALVO.pecaId,
  versao: 'c'.repeat(40),
  aprovado: true,
  manifesto: {
    legendaSha256: 'd'.repeat(64),
    capaSha256: null,
    midias: [{ tipo: 'imagem', sha256: 'e'.repeat(64) }],
  },
};

function criarDom() {
  let ultimoFoco = null;
  const walk = (n) => (n && typeof n === 'object' ? [n, ...(n.children || []).flatMap(walk)] : []);
  const texto = (n) => (n == null ? '' : typeof n === 'object' ? [n.attrs?.texto || '', ...(n.children || []).map(texto)].join(' ') : String(n));
  const node = (tag, attrs = {}, ...filhos) => {
    const el = {
      tag,
      attrs: { ...attrs },
      hidden: Boolean(attrs.hidden),
      disabled: Boolean(attrs.disabled),
      children: filhos.flat(Infinity).filter((x) => x != null && x !== false),
      append(...ns) { this.children.push(...ns.flat(Infinity).filter((x) => x != null && x !== false)); },
      appendChild(n) { if (n != null && n !== false) this.children.push(n); return n; },
      replaceChildren(...ns) { this.children = ns.flat(Infinity).filter((x) => x != null && x !== false); },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k]; },
      focus() { ultimoFoco = this; },
      querySelector(sel) {
        if (sel === 'h2') return walk(this).find((x) => x !== this && x.tag === 'h2') || null;
        return null;
      },
      querySelectorAll(sel) {
        if (sel === 'button[data-operacao]') return walk(this).filter((x) => x.tag === 'button' && x.attrs['data-operacao']);
        return [];
      },
      get textContent() { return this.attrs.texto || ''; },
      set textContent(v) { this.attrs.texto = String(v ?? ''); },
    };
    return el;
  };
  return { node, walk, texto, getUltimoFoco: () => ultimoFoco };
}

const fonteTela = fs.readFileSync(path.join(ROOT, 'tools/admin-local/web/telas/publicacoes.js'), 'utf8');
const corpoJs = fonteTela.replace(/^export /gm, '');
const sandbox = { console, Date };
vm.runInNewContext(`(function(){${corpoJs}\n;globalThis.montarPublicacoes = montar;})()`, sandbox);

async function montarCena({ apiResp, acaoResp, confirmar = true, formulario = null }) {
  const dom = criarDom();
  const chamadas = [];
  const raiz = dom.node('main');
  const ctx = {
    h: dom.node,
    params: { modo: 'simulacao' },
    obsoleta: () => false,
    dataHora: (iso) => `local(${iso})`,
    cabecalho: (r, titulo, sub, acoes = []) => r.append(dom.node('header', {}, dom.node('h1', { texto: titulo }), dom.node('p', { texto: sub }), ...acoes)),
    api: async (url) => {
      chamadas.push(['GET', url]);
      if (typeof apiResp === 'function') return apiResp(url);
      if (apiResp instanceof Error) throw apiResp;
      return { dados: apiResp };
    },
    acao: async (url, corpo) => {
      chamadas.push(['POST', url, corpo]);
      if (typeof acaoResp === 'function') return { dados: await acaoResp(corpo) };
      if (acaoResp instanceof Error) throw acaoResp;
      return { dados: acaoResp };
    },
    confirmar: async (cfg) => {
      chamadas.push(['CONFIRMAR', cfg.titulo]);
      return typeof confirmar === 'function' ? confirmar(cfg) : confirmar;
    },
    formulario: async (cfg) => {
      chamadas.push(['FORM', cfg.titulo]);
      return formulario;
    },
  };
  Object.assign(sandbox, { raiz, ctx });
  await vm.runInNewContext('montarPublicacoes(raiz, ctx)', sandbox);
  const botao = (rotulo) => dom.walk(raiz).find((n) => n.tag === 'button' && n.attrs.texto === rotulo);
  return { raiz, chamadas, botao, texto: () => dom.texto(raiz), walk: () => dom.walk(raiz), ultimoFoco: dom.getUltimoFoco };
}

(async () => {
  // 1. Estado ausente / indisponível por configuração remota incompleta
  {
    const c = await montarCena({
      apiResp: {
        modo: 'simulacao',
        status: 'indisponivel',
        motivo: 'Configuração remota incompleta para simulação de publicações.',
        faltantes: ['ADMIN_MARKETING_USER_ID'],
      },
    });
    const t = c.texto();
    ok(t.includes('Publicações indisponíveis') && t.includes('ADMIN_MARKETING_USER_ID'), 'status=indisponivel mostra motivo e variável faltante');
    ok(!t.includes('resposta-invalida'), 'status=indisponivel não é confundido com resposta inválida');
  }

  // 2. Falha HTTP 503 honesta: não finge lista vazia nem pausa ativa
  {
    const erro503 = Object.assign(new Error('Fonte indisponível'), { status: 503, codigo: 'fonte-indisponivel' });
    const c = await montarCena({ apiResp: erro503 });
    const t = c.texto();
    ok(t.includes('Publicações indisponíveis') && t.includes('HTTP 503') && t.includes('fonte-indisponivel'), 'HTTP 503 exibe recibo de erro honesto');
    ok(!c.botao('Pausar Global'), 'HTTP 503 não renderiza controles de pausa falsos');
  }

  // 3. Lista com item precisa-conferir, pausa/retomada estrita, consulta, reconciliação e bloqueio de prévia
  {
    const pausas = { global: false, facebook: false, instagram: false };
    const job = {
      modo: 'simulacao',
      chave: CHAVE,
      alvo: ALVO,
      peca: PECA,
      versao: PECA.versao,
      estado: 'precisa-conferir',
      motivo: 'Timeout simulado na chamada',
      remotoId: null,
    };
    const c = await montarCena({
      apiResp: () => ({
        dados: {
          modo: 'simulacao',
          registros: [{ ...job }],
          limitado: true,
          pausas: { ...pausas },
        },
      }),
      acaoResp: (corpo) => {
        if (corpo.acao === 'pausar' || corpo.acao === 'retomar') {
          pausas[corpo.rede] = corpo.acao === 'pausar';
          return { modo: 'simulacao', pausas: { ...pausas }, cancelamentos: 'Conferir agendamentos existentes.' };
        }
        if (corpo.acao === 'consultar') {
          return { modo: 'simulacao', registro: { revisao: 1, dados: { ...job } } };
        }
        if (corpo.acao === 'reconciliar') {
          job.estado = 'publicado';
          job.remotoId = 'sim-ok-1';
          return { modo: 'simulacao', registro: { ...job }, chamadasMetaReais: 0, chamadasSimuladas: ['reconciliar'] };
        }
        if (corpo.acao === 'previa') {
          return { modo: 'simulacao', chave: CHAVE, estado: 'planejado', alvo: corpo.alvo, peca: PECA };
        }
        throw new Error('acao-inesperada:' + corpo.acao);
      },
      formulario: {
        pecaId: ALVO.pecaId,
        rede: 'instagram',
        conta: '123456',
        formato: 'feed',
        horario: '2027-01-01T12:00',
        estrategia: 'executor-remoto',
      },
    });

    ok(c.texto().includes('SIMULAÇÃO · nenhuma publicação real') && c.texto().includes('não é o inventário completo'), 'cabeçalho de simulação e aviso de limite presentes');

    await c.botao('Pausar Global').attrs.onclick();
    const postPausa = c.chamadas.find((x) => x[0] === 'POST' && x[2].acao === 'pausar');
    igual(postPausa[2], { recurso: 'publicacoes-simulacao', modo: 'simulacao', acao: 'pausar', rede: 'global' }, 'pausar envia envelope estrito');
    ok(Boolean(c.botao('Retomar Global')), 'estado muda para Retomar Global após pausa');

    await c.botao('Retomar Global').attrs.onclick();
    const postRetomar = c.chamadas.find((x) => x[0] === 'POST' && x[2].acao === 'retomar');
    igual(postRetomar[2], { recurso: 'publicacoes-simulacao', modo: 'simulacao', acao: 'retomar', rede: 'global', confirmado: true }, 'retomar exige confirmado: true');

    await c.botao('Ver combinação e recibo').attrs.onclick();
    ok(Boolean(c.botao('Reconciliar simulação')) && !c.botao('Executar simulação'), 'estado precisa-conferir oferece Reconciliar e bloqueia Executar');

    await c.botao('Reconciliar simulação').attrs.onclick();
    ok(c.texto().includes('sim-ok-1') && !c.botao('Executar simulação'), 'reconciliação atualiza recibo com id sim- e mantém terminal sem execução');

    await c.botao('Conferir combinação').attrs.onclick();
    ok(c.texto().includes('Prévia indisponível no contrato atual'), 'consulta de combinação informa ausência de prévia visual no contrato atual');
    const btnConfirmar = c.botao('Confirmar simulação');
    ok(btnConfirmar && btnConfirmar.disabled === true, 'botão Confirmar simulação permanece desabilitado sem prévia visual');
    ok(!c.chamadas.some((x) => x[0] === 'POST' && x[2]?.acao === 'confirmar'), 'nenhuma chamada confirmar foi disparada');
  }

  // 4. Resolvedor local de prévia de conteúdo (previa-conteudo.cjs): bloqueia sem aceite ou quando há divergência
  {
    const { criarResolvedor } = require(path.join(ROOT, 'tools/admin-local/marketing/previa-conteudo.cjs'));
    const resolverSemPeca = criarResolvedor({ obterPeca: async () => null });
    const rVazio = await resolverSemPeca(ROOT, null);
    igual(rVazio.previaConteudo.estado, 'sem-conteudo-aprovado', 'resolvedor recusa prévia nula com sem-conteudo-aprovado');

    const rNaoAprovado = await resolverSemPeca(ROOT, {
      chave: CHAVE,
      alvo: ALVO,
      peca: { ...PECA, aprovado: false },
    });
    igual(rNaoAprovado.previaConteudo.estado, 'sem-aceite', 'resolvedor recusa peça não aprovada com sem-aceite');
  }

  // 5. Fiação no painel local
  {
    const rotas = fs.readFileSync(path.join(ROOT, 'tools/admin-local/rotas.cjs'), 'utf8');
    ok(rotas.includes("'/api/marketing/publicacoes-simulacao'"), 'rota /api/marketing/publicacoes-simulacao registrada em rotas.cjs');
    ok(fs.readFileSync(path.join(ROOT, 'tools/admin-local/web/app.js'), 'utf8').includes("'marketing/publicacoes'"), 'rota marketing/publicacoes registrada em app.js');
    ok(fs.readFileSync(path.join(ROOT, 'tools/admin-local/web/index.html'), 'utf8').includes('#/marketing/publicacoes'), 'link #/marketing/publicacoes presente em index.html');
  }

  console.log(`admin-publicacoes-local: ${passou} checagens passaram — 0 falhas`);
})().catch((e) => { console.error(e); process.exit(1); });
