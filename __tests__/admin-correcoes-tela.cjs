'use strict';
/*
 * Entrega 3 (16/10/2026): correções de criativos no /admin web.
 *
 *   node __tests__/admin-correcoes-tela.cjs
 *
 * Executa o CorrecoesCriativos.web.tsx real sobre o lib/admin-web.ts real. Dublês: fetch, sessão
 * do Supabase e um React mínimo. Asserta QUAIS pedidos saem (função, corpo exato), o que a tela
 * mostra para cada estado, que o aceite NÃO existe no navegador, e que falha vira recibo sem
 * texto do pedido no log.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const compilar = (rel) => ts.transpileModule(fs.readFileSync(path.join(ROOT, rel), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const SEGREDO = 'Troca o fundo por um verde mais escuro';
const sha = (c) => c.repeat(40);
const pedido = (i, extra = {}) => ({
  id: `66666666-6666-4666-8666-${String(i).padStart(12, '0')}`, pecaId: String(i).padStart(16, 'a'),
  caminho: `docs/marketing/2026-10/semana-41/para-aprovacao/pecas/carrossel-${i}.png`, versaoAlvo: sha('1'), estado: 'novo', tentativas: 0,
  versaoCorrigida: null, commit: null, aceiteEm: null, criadoEm: '2026-10-16T09:00:00.000Z', atualizadoEm: '2026-10-16T09:00:00.000Z', importadoEm: null, ...extra,
});
const pronto = (i, extra = {}) => pedido(i, { estado: 'corrigido-aguardando-aceite', versaoCorrigida: sha('2'), commit: sha('3'), tentativas: 1, ...extra });
const tick = () => new Promise((r) => setImmediate(r));
const lista = (pedidos) => ({ status: 200, body: { ok: true, contrato: 1, geradoEm: '2026-10-16T13:00:00.000Z', dados: { pedidos } } });
const criado = (id) => ({ status: 200, body: { ok: true, contrato: 1, geradoEm: '2026-10-16T13:05:00.000Z', dados: { pedido: { id, estado: 'novo', criadoEm: '2026-10-16T13:05:00.000Z' } } } });

function ambiente() {
  const pedidos = [], logs = [], respostas = [];
  const client = {};
  vm.runInNewContext(compilar('lib/admin-web.ts'), {
    exports: client, Date, AbortController, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto,
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://p.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon' } },
    require: () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token-ficticio' } }, error: null }) } } }),
    fetch: async (url, init) => {
      pedidos.push({ url, corpo: JSON.parse(init.body) });
      const r = respostas.shift() ?? lista([]);
      return { ok: r.status === 200, status: r.status, json: async () => r.body };
    },
  });
  let celulas = [], cursor = 0, efeitos = [];
  const React = {
    useState: (v) => { const i = cursor++; if (!(i in celulas)) celulas[i] = v; return [celulas[i], (x) => { celulas[i] = typeof x === 'function' ? x(celulas[i]) : x; }]; },
    useRef: (v) => { const i = cursor++; return celulas[i] ??= { current: v }; },
    useEffect: (f, deps) => { const i = cursor++; if (deps && celulas[i]) return; celulas[i] = true; efeitos.push(f); },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const tela = {};
  vm.runInNewContext(compilar('components/admin/CorrecoesCriativos.web.tsx'), {
    exports: tela, Date, Number, Object, Set, console: { warn: (...a) => logs.push(a.join(' ')) },
    require: (id) => {
      if (id === 'react') return React;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (id === '@/lib/admin-web') return client;
      if (id.endsWith('.css')) return {};
      throw new Error('import inesperado ' + id);
    },
  });
  const expandir = (n) => {
    if (n == null || typeof n !== 'object') return n;
    if (Array.isArray(n)) return n.map(expandir);
    if (typeof n.type === 'function') return expandir(n.type(n.props));
    return { ...n, props: { ...n.props, children: expandir(n.props?.children) } };
  };
  let arvore;
  const render = () => {
    cursor = 0; efeitos = [];
    arvore = expandir(tela.default());
    const pendentes = efeitos; efeitos = [];
    pendentes.forEach((f) => f());
    return arvore;
  };
  const todos = (n, saida = []) => {
    if (Array.isArray(n)) n.forEach((x) => todos(x, saida));
    else if (n && typeof n === 'object') { saida.push(n); todos(n.props?.children, saida); }
    return saida;
  };
  const texto = (n) => {
    if (n == null || typeof n === 'boolean') return '';
    if (Array.isArray(n)) return n.map(texto).join('');
    if (typeof n !== 'object') return String(n);
    return texto(n.props?.children);
  };
  const achar = (pred) => todos(arvore).find(pred);
  return {
    tela, pedidos, logs, respostas, render, texto: () => texto(arvore), achar, porId: (id) => achar((e) => e.props?.id === id),
    botao: (rotulo) => achar((e) => e.type === 'button' && texto(e).includes(rotulo)),
    todosOs: (pred) => todos(arvore).filter(pred),
    botoes: () => todos(arvore).filter((e) => e.type === 'button').map(texto),
    async assentar() { for (let i = 0; i < 6; i++) await tick(); return render(); },
    digitar(valor) { achar((e) => e.type === 'textarea').props.onChange({ currentTarget: { value: valor } }); render(); },
    async enviar() { achar((e) => e.type === 'form').props.onSubmit({ preventDefault() {} }); await this.assentar(); },
  };
}

let ok = 0;
const igual = (a, b, nome) => { assert.deepEqual(a, b, nome); ok++; };

(async () => {
  /* Ao abrir: uma leitura só, na função da fila de ajustes. */
  {
    const a = ambiente();
    a.respostas.push(lista([]));
    a.render();
    igual(a.texto().includes('Lendo as correções'), true, 'estado carregando');
    await a.assentar();
    igual(a.pedidos, [{ url: 'https://p.supabase.co/functions/v1/admin-ajustes', corpo: { recurso: 'ajustes-listar' } }], 'um pedido, à função admin-ajustes');
    igual(a.texto().includes('ainda não abriu nenhum pedido'), true, 'vazio explica');
  }

  /* Estados: cada um com rótulo e próximo passo; prontos primeiro; comparação só no pronto. */
  {
    const a = ambiente();
    const todos = ['novo', 'em-correcao', 'aceito', 'falha-de-envio', 'desatualizado', 'aguardando-aprovacao-de-custo', 'precisa-de-atencao', 'encerrado', 'recusado-pelo-autor']
      .map((estado, i) => pedido(i + 10, { estado, aceiteEm: estado === 'aceito' ? '2026-10-16T11:00:00.000Z' : null }));
    a.respostas.push(lista([...todos, pronto(1)]));
    a.render(); await a.assentar();
    const t = a.texto();
    for (const rotulo of ['Na fila', 'Em correção', 'Aceito', 'Falha ao entregar ao agente', 'Desatualizado', 'Aguardando sua decisão de custo', 'Precisa de atenção', 'Encerrado', 'Recusado', 'Pronto para sua revisão']) {
      igual(t.includes(rotulo), true, `rótulo "${rotulo}"`);
    }
    igual(t.includes('1 pronto(s) para sua revisão'), true, 'contagem dos prontos');
    const itens = a.achar((e) => e.type === 'ol').props.children;
    igual(a.texto().indexOf('carrossel-1.png') < a.texto().indexOf('carrossel-10.png'), true, 'o pronto para revisão vem antes dos outros');
    igual(itens.length, 10, 'dez itens');
    igual(a.achar((e) => e.props?.role === 'group' && /Comparação/.test(e.props['aria-label'] ?? '')) !== undefined, true, 'o pronto tem comparação');
    // Só um bloco de comparação: nos demais estados não existe.
    igual(a.todosOs((e) => e.props?.role === 'group').length, 1, 'comparação só no item pronto para revisão');
    igual(t.includes('Antes (versão pedida)') && t.includes('Depois (versão corrigida)'), true, 'antes e depois nomeados');
    igual([t.includes(sha('1').slice(0, 7)), t.includes(sha('2').slice(0, 7)), t.includes(`Commit ${sha('3').slice(0, 7)}`)], [true, true, true], 'versões e commit por identificador curto');
    igual(t.includes('prévia das artes ainda não abre aqui'), true, 'a ausência da prévia é dita, não escondida');
    igual(t.includes('Aceito em'), true, 'aceito mostra quando');
  }

  /* O aceite não existe no navegador: nenhum botão de aceitar, e o motivo está na tela. */
  {
    const a = ambiente();
    a.respostas.push(lista([pronto(1)]));
    a.render(); await a.assentar();
    igual(a.botoes().some((b) => /aceitar|aprovar|publicar/i.test(b)), false, 'nenhum botão de aceitar, aprovar ou publicar');
    igual(a.texto().includes('Para aceitar, use o painel local') && a.texto().includes(`só para a versão ${sha('2').slice(0, 7)}`), true, 'diz onde aceitar e que vale só para a versão vista');
    igual(a.pedidos.length, 1, 'abrir a tela não grava nada');
  }

  /* Pedir outro ajuste: alvo é a versão corrigida vista; corpo exato; recibo; lista relida. */
  {
    const a = ambiente();
    a.respostas.push(lista([pronto(1)]));
    a.render(); await a.assentar();
    igual(a.porId('admin-corr-form-' + pronto(1).id), undefined, 'formulário começa fechado');
    a.botao('Pedir outro ajuste').props.onClick(); a.render();
    igual(a.botao('Fechar').props['aria-expanded'], true, 'botão anuncia que abriu');
    a.digitar(`  ${SEGREDO}  `);
    a.respostas.push(criado(pedido(2).id)); a.respostas.push(lista([pronto(1, { estado: 'em-correcao' })]));
    await a.enviar();
    igual(a.pedidos[1], { url: 'https://p.supabase.co/functions/v1/admin-ajustes',
      corpo: { recurso: 'ajustes-criar', pecaId: pronto(1).pecaId, caminho: pronto(1).caminho, versaoAlvo: sha('2'), texto: SEGREDO } }, 'pedido com a versão corrigida como alvo e texto aparado');
    igual(a.pedidos.length, 3, 'depois de enviar, a lista é relida');
    igual(a.texto().includes('Pedido enviado às'), true, 'recibo de sucesso');
    igual(a.texto().includes('Em correção'), true, 'a lista reflete o novo andamento');
    igual(a.logs, [], 'sucesso não loga nada');
  }

  /* Validação do navegador: nada sai. */
  for (const [nome, valor, aviso] of [['vazio', '   ', 'Escreva o que precisa mudar'], ['acima de 2000', 'x'.repeat(2001), 'até 2000 caracteres']]) {
    const a = ambiente();
    a.respostas.push(lista([pronto(1)]));
    a.render(); await a.assentar();
    a.botao('Pedir outro ajuste').props.onClick(); a.render();
    a.digitar(valor); await a.enviar();
    igual(a.pedidos.length, 1, `${nome}: nenhum pedido sai`);
    igual(a.texto().includes(aviso), true, `${nome}: aviso na tela`);
  }
  {
    const a = ambiente();
    a.respostas.push(lista([pronto(1, { versaoCorrigida: null })]));
    a.render(); await a.assentar();
    // Sem versão corrigida o botão nem aparece como pronto para ajuste seguro: o envio é barrado.
    a.botao('Pedir outro ajuste').props.onClick(); a.render();
    a.digitar('x'); await a.enviar();
    igual([a.pedidos.length, a.texto().includes('não tem versão corrigida')], [1, true], 'sem versão corrigida registrada, nada sai');
  }

  /* Falha ao enviar: recibo com referência, texto preservado, log só com código. */
  {
    const a = ambiente();
    a.respostas.push(lista([pronto(1)]));
    a.render(); await a.assentar();
    a.botao('Pedir outro ajuste').props.onClick(); a.render();
    a.digitar(SEGREDO);
    a.respostas.push({ status: 503, body: { ok: false, erro: { codigo: 'indisponivel' }, ocorrencia: 'ref-corr-1' } });
    await a.enviar();
    const t = a.texto();
    igual([t.includes('Não foi possível enviar o pedido'), t.includes('ref-corr-1'), t.includes('Nada foi gravado')], [true, true, true], 'recibo com referência');
    igual(a.achar((e) => e.type === 'textarea').props.value, SEGREDO, 'o texto digitado continua no formulário');
    igual(a.logs, ['[admin-correcoes] indisponivel ref-corr-1'], 'log só com código e referência');
    igual(a.texto().includes('Pedido enviado'), false, 'não aparenta sucesso');
  }

  /* Erro ao ler: recibo e tentar de novo; nada do texto no log. */
  {
    const a = ambiente();
    a.respostas.push({ status: 503, body: { ok: false, erro: { codigo: 'indisponivel' }, ocorrencia: 'ref-corr-2' } });
    a.render(); await a.assentar();
    igual([a.texto().includes('Não foi possível ler as correções'), a.texto().includes('ref-corr-2')], [true, true], 'recibo de leitura');
    a.respostas.push(lista([pronto(1)]));
    a.botao('Tentar de novo').props.onClick(); await a.assentar();
    igual(a.texto().includes('carrossel-1.png'), true, 'tentar de novo lê de novo');
  }

  /* Contrato fechado: campo a mais (texto, autor) ou estado inventado derrubam a resposta. */
  for (const [nome, item] of [
    ['campo a mais com o texto do pedido', { ...pronto(1), texto: SEGREDO }],
    ['autor do pedido', { ...pronto(1), criadoPor: '11111111-1111-4111-8111-111111111111' }],
    ['estado inventado', pedido(1, { estado: 'publicado' })],
    ['caminho fora do acervo', pedido(1, { caminho: '/etc/passwd' })],
    ['versão que não é sha1', pedido(1, { versaoAlvo: 'abc' })],
  ]) {
    const a = ambiente();
    a.respostas.push(lista([item]));
    a.render(); await a.assentar();
    igual([a.texto().includes('resposta incompatível'), a.texto().includes(SEGREDO)], [true, false], `${nome}: resposta recusada`);
  }

  console.log(`admin-correcoes-tela: ${ok} checagens passaram — 0 falhas`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
