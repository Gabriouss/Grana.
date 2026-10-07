// Painel administrativo local do Grana. Casca, roteamento por hash e utilidades das telas.
// Contrato de tela: cada módulo em ./telas/ exporta `montar(raiz, ctx)` e pode devolver uma
// função de limpeza. Interface descrita em E:/Grana-temporarios/2026-10-07-admin-panel/INTERFACE-front-anvil-lumen.md.
//
// Regra de segurança deste arquivo: texto que vem da API entra SEMPRE por textContent ou
// atributo, nunca por innerHTML. Nenhuma credencial passa por aqui: o servidor local guarda
// as chaves e só devolve status e dados já sanitizados.

import { SIMULADO } from './simulado.js';
import { criarAcesso, CODIGOS_LOGIN, ROTAS_SESSAO } from './telas/_acesso.js';

const ROTAS_SEM_EFEITO = new Set(Object.values(ROTAS_SESSAO));

const ROTAS = {
  'visao-geral': { modulo: 'visao-geral', titulo: 'Visão geral' },
  supabase: { modulo: 'supabase', titulo: 'Supabase' },
  vercel: { modulo: 'vercel', titulo: 'Vercel' },
  eas: { modulo: 'eas', titulo: 'EAS e builds' },
  github: { modulo: 'github', titulo: 'GitHub' },
  vendas: { modulo: 'vendas', titulo: 'Vendas (Cakto)' },
  'marketing/documento': { modulo: 'documento', titulo: 'Documento de marketing' },
  'marketing/aprovacao': { modulo: 'aprovacao', titulo: 'Aprovação' },
  'marketing/feed': { modulo: 'feed', titulo: 'Feed' },
  'marketing/calendario': { modulo: 'calendario', titulo: 'Calendário' },
  'marketing/trafego': { modulo: 'trafego', titulo: 'Tráfego pago' },
  'marketing/acervo': { modulo: 'acervo', titulo: 'Acervo' },
  'design-system': { modulo: 'design-system', titulo: 'Design System' },
};
const ROTA_PADRAO = 'visao-geral';
const PRAZO_MS = 20000; // o servidor corta cada adaptador em 15s; 5s de folga para a resposta chegar
// Ações cujo pior caso no servidor passa dos 20s. O prazo daqui tem de cobrir o de lá com folga,
// senão a tela diz falha enquanto o servidor ainda conclui (achado A1 do Lynx).
const PRAZO_ACAO_MS = {
  '/api/eas/preparar-build': 130000, // preparar-lancamento.ts tem até 120s no servidor
  '/api/vercel/redeploy': 45000, // descobrir projeto + lista + POST, 15s cada
};
export const prazoDaAcao = (caminho) => PRAZO_ACAO_MS[caminho.split('?')[0]] || PRAZO_MS;

// ---------------------------------------------------------------------------
// Elementos

export function h(tag, attrs, ...filhos) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'texto') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dados' && typeof v === 'object') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  anexar(el, filhos);
  return el;
}

function anexar(el, filhos) {
  for (const f of filhos) {
    if (f === undefined || f === null || f === false) continue;
    if (Array.isArray(f)) anexar(el, f);
    else if (f instanceof Node) el.appendChild(f);
    else el.appendChild(document.createTextNode(String(f)));
  }
}

