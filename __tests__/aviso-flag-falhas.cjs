const assert = require('node:assert/strict');
const { ambiente, flush, pendente } = require('./helpers/react-fronteiras.cjs');
const rejeicoes = [];
process.on('unhandledRejection', e => rejeicoes.push(e));
const flag = (severidade = 'aviso', aviso_versao = 1) => ({ key: 'voz', severidade, aviso_versao, titulo: 'Instabilidade', mensagem: 'Tente depois' });
function preparar({ ler = async () => null, gravar = async () => {}, flags = [flag()] } = {}) {
  const chamadas = [];
  const a = ambiente({
    '@react-native-async-storage/async-storage': { getItem: k => { chamadas.push(['ler', k]); return ler(k); }, setItem: (k, v) => { chamadas.push(['gravar', k, v]); return gravar(k, v); } },
    '@/lib/feature-flags': { useFlags: () => ({ avisosAtivos: flags }) },
    '@/lib/theme': { theme: {}, radius: {}, spacing: {}, fonts: {}, type: {}, lh: () => 1 },
    '@expo/vector-icons/Ionicons': 'Icon', './AppModal': 'Modal', './AppPressable': 'Botao', './AccessibleModalPanel': 'Panel',
  });
  const mod = a.carregar('components/AvisoFlagModal.tsx');
  const montar = () => a.montar(mod.default);
  return { ...a, chamadas, montar, trocar: novo => { flags = novo; } };
}
const casos = [];
const caso = (nome, fn) => casos.push([nome, fn]);
caso('fecha imediatamente com escrita pendente e dispensa na sessão após remontar', async () => {
  const escrita = pendente(), a = preparar({ gravar: () => escrita.promise }), m = a.montar();
  await flush(); const modal = m.render(); assert.ok(modal);
  const p = modal.props.onRequestClose();
  const q = modal.props.onRequestClose();
  assert.equal(m.render(), null); await flush(); assert.equal(a.chamadas.filter(c => c[0] === 'gravar').length, 1);
  m.desmontar(); const n = a.montar(); await flush(); assert.equal(n.render(), null);
  escrita.resolve(); await Promise.all([p, q]);
});
caso('escrita rejeitada não reabre e log não carrega erro privado', async () => {
  const a = preparar({ gravar: async () => { throw Error('SEGREDO PRIVADO'); } }), m = a.montar(); await flush();
  await m.render().props.onRequestClose(); await flush(); assert.equal(m.render(), null);
  a.trocar([flag()]); m.render(); await flush(); assert.equal(m.render(), null);
  assert.ok(a.logs.length); assert.doesNotMatch(JSON.stringify(a.logs), /SEGREDO PRIVADO/);
});
caso('leitura rejeitada exibe aviso e deixa log sanitizado', async () => {
  const a = preparar({ ler: async () => { throw Error('SEGREDO PRIVADO'); } }), m = a.montar(); await flush();
  assert.ok(m.render()); assert.ok(a.logs.length); assert.doesNotMatch(JSON.stringify(a.logs), /SEGREDO PRIVADO/);
});
caso('crítico fecha por abertura e volta na próxima, sem persistir', async () => {
  const a = preparar({ flags: [flag('critico')] }), m = a.montar(); await flush(); await m.render().props.onRequestClose();
  a.trocar([flag('critico')]); m.render(); await flush(); assert.equal(m.render(), null);
  m.desmontar(); const n = a.montar(); await flush(); assert.ok(n.render()); assert.equal(a.chamadas.length, 0);
});
caso('versão nova reaparece e info continua sem modal', async () => {
  const a = preparar(), m = a.montar(); await flush(); await m.render().props.onRequestClose();
  a.trocar([flag('aviso', 2)]); m.render(); await flush(); assert.ok(m.render());
  a.trocar([flag('info', 3)]); m.render(); await flush(); assert.equal(m.render(), null);
});
caso('dispensa persistida é respeitada e crítico tem prioridade sem ler storage', async () => {
  const a = preparar({ ler: async () => '1' }), m = a.montar(); await flush(); assert.equal(m.render(), null);
  const b = preparar({ flags: [flag(), flag('critico', 2)] }), n = b.montar(); await flush();
  assert.ok(n.render()); assert.equal(b.chamadas.length, 0);
});
(async () => {
  let falhas = 0;
  for (const [nome, fn] of casos) { try { await fn(); console.log('OK ' + nome); } catch (e) { falhas++; console.error('FALHA ' + nome + ': ' + e.message); } }
  await new Promise(setImmediate); assert.equal(rejeicoes.length, 0, 'rejeições não tratadas');
  console.log(`${casos.length - falhas}/${casos.length} grupos`); process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e.message); process.exitCode = 1; });
