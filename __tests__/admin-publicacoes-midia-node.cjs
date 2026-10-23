'use strict';
// Catálogo/captura/adaptador reais; headers e transportes privados sintéticos.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), crypto = require('node:crypto'), vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const configId = require.resolve('../tools/admin-local/config.cjs');
require.cache[configId] = { id: configId, filename: configId, loaded: true, exports: {
  RAIZ: ROOT, RAIZ_DADOS: os.tmpdir(), SIMULAR: false, ler: () => null, tem: () => false, ocultar: String,
} };
const { criarPublicacoes } = require('../tools/admin-local/marketing/publicacoes.cjs');
const { criarPublicacoesReais } = require('../tools/admin-local/adaptadores/marketing-backend.cjs');
const { criarCapturador } = require('../tools/admin-local/marketing/snapshot-local.cjs');
const helper = { Date, Intl, URLSearchParams };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'tools/admin-local/web/telas/_publicacoes-reais.js'), 'utf8').replace(/^export /gm, ''), helper);
const sha = (alg, b) => crypto.createHash(alg).update(b).digest('hex');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAUCAYAAACEYr13AAAAMElEQVR4AaXBAQEAAAiDMKR/5xuC7QYjkEgiiSSSSCKJJJJIIokkkkgiiSSSSCKJHoQXAiYb/t5AAAAAAElFTkSuQmCC', 'base64');
const MP4 = Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex');
let checks = 0, failures = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.error('FALHOU:', m); } else console.log('ok:', m); };
const ADMIN = crypto.randomUUID(), IG = crypto.randomUUID(), FB = crypto.randomUUID();
const contas = [[IG, 'instagram'], [FB, 'facebook']].map(([contaId, rede]) => ({ contaId, rede, rotulo: rede, revisao: 1,
  conexao: 'verificada', pausada: false, capacidades: ['feed', 'carrossel', 'reels', 'stories'].map(formato => ({ formato, estado: 'disponivel', revisao: 1, motivos: [] })) }));