function limpar(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// ---------------------------------------------------------------------------
// Formatação pt-BR

const fmtData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const fmtReais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNumero = new Intl.NumberFormat('pt-BR');

function paraData(v) {
  if (v === undefined || v === null || v === '') return null;
  // "AAAA-MM-DD" sozinho é data local, não meia-noite UTC (regra da hora local)
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [a, m, d] = v.split('-').map(Number);
    return new Date(a, m - 1, d);
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d/.test(v)) {
    v = v.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d{2})$/, '$1:00');
  }
  const d = new Date(typeof v === 'number' && v < 1e12 ? v * 1000 : v);
  return Number.isNaN(d.getTime()) ? null : d;
}
export const formatar = {
  data: (v) => { const d = paraData(v); return d ? fmtData.format(d) : 'sem data'; },
  dataHora: (v) => { const d = paraData(v); return d ? fmtDataHora.format(d) : 'sem data'; },
  reais: (n) => (typeof n === 'number' && Number.isFinite(n) ? fmtReais.format(n) : 'sem valor'),
  numero: (n) => (typeof n === 'number' && Number.isFinite(n) ? fmtNumero.format(n) : 'sem dado'),
  relativo(v) {
    const d = paraData(v);
    if (!d) return 'sem data';
    const min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const horas = Math.round(min / 60);
    if (horas < 24) return `há ${horas} h`;
    const dias = Math.round(horas / 24);
    return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
  },
  isoLocal(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
};

// ---------------------------------------------------------------------------
// Rede

let modoSimulado = false;

class ErroApi extends Error {
  constructor(codigo, mensagem, status) {
    super(mensagem || 'Erro sem mensagem.');
    this.codigo = codigo || 'erro';
    this.status = status || 0;
  }
}

function lerErro(corpo, status) {
  // aceita o formato do contrato ({ok:false, erro}) e o alternativo ({error:{code,message}})
  const e = (corpo && (corpo.erro || corpo.error)) || {};
  const err = new ErroApi(e.codigo || e.code || `http-${status}`, e.mensagem || e.message || `O servidor respondeu ${status}.`, status);
  // Sessão sem pareamento ou antiga: nada na tela funciona até reabrir pelo atalho.
  // Isso tapa o painel inteiro e nunca vira modo simulado.
  if (status === 401 && err.codigo === 'nao-pareado') bloquearPainel('nao-pareado');
  if (status === 403 && err.codigo === 'sessao-antiga') bloquearPainel('sessao-antiga');
  // Vencimento (10 min sem uso ou 1 h de login): o servidor destrói o pareamento junto, então a
  // tela de senha não funciona mais. Vira tela cheia com o motivo e a orientação do atalho.
  if (status === 401 && MOTIVOS_VENCIMENTO.includes(err.codigo)) bloquearPainel(err.codigo);
  // Login pendente: a tela de acesso assume.
  else if (status === 401 && CODIGOS_LOGIN.includes(err.codigo) && acesso) acesso.exigir(err.codigo);
  if (status === 503 && err.codigo === 'login-nao-configurado' && acesso) acesso.exigirSemConta();
  // erros 429 carregam o tempo de espera
  if (e.tentarEmSeg !== undefined) err.tentarEmSeg = e.tentarEmSeg;
  return err;
}

const MOTIVOS_VENCIMENTO = ['inatividade', 'sessao-expirada'];
// motivos que dizem POR QUE o painel deixou de estar pareado: valem mais que o "não pareado" genérico
const MOTIVOS_COM_CAUSA = ['saiu', ...MOTIVOS_VENCIMENTO];

const TEXTO_BLOQUEIO = {
  'nao-pareado': {
    titulo: 'Painel não pareado',
    texto: 'Painel não pareado. Abra pelo atalho Grana. Admin na Área de Trabalho.',
  },
  'servidor-fora': {
    titulo: 'Sem contato com o servidor',
    texto: 'O painel perdeu contato com o servidor local. Abra de novo pelo atalho Grana. Admin.',
  },
  saiu: {
    titulo: 'Você saiu do painel',
    texto: 'A sessão foi encerrada neste navegador. Para entrar de novo, abra o painel pelo atalho Grana. Admin na Área de Trabalho.',
  },
  inatividade: {
    titulo: 'Sessão vencida',
    texto: 'A sessão venceu depois de 10 minutos sem uso. Reabra o painel pelo atalho Grana. Admin na Área de Trabalho.',
  },
  'sessao-expirada': {
    titulo: 'Sessão vencida',
    texto: 'A sessão venceu ao completar 1 hora de login. Reabra o painel pelo atalho Grana. Admin na Área de Trabalho.',
  },
  'sessao-antiga': {
    titulo: 'Sessão antiga',
    texto: 'Esta aba é de uma sessão antiga do painel, e a última ação não foi feita. Feche esta aba e abra o painel de novo pelo atalho Grana. Admin na Área de Trabalho.',
  },
};
let bloqueado = null;

export function bloquearPainel(motivo) {
  // "saiu" e o vencimento substituem o "não pareado" que eles mesmos provocam (depois de sair ou
  // vencer, todo pedido volta nao-pareado); o resto não troca de motivo
  if (bloqueado && !(MOTIVOS_COM_CAUSA.includes(motivo) && bloqueado === 'nao-pareado')) return;
  for (const a of document.querySelectorAll('.avisos .aviso')) a.remove();
  if (bloqueado) for (const el of document.querySelectorAll('.bloqueio')) el.remove();
  bloqueado = motivo;
  epoca++;
  if (acesso) acesso.parar();
  const t = TEXTO_BLOQUEIO[motivo] || TEXTO_BLOQUEIO['nao-pareado'];
  const casca = document.querySelector('.casca');
  // some com o painel inteiro: a mensagem ocupa a tela mesmo sem o estilo.css
  if (casca) { casca.inert = true; casca.hidden = true; }
  const faixaSim = faixa();
  if (faixaSim) faixaSim.hidden = true;
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  // a tela de login ou o aviso de inatividade não podem ficar por cima do bloqueio
  for (const el of document.querySelectorAll('.acesso, .aviso-inatividade')) el.remove();
  const tela = h('div', { class: 'bloqueio', role: 'alert', 'aria-labelledby': 'bloqueio-titulo' },
    h('div', { class: 'bloqueio-caixa' },
      h('img', { class: 'bloqueio-marca', src: '/design-system/marca/logotipo-gradiente.svg', alt: 'Grana.', width: '120', height: '34' }),
      h('h1', { class: 'bloqueio-titulo', id: 'bloqueio-titulo', tabindex: '-1', texto: t.titulo }),
      h('p', { class: 'bloqueio-texto', texto: t.texto }),
      h('p', { class: 'bloqueio-ajuda', texto: motivo === 'servidor-fora'
        ? 'O atalho liga o servidor de novo e pareia este navegador. Nada mais é tentado sozinho por esta aba.'
        : MOTIVOS_COM_CAUSA.includes(motivo)
          ? 'O atalho pareia este navegador de novo e pede a senha e o código. Esta aba não envia mais nada: pode fechá-la.'
          : 'Por segurança, o painel só responde à janela aberta pelo atalho. Nenhum dado foi mostrado e nenhuma ação foi enviada.' })));
  document.body.appendChild(tela);
  tela.querySelector('h1').focus();
  document.title = `${t.titulo} · Grana. Administração local`;
}

// Só pedido nascido de gesto da pessoa (clique, tecla, envio, troca de tela) renova a inatividade
// no servidor. Recarga automática e temporizador vão sem o cabeçalho.
let ultimoGesto = 0;
const JANELA_GESTO_MS = 3000;
for (const tipo of ['pointerdown', 'keydown', 'submit']) document.addEventListener(tipo, () => { ultimoGesto = Date.now(); }, true);
window.addEventListener('hashchange', () => { ultimoGesto = Date.now(); }, true);

// Época da sessão na tela. Sair, bloquear ou esconder o painel avança a época, e qualquer resposta
// de um pedido feito antes disso é descartada sem efeito: não repinta tela, não mostra aviso,
// não renova a inatividade (F5).
let epoca = 0;

async function pedir(caminho, opcoes, prazoMs = PRAZO_MS) {
  const minhaEpoca = epoca;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), prazoMs);
  // Login, pareamento, saída e renovação podem ser repetidos sem efeito colateral: não são "ação".
  const ehAcao = opcoes && opcoes.method === 'POST' && !ROTAS_SEM_EFEITO.has(caminho);
  const deGesto = caminho.startsWith('/api/') && caminho !== '/api/saude' && Date.now() - ultimoGesto < JANELA_GESTO_MS;
  if (deGesto) opcoes = { ...opcoes, headers: { ...(opcoes.headers || {}), 'X-Grana-Atividade': '1' } };
  try {
    // o corpo é lido dentro do prazo também: um corpo pendurado não pode travar a tela
    const resp = await fetch(caminho, { ...opcoes, signal: ctrl.signal, credentials: 'same-origin', cache: 'no-store' });
    const texto = await resp.text();
    if (minhaEpoca !== epoca) throw new ErroApi('descartado', 'Resposta de antes da saída, descartada.', 0);
    let corpo = null;
    try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = null; }
    if (!resp.ok || !corpo || corpo.ok === false) {
      if (!corpo) throw new ErroApi(`http-${resp.status}`, `O servidor respondeu ${resp.status} sem JSON.`, resp.status);
      throw lerErro(corpo, resp.status);
    }
    if (deGesto && acesso) acesso.registrarAtividade();
    return corpo;
  } catch (err) {
    if (err instanceof ErroApi) throw err;
    if (minhaEpoca !== epoca) throw new ErroApi('descartado', 'Resposta de antes da saída, descartada.', 0);
    // Numa ação, prazo esgotado ou conexão caída não provam falha: o servidor pode ter concluído.
    if (ehAcao && err && err.name === 'AbortError') {
      throw new ErroApi('resultado-desconhecido', `Resultado desconhecido: o servidor local não respondeu em ${Math.round(prazoMs / 1000)} segundos e a ação pode ter sido feita. Confira antes de repetir.`, 0);
    }
    // Conexão recusada ou rede caída: se o servidor sumiu de vez, o painel para tudo e diz isso.
    if (err instanceof TypeError && caminho !== '/api/saude' && !modoSimulado && (await servidorCaiu())) {
      bloquearPainel('servidor-fora');
      throw new ErroApi('servidor-fora', TEXTO_BLOQUEIO['servidor-fora'].texto, 0);
    }
    // Só ação com efeito (redeploy, build, gravação) fica com resultado desconhecido.
    if (ehAcao && err instanceof TypeError) {
      throw new ErroApi('resultado-desconhecido', 'Resultado desconhecido: a conexão com o servidor local caiu no meio do envio e a ação pode ter sido feita. Confira antes de repetir.', 0);
    }
    if (err && err.name === 'AbortError') throw new ErroApi('prazo', `O servidor local demorou mais de ${Math.round(prazoMs / 1000)} segundos para responder.`, 0);
    throw new ErroApi('rede', 'Não consegui falar com o servidor local. Ele está aberto?', 0);
  } finally {
    clearTimeout(timer);
  }
}

