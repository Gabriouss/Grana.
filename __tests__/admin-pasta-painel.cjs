'use strict';
// Pasta própria do painel (autor, 23/10/2026): as peças saem de docs/marketing para
// E:\Grana - Painel. Só muda o lugar físico; o caminho lógico, o id e a versão de cada peça
// continuam iguais. Prova: o mesmo acervo nos dois layouts dá o mesmo catálogo; Reel e capa
// em pastas de estado diferentes continuam pareados; promover leva a capa junto, preserva o
// aceite, grava registros e índice na pasta do painel e não deixa pasta vazia.
// Módulos reais, pastas temporárias, sem rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const base = fs.mkdtempSync(path.join(process.env.GRANA_TEMP || os.tmpdir(), 'grana-pasta-painel-'));
const legado = path.join(base, 'repo'), painel = path.join(base, 'Grana - Painel');
process.env.GRANA_ADMIN_PASTA_CONTA = path.join(base, 'conta');
process.env.GRANA_ADMIN_PASTA_PAINEL = painel;
fs.mkdirSync(legado, { recursive: true }); fs.mkdirSync(path.join(painel, 'Registros'), { recursive: true });
// O layout novo só liga com o recibo de uma migração conferida (gravado por último pelo script).
fs.writeFileSync(path.join(painel, 'Registros', 'migracao-AUDIT.json'), '{"formato":1}\n');
const configPath = require.resolve('../tools/admin-local/config.cjs');
require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: {
  RAIZ: path.resolve(__dirname, '..'), RAIZ_DADOS: path.resolve(__dirname, '..'), ler: () => null, tem: () => false,
  ocultar: (s) => String(s), registrarSegredo() {}, refSupabase: () => null } };
global.fetch = () => { throw Error('rede proibida'); };
const pp = require('../tools/admin-local/marketing/pasta-painel.cjs');
const R = pp.REPO; // o servidor passa a raiz do repositório; a pasta do painel vem do ambiente
const cat = require('../tools/admin-local/marketing/catalogo.cjs');
const ap = require('../tools/admin-local/marketing/aprovacoes.cjs');
const promo = require('../tools/admin-local/marketing/promocao.cjs');

const MES = '2026-10', SEM = 'semana-42-2026-10-12-a-2026-10-18', S = `docs/marketing/${MES}/${SEM}`;
const TOPO = { 'para-aprovacao': 'Para aprovar', aprovados: 'Aprovados', historico: 'Histórico' };
// Fixture física escrita à mão, sem passar pelo tradutor que está sendo testado.
function grava(rel, conteudo) {
  const [estado, ...resto] = rel.split('/');
  const noPainel = rel === 'INDICE.md' ? path.join(painel, 'Registros', 'Índices semanais', `${SEM}.md`)
    : estado === 'painel' ? path.join(painel, 'Registros', ...resto)
      : path.join(painel, TOPO[estado], MES, SEM, ...resto);
  const noLegado = estado === 'painel' ? path.join(legado, 'docs/marketing/painel', ...resto) : path.join(legado, S, rel);
  for (const f of [noPainel, noLegado]) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, conteudo); }
}
const resumo = (raiz) => cat.listarPecas(raiz).pecas.map((p) => [p.caminho, p.id, p.versao, p.estado, p.capa?.pecaId || null, p.capaDe || null, !!p.capaOrfa])
  .sort((a, b) => a[0].localeCompare(b[0]));
const por = (raiz, rel) => cat.listarPecas(raiz).pecas.find((p) => p.caminho === `${S}/${rel}`);
const vazias = (d) => fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory())
  .flatMap((e) => { const f = path.join(d, e.name); return fs.readdirSync(f).length ? vazias(f) : [f]; });

