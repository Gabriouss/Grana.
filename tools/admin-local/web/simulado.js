// Dados simulados do painel. Usados só quando o servidor local não responde ou ainda não tem a rota.
// Tudo aqui é inventado e marcado como simulado: nenhum número é do Grana. real, nenhuma pessoa existe.
// As ações mudam só este objeto, na memória desta aba, e somem ao recarregar.

const hoje = new Date();
const p = (n) => String(n).padStart(2, '0');
const isoDia = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
const diasAtras = (n, h = 10) => { const d = new Date(hoje); d.setDate(d.getDate() - n); d.setHours(h, 12, 0, 0); return d.toISOString(); };
const diaDoMes = (n) => isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), n));
const MARCA = 'design-system/marca/';

const pecas = [
  { id: 'sim-01', versao: 'a1b2c3d4', semana: 'semana-41', estado: 'para-aprovacao', tipo: 'carrossel', canal: 'instagram-feed',
    titulo: 'SIMULADO · Carrossel livre para gastar', legenda: 'Exemplo simulado de legenda. Quanto dá para gastar hoje sem apertar o fim do mês?',
    arquivos: [`${MARCA}logotipo-gradiente.svg`, `${MARCA}simbolo-gradiente.svg`, `${MARCA}icone-circular.svg`],
    pareceres: [{ revisor: 'Prism', texto: 'Parecer simulado: legível em 1080×1350.' }], publicacao: null, aceite: null, ajustes: [] },
  { id: 'sim-02', versao: 'b2c3d4e5', semana: 'semana-41', estado: 'para-aprovacao', tipo: 'imagem', canal: 'instagram-feed',
    titulo: 'SIMULADO · Card foto da nota', legenda: 'Exemplo simulado. Tire a foto da nota e o lançamento aparece pronto.',
    arquivos: [`${MARCA}icone-fundo-gradiente-escuro.svg`], pareceres: [], publicacao: null, aceite: null, ajustes: [] },
  { id: 'sim-03', versao: 'c3d4e5f6', semana: 'semana-40', estado: 'aprovados', tipo: 'imagem', canal: 'instagram-feed',
    titulo: 'SIMULADO · Card de abertura', legenda: 'Exemplo simulado de peça aprovada com data.',
    arquivos: [`${MARCA}logotipo-menta.svg`], pareceres: [], publicacao: { data: diaDoMes(12), hora: '19:00', canal: 'instagram-feed' },
    aceite: { aprovadoEm: diasAtras(3), evidencia: 'simulado' }, ajustes: [] },
  { id: 'sim-04', versao: 'd4e5f6a7', semana: 'semana-40', estado: 'aprovados', tipo: 'imagem', canal: 'stories',
    titulo: 'SIMULADO · Stories sem data', legenda: 'Exemplo simulado de peça aprovada ainda sem dia marcado.',
    arquivos: [`${MARCA}simbolo-menta-sem-ponto.svg`], pareceres: [], publicacao: null,
    aceite: { aprovadoEm: diasAtras(2), evidencia: 'simulado' }, ajustes: [] },
  { id: 'sim-05', versao: 'e5f6a7b8', semana: 'semana-39', estado: 'historico', tipo: 'imagem', canal: 'instagram-feed',
    titulo: 'SIMULADO · Versão substituída', legenda: 'Exemplo simulado de peça no histórico.',
    arquivos: [`${MARCA}logotipo-branco.svg`], pareceres: [], publicacao: null, aceite: null, ajustes: [] },
];

let campanhas = [
  { id: 'camp-sim-1', nome: 'SIMULADO · Teste mínimo pós dia D', objetivo: 'Vendas', publico: 'Exemplo: 25 a 40 anos, interesse em finanças pessoais',
    orcamentoDiario: 10.5, inicio: diaDoMes(15), fim: diaDoMes(28), pecas: ['sim-03'], status: 'rascunho' },
];

const DOC = `# Documento de marketing (simulado)

Este texto aparece porque o servidor local ainda não entregou o DOCUMENTO-DE-MARKETING.md.

## O que vale hoje

- Nada vai ao ar antes do dia D.
- Aprovar uma peça **não publica** nada.
- Peça aprovada sem data fica em "Aprovados sem data" no calendário.

## Tabela de exemplo

| Canal | Ritmo |
|---|---|
| Feed | 3 por semana |
| Stories | diário |
`;

function ok(dados) { return { ok: true, dados, atualizadoEm: new Date().toISOString(), simulado: true }; }
function falha(codigo, mensagem, status = 400) { const e = new Error(mensagem); e.codigo = codigo; e.status = status; throw e; }