// Confirma a queda com uma sonda curta em /api/saude, para um tropeço isolado não fechar o painel.
async function servidorCaiu() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch('/api/saude', { signal: ctrl.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
    return !r.ok;
  } catch (e) {
    // sonda que só demorou é servidor lento, não servidor fora
    return !(e && e.name === 'AbortError');
  } finally {
    clearTimeout(t);
  }
}

// Só cai no simulado a rota que o servidor declara que não existe. 404 de domínio (peça inexistente,
// projeto não encontrado) e queda de rede no meio do uso são erros reais e aparecem como erro (achado A4 do Lynx).
function deveSimular(err) {
  if (bloqueado || (acesso && (acesso.ativo || acesso.entrou))) return false;
  return modoSimulado || (err instanceof ErroApi && err.status === 404 && err.codigo === 'rota-inexistente');
}

async function api(caminho) {
  if (!modoSimulado) {
    try {
      return await pedir(caminho, { method: 'GET', headers: { Accept: 'application/json', 'X-Grana-Admin': '1' } });
    } catch (err) {
      if (!deveSimular(err) || !SIMULADO.temLeitura(caminho)) throw err;
      marcarSimulado(`A rota ${caminho.split('?')[0]} ainda não existe no servidor.`);
    }
  }
  return SIMULADO.ler(caminho);
}

// Token anti-CSRF da sessão local. O cookie é HttpOnly e o servidor o emite junto com a página;
// o token só vive nesta variável, nunca em storage.
let csrfToken = null;

async function obterCsrf(forcar) {
  if (csrfToken && !forcar) return csrfToken;
  const r = await pedir('/api/sessao', { method: 'GET', headers: { Accept: 'application/json', 'X-Grana-Admin': '1' } });
  csrfToken = (r.dados && (r.dados.csrfToken || r.dados.csrf)) || null;
  if (!csrfToken) throw new ErroApi('sessao', 'O servidor local não entregou o token da sessão. Recarregue a página.', 0);
  return csrfToken;
}

async function postar(caminho, corpo, forcarToken) {
  const token = await obterCsrf(forcarToken);
  return pedir(caminho, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Grana-Admin': '1', 'X-CSRF-Token': token },
    body: JSON.stringify(corpo || {}),
  }, prazoDaAcao(caminho));
}

// POST sem CSRF: só o pareamento, que acontece antes de existir sessão.
async function enviarSemCsrf(caminho, corpo) {
  return pedir(caminho, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Grana-Admin': '1' },
    body: JSON.stringify(corpo || {}),
  });
}

async function acao(caminho, corpo) {
  if (bloqueado) throw new ErroApi(bloqueado, TEXTO_BLOQUEIO[bloqueado].texto, bloqueado === 'nao-pareado' ? 401 : 403);
  if (acesso && acesso.ativo) throw new ErroApi('nao-autenticado', 'Entre no painel antes de fazer qualquer ação.', 401);
  if (!modoSimulado) {
    try {
      try {
        return await postar(caminho, corpo, false);
      } catch (err) {
        // sessão expirada ou token trocado: renova uma vez e tenta de novo
        if (err instanceof ErroApi && err.status === 403 && ['sessao-expirada', 'csrf-invalido'].includes(err.codigo)) {
          return await postar(caminho, corpo, true);
        }
        // ação destrutiva com código velho: pede o código de novo e repete UMA vez
        if (err instanceof ErroApi && err.status === 403 && err.codigo === 'reautenticar' && acesso) {
          if (!(await acesso.reautenticar())) throw new ErroApi('cancelado', 'Ação cancelada: o código não foi confirmado, nada foi feito.', 0);
          return await postar(caminho, corpo, false);
        }
        throw err;
      }
    } catch (err) {
      if (!deveSimular(err) || !SIMULADO.temAcao(caminho)) throw err;
      marcarSimulado(`A ação ${caminho} ainda não existe no servidor; simulada só nesta aba.`);
    }
  }
  return SIMULADO.agir(caminho, corpo);
}

// ---------------------------------------------------------------------------
// Faixa de simulado, avisos (toast), modal

const faixa = () => document.querySelector('.faixa-simulado');

function marcarSimulado(motivo) {
  const f = faixa();
  if (!f) return;
  f.hidden = false;
  limpar(f);
  f.appendChild(h('strong', { texto: 'Dados simulados. ' }));
  f.appendChild(document.createTextNode(`${motivo} Nada aqui veio do Supabase, da Vercel, do EAS ou da Cakto, e nenhuma ação sai desta aba.`));
  if (modoSimulado) {
    f.appendChild(h('button', {
      class: 'botao botao-fantasma', type: 'button', texto: 'Tentar o servidor de novo',
      onclick: async () => { if (await checarServidor()) { f.hidden = true; renderizar(); } else aviso('O servidor local continua fora do ar.', 'erro'); },
    }));
  }
}

