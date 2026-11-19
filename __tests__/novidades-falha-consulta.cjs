// Novidades e modal REAIS; SDK/storage/apresentacao somente nas fronteiras.
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const VISTA = 'grana_novidades_versao_vista';
const DISPENSADA = 'grana_versao_dispensada';
const INSTALADA = '2.0.0';
const ANTERIOR = '1.0.0';
const row = (version = INSTALADA, notes = '  Nota A\n\nNota B  ') => ({ version, notes, apk_url: 'https://example.invalid/grana.apk', apk_expires_at: null });
const ok = data => ({ data, error: null });
const failures = [];
let checks = 0;
function check(label, fn) { checks++; try { fn(); } catch (e) { failures.push(label + ': ' + e.message); } }
function plain(value) { return JSON.parse(JSON.stringify(value)); }

(async () => {
  const mode = 'integrado';
  const selected = path.join(root, 'lib/atualizacao.ts');
  const { ambiente, flush } = require(path.join(root, '__tests__/helpers/providers-controlados.cjs'));

  function device({ vista = ANTERIOR, steps = [], play = false } = {}) {
    const disk = new Map(vista === null ? [] : [[VISTA, vista]]);
    const writes = [], queries = [], queue = [...steps];
    const networkError = new Error('FALHA_REDE_SINTETICA_ITEM46');
    const store = {
      async getItem(key) { return disk.get(key) ?? null; },
      async setItem(key, value) { writes.push([key, value]); disk.set(key, value); },
    };
    const supabase = { from(table) {
      queries.push(['from', table]);
      const query = {
        select(columns) { queries.push(['select', columns]); return query; },
        eq(key, value) { queries.push(['eq', key, value]); return query; },
        async maybeSingle() {
          if (!queue.length) throw new Error('FIXTURE: consulta nao planejada');
          const next = queue.shift();
          if (next === 'throw') throw networkError;
          return next;
        },
      };
      return query;
    } };
    const mocks = {
      'expo-constants': { __esModule: true, default: { expoConfig: { version: INSTALADA } } },
      '@react-native-async-storage/async-storage': { __esModule: true, default: store },
      './supabase': { supabase },
      './download-app': { obterUrlDownloadAndroid: () => null },
      './canal': { ehCanalPlay: () => play },
      'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: value => value } },
      '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Ionicons' },
      '@/lib/theme': { theme: {}, radius: {}, spacing: {}, fonts: {}, type: {}, lh: () => 12 },
      './AppModal': { __esModule: true, default: 'AppModal' },
      './AppPressable': { __esModule: true, default: 'AppPressable' },
      './AccessibleModalPanel': { __esModule: true, default: 'AccessibleModalPanel' },
    };
    const env = ambiente(mocks);
    mocks['./versao'] = env.load('lib/versao.ts');
    const api = env.load(selected);
    mocks['@/lib/atualizacao'] = api;
    return { env, api, disk, writes, queries, networkError,
      fetches: () => queries.filter(call => call[0] === 'from').length,
      seenWrites: () => writes.filter(call => call[0] === VISTA),
      mount: () => env.mount(env.load('components/NovidadesModal.tsx').default),
    };
  }

  async function novidades(device, label) {
    try { return await device.api.verificarNovidades(); }
    catch (e) {
      if (e !== device.networkError) throw e;
      check(label + ': falha de fetch nao rejeita sem tratamento no modal', () => assert.fail('rejeicao de rede escapou'));
      return undefined;
    }
  }
  function validQuery(device, label) {
    check(label + ': somente singleton real app_release', () => {
      assert.deepEqual(device.queries, Array.from({ length: device.fetches() }, () => [
        ['from', 'app_release'],
        ['select', 'version, apk_url, notes, apk_expires_at'],
        ['eq', 'id', 1],
      ]).flat());
    });
  }

  for (const [name, failure] of [
    ['erro retornado', { data: null, error: { code: 'NETWORK_SYNTHETIC' } }],
    ['excecao de transporte', 'throw'],
    ['dados com erro continuam falha', { data: row(), error: { code: 'NETWORK_SYNTHETIC' } }],
  ]) {
    const d = device({ steps: [failure, ok(row())] });
    const first = await novidades(d, name);
    check(name + ': primeira consulta nao exibe notas', () => assert.equal(first, null));
    check(name + ': preserva versao anterior', () => assert.equal(d.disk.get(VISTA), ANTERIOR));
    check(name + ': zero gravacao de vista na falha', () => assert.equal(d.seenWrites().length, 0));
    check(name + ': falha deixa log sem dados da resposta', () => assert.ok(d.env.logs.some(call => call.length === 1 && call[0] === '[atualizacao] não foi possível consultar a versão publicada')));
    const second = await novidades(d, name + '/segunda');
    check(name + ': segunda consulta recupera notas', () => assert.deepEqual(plain(second), { versao: INSTALADA, itens: ['Nota A', 'Nota B'] }));
    check(name + ': leitura das notas ainda nao confirma leitura', () => assert.equal(d.seenWrites().length, 0));
    check(name + ': duas consultas aconteceram', () => assert.equal(d.fetches(), 2));
    validQuery(d, name);
  }

  const fresh = device({ vista: null });
  const initial = await fresh.api.verificarNovidades();
  check('instalacao nova: resultado nulo', () => assert.equal(initial, null));
  check('instalacao nova: grava apenas baseline instalada', () => assert.deepEqual(fresh.writes, [[VISTA, INSTALADA]]));
  check('instalacao nova: nenhuma consulta', () => assert.equal(fresh.fetches(), 0));
  await fresh.api.verificarNovidades();
  check('baseline nao se repete na mesma versao', () => assert.equal(fresh.writes.length, 1));

  const seen = device({ vista: INSTALADA });
  const already = await seen.api.verificarNovidades();
  check('ja vista: nao consulta nem grava', () => { assert.equal(already, null); assert.equal(seen.fetches(), 0); assert.equal(seen.writes.length, 0); });

  for (const [name, release] of [
    ['ausencia confirmada', null], ['notas null', row(INSTALADA, null)], ['notas vazias', row(INSTALADA, ' \n\t ')],
    ['publicada adiante da instalada', row('3.0.0')], ['publicada atras da instalada', row('1.5.0')],
  ]) {
    const d = device({ steps: [ok(release)] });
    const result = await d.api.verificarNovidades();
    check(name + ': nao inventa novidades', () => assert.equal(result, null));
    check(name + ': confirma baseline uma vez', () => assert.deepEqual(d.seenWrites(), [[VISTA, INSTALADA]]));
    await d.api.verificarNovidades();
    check(name + ': proxima abertura nao repete consulta', () => assert.equal(d.fetches(), 1));
    check(name + ': nao toca dispensa do APK', () => assert.equal(d.disk.has(DISPENSADA), false));
  }

  const updates = device({ steps: [ok(row('3.0.0'))] });
  await updates.api.dispensarAtualizacao('3.0.0');
  const update = await updates.api.verificarAtualizacao();
  check('dispensa do APK continua respeitada', () => { assert.equal(update, null); assert.equal(updates.disk.get(DISPENSADA), '3.0.0'); });
  check('dispensa do APK nao consome novidades', () => { assert.equal(updates.disk.get(VISTA), ANTERIOR); assert.equal(updates.seenWrites().length, 0); });
  const play = device({ play: true });
  const playUpdate = await play.api.verificarAtualizacao();
  check('Play continua sem APK/consulta/gravacao', () => { assert.equal(playUpdate, null); assert.equal(play.fetches(), 0); assert.equal(play.writes.length, 0); });

  const available = device({ steps: [ok(row('3.0.0'))] });
  const advertised = await available.api.verificarAtualizacao();
  check('APK novo continua disponivel', () => assert.deepEqual(plain(advertised), { versao: '3.0.0', apkUrl: 'https://example.invalid/grana.apk', notas: '  Nota A\n\nNota B  ' }));
  check('anuncio nao altera visto nem dispensa', () => assert.deepEqual(available.writes, []));

  for (const [name, failure] of [
    ['erro retornado', { data: null, error: { code: 'NETWORK_SYNTHETIC' } }],
    ['excecao de transporte', 'throw'],
  ]) {
    const d = device({ steps: [failure] });
    let result;
    try { result = await d.api.verificarAtualizacao(); }
    catch (e) {
      if (e !== d.networkError) throw e;
      check('APK/' + name + ': rejeicao tratada', () => assert.fail('rejeicao de rede escapou'));
    }
    check('APK/' + name + ': falha nao anuncia APK', () => assert.equal(result, null));
    check('APK/' + name + ': falha nao grava estado', () => assert.deepEqual(d.writes, []));
    validQuery(d, 'APK/' + name);
  }

  function nodes(tree) {
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  }
  for (const [name, handler] of [
    ['voltar', tree => tree.props.onRequestClose],
    ['fundo', tree => nodes(tree).find(node => node.type === 'Pressable').props.onPress],
    ['painel acessivel', tree => nodes(tree).find(node => node.type === 'AccessibleModalPanel').props.onClose],
    ['Entendi', tree => nodes(tree).find(node => node.type === 'AppPressable').props.onPress],
  ]) {
    const d = device({ steps: [ok(row())] });
    const modal = d.mount(); modal.render(); await flush();
    const tree = modal.render();
    check(name + ': modal real exibe notas sem marcar vista', () => { assert.ok(tree); assert.equal(d.disk.get(VISTA), ANTERIOR); assert.equal(d.seenWrites().length, 0); });
    const close = handler(tree);
    assert.equal(typeof close, 'function', 'FIXTURE: fechamento real nao localizado');
    await close(); await flush();
    check(name + ': dispensa fecha o modal', () => assert.equal(modal.render(), null));
    check(name + ': somente dispensa marca instalada', () => assert.deepEqual(d.seenWrites(), [[VISTA, INSTALADA]]));
    const after = await d.api.verificarNovidades();
    check(name + ': reabertura nao repete notas', () => { assert.equal(after, null); assert.equal(d.fetches(), 1); });
    modal.unmount();
  }
  console.log(JSON.stringify({ status: failures.length ? 'FAIL' : 'PASS', mode, checks, failures }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
})().catch(e => { console.error('ERRO DE FIXTURE (nao e RED causal):', e.stack); process.exitCode = 2; });
