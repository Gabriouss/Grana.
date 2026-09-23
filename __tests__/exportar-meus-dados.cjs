/*
 * Baixar os próprios dados entrega tudo, e diz o que não conseguiu entregar.
 *
 * O autor decidiu em 23/09/2026 que sair, exportar e excluir precisam
 * funcionar mesmo para quem está no paywall ou vencido, por conformidade com a
 * LGPD. Este teste roda o módulo real (`lib/exportar-meus-dados.ts`) num
 * sandbox com dublês de Supabase e sessão, e prende três coisas:
 *
 * 1. nenhuma tabela da lista fica de fora da leitura;
 * 2. tabela que falhou aparece como INDISPONÍVEL, com o motivo, dentro do
 *    próprio arquivo — export que engole erro entrega menos do que promete;
 * 3. tabela vazia não se confunde com tabela que não pôde ser lida.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const codigo = ts.transpileModule(fs.readFileSync('lib/exportar-meus-dados.ts', 'utf8'), {
  fileName: 'lib/exportar-meus-dados.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function carregar() {
  const module = { exports: {} };
  vm.runInNewContext(codigo, {
    module,
    exports: module.exports,
    Promise,
    setTimeout,
    require: (nome) => {
      if (nome === 'react-native') return { Platform: { OS: 'android' } };
      if (nome === './supabase') return { supabase: { from: () => { throw new Error('não deveria ser usado: o teste injeta o leitor'); } } };
      if (nome === './sessao-offline') return { idDoUsuarioLocal: async () => 'usuario-1' };
      throw new Error(`import inesperado: ${nome}`);
    },
  });
  return module.exports;
}

const { montarExportacao, TABELAS_DO_USUARIO } = carregar();

let total = 0;
let falhas = 0;
function conferir(nome, ok, visto) {
  total++;
  if (ok) return;
  falhas++;
  console.error(`✗ ${nome}${visto === undefined ? '' : ` — visto: ${JSON.stringify(visto)}`}`);
}

const AGORA = new Date('2026-09-23T15:00:00.000Z');

(async () => {
  /* ── 1. Caminho feliz: tudo lido ──────────────────────────────────────── */
  {
    const lidas = [];
    const exportacao = await montarExportacao({
      agora: AGORA,
      conta: { id: 'usuario-1', email: 'pessoa@exemplo.com' },
      ler: async (tabela) => {
        lidas.push(tabela);
        return { data: [{ id: `${tabela}-1` }], error: null };
      },
    });
    const corpo = JSON.parse(exportacao.conteudo);

    conferir(
      'lê todas as tabelas da lista, sem pular nenhuma',
      lidas.length === TABELAS_DO_USUARIO.length && TABELAS_DO_USUARIO.every((t) => lidas.includes(t)),
      { lidas: lidas.length, esperado: TABELAS_DO_USUARIO.length }
    );
    conferir('o arquivo é JSON válido e traz a conta', corpo.conta.id === 'usuario-1' && corpo.conta.email === 'pessoa@exemplo.com');
    conferir('carimba quando foi exportado', corpo.exportado_em === AGORA.toISOString(), corpo.exportado_em);
    conferir('o nome do arquivo leva a data', exportacao.nomeArquivo === 'grana-meus-dados-2026-09-23.json', exportacao.nomeArquivo);
    conferir('nada indisponível quando tudo foi lido', exportacao.indisponiveis.length === 0, exportacao.indisponiveis);
    conferir(
      'os lançamentos entram com as linhas completas',
      Array.isArray(corpo.dados.transactions) && corpo.dados.transactions[0].id === 'transactions-1',
      corpo.dados.transactions
    );
  }

  /* ── 2. Tabela que falha vira recibo dentro do arquivo ────────────────── */
  {
    const exportacao = await montarExportacao({
      agora: AGORA,
      conta: { id: 'usuario-1', email: null },
      ler: async (tabela) => {
        if (tabela === 'subscriptions') return { data: null, error: { message: 'permission denied' } };
        if (tabela === 'voice_operations') throw new Error('sem rede');
        return { data: [], error: null };
      },
    });
    const corpo = JSON.parse(exportacao.conteudo);

    conferir('a tabela recusada entra como indisponível', exportacao.indisponiveis.some((i) => i.tabela === 'subscriptions' && /permission/.test(i.motivo)), exportacao.indisponiveis);
    conferir('a que lançou exceção também', exportacao.indisponiveis.some((i) => i.tabela === 'voice_operations' && /sem rede/.test(i.motivo)), exportacao.indisponiveis);
    conferir('e o motivo vai escrito DENTRO do arquivo', corpo.observacoes.tabelas_indisponiveis.length === 2, corpo.observacoes.tabelas_indisponiveis);
    conferir('o que deu certo continua sendo entregue', Object.keys(corpo.dados).length === TABELAS_DO_USUARIO.length - 2, Object.keys(corpo.dados).length);
    conferir('a falha não vira tabela vazia', corpo.dados.subscriptions === undefined && corpo.dados.voice_operations === undefined);
  }

  /* ── 3. Vazio é vazio, não é falha ────────────────────────────────────── */
  {
    const exportacao = await montarExportacao({
      agora: AGORA,
      conta: { id: 'usuario-1', email: null },
      ler: async () => ({ data: [], error: null }),
    });
    const corpo = JSON.parse(exportacao.conteudo);
    conferir('conta zero linhas sem chamar de indisponível', exportacao.contagem.transactions === 0 && exportacao.indisponiveis.length === 0);
    conferir('a tabela vazia aparece como lista vazia', Array.isArray(corpo.dados.bills) && corpo.dados.bills.length === 0);
  }

  console.log(`\n${total - falhas}/${total} checagens da exportação de dados passaram — ${falhas} falhas`);
  if (falhas > 0) process.exit(1);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