export function aviso(texto, tipo = 'info', { mesmoSemPainel = false } = {}) {
  const caixa = document.querySelector('.avisos');
  if (!caixa) return;
  // com o painel escondido (sem sessão), aviso de tela antiga não aparece: pode carregar dado
  const casca = document.querySelector('.casca');
  if (!mesmoSemPainel && casca && casca.hidden) return;
  // mesma mensagem já na tela: não empilha outra igual
  const chave = `${tipo}|${texto}`;
  for (const existente of caixa.querySelectorAll('.aviso')) if (existente.dataset.chave === chave) return;
  const el = h('div', { class: `aviso aviso-${tipo}`, role: tipo === 'erro' ? 'alert' : 'status', dados: { chave } },
    h('span', { texto }),
    h('button', { class: 'botao botao-fantasma', type: 'button', 'aria-label': 'Fechar aviso', texto: 'Fechar', onclick: () => el.remove() }));
  caixa.appendChild(el);
  // erro fica até a pessoa fechar; sucesso some sozinho
  if (tipo !== 'erro') setTimeout(() => el.remove(), 6000);
}

function abrirDialogo(conteudo, aoFechar) {
  const dlg = h('dialog', { class: 'modal', 'aria-modal': 'true' }, conteudo);
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => { aoFechar(); dlg.remove(); });
  dlg.addEventListener('cancel', () => { /* Esc fecha com resultado nulo */ });
  dlg.showModal();
  return dlg;
}

// Confirmação digitada: o botão só liga quando o texto é exatamente a frase pedida.
export function confirmar({ titulo, texto, detalhes, frase, rotuloBotao = 'Confirmar', perigo = false }) {
  return new Promise((resolver) => {
    let resultado = false;
    const idTitulo = `modal-t-${Math.random().toString(36).slice(2)}`;
    const entrada = frase ? h('input', {
      type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters',
      'aria-describedby': `${idTitulo}-frase`,
    }) : null;
    const botaoOk = h('button', {
      class: `botao ${perigo ? 'botao-perigo' : 'botao-primario'}`, type: 'button', texto: rotuloBotao, disabled: !!frase,
      onclick: () => { resultado = true; dlg.close(); },
    });
    if (entrada) {
      entrada.addEventListener('input', () => { botaoOk.disabled = entrada.value.trim() !== frase; });
      entrada.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !botaoOk.disabled) { e.preventDefault(); botaoOk.click(); } });
    }
    const dlg = abrirDialogo([
      h('h2', { class: 'modal-titulo', id: idTitulo, texto: titulo }),
      texto ? h('p', { class: 'modal-texto', texto }) : null,
      detalhes && detalhes.length ? h('ul', { class: 'modal-detalhes' }, detalhes.map((d) => h('li', { texto: d }))) : null,
      frase ? h('div', { class: 'campo' },
        h('label', { id: `${idTitulo}-frase` }, 'Para continuar, digite ', h('span', { class: 'modal-frase mono', texto: frase })),
        entrada) : null,
      h('div', { class: 'modal-acoes' },
        h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Cancelar', onclick: () => dlg.close() }),
        botaoOk),
    ], () => resolver(resultado));
    dlg.setAttribute('aria-labelledby', idTitulo);
    (entrada || botaoOk).focus();
  });
}

// Formulário em modal. campos: [{ nome, rotulo, tipo:'text|textarea|date|time|number|select', opcoes:[{valor,rotulo}], valor, obrigatorio, ajuda, min, max, passo }]
export function formulario({ titulo, texto, campos, rotuloBotao = 'Salvar' }) {
  return new Promise((resolver) => {
    let resultado = null;
    const idTitulo = `form-t-${Math.random().toString(36).slice(2)}`;
    const form = h('form', { class: 'modal-form', novalidate: true });
    const entradas = {};
    for (const c of campos) entradas[c.nome] = criarCampo(form, c, idTitulo);
    const erro = h('p', { class: 'campo-erro', role: 'alert', hidden: true });
    form.appendChild(erro);
    form.appendChild(h('div', { class: 'modal-acoes' },
      h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Cancelar', onclick: () => dlg.close() }),
      h('button', { class: 'botao botao-primario', type: 'submit', texto: rotuloBotao })));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const valores = {};
      for (const c of campos) {
        const el = entradas[c.nome];
        let v = c.tipo === 'select' && c.multiplo ? [...el.selectedOptions].map((o) => o.value) : el.value.trim();
        if (c.tipo === 'number' && v !== '') v = Number(v.replace(',', '.'));
        if (c.obrigatorio && (v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'number' && Number.isNaN(v)))) {
          erro.hidden = false;
          erro.textContent = `Preencha "${c.rotulo}".`;
          el.focus();
          return;
        }
        valores[c.nome] = v;
      }
      resultado = valores;
      dlg.close();
    });
    const dlg = abrirDialogo([
      h('h2', { class: 'modal-titulo', id: idTitulo, texto: titulo }),
      texto ? h('p', { class: 'modal-texto', texto }) : null,
      form,
    ], () => resolver(resultado));
    dlg.setAttribute('aria-labelledby', idTitulo);
    const primeiro = form.querySelector('input, select, textarea');
    if (primeiro) primeiro.focus();
  });
}

function criarCampo(pai, c, prefixo) {
  const id = `${prefixo}-${c.nome}`;
  let el;
  if (c.tipo === 'textarea') el = h('textarea', { id, rows: c.linhas || 4 });
  else if (c.tipo === 'select') {
    el = h('select', { id, multiple: !!c.multiplo, size: c.multiplo ? Math.min(6, (c.opcoes || []).length) : undefined },
      (c.opcoes || []).map((o) => h('option', { value: o.valor, texto: o.rotulo })));
  } else {
    el = h('input', { id, type: c.tipo || 'text', min: c.min, max: c.max, step: c.passo, inputmode: c.tipo === 'number' ? 'decimal' : undefined, autocomplete: 'off' });
  }
  if (c.valor !== undefined && c.valor !== null) {
    if (c.tipo === 'select' && c.multiplo) {
      const set = new Set(c.valor);
      for (const o of el.options) o.selected = set.has(o.value);
    } else el.value = String(c.valor);
  }
  if (c.obrigatorio) el.setAttribute('aria-required', 'true');
  const ajudaId = c.ajuda ? `${id}-ajuda` : undefined;
  if (ajudaId) el.setAttribute('aria-describedby', ajudaId);
  pai.appendChild(h('div', { class: 'campo' },
    h('label', { for: id, texto: c.rotulo }),
    el,
    c.ajuda ? h('p', { class: 'campo-ajuda', id: ajudaId, texto: c.ajuda }) : null));
  return el;
}