const leituras = {
  '/api/saude': () => ({ painel: 'grana-admin', versao: 1 }),
  '/api/visao-geral': () => ({
    app: { versao: '0.0.0-simulado', versaoAnunciada: '0.0.0-simulado' },
    integracoes: [
      { id: 'supabase', nome: 'Supabase', status: 'ok' },
      { id: 'vercel', nome: 'Vercel', status: 'ok' },
      { id: 'eas', nome: 'EAS', status: 'ausente', detalhe: 'CLI não logada (simulado).' },
      { id: 'github', nome: 'GitHub', status: 'ok' },
      { id: 'cakto', nome: 'Cakto', status: 'ausente', detalhe: 'Sem leitura disponível (simulado).' },
      { id: 'git', nome: 'Git local', status: 'ok' },
    ],
    git: { branch: 'main', commit: { hash: '0000000', assunto: 'commit simulado', data: diasAtras(0, 9) }, aFrente: 0, atras: 0 },
    builds: { semana: { usadas: 1, teto: 3 }, mes: { usadas: 2, cota: 15 } },
    vercel: { ultimoDeploy: { estado: 'READY', url: 'exemplo-simulado.vercel.app', criadoEm: diasAtras(1), commit: '0000000' } },
    assinantes: { ativos: 0 },
    marketing: { paraAprovacao: pecas.filter((x) => x.estado === 'para-aprovacao').length },
    alertas: [
      { nivel: 'critico', texto: 'Simulado: os cinco segredos expostos em 16/09 ainda não foram trocados.' },
      { nivel: 'atencao', texto: 'Simulado: função publicada mais nova que o repositório.', link: { href: '#/supabase', texto: 'Ver funções' } },
    ],
  }),
  '/api/supabase/resumo': () => ({
    status: 'ok', projeto: { ref: 'simulado', regiao: 'sa-east-1', status: 'ACTIVE_HEALTHY' },
    usuarios: { total: 0, hoje: 0, ultimos7: 0, ultimos30: 0, confirmados: 0 },
    assinaturas: { porStatus: [{ status: 'active', total: 0 }, { status: 'trialing', total: 0 }, { status: 'canceled', total: 0 }] },
    pushTokens: { total: 0, usuarios: 0 },
  }),
  '/api/supabase/funcoes': () => ({
    status: 'ok',
    funcoes: [
      { slug: 'exemplo-a', version: 12, updated_at: diasAtras(2), verify_jwt: true, status: 'ACTIVE', ultimoCommitLocal: { hash: '0000001', data: diasAtras(5) }, producaoMaisNova: true },
      { slug: 'whatsapp-webhook', version: 69, updated_at: diasAtras(20), verify_jwt: false, status: 'ACTIVE', ultimoCommitLocal: { hash: '0000002', data: diasAtras(21) }, producaoMaisNova: false },
    ],
  }),
  '/api/supabase/migrations': () => ({ migrations: [{ nome: '20261002120000_exemplo_simulado.sql', data: '2026-10-02' }] }),
  '/api/supabase/app-release': () => ({ status: 'ok', release: { version: '0.0.0-simulado', notes: 'Notas simuladas.', created_at: diasAtras(6) } }),
  '/api/vercel/deployments': () => ({
    status: 'ok',
    deployments: [
      { id: 'dpl_sim1', url: 'exemplo-simulado.vercel.app', estado: 'READY', alvo: 'production', commit: { hash: '0000000', mensagem: 'commit simulado' }, criadoEm: diasAtras(1), criador: 'simulado' },
      { id: 'dpl_sim2', url: 'exemplo-simulado-2.vercel.app', estado: 'ERROR', alvo: 'preview', commit: { hash: '0000003', mensagem: 'outro commit simulado' }, criadoEm: diasAtras(3), criador: 'simulado' },
    ],
  }),
  '/api/vercel/projeto': () => ({ status: 'ok', nome: 'simulado', framework: 'expo', dominios: [{ nome: 'exemplo.simulado', verificado: true }] }),
  '/api/eas/builds': () => ({
    status: 'ok',
    builds: [{ id: 'sim-build', versao: '0.0.0', perfil: 'preview', plataforma: 'android', estado: 'FINISHED', criadoEm: diasAtras(4), artefato: null }],
    saldo: { semana: { usadas: 1, teto: 3 }, mes: { usadas: 2, cota: 15 } },
  }),
  '/api/github/releases': () => ({ status: 'ok', releases: [{ tag: 'v0.0.0-sim', nome: 'Release simulada', publicadoEm: diasAtras(4), url: null, assets: [{ nome: 'grana.apk', tamanho: 0, downloads: 0 }] }] }),
  '/api/cakto/resumo': () => ({ status: 'ausente', motivo: 'Simulado: a Cakto não oferece leitura configurada neste computador.' }),
  '/api/git/estado': () => ({ branch: 'main', commit: { hash: '0000000', assunto: 'commit simulado', data: diasAtras(0, 9) }, aFrente: 0, atras: 0, alterados: 0 }),
  '/api/marketing/pecas': () => ({ pecas: pecas.map((x) => ({ ...x })) }),
  '/api/marketing/feed': () => ({
    pecas: pecas.filter((x) => x.estado === 'aprovados' || x.aceite)
      .sort((a, b) => String(a.publicacao?.data || '9999').localeCompare(String(b.publicacao?.data || '9999'))
        || String(a.aceite?.aprovadoEm).localeCompare(String(b.aceite?.aprovadoEm))),
  }),
  '/api/marketing/calendario': (q) => {
    const mes = q.get('mes') || `${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}`;
    const aprovadas = pecas.filter((x) => x.estado === 'aprovados' || x.aceite);
    return {
      mes,
      itens: aprovadas.filter((x) => x.publicacao && x.publicacao.data.startsWith(mes)).map((x) => ({ id: x.id, versao: x.versao, titulo: x.titulo, tipo: x.tipo, ...x.publicacao })),
      semData: aprovadas.filter((x) => !x.publicacao).map((x) => ({ id: x.id, versao: x.versao, titulo: x.titulo, tipo: x.tipo, canal: x.canal })),
    };
  },
  '/api/marketing/trafego': () => ({ campanhas: campanhas.map((c) => ({ ...c })) }),
  '/api/marketing/documento': () => ({ texto: DOC, caminho: 'docs/marketing/painel/DOCUMENTO-DE-MARKETING.md' }),
};

