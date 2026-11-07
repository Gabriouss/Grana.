// Denúncia de resposta do Granabô (política da Play para IA generativa).
// Executa o lib/assistente.ts REAL com supabase de dublê; asserta nas chamadas
// (tabela, payload, falha que sobe), e confere a migration e a tela por texto.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

function carregar(supabase, modoTeste) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root, 'lib/assistente.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const erros = [];
  vm.runInNewContext(js, {
    exports, Date, process: { env: {} }, fetch: async () => { throw new Error('sem rede'); },
    console: { error: (...a) => erros.push(a), log() {} },
    require(id) {
      if (id === './supabase') return { supabase };
      if (id === './modo-teste') return { MODO_TESTE: modoTeste };
      if (id === './assistente-teste') return { respostaDoTeste: () => '' };
      throw new Error('Import não simulado: ' + id);
    },
  }, { filename: 'lib/assistente.ts' });
  return { mod: exports, erros };
}

const UUID = '3f2b8c1e-5a6d-4e7f-8a9b-0c1d2e3f4a5b';

(async () => {
  // 1. Caminho feliz: grava na tabela certa, uuid do banco vai, comentário aparado.
  let chamadas = [];
  let { mod } = carregar({ from(t) { return { insert: async (p) => { chamadas.push([t, p]); return { error: null }; } }; } }, false);
  await mod.denunciarResposta({ id: UUID, texto: ' Resposta X ' }, 'incorreta', '  confuso  ');
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0][0], 'assistant_reports');
  assert.deepEqual({ ...chamadas[0][1] }, { mensagem_id: UUID, motivo: 'incorreta', comentario: 'confuso', texto_resposta: 'Resposta X' });

  // 2. Id local (bolha recém-recebida) vira null; comentário vazio vira null.
  chamadas = [];
  ({ mod } = carregar({ from(t) { return { insert: async (p) => { chamadas.push([t, p]); return { error: null }; } }; } }, false));
  await mod.denunciarResposta({ id: 'local-123', texto: 'ok' }, 'outro', '   ');
  assert.equal(chamadas[0][1].mensagem_id, null);
  assert.equal(chamadas[0][1].comentario, null);

  // 3. Comentário truncado em 300.
  await mod.denunciarResposta({ id: UUID, texto: 'ok' }, 'outro', 'a'.repeat(500));
  assert.equal(chamadas[1][1].comentario.length, 300);

  // 4. Falha do banco SOBE (nunca engolida) e deixa log.
  let r = carregar({ from() { return { insert: async () => ({ error: { code: '42501', message: 'rls' } }) }; } }, false);
  await assert.rejects(r.mod.denunciarResposta({ id: UUID, texto: 'x' }, 'improprio'), /denuncia_nao_enviada/);
  assert.equal(r.erros.length, 1);

  // 5. Texto vazio não chega ao banco.
  chamadas = [];
  ({ mod } = carregar({ from(t) { return { insert: async (p) => { chamadas.push(p); return { error: null }; } }; } }, false));
  await assert.rejects(mod.denunciarResposta({ id: UUID, texto: '  ' }, 'outro'), /denuncia_sem_texto/);
  assert.equal(chamadas.length, 0);

  // 6. Modo teste da landing não grava.
  ({ mod } = carregar({ from() { throw new Error('não devia gravar'); } }, true));
  await mod.denunciarResposta({ id: UUID, texto: 'x' }, 'outro');

  // 7. Motivos da tela == motivos aceitos pelo check da migration.
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261107120000_denuncias_assistente.sql'), 'utf8');
  for (const m of mod.MOTIVOS_DENUNCIA) assert.ok(sql.includes(`'${m.valor}'`), m.valor);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /for insert to authenticated[\s\S]*auth\.uid\(\) = user_id/);
  assert.match(sql, /for select to authenticated[\s\S]*auth\.uid\(\) = user_id/);
  assert.doesNotMatch(sql, /grant[^;]*(update|delete)[^;]*to authenticated/i);

  // 8. Tela: recibo visível na falha, sem catch vazio, e ação presente no Granachat.
  const tela = fs.readFileSync(path.join(root, 'components/DenunciarRespostaModal.tsx'), 'utf8');
  assert.match(tela, /setFalhou\(true\)/);
  assert.match(tela, /Não foi possível enviar a denúncia/);
  const chat = fs.readFileSync(path.join(root, 'components/Granachat.tsx'), 'utf8');
  assert.match(chat, /Denunciar esta resposta/);
  assert.match(chat, /!isUser && !item\.erro/);

  console.log('denunciar-resposta: ok');
})().catch((e) => { console.error(e); process.exit(1); });