// ---------------------------------------------------------------------------
// Estados e peças reutilizáveis pelas telas

function caixaEstado(tipo, texto, extra) {
  return h('div', { class: `estado estado-${tipo}`, role: tipo === 'erro' ? 'alert' : 'status' },
    h('p', { class: 'estado-texto', texto }), extra);
}

const NOMES_INTEGRACAO = {
  supabase: 'Supabase', vercel: 'Vercel', eas: 'EAS', github: 'GitHub', cakto: 'Cakto', git: 'Git local',
};

export const estado = {
  carregando(raiz, texto = 'Carregando…') { limpar(raiz); raiz.appendChild(caixaEstado('carregando', texto)); },
  vazio(raiz, texto) { limpar(raiz); raiz.appendChild(caixaEstado('vazio', texto)); },
  erro(raiz, err, tentarDeNovo) {
    limpar(raiz);
    raiz.appendChild(caixaEstado('erro', mensagemErro(err),
      tentarDeNovo ? h('button', { class: 'botao', type: 'button', texto: 'Tentar de novo', onclick: tentarDeNovo }) : null));
  },
  ausente(raiz, integracao, motivo) {
    limpar(raiz);
    raiz.appendChild(caixaEstado('ausente', textoAusente(integracao, motivo)));
  },
  // versões que devolvem o elemento em vez de substituir o conteúdo, para blocos dentro de uma tela
  bloco: {
    carregando: (texto = 'Carregando…') => caixaEstado('carregando', texto),
    vazio: (texto) => caixaEstado('vazio', texto),
    erro: (err, tentarDeNovo) => caixaEstado('erro', mensagemErro(err),
      tentarDeNovo ? h('button', { class: 'botao', type: 'button', texto: 'Tentar de novo', onclick: tentarDeNovo }) : null),
    ausente: (integracao, motivo) => caixaEstado('ausente', textoAusente(integracao, motivo)),
  },
};

function textoAusente(integracao, motivo) {
  const nome = NOMES_INTEGRACAO[integracao] || integracao;
  return `${nome} não configurado neste computador. ${motivo || 'Falta a credencial no .env local, então o painel não consulta esse serviço.'}`;
}

function mensagemErro(err) {
  if (!err) return 'Algo falhou sem mensagem.';
  const base = err.message || String(err);
  return err.codigo && !String(err.codigo).startsWith('http-') && err.codigo !== 'rede' && err.codigo !== 'prazo'
    ? `${base} (código ${err.codigo})` : base;
}

export function cabecalho(raiz, titulo, subtitulo, acoes) {
  const el = h('header', { class: 'tela-cabecalho' },
    h('div', null,
      h('h1', { class: 'tela-titulo', texto: titulo }),
      subtitulo ? h('p', { class: 'tela-subtitulo', texto: subtitulo }) : null),
    acoes && acoes.length ? h('div', { class: 'tela-acoes' }, acoes) : null);
  raiz.appendChild(el);
  return el;
}

const ROTULO_STATUS = { ok: 'Funcionando', ausente: 'Não configurado', erro: 'Com erro', alerta: 'Atenção' };
export function selo(status, texto) {
  const s = ['ok', 'ausente', 'erro', 'alerta'].includes(status) ? status : 'neutro';
  return h('span', { class: `selo selo-${s}`, texto: texto || ROTULO_STATUS[s] || String(status || 'sem status') });
}

// colunas: [{ titulo, valor: (linha) => texto|Node, classe }]
export function tabela(colunas, linhas, { legenda } = {}) {
  return h('div', { class: 'tabela-rolagem', tabindex: '0', role: 'region', 'aria-label': legenda || 'Tabela' },
    h('table', { class: 'tabela' },
      legenda ? h('caption', { texto: legenda }) : null,
      h('thead', null, h('tr', null, colunas.map((c) => h('th', { scope: 'col', class: c.classe, texto: c.titulo })))),
      h('tbody', null, linhas.map((l) => h('tr', null, colunas.map((c) => {
        const v = c.valor(l);
        return h('td', { class: c.classe }, v === undefined || v === null || v === '' ? '—' : v);
      }))))));
}

export function cartao({ titulo, valor, detalhe, status, link, rotuloLink }) {
  return h('article', { class: 'cartao' },
    h('div', { class: 'cartao-topo' },
      h('h2', { class: 'cartao-titulo', texto: titulo }),
      status ? selo(status) : null),
    valor !== undefined ? h('p', { class: 'cartao-valor', texto: valor }) : null,
    detalhe ? h('p', { class: 'cartao-detalhe', texto: detalhe }) : null,
    link ? h('a', { class: 'cartao-link', href: link, texto: rotuloLink || 'Ver detalhes' }) : null);
}

export function secao(titulo, ...filhos) {
  return h('section', { class: 'secao' }, h('h2', { class: 'secao-titulo', texto: titulo }), filhos);
}