(async () => {
  try {
    // Tradutor: ida e volta, e o que não é do painel continua no repositório.
    assert.equal(pp.ativo(R), true); assert.equal(pp.ativo(legado), false, 'outra raiz segue o layout antigo');
    assert.equal(pp.ativo(painel), false, 'só a raiz do repositório liga o layout novo');
    const ida = pp.fisico(R, `${S}/aprovados/pecas/x.png`);
    assert.equal(ida, path.join(painel, 'Aprovados', MES, SEM, 'pecas', 'x.png'));
    assert.equal(pp.logico(R, ida), `${S}/aprovados/pecas/x.png`);
    assert.equal(pp.fisico(R, 'docs/marketing/painel/aprovacoes.json'), path.join(painel, 'Registros', 'aprovacoes.json'));
    assert.equal(pp.fisico(R, `${S}/INDICE.md`), path.join(painel, 'Registros', 'Índices semanais', `${SEM}.md`));
    assert.equal(pp.fisico(R, 'docs/marketing/arsenal/icones/a.png'), path.join(pp.REPO, 'docs/marketing/arsenal/icones/a.png'));
    assert.equal(pp.fisico(R, `${S}/apoio/x.md`), path.join(pp.REPO, S, 'apoio/x.md'), 'apoio fica no repositório');
    assert.equal(pp.fisico(legado, `${S}/aprovados/x.png`), path.join(legado, S, 'aprovados/x.png'));
    assert.throws(() => cat.caminhoSeguro(R, `${S}/aprovados/../../../fora.png`), (e) => e.codigo === 'caminho-invalido');

    grava('INDICE.md', '# AUDIT\n');
    grava('painel/calendario.json', JSON.stringify({ diaD: '2099-01-01', planejados: [] }));
    grava('para-aprovacao/pecas/COPYS-FINAIS.md', '## E01 - Fixture\n\n**Legenda:** Texto de publicacao E01.\n\n## Junto\n\n**Legenda:** Texto de publicacao do Reel.\n');
    grava('para-aprovacao/pecas/E01.jpg', 'AUDIT-e01');
    // 6.4 (a): Reel em Aprovados, capa em Para aprovar (pastas de topo diferentes).
    grava('aprovados/pecas/reels/Inverso.mp4', 'AUDIT-video-inv');
    grava('para-aprovacao/pecas/reels/Inverso-capa.png', 'AUDIT-capa-inv');
    // 6.4 (c): capa sem vídeo continua órfã.
    grava('aprovados/pecas/reels/Sozinha-capa.png', 'AUDIT-capa-so');
    // 6.4 (b): par inteiro em Para aprovar, para promover.
    grava('para-aprovacao/pecas/reels/Junto.mp4', 'AUDIT-video-junto');
    grava('para-aprovacao/pecas/reels/Junto-capa.png', 'AUDIT-capa-junto');
    const B = `${S}/para-aprovacao/pecas/reels/`;
    grava('painel/familias.json', JSON.stringify({ familias: [], capas: [{ capa: B + 'Junto-capa.png', reel: B + 'Junto.mp4' }] }));

    // Mesmo acervo, dois layouts: mesmo catálogo (caminho lógico, id, versão, pares).
    assert.deepEqual(resumo(R), resumo(legado));
    assert.ok(resumo(R).length >= 5, 'catálogo leu a pasta do painel');

    const v = por(R, 'aprovados/pecas/reels/Inverso.mp4'), c = por(R, 'para-aprovacao/pecas/reels/Inverso-capa.png');
    assert.equal(v.capa?.pecaId, c.id); assert.equal(c.capaDe, v.id); assert.equal(c.capaOrfa, false);
    assert.equal(por(R, 'aprovados/pecas/reels/Sozinha-capa.png').capaOrfa, true);
    // Mídia servida pela URL lógica sai do arquivo físico do painel.
    assert.equal(cat.caminhoSeguro(R, decodeURIComponent(v.arquivos[0].url.slice(1))), path.join(painel, 'Aprovados', MES, SEM, 'pecas', 'reels', 'Inverso.mp4'));

    // 6.4 (b): aprovar e promover o Reel leva a capa junto, com o mesmo id e a mesma versão.
    const reel = por(R, 'para-aprovacao/pecas/reels/Junto.mp4');
    assert.ok(reel.capa, 'Reel com capa pareada');
    await ap.aprovar(R, reel.id, { versao: reel.versao, confirmacao: true });
    const r = await promo.promover(R, reel.id, { versao: reel.versao, confirmacao: true });
    assert.equal(r.promocao.versao, reel.versao);
    const aprov = path.join(painel, 'Aprovados', MES, SEM, 'pecas', 'reels');
    assert.ok(fs.existsSync(path.join(aprov, 'Junto.mp4')) && fs.existsSync(path.join(aprov, 'Junto-capa.png')), 'par inteiro em Aprovados');
    assert.ok(!fs.existsSync(path.join(painel, 'Para aprovar', MES, SEM, 'pecas', 'reels', 'Junto.mp4')));
    const novo = por(R, 'aprovados/pecas/reels/Junto.mp4');
    assert.equal(novo.versao, reel.versao); assert.equal(novo.capa?.pecaId, por(R, 'aprovados/pecas/reels/Junto-capa.png').id);
    const aceites = JSON.parse(fs.readFileSync(path.join(painel, 'Registros', 'aprovacoes.json'), 'utf8')).aprovacoes;
    assert.ok(aceites.some((a) => a.versao === reel.versao), 'aceite preservado no registro da pasta do painel');
    assert.equal(r.promocao.indice, `${S}/INDICE.md`, 'recibo do índice guarda o caminho lógico');
    assert.match(fs.readFileSync(path.join(painel, 'Registros', 'Índices semanais', `${SEM}.md`), 'utf8'), /Promoção/);

    // Nada escrito no layout antigo dentro do painel, e nenhuma pasta vazia ficou para trás.
    assert.ok(!fs.existsSync(path.join(painel, 'docs')));
    assert.ok(!fs.existsSync(path.join(pp.REPO, 'docs/marketing', MES, SEM, 'aprovados/pecas/reels/Junto.mp4')), 'repositório intocado');
    assert.deepEqual(vazias(painel), []);
    console.log('admin-pasta-painel: tradutor ida/volta (peças, registros, índice, apoio e arsenal no repositório), mesmo catálogo nos dois layouts, Reel e capa pareados entre Aprovados e Para aprovar, capa sozinha órfã, promoção leva a capa e preserva aceite e versão, índice e registros na pasta do painel, sem pasta vazia OK');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