(async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-midia-node-'));
  let db;
  try {
    const base = 'docs/marketing/2026-10/semana-fixture/aprovados/';
    fs.mkdirSync(path.join(pasta, base), { recursive: true });
    let seq = 0;
    const peca = (midias, capa) => {
      const id = (++seq).toString(16).padStart(16, '0'), versao = id.padStart(40, '0');
      const arquivo = (b, tipo, i) => {
        const nome = `${id}-${i}.bin`; fs.writeFileSync(path.join(pasta, base, nome), b);
        return { nome, tipo, url: '/' + base + nome, sha1: sha('sha1', b), bytes: b.length };
      };
      return { id, versao, titulo: 'Fixture aprovada', tipo: 'rótulo editorial deliberadamente genérico', aprovada: true,
        caminho: base + id + '-0.bin', legenda: 'Legenda aprovada',
        arquivos: midias.map((m, i) => arquivo(m.bytes, m.tipo, i)), capa: capa ? arquivo(capa, 'imagem', 'capa') : null,
        aceite: { id, versao, caminho: base + id + '-0.bin', aprovadoEm: new Date(Date.now() - 10000).toISOString(),
          evidencia: 'aceite pelo autor no painel local' } };
    };
    const imagem = () => ({ bytes: PNG, tipo: 'imagem' }), video = () => ({ bytes: MP4, tipo: 'video' });
    const image = peca([imagem()]), movie = peca([video()], PNG), carousel = peca([imagem(), imagem()]);
    const invalid = peca([{ bytes: Buffer.from('nao e midia'), tipo: 'video' }]);
    const invalidCover = peca([video()], Buffer.from('nao e capa'));
    const api = criarPublicacoes({ catalogo: () => ({ pecas: [image, movie, carousel, invalid, invalidCover] }) });
    const catalogo = api.catalogo(pasta).pecas;
    ok(JSON.stringify(catalogo[0].midias) === JSON.stringify([{ tipo: 'imagem', mime: 'image/jpeg' }]), 'catálogo usa bytes PNG e anuncia JPEG do transporte real');
    ok(catalogo[1].midias?.[0]?.mime === 'video/mp4', 'catálogo identifica MP4 sem depender de rótulo/extensão');
    ok(catalogo[1].capa?.mime === 'image/jpeg', 'capa PNG tem MIME do transporte JPEG');
    ok(catalogo[2].midias?.length === 2, 'catálogo conserva quantidade do carrossel');
    ok(catalogo[3].midias?.[0] === null && !helper.capacidadeDaPeca(catalogo[3], 'instagram', 'reels').disponivel, 'header inválido não habilita destino');
    ok(catalogo[4].capa?.mime === null && !helper.capacidadeDaPeca(catalogo[4], 'instagram', 'reels').disponivel,
      'capa inválida é diferente de capa ausente e bloqueia Reel Instagram');
    let posted = 0;
    const client = helper.criarClientePublicacoes({ acao: async () => { posted++; throw new Error('Não deveria enviar'); } });
    for (const c of contas) {
      await assert.rejects(client.prever({ peca: catalogo[1], destinos: [{ contaId: c.contaId, rede: c.rede, formato: 'feed' }],
        contas, horarioLocal: '2027-01-01T12:00' }), { codigo: 'midia-incompativel' }); checks++;
    }
    ok(posted === 0, 'cliente recusa MP4+Feed antes de POST/captura');
    // Requisição forjada não passa da captura para RPC/assinatura/upload privado.
    for (const rede of ['instagram', 'facebook']) {
      const events = [];
      const remote = { rpc: n => { events.push(n); return { abortSignal: async () => ({ data: null, error: { message: 'fixture-parou-na-fronteira' } }) }; } };
      const backend = criarPublicacoesReais({ env: n => n === 'ADMIN_MARKETING_USER_ID' ? ADMIN : undefined,
        remoto: () => null, cliente: () => remote, relogio: () => new Date(), log: () => {},
        rede: () => { throw new Error('Rede proibida'); },
        capturar: criarCapturador({ obterPeca: async () => structuredClone(movie), pastaTemporaria: pasta }) });
      let error;
      try { await backend.prever(pasta, { pecaId: movie.id, versao: movie.versao,
        destinos: [{ contaId: rede === 'instagram' ? IG : FB, rede, formato: 'feed', publicarEm: '2027-01-01T15:00:00.000Z', fuso: 'America/Sao_Paulo' }] }); }
      catch (e) { error = e; }
      ok(error?.codigo === 'midia-incompativel', rede + ': backend real rejeita MP4+Feed');
      ok(events.length === 0, rede + ': zero RPC/assinatura/upload para pedido incompatível');
      ok(!fs.readdirSync(pasta).some(n => n.startsWith('grana-snapshot-')), rede + ': captura privada descartada após recusa');
    }
    // Paridade da decisão UI com a função SQL real; nenhuma RPC remota.
    const { PGlite } = await import('@electric-sql/pglite'); db = new PGlite();
    const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261021083000_admin_marketing_real_midia_formato.sql'), 'utf8');
    const start = migration.indexOf('create function public.admin_marketing_real_midia_compativel(');
    const end = migration.indexOf('end $$;', start);
    assert.ok(start >= 0 && end > start);
    await db.exec(migration.slice(start, end + 'end $$;'.length));
    const im = mime => ({ tipo: 'imagem', mime: mime || 'image/jpeg' });
    const vid = () => ({ tipo: 'video', mime: 'video/mp4' });
    const cases = [[], [im()], [vid()], [im(), im()], [im(), vid()], [vid(), vid()], [im('image/png')],
      Array.from({ length: 10 }, () => im()), Array.from({ length: 11 }, () => im()), [null], [{ tipo: 'imagem', mime: 'video/mp4' }]];
    const matrix = cases.map(midias => ({ midias, capa: null })).concat([
      { midias: [vid()], capa: { mime: 'image/jpeg' } }, { midias: [vid()], capa: { mime: 'image/png' } },
    ]);
    for (const data of matrix) for (const rede of ['instagram', 'facebook']) for (const formato of ['feed', 'carrossel', 'reels', 'stories']) {
      const midias = data.midias;
      const sql = (await db.query('select public.admin_marketing_real_midia_compativel($1,$2,$3) r', [data, rede, formato])).rows[0].r;
      // Stories voltaram aos pedidos novos (autor, 23/10): Instagram com 1 JPEG ou 1 MP4; Facebook recusado nos dois lados.
      ok(helper.capacidadeDaPeca(data, rede, formato).disponivel === sql, `UI/SQL paridade ${rede}/${formato}/${midias.length}/${midias[0]?.mime || 'invalido'}`);
      if (formato === 'stories') ok(sql === (rede === 'instagram' && midias.length === 1 && ['image/jpeg', 'video/mp4'].includes(midias[0]?.mime) && !!midias[0]?.tipo && (midias[0].tipo === 'video') === (midias[0].mime === 'video/mp4')),
        `Stories ${rede}/${midias.length}/${midias[0]?.mime || 'invalido'}: só Instagram com uma mídia JPEG ou MP4`);
      const events = [];
      const backend = criarPublicacoesReais({ env: n => n === 'ADMIN_MARKETING_USER_ID' ? ADMIN : undefined,
        remoto: () => null, cliente: () => ({ rpc: nome => {
          events.push(nome);
          return { abortSignal: async () => ({ data: null, error: { message: 'fixture-fronteira-remota' } }) };
        } }), relogio: () => new Date(), log: () => {}, rede: () => { throw new Error('Rede externa proibida'); },
        capturar: async () => ({ pecaId: movie.id, versao: movie.versao, aceiteSha256: 'a'.repeat(64),
          manifesto: { legenda: movie.legenda, legendaSha256: sha('sha256', movie.legenda),
            midias: midias.map((m, ordem) => m && ({ ...m, ordem, sha256: 'b'.repeat(64), bytes: 100 })),
            capa: data.capa && { ...data.capa, sha256: 'c'.repeat(64), bytes: 100 } }, fechar: async () => {} }),
      });
      let error;
      try { await backend.prever(pasta, { pecaId: movie.id, versao: movie.versao,
        destinos: [{ contaId: rede === 'instagram' ? IG : FB, rede, formato, publicarEm: '2027-01-01T15:00:00.000Z', fuso: 'America/Sao_Paulo' }] }); }
      catch (e) { error = e; }
      ok(sql ? events.length === 1 : events.length === 0 && error?.codigo === 'midia-incompativel',
        `Node/SQL paridade ${rede}/${formato}/${midias.length}/${data.capa?.mime || 'sem-capa'}`);
    }
    ok(!helper.capacidadeDaPeca({}, 'instagram', 'feed').disponivel, 'UI bloqueia catálogo antigo sem metadados até atualização');
    console.log(`admin-publicacoes-midia-node: ${checks} checks, ${failures} falhas; remoto=0`);
    process.exitCode = failures ? 1 : 0;
  } finally {
    await db?.close();
    assert.equal(path.dirname(path.resolve(pasta)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(pasta).startsWith('grana-midia-node-'));
    fs.rmSync(pasta, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