const acoes = [
  [/^\/api\/marketing\/pecas\/([^/]+)\/aprovar$/, (m, corpo) => {
    const peca = pecas.find((x) => x.id === decodeURIComponent(m[1]));
    if (!peca) falha('nao-encontrada', 'Peça não encontrada.', 404);
    if (corpo.confirmacao !== 'APROVAR') falha('confirmacao', 'Confirmação diferente da pedida.', 400);
    if (corpo.versao !== peca.versao) falha('versao-mudou', 'A peça mudou depois que você abriu. Recarregue e revise de novo.', 409);
    peca.estado = 'aprovados';
    peca.aceite = { aprovadoEm: new Date().toISOString(), evidencia: 'aceite simulado nesta aba' };
    return { id: peca.id, versao: peca.versao, aprovadoEm: peca.aceite.aprovadoEm };
  }],
  [/^\/api\/marketing\/pecas\/([^/]+)\/ajuste$/, (m, corpo) => {
    const peca = pecas.find((x) => x.id === decodeURIComponent(m[1]));
    if (!peca) falha('nao-encontrada', 'Peça não encontrada.', 404);
    if (!corpo.motivo) falha('motivo', 'Diga o que precisa mudar.', 400);
    peca.ajustes.push({ motivo: corpo.motivo, pedidoEm: new Date().toISOString(), versao: corpo.versao });
    return { id: peca.id };
  }],
  [/^\/api\/marketing\/calendario$/, (m, corpo) => {
    const peca = pecas.find((x) => x.id === corpo.id);
    if (!peca) falha('nao-encontrada', 'Peça não encontrada.', 404);
    if (!(peca.estado === 'aprovados' || peca.aceite)) falha('nao-aprovada', 'Só peça aprovada vai para o calendário.', 409);
    peca.publicacao = corpo.data ? { data: corpo.data, hora: corpo.hora || '', canal: corpo.canal || peca.canal } : null;
    return { id: peca.id, publicacao: peca.publicacao };
  }],
  [/^\/api\/marketing\/trafego$/, (m, corpo) => {
    const c = { ...corpo, id: corpo.id || `camp-sim-${Date.now()}` };
    campanhas = campanhas.filter((x) => x.id !== c.id).concat(c);
    return c;
  }],
  [/^\/api\/vercel\/redeploy$/, (m, corpo) => {
    if (corpo.confirmacao !== 'REDEPLOY') falha('confirmacao', 'Confirmação diferente da pedida.', 400);
    return { simulado: true, mensagem: 'Redeploy simulado. Nada foi enviado à Vercel.' };
  }],
  [/^\/api\/eas\/preparar-build$/, (m, corpo) => {
    if (corpo.confirmacao !== 'PREPARAR BUILD') falha('confirmacao', 'Confirmação diferente da pedida.', 400);
    return {
      simulado: true,
      saida: 'Simulado: o build:preparar não rodou. Nenhum arquivo foi alterado.',
      comando: `eas build --profile preview --platform android --message "${String(corpo.mensagem || '').replace(/"/g, '\\"')}"`,
    };
  }],
];

export const SIMULADO = {
  temLeitura: (caminho) => Object.hasOwn(leituras, caminho.split('?')[0]),
  temAcao: (caminho) => acoes.some(([re]) => re.test(caminho)),
  async ler(caminho) {
    const [base, q] = caminho.split('?');
    const f = leituras[base];
    if (!f) falha('sem-simulado', `Sem dado simulado para ${base}.`, 404);
    return ok(f(new URLSearchParams(q || '')));
  },
  async agir(caminho, corpo) {
    for (const [re, f] of acoes) {
      const m = re.exec(caminho);
      if (m) return ok(f(m, corpo || {}));
    }
    return falha('sem-simulado', `Sem ação simulada para ${caminho}.`, 404);
  },
};