// Seção que carrega sozinha uma rota da API, com os quatro estados (carregando, erro, ausente, vazio).
// desenhar(dados, resposta) devolve Node, ou null/[] para cair no estado vazio com textoVazio.
export function blocoDeDados(titulo, caminho, desenhar, { integracao, textoVazio = 'Nada para mostrar.', obsoleta = () => false } = {}) {
  const corpo = h('div', { class: 'secao-corpo' });
  const el = h('section', { class: 'secao' }, h('h2', { class: 'secao-titulo', texto: titulo }), corpo);
  const carregar = async () => {
    limpar(corpo);
    corpo.appendChild(estado.bloco.carregando());
    let r;
    try {
      r = await api(caminho);
    } catch (err) {
      if (obsoleta()) return;
      limpar(corpo);
      corpo.appendChild(estado.bloco.erro(err, carregar));
      return;
    }
    if (obsoleta()) return;
    limpar(corpo);
    const d = r.dados || {};
    if (d.status === 'ausente') { corpo.appendChild(estado.bloco.ausente(integracao || titulo, d.motivo)); return; }
    if (d.status === 'erro') { corpo.appendChild(estado.bloco.erro(new ErroApi(d.codigo || 'erro', d.motivo || d.mensagem || 'A integração respondeu com erro.'), carregar)); return; }
    let conteudo;
    try {
      conteudo = desenhar(d, r);
    } catch (err) {
      console.error(`[painel] bloco ${titulo} não desenhou`, err);
      corpo.appendChild(estado.bloco.erro(new ErroApi('formato', `Os dados de ${titulo} vieram num formato que esta tela não entende.`), carregar));
      return;
    }
    if (!conteudo || (Array.isArray(conteudo) && !conteudo.length)) { corpo.appendChild(estado.bloco.vazio(textoVazio)); return; }
    anexar(corpo, [conteudo]);
    corpo.appendChild(h('p', { class: 'rodape-leitura', texto: `Lido ${formatar.dataHora(r.atualizadoEm)}${r.simulado ? ' (simulado)' : ''}.` }));
  };
  carregar();
  el.recarregar = carregar;
  return el;
}

export function alerta(nivel, texto, link) {
  const n = ['critico', 'atencao', 'info'].includes(nivel) ? nivel : 'info';
  return h('div', { class: `alerta alerta-${n}`, role: n === 'critico' ? 'alert' : 'note' },
    h('p', { texto }), link ? h('a', { href: link.href, texto: link.texto }) : null);
}

// Caminho servível de um arquivo do acervo. O servidor só entrega docs/marketing, design-system e fontes.
export function urlArquivo(caminho) {
  if (!caminho) return '';
  if (/^(blob:|data:)/.test(caminho)) return caminho;
  const limpo = String(caminho).replace(/\\/g, '/').replace(/^\/+/, '');
  return `/${limpo.split('/').map((s) => encodeURIComponent(decodeURIComponentSeguro(s))).join('/')}`;
}
function decodeURIComponentSeguro(s) { try { return decodeURIComponent(s); } catch { return s; } }

const EXT_VIDEO = /\.(mp4|webm|mov|m4v)$/i;
const EXT_IMAGEM = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

export function arquivosDaPeca(peca) {
  const lista = peca.arquivos && peca.arquivos.length ? peca.arquivos : (peca.caminho ? [peca.caminho] : []);
  return lista.map((a) => (typeof a === 'string' ? a : a.caminho || a.url)).filter(Boolean);
}

// Prévia de uma peça: imagem, vídeo (com controles, sem autoplay) ou carrossel com setas.
export function midia(peca, { grande = false } = {}) {
  const arquivos = arquivosDaPeca(peca).filter((a) => EXT_VIDEO.test(a) || EXT_IMAGEM.test(a));
  const alt = peca.textoAlternativo || peca.titulo || 'Peça de marketing';
  const classe = `previa${grande ? ' previa-grande' : ''}`;
  if (!arquivos.length) {
    const outro = arquivosDaPeca(peca)[0];
    return h('div', { class: `${classe} previa-texto` },
      h('p', { texto: peca.tipo === 'texto' ? 'Peça só de texto.' : 'Sem arquivo de imagem ou vídeo.' }),
      outro ? h('a', { href: urlArquivo(outro), target: '_blank', rel: 'noopener', texto: 'Abrir o arquivo' }) : null);
  }
  const um = (arq, i) => (EXT_VIDEO.test(arq)
    ? h('video', { src: urlArquivo(arq), controls: true, preload: 'metadata', playsinline: true, 'aria-label': `${alt}${arquivos.length > 1 ? `, parte ${i + 1}` : ''}` })
    : h('img', { src: urlArquivo(arq), alt: arquivos.length > 1 ? `${alt}, slide ${i + 1} de ${arquivos.length}` : alt, loading: 'lazy', decoding: 'async' }));
  if (arquivos.length === 1) return h('div', { class: classe }, um(arquivos[0], 0));

  let atual = 0;
  const palco = h('div', { class: 'previa-palco' });
  const contador = h('span', { class: 'previa-contador', 'aria-live': 'polite' });
  const anterior = h('button', { class: 'botao botao-fantasma previa-seta', type: 'button', 'aria-label': 'Slide anterior', texto: '‹' });
  const proximo = h('button', { class: 'botao botao-fantasma previa-seta', type: 'button', 'aria-label': 'Próximo slide', texto: '›' });
  const pontos = h('div', { class: 'previa-pontos', 'aria-hidden': 'true' }, arquivos.map(() => h('span', { class: 'previa-ponto' })));
  const mostrar = (i) => {
    atual = (i + arquivos.length) % arquivos.length;
    const videoAtual = palco.querySelector('video');
    if (videoAtual) videoAtual.pause();
    limpar(palco);
    palco.appendChild(um(arquivos[atual], atual));
    contador.textContent = `${atual + 1} de ${arquivos.length}`;
    [...pontos.children].forEach((p, k) => p.classList.toggle('ativo', k === atual));
  };
  anterior.addEventListener('click', () => mostrar(atual - 1));
  proximo.addEventListener('click', () => mostrar(atual + 1));
  const caixa = h('div', { class: `${classe} previa-carrossel`, role: 'group', 'aria-roledescription': 'carrossel', 'aria-label': alt, tabindex: '0' },
    palco, h('div', { class: 'previa-controles' }, anterior, contador, proximo), pontos);
  caixa.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); mostrar(atual - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); mostrar(atual + 1); }
  });
  mostrar(0);
  return caixa;
}

