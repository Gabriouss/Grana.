'use strict';
/*
 * B3b (15/10/2026): tela de leitura dos feedbacks no /admin web.
 *
 *   node __tests__/admin-feedbacks-tela.cjs
 *
 * Executa o FeedbacksAdmin.web.tsx real sobre o lib/admin-web.ts real. Dublês: fetch,
 * sessão do Supabase e um React mínimo (useState/useRef/useEffect). Asserta QUAIS
 * pedidos saem (corpo exato, função certa), o que aparece na tela, o que nunca aparece
 * (user_id, texto do feedback no log) e que pedido inválido não sai do navegador.
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
const TEXTO = 'O app travou quando colei o pix';
const fb = (i, extra = {}) => ({
  id: `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`, tipo: 'suggestion', nota: 4, mensagem: `${TEXTO} ${i}`, status: 'pending',
  versaoApp: '1.10.5', plataforma: 'android', usoPublicoAutorizado: false, temConta: true,
  criadoEm: new Date(Date.UTC(2026, 9, 15, 12, 0, 0) - i * 60_000).toISOString(),
  gestao: { estado: 'novo', prioridade: null, responsavel: null, etiquetas: [], evidencia: null, versaoResolucao: null, atualizadoEm: null },
  ...extra,
});
const tick = () => new Promise((r) => setImmediate(r));

function ambiente() {
  const pedidos = [], logs = [], respostas = [];
  const client = {};
  vm.runInNewContext(compilar('lib/admin-web.ts'), {
    exports: client, Date, AbortController, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto,
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://p.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon' } },
    require: () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token-ficticio' } }, error: null }) } } }),
    fetch: async (url, init) => {
      pedidos.push({ url, corpo: JSON.parse(init.body) });
      const r = respostas.shift() ?? { status: 200, body: { ok: true, contrato: 1, geradoEm: '2026-10-15T15:00:00.000Z', dados: { feedbacks: [], haMais: false } } };
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
  vm.runInNewContext(compilar('components/admin/FeedbacksAdmin.web.tsx'), {
    exports: tela, Date, Number, Object, Set, console: { warn: (...a) => logs.push(a.join(' ')) },
    require: (id) => {
      if (id === 'react') return React;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (id === '@/lib/admin-web') return client;
      if (id.endsWith('.css')) return {};
      throw new Error('import inesperado ' + id);
    },
  });

  // Expande componentes de função para a árvore final de elementos.
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
  const porId = (id) => achar((e) => e.props?.id === id);
  const botao = (rotulo) => achar((e) => e.type === 'button' && texto(e).includes(rotulo));
  return {
    tela, pedidos, logs, respostas, render, texto: () => texto(arvore), achar, porId, botao,
    async assentar() { for (let i = 0; i < 5; i++) await tick(); return render(); },
    mudar(id, valor) { porId(id).props.onChange({ currentTarget: { value: valor } }); render(); },
    enviar() { const f = achar((e) => e.type === 'form'); f.props.onSubmit({ preventDefault() {} }); },
  };
}

let ok = 0;
const igual = (a, b, nome) => { assert.deepEqual(a, b, nome); ok++; };
const pagina = (feedbacks, haMais = false) => ({ status: 200, body: { ok: true, contrato: 1, geradoEm: '2026-10-15T15:00:00.000Z', dados: { feedbacks, haMais } } });

(async () => {
  /* Ao abrir: um pedido só, sem filtro, à função admin-feedbacks. */
  {
    const a = ambiente();
    a.respostas.push(pagina([fb(1), fb(2, { tipo: 'bug', nota: null, versaoApp: null, temConta: false, usoPublicoAutorizado: true })]));
    a.render();
    igual(a.texto().includes('Lendo os feedbacks'), true, 'estado carregando');
    await a.assentar();
    igual(a.pedidos.map((p) => [p.url, p.corpo]), [['https://p.supabase.co/functions/v1/admin-feedbacks', { recurso: 'feedbacks-listar' }]], 'um pedido, sem filtro');
    const t = a.texto();
    igual([t.includes(`${TEXTO} 1`), t.includes(`${TEXTO} 2`)], [true, true], 'as duas mensagens aparecem');
    igual([t.includes('Sugestão'), t.includes('Problema'), t.includes('4 de 5 estrelas'), t.includes('Sem nota')], [true, true, true, true], 'tipo e nota legíveis, também para leitor de tela');
    igual([t.includes('Versão 1.10.5'), t.includes('Versão não informada'), t.includes('Sem conta'), t.includes('Autorizou uso público')], [true, true, true, true], 'rodapé do item');
    igual(t.includes('2 feedbacks'), true, 'contagem');
    igual(a.botao('Carregar mais'), undefined, 'sem próxima página, sem botão');
    igual(a.logs, [], 'nada no log');
  }

  /* Filtros: o corpo leva exatamente o que foi escolhido; o dia vira o intervalo local inteiro. */
  {
    const a = ambiente();
    a.render(); await a.assentar();
    a.mudar('admin-fb-tipo', 'bug'); a.mudar('admin-fb-nota', '2'); a.mudar('admin-fb-versao', ' 1.10.5 ');
    a.mudar('admin-fb-desde', '2026-10-01'); a.mudar('admin-fb-ate', '2026-10-15');
    a.enviar(); await a.assentar();
    igual(a.pedidos[1].corpo, {
      recurso: 'feedbacks-listar', tipo: 'bug', nota: 2, versao: '1.10.5',
      desde: new Date('2026-10-01T00:00:00').toISOString(), ate: new Date('2026-10-15T23:59:59.999').toISOString(),
    }, 'filtros no corpo, nota como número, versão sem espaço');
    igual(a.texto().includes('Nenhum feedback com esses filtros.'), true, 'vazio com filtro');
    a.botao('Limpar').props.onClick(); await a.assentar();
    igual(a.pedidos[2].corpo, { recurso: 'feedbacks-listar' }, 'limpar volta sem filtro');
    igual(a.porId('admin-fb-tipo').props.value, '', 'limpar zera os campos');
    igual(a.texto().includes('Ainda não chegou nenhum feedback.'), true, 'vazio sem filtro');
  }

  /* Filtro inválido não sai do navegador. */
  for (const [nome, campos, aviso] of [
    ['versão com curinga', { 'admin-fb-versao': '1.%' }, 'na versão'],
    ['intervalo invertido', { 'admin-fb-desde': '2026-10-15', 'admin-fb-ate': '2026-10-01' }, 'antes da final'],
  ]) {
    const a = ambiente();
    a.render(); await a.assentar();
    for (const [id, v] of Object.entries(campos)) a.mudar(id, v);
    a.enviar(); await a.assentar();
    igual(a.pedidos.length, 1, `${nome}: nenhum pedido novo`);
    igual(a.texto().includes(aviso), true, `${nome}: aviso na tela`);
  }

  /* Carregar mais: cursor é o criadoEm do último, mantém o filtro, junta sem repetir. */
  {
    const a = ambiente();
    a.respostas.push(pagina(Array.from({ length: 50 }, (_, i) => fb(i + 1)), true));
    a.render(); await a.assentar();
    igual(a.texto().includes('50 feedbacks nesta lista, e há mais'), true, 'avisa que há mais');
    a.respostas.push(pagina([fb(50), fb(51)], false));
    a.botao('Carregar mais').props.onClick(); await a.assentar();
    igual(a.pedidos[1].corpo, { recurso: 'feedbacks-listar', antesDe: fb(50).criadoEm }, 'cursor do último item');
    igual(a.texto().includes('51 feedbacks'), true, 'junta sem repetir o 50');
    igual(a.botao('Carregar mais'), undefined, 'acabou a lista, some o botão');
    const ancora = a.achar((e) => e.type === 'li' && e.props.tabIndex === -1);
    igual(texto2(ancora).includes(`${TEXTO} 51`), true, 'o primeiro item novo recebe o foco');
  }

  /* Erro do servidor: recibo com referência, botão de tentar de novo, nada do texto no log. */
  {
    const a = ambiente();
    a.respostas.push({ status: 503, body: { ok: false, erro: { codigo: 'indisponivel' }, ocorrencia: 'ref-fixture-1' } });
    a.render(); await a.assentar();
    const t = a.texto();
    igual([t.includes('Não foi possível ler os feedbacks'), t.includes('ref-fixture-1')], [true, true], 'recibo com referência');
    igual(a.logs, ['[admin-feedbacks] indisponivel ref-fixture-1'], 'log só com código e referência');
    a.respostas.push(pagina([fb(1)]));
    a.botao('Tentar de novo').props.onClick(); await a.assentar();
    igual(a.texto().includes(`${TEXTO} 1`), true, 'tentar de novo lê de novo');
  }

  /* Resposta fora do contrato (campo a mais, como user_id) é recusada inteira. */
  {
    const a = ambiente();
    a.respostas.push(pagina([{ ...fb(1), user_id: '44444444-4444-4444-8444-444444444444' }]));
    a.render(); await a.assentar();
    const t = a.texto();
    igual([t.includes('resposta incompatível'), t.includes('44444444'), t.includes(TEXTO)], [true, false, false], 'campo a mais derruba a resposta');
  }

  /* Entrega 3: gestão por item. Só o que mudou vai ao servidor; o texto nunca é editável. */
  const gerir = (a, i) => { a.porId(`admin-fb-gerir-${fb(i).id}`).props.onClick(); a.render(); };
  const salvar = async (a) => {
    const f = a.achar((e) => e.type === 'form' && String(e.props.id ?? '').startsWith('admin-fb-gestao-'));
    f.props.onSubmit({ preventDefault() {} }); await a.assentar();
  };
  const GESTAO_SALVA = { estado: 'em_analise', prioridade: 'alta', responsavel: 'Gabriel', etiquetas: ['voz', 'android'], evidencia: null, versaoResolucao: null, atualizadoEm: '2026-10-16T10:00:00.000Z' };
  const respostaGestao = (id, gestao) => ({ status: 200, body: { ok: true, contrato: 1, geradoEm: '2026-10-16T13:30:00.000Z', dados: { id, gestao } } });
  {
    const a = ambiente();
    a.respostas.push(pagina([fb(1), fb(2)]));
    a.render(); await a.assentar();
    const t = a.texto();
    igual([t.includes('Andamento: Novo'), t.includes('Status no app: Pendente')], [true, true], 'cada item mostra o andamento e o status do app, separados');
    igual(a.porId('admin-fbg-estado'), undefined, 'a gestão começa fechada');
    gerir(a, 1);
    const botao = a.porId(`admin-fb-gerir-${fb(1).id}`);
    igual(botao.props['aria-expanded'], true, 'o botão anuncia que a gestão abriu');
    igual(a.porId('admin-fbg-estado').props.value, 'novo', 'o formulário parte do estado atual');
    igual(a.achar((e) => e.type === 'textarea').props.id, 'admin-fbg-evidencia', 'evidência é um campo próprio, não o texto do feedback');
    igual(a.achar((e) => e.props?.id === 'admin-fbg-dica').props.children.includes('Não cole dado pessoal'), true, 'a dica avisa para não colar dado pessoal');

    // Só o que mudou vai; vírgulas viram lista normalizada.
    a.mudar('admin-fbg-estado', 'em_analise'); a.mudar('admin-fbg-prioridade', 'alta');
    a.mudar('admin-fbg-responsavel', ' Gabriel '); a.mudar('admin-fbg-etiquetas', 'Voz,  android , voz');
    a.respostas.push(respostaGestao(fb(1).id, GESTAO_SALVA));
    await salvar(a);
    igual(a.pedidos[1], { url: 'https://p.supabase.co/functions/v1/admin-feedbacks',
      corpo: { recurso: 'feedbacks-gestao', id: fb(1).id, estado: 'em_analise', prioridade: 'alta', responsavel: 'Gabriel', etiquetas: ['voz', 'android'] } }, 'pedido só com o que mudou, para a função certa');
    const depois = a.texto();
    igual([depois.includes('Andamento: Em análise'), depois.includes('Prioridade alta'), depois.includes('Responsável: Gabriel'), depois.includes('Gestão salva às')], [true, true, true, true], 'a lista reflete a gestão gravada e recibo de sucesso');
    igual([a.porId('admin-fbg-estado'), a.pedidos.length], [undefined, 2], 'o formulário fecha e não há pedido extra');
    igual(depois.includes(`${TEXTO} 1`), true, 'o texto original segue intacto');
    igual(a.texto().includes('Andamento: Novo'), true, 'o outro feedback continua novo');
  }

  /* Validação do navegador: nada sai. */
  for (const [nome, campos, aviso] of [
    ['resolvido sem evidência', { 'admin-fbg-estado': 'resolvido', 'admin-fbg-versao': '1.11.0' }, 'informe a evidência'],
    ['resolvido sem versão', { 'admin-fbg-estado': 'resolvido', 'admin-fbg-evidencia': 'Commit 02235ca' }, 'informe a versão'],
    ['etiqueta com e-mail', { 'admin-fbg-etiquetas': 'joao@exemplo.com' }, 'Não escreva dado pessoal'],
    ['nove etiquetas', { 'admin-fbg-etiquetas': 'a,b,c,d,e,f,g,h,i' }, 'no máximo 8'],
    ['versão com curinga', { 'admin-fbg-versao': '1.%' }, 'na versão'],
    ['sem alteração', {}, 'Nenhuma alteração'],
  ]) {
    const a = ambiente();
    a.respostas.push(pagina([fb(1)]));
    a.render(); await a.assentar(); gerir(a, 1);
    for (const [id, v] of Object.entries(campos)) a.mudar(id, v);
    await salvar(a);
    igual(a.pedidos.length, 1, `${nome}: nenhum pedido de gestão sai`);
    igual(a.texto().includes(aviso), true, `${nome}: aviso na tela`);
  }

  /* Arquivar pede um segundo toque. */
  {
    const a = ambiente();
    a.respostas.push(pagina([fb(1)]));
    a.render(); await a.assentar(); gerir(a, 1);
    a.mudar('admin-fbg-estado', 'arquivado');
    await salvar(a);
    igual(a.pedidos.length, 1, 'arquivar: o primeiro toque não grava');
    igual(a.botao('Confirmar arquivamento') !== undefined, true, 'arquivar: o botão vira confirmação');
    a.respostas.push(respostaGestao(fb(1).id, { ...GESTAO_SALVA, estado: 'arquivado', prioridade: null, responsavel: null, etiquetas: [] }));
    await salvar(a);
    igual(a.pedidos[1].corpo, { recurso: 'feedbacks-gestao', id: fb(1).id, estado: 'arquivado' }, 'arquivar: o segundo toque grava');
    igual(a.texto().includes('Andamento: Arquivado'), true, 'arquivar: a lista mostra o arquivado');
  }

  /* Falha ao salvar: recibo, nada some, o formulário segue aberto com o digitado, sem texto no log. */
  {
    const a = ambiente();
    a.respostas.push(pagina([fb(1)]));
    a.render(); await a.assentar(); gerir(a, 1);
    a.mudar('admin-fbg-responsavel', 'Gabriel');
    a.respostas.push({ status: 503, body: { ok: false, erro: { codigo: 'indisponivel' }, ocorrencia: 'ref-gestao-1' } });
    await salvar(a);
    const t = a.texto();
    igual([t.includes('Não foi possível salvar a gestão'), t.includes('ref-gestao-1'), t.includes('Nada foi gravado')], [true, true, true], 'falha: recibo com referência');
    igual([a.porId('admin-fbg-responsavel').props.value, t.includes('Andamento: Novo'), t.includes(`${TEXTO} 1`)], ['Gabriel', true, true], 'falha: o digitado e a lista continuam');
    igual(a.logs, ['[admin-feedbacks] indisponivel ref-gestao-1'], 'falha: log só com código e referência');
    igual(a.texto().includes('Gestão salva'), false, 'falha: não aparenta salvamento');
  }

  /* Resposta de gestão fora do contrato é recusada, inclusive id trocado. */
  {
    const a = ambiente();
    a.respostas.push(pagina([fb(1)]));
    a.render(); await a.assentar(); gerir(a, 1);
    a.mudar('admin-fbg-prioridade', 'baixa');
    a.respostas.push(respostaGestao(fb(2).id, GESTAO_SALVA));
    await salvar(a);
    igual(a.texto().includes('resposta incompatível'), true, 'gestão de outro id na resposta é recusada');
    igual(a.texto().includes('Gestão salva'), false, 'e não vira sucesso');
  }

  /* Contrato da lista: item sem gestão, ou com chave a mais na gestão, derruba a resposta. */
  for (const [nome, item] of [
    ['sem gestão', (() => { const x = fb(1); delete x.gestao; return x; })()],
    ['estado inventado', fb(1, { gestao: { ...fb(1).gestao, estado: 'apagado' } })],
    ['chave a mais na gestão', fb(1, { gestao: { ...fb(1).gestao, atualizadoPor: '11111111-1111-4111-8111-111111111111' } })],
  ]) {
    const a = ambiente();
    a.respostas.push(pagina([item]));
    a.render(); await a.assentar();
    igual(a.texto().includes('resposta incompatível'), true, `lista ${nome}: resposta recusada`);
  }

  console.log(`admin-feedbacks-tela: ${ok} checagens passaram — 0 falhas`);
})().catch((e) => { console.error(e); process.exitCode = 1; });

function texto2(n) {
  if (n == null || typeof n === 'boolean') return '';
  if (Array.isArray(n)) return n.map(texto2).join('');
  if (typeof n !== 'object') return String(n);
  return texto2(n.props?.children);
}