// Markdown seguro: gera elementos, nunca HTML cru. Cobre o que os documentos do projeto usam:
// títulos, parágrafos, listas, citações, blocos de código, tabelas, código inline, ênfase e links.
export function markdown(texto) {
  const raiz = h('div', { class: 'documento' });
  const linhas = String(texto || '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  const ehTabela = (l) => /^\s*\|.*\|\s*$/.test(l);
  const celulas = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
  while (i < linhas.length) {
    const l = linhas[i];
    if (/^\s*$/.test(l)) { i++; continue; }
    if (/^```/.test(l)) {
      const corpo = [];
      i++;
      while (i < linhas.length && !/^```/.test(linhas[i])) corpo.push(linhas[i++]);
      i++;
      raiz.appendChild(h('pre', { class: 'saida' }, h('code', { texto: corpo.join('\n') })));
      continue;
    }
    const t = /^(#{1,6})\s+(.*)$/.exec(l);
    if (t) {
      const nivel = Math.min(6, t[1].length + 1); // h1 é o título da tela
      const titulo = h(`h${nivel}`, { id: `doc-${slug(t[2])}` }, inline(t[2]));
      raiz.appendChild(titulo);
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { raiz.appendChild(h('hr')); i++; continue; }
    if (ehTabela(l) && i + 1 < linhas.length && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1])) {
      const cab = celulas(l);
      i += 2;
      const corpo = [];
      while (i < linhas.length && ehTabela(linhas[i])) corpo.push(celulas(linhas[i++]));
      raiz.appendChild(h('div', { class: 'tabela-rolagem', tabindex: '0' }, h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, cab.map((c) => h('th', { scope: 'col' }, inline(c))))),
        h('tbody', null, corpo.map((r) => h('tr', null, r.map((c) => h('td', null, inline(c)))))))));
      continue;
    }
    if (/^\s*>/.test(l)) {
      const corpo = [];
      while (i < linhas.length && /^\s*>/.test(linhas[i])) corpo.push(linhas[i++].replace(/^\s*>\s?/, ''));
      raiz.appendChild(h('blockquote', null, h('p', null, inline(corpo.join(' ')))));
      continue;
    }
    const lista = /^(\s*)([-*+]|\d+[.)])\s+/.exec(l);
    if (lista) {
      const ordenada = /\d/.test(lista[2]);
      const el = h(ordenada ? 'ol' : 'ul');
      while (i < linhas.length && /^(\s*)([-*+]|\d+[.)])\s+/.test(linhas[i])) {
        let item = linhas[i++].replace(/^(\s*)([-*+]|\d+[.)])\s+/, '');
        while (i < linhas.length && /^\s{2,}\S/.test(linhas[i]) && !/^(\s*)([-*+]|\d+[.)])\s+/.test(linhas[i])) item += ` ${linhas[i++].trim()}`;
        const marcado = /^\[( |x|X)\]\s+/.exec(item);
        el.appendChild(h('li', marcado ? { class: marcado[1] === ' ' ? 'tarefa' : 'tarefa feita' } : null,
          marcado ? `${marcado[1] === ' ' ? '☐' : '☑'} ` : null, inline(marcado ? item.slice(marcado[0].length) : item)));
      }
      raiz.appendChild(el);
      continue;
    }
    const par = [];
    while (i < linhas.length && !/^\s*$/.test(linhas[i]) && !/^(#{1,6}\s|```|\s*>|\s*([-*+]|\d+[.)])\s+)/.test(linhas[i]) && !ehTabela(linhas[i])) par.push(linhas[i++].trim());
    if (!par.length) { raiz.appendChild(h('p', null, inline(linhas[i++]))); continue; }
    raiz.appendChild(h('p', null, inline(par.join(' '))));
  }
  return raiz;
}

function slug(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function inline(texto) {
  const frag = document.createDocumentFragment();
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))/g;
  let ultimo = 0;
  let m;
  const s = String(texto);
  while ((m = re.exec(s))) {
    if (m.index > ultimo) frag.appendChild(document.createTextNode(s.slice(ultimo, m.index)));
    const t = m[0];
    if (m[1]) frag.appendChild(h('code', { texto: t.slice(1, -1) }));
    else if (m[2]) frag.appendChild(h('strong', { texto: t.slice(2, -2) }));
    else if (m[3]) frag.appendChild(h('em', { texto: t.slice(1, -1) }));
    else {
      const lk = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t);
      const href = lk[2];
      // só http(s) e âncora interna viram link; caminho relativo do repositório fica como texto
      if (/^https?:\/\//i.test(href)) frag.appendChild(h('a', { href, target: '_blank', rel: 'noopener noreferrer', texto: lk[1] }));
      else if (href.startsWith('#')) frag.appendChild(h('a', { href: `#doc-${slug(href.slice(1))}`, texto: lk[1], dados: { ancora: '1' } }));
      else frag.appendChild(h('span', { class: 'link-repo', title: href, texto: lk[1] }));
    }
    ultimo = m.index + t.length;
  }
  if (ultimo < s.length) frag.appendChild(document.createTextNode(s.slice(ultimo)));
  return frag;
}

// Copia texto para a área de transferência com recibo visível.
export async function copiar(texto, rotulo = 'Copiado.') {
  try {
    await navigator.clipboard.writeText(texto);
    aviso(rotulo, 'ok');
  } catch {
    aviso('O navegador não deixou copiar. Selecione o texto e copie com Ctrl+C.', 'erro');
  }
}

// ---------------------------------------------------------------------------
// Roteamento

function lerHash() {
  const bruto = decodeURIComponentSeguro(location.hash.replace(/^#\/?/, ''));
  const [rota, query] = bruto.split('?');
  return { rota: rota || ROTA_PADRAO, params: Object.fromEntries(new URLSearchParams(query || '')) };
}

let limpezaAtual = null;
let geracao = 0;

async function renderizar() {
  if (bloqueado || (acesso && !podeDesenhar())) return;
  if (acesso && !acesso.legado && !acesso.entrou) return;
  const { rota, params } = lerHash();
  const def = ROTAS[rota];
  if (!def) { location.replace(`#/${ROTA_PADRAO}`); return; }
  const minha = ++geracao;

  for (const a of document.querySelectorAll('.nav-link')) {
    if (a.getAttribute('href') === `#/${rota}`) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  fecharMenu();
  document.title = `${def.titulo} · Grana. Administração local`;

  if (typeof limpezaAtual === 'function') { try { limpezaAtual(); } catch (e) { console.error('[painel] limpeza da tela falhou', e); } }
  limpezaAtual = null;

  const raiz = document.getElementById('tela');
  estado.carregando(raiz, `Abrindo ${def.titulo}…`);
  let modulo;
  try {
    modulo = await import(`./telas/${def.modulo}.js`);
  } catch (err) {
    console.error(`[painel] tela ${def.modulo} não carregou`, err);
    if (minha !== geracao) return;
    estado.erro(raiz, new ErroApi('tela', `A tela ${def.titulo} ainda não está disponível neste painel.`), renderizar);
    return;
  }
  if (minha !== geracao) return;
  limpar(raiz);
  // cada tela recebe sua própria raiz: uma tela antiga que termine depois não escreve na nova
  const palco = h('div', { class: `tela-${def.modulo}` });
  raiz.appendChild(palco);
  const ctx = criarContexto(params, () => minha !== geracao);
  try {
    limpezaAtual = await modulo.montar(palco, ctx);
  } catch (err) {
    console.error(`[painel] tela ${def.modulo} falhou ao montar`, err);
    if (minha === geracao) estado.erro(palco, err, renderizar);
  }
  if (minha === geracao) {
    const conteudo = document.getElementById('conteudo');
    if (conteudo && document.activeElement && document.activeElement.closest('.lateral')) conteudo.focus({ preventScroll: true });
  }
}

function criarContexto(params, obsoleta) {
  return {
    api, acao, h, estado, confirmar, formulario, aviso, cabecalho, selo, tabela, cartao, secao, alerta,
    bloco: (titulo, caminho, desenhar, opcoes = {}) => blocoDeDados(titulo, caminho, desenhar, { obsoleta, ...opcoes }),
    midia, markdown, copiar, urlArquivo, arquivosDaPeca, formatar,
    data: formatar.data, dataHora: formatar.dataHora, reais: formatar.reais,
    params,
    obsoleta,
    get simulado() { return modoSimulado || !faixa()?.hidden; },
    navegar: (hash) => { if (location.hash === hash) renderizar(); else location.hash = hash; },
    recarregar: () => renderizar(),
  };
}

// ---------------------------------------------------------------------------
// Menu no estreito

// Mesmo corte do estilo.css (max-width: 899px): só no estreito a lateral vira gaveta.
const estreito = window.matchMedia('(max-width: 899px)');

// Gaveta fechada fica fora da ordem do Tab e do leitor de tela.
function sincronizarGaveta() {
  const l = document.getElementById('lateral');
  if (!l) return;
  l.inert = estreito.matches && !l.classList.contains('aberta');
}

function fecharMenu() {
  const b = document.querySelector('.botao-menu');
  const l = document.getElementById('lateral');
  if (!b || !l) return;
  b.setAttribute('aria-expanded', 'false');
  l.classList.remove('aberta');
  sincronizarGaveta();
}

function ligarMenu() {
  const b = document.querySelector('.botao-menu');
  const l = document.getElementById('lateral');
  if (!b || !l) return;
  b.addEventListener('click', () => {
    const abrir = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(abrir));
    l.classList.toggle('aberta', abrir);
    sincronizarGaveta();
    if (abrir) l.querySelector('.nav-link')?.focus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && l.classList.contains('aberta')) { fecharMenu(); b.focus(); }
  });
  // toque no véu, fora da gaveta, fecha
  document.addEventListener('click', (e) => {
    if (!l.classList.contains('aberta') || l.contains(e.target) || b.contains(e.target)) return;
    fecharMenu();
  });
  estreito.addEventListener('change', sincronizarGaveta);
  sincronizarGaveta();
}

// ---------------------------------------------------------------------------
// Partida

async function checarServidor() {
  try {
    const r = await pedir('/api/saude', { method: 'GET', headers: { Accept: 'application/json', 'X-Grana-Admin': '1' } });
    const ok = r && r.dados && r.dados.painel === 'grana-admin';
    modoSimulado = !ok;
    return ok;
  } catch {
    modoSimulado = true;
    return false;
  }
}

// ---------------------------------------------------------------------------
// Acesso (pareamento, senha, código, inatividade)

let acesso = null;
const podeDesenhar = () => acesso && (acesso.legado || acesso.entrou);

function esconderPainel() {
  epoca++;
  const casca = document.querySelector('.casca');
  if (casca) { casca.inert = true; casca.hidden = true; }
  // nada de dado na tela enquanto não houver sessão
  const raiz = document.getElementById('tela');
  if (raiz) limpar(raiz);
  if (typeof limpezaAtual === 'function') { try { limpezaAtual(); } catch { /* tela já saiu */ } }
  limpezaAtual = null;
  geracao++;
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  for (const a of document.querySelectorAll('.avisos .aviso')) a.remove();
}

function mostrarPainel() {
  const casca = document.querySelector('.casca');
  if (casca) { casca.hidden = false; casca.inert = false; }
}

async function iniciar() {
  // origem canônica: 127.0.0.1 (o cookie de pareamento vale só nela)
  if (location.hostname === 'localhost' && location.protocol === 'http:') {
    location.replace(`http://127.0.0.1:${location.port}${location.pathname}${location.search}${location.hash}`);
    return;
  }
  ligarMenu();
  window.addEventListener('hashchange', renderizar);
  // âncoras internas do documento rolam sem trocar de rota
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-ancora]');
    if (!a) return;
    e.preventDefault();
    document.getElementById(a.getAttribute('href').slice(1))?.scrollIntoView({ block: 'start' });
  });
  acesso = criarAcesso({
    h,
    ler: (c) => pedir(c, { method: 'GET', headers: { Accept: 'application/json', 'X-Grana-Admin': '1' } }),
    enviar: (c, corpo) => postar(c, corpo, false),
    enviarSemCsrf,
    definirCsrf: (t) => { csrfToken = t || null; },
    esconderPainel,
    mostrarPainel,
    aoEntrar: () => { if (!lerHash().rota || !ROTAS[lerHash().rota]) location.replace(`#/${ROTA_PADRAO}`); renderizar(); },
    aviso: (texto, tipo, opcoes) => aviso(texto, tipo, { mesmoSemPainel: true, ...(opcoes || {}) }),
    bloquear: bloquearPainel,
    limparContexto: esconderPainel,
  });
  document.querySelector('.botao-sair')?.addEventListener('click', () => acesso.sair());

  const ok = await checarServidor();
  if (!ok) {
    // sem servidor não há login a fazer: modo simulado, como antes
    acesso = null;
    if (!bloqueado) marcarSimulado(location.protocol === 'file:' ? 'O painel foi aberto como arquivo, sem o servidor local.' : 'O servidor local não respondeu em /api/saude.');
    if (!location.hash) location.replace(`#/${ROTA_PADRAO}`);
    renderizar();
    return;
  }
  esconderPainel();
  const liberado = await acesso.verificar();
  if (!liberado || bloqueado) return;
  mostrarPainel();
  if (acesso.legado) document.querySelector('.botao-sair')?.setAttribute('hidden', '');
  if (!location.hash || !ROTAS[lerHash().rota]) location.replace(`#/${ROTA_PADRAO}`);
  renderizar();
}

iniciar();
