#!/usr/bin/env node
'use strict';
// Migra as peças, os registros e os índices do painel de docs/marketing (repositório) para a
// pasta própria do painel (GRANA_ADMIN_PASTA_PAINEL, padrão E:\Grana - Painel). Autor, 23/10/2026.
//
//   node scripts/migrar-pasta-painel.cjs --seco     lista o que seria copiado, sem escrever nada
//   node scripts/migrar-pasta-painel.cjs --copiar   copia, confere o SHA-256 de cada arquivo e grava o recibo
//
// Idempotente: arquivo já copiado com o mesmo hash é pulado; com hash diferente, o script PARA.
// Nunca apaga nada do repositório: a saída do repositório é um commit próprio (regra 14), feito
// depois, com a lista que este script imprime. Recusa rodar com o painel ligado ou com a trava
// de escrita do acervo presente; mantém a mesma reserva dos writers até o recibo.
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const pp = require('../tools/admin-local/marketing/pasta-painel.cjs');

const REPO = pp.REPO, PAINEL = pp.pasta();
const modo = process.argv[2];
if (!['--seco', '--copiar'].includes(modo)) { console.error('uso: node scripts/migrar-pasta-painel.cjs --seco | --copiar'); process.exit(2); }

const RE_SEMANA_ESTADO = /^docs\/marketing\/\d{4}-\d{2}\/semana-[^/]+\/(para-aprovacao|aprovados|historico)\//;
const RE_INDICE = /^docs\/marketing\/\d{4}-\d{2}\/semana-[^/]+\/INDICE\.md$/;
const RE_REGISTRO = /^docs\/marketing\/painel\/[^/]+\.json$/;
const saiDoRepo = (rel) => RE_SEMANA_ESTADO.test(rel) || RE_INDICE.test(rel) || RE_REGISTRO.test(rel);
const doPainel = (rel) => saiDoRepo(rel) && path.posix.basename(rel) !== '.gitkeep'; // pasta vazia não se copia

// Valida componentes desde a raiz do volume, inclusive ancestrais de REPO/PAINEL.
// As identidades observadas ficam ancoradas durante esta execução: não seguir trocas de pasta.
const ancoras = new Map();
const normal = p => path.sep === '\\' ? path.resolve(p).toLowerCase() : path.resolve(p);
const dentro = (root, abs) => { const rel = path.relative(root, abs); return !rel || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); };
function conferirCaminho(abs) {
  abs = path.resolve(abs);
  const volume = path.parse(abs).root;
  const partes = path.relative(volume, abs).split(path.sep).filter(Boolean);
  let cur = volume, st;
  for (let i = -1; i < partes.length; i++) {
    if (i >= 0) cur = path.join(cur, partes[i]);
    try { st = fs.lstatSync(cur); }
    catch (e) {
      if (e.code !== 'ENOENT' || ancoras.has(normal(cur))) throw e;
      return null; // Os descendentes de um componente inexistente também não existem.
    }
    if (st.isSymbolicLink() || normal(fs.realpathSync(cur)) !== normal(cur)) throw new Error(`link/junction ou escape no caminho: ${cur}`);
    if (i < partes.length - 1 && !st.isDirectory()) throw new Error(`ancestral não é pasta: ${cur}`);
    const id = `${st.dev}:${st.ino}`, chave = normal(cur), anterior = ancoras.get(chave);
    if (anterior && anterior !== id) throw new Error(`ancoragem do caminho mudou: ${cur}`);
    ancoras.set(chave, id);
  }
  return st;
}
function destinoSeguro(abs) {
  if (!dentro(PAINEL, abs)) throw new Error(`destino fora da pasta do painel: ${abs}`);
  return conferirCaminho(abs);
}
function listar(dir, rel = '') {
  const st = conferirCaminho(dir);
  if (!st?.isDirectory()) throw new Error(`origem não é pasta: ${dir}`);
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name, abs = path.join(dir, e.name);
    const item = conferirCaminho(abs);
    if (item?.isDirectory()) return listar(abs, r);
    if (!item?.isFile()) throw new Error(`entrada não regular no acervo: ${r}`);
    return [r];
  });
}
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const inventario = () => listar(path.join(REPO, 'docs/marketing'), 'docs/marketing').filter(doPainel).sort();
const portaOcupada = () => new Promise((ok) => {
  const s = net.connect({ host: '127.0.0.1', port: Number(process.env.GRANA_ADMIN_PORTA) || 4317 });
  s.once('connect', () => { s.destroy(); ok(true); }); s.once('error', () => ok(false));
});
function criarPastas(dir) {
  const st = destinoSeguro(dir);
  if (st) { if (!st.isDirectory()) throw new Error(`destino não é pasta: ${dir}`); return; }
  const pai = path.dirname(dir);
  if (dentro(PAINEL, pai)) criarPastas(pai);
  else if (!conferirCaminho(pai)?.isDirectory()) {
    throw new Error(`pai da pasta do painel precisa existir: ${pai}`);
  }
  conferirCaminho(pai); destinoSeguro(dir);
  fs.mkdirSync(dir);
  destinoSeguro(dir);
}

(async () => {
  if (dentro(REPO, PAINEL) || dentro(PAINEL, REPO)) throw new Error('origem e painel precisam ser pastas separadas, sem sobreposição');
  if (!conferirCaminho(REPO)?.isDirectory()) throw new Error('raiz do repositório ausente');
  conferirCaminho(path.join(REPO, 'docs/marketing'));
  conferirCaminho(PAINEL); destinoSeguro(path.join(PAINEL, 'Registros'));
  const lock = path.join(REPO, '.grana-admin-writer.lock');
  if (conferirCaminho(lock)) throw new Error('trava de escrita do acervo presente (.grana-admin-writer.lock): confira antes de migrar');

  async function executar(copiar) {
    // A reserva é a do catálogo real; nenhum protocolo paralelo de trava.
    const dono = copiar ? fs.readFileSync(lock, 'utf8') : null;
    function reserva() {
      conferirCaminho(REPO);
      if (copiar && (!conferirCaminho(lock)?.isFile() || fs.readFileSync(lock, 'utf8') !== dono)) throw new Error('reserva do acervo mudou durante a migração');
    }
    reserva();
    const rels = inventario();
    const todosRastreados = execFileSync('git', ['-C', REPO, 'ls-files', '-z', '--', 'docs/marketing'], { maxBuffer: 64 << 20 }).toString().split('\0').filter(saiDoRepo).sort();
    const rastreados = new Set(todosRastreados.filter(doPainel)), destinos = new Set();
    const plano = rels.map(rel => {
      const destino = pp.mapear(PAINEL, rel).abs, origem = path.join(REPO, ...rel.split('/'));
      const st = destinoSeguro(destino);
      if (st && !st.isFile()) throw new Error(`destino não é arquivo regular: ${rel}`);
      if (destinos.has(normal(destino))) throw new Error(`dois caminhos lógicos no mesmo destino: ${rel}`);
      destinos.add(normal(destino));
      if (path.dirname(destino) === path.join(PAINEL, 'Registros') && /^migracao-.+\.json$/.test(path.basename(destino))) throw new Error(`nome reservado ao recibo de ativação: ${rel}`);
      conferirCaminho(origem);
      const sha = sha256(origem), acao = !st ? 'copiar' : sha256(destino) === sha ? 'ja-copiado' : 'CONFLITO';
      return { rel, origem, destino, sha256: sha, bytes: fs.statSync(origem).size, acao, rastreado: rastreados.has(rel) };
    });
    const conflitos = plano.filter(p => p.acao === 'CONFLITO');
    const conta = a => plano.filter(p => p.acao === a).length;
    console.log(`pasta do painel: ${PAINEL}`);
    console.log(`arquivos: ${plano.length} (copiar ${conta('copiar')}, já copiados ${conta('ja-copiado')}, conflitos ${conflitos.length}); ${(plano.reduce((s,p) => s+p.bytes,0)/1048576).toFixed(1)} MB`);
    for (const p of plano) console.log(`${p.acao.padEnd(10)} ${p.rel}  ->  ${path.relative(PAINEL, p.destino)}`);
    if (conflitos.length) throw new Error(`destino com conteúdo diferente: ${conflitos.map(p => p.rel).join(', ')}. Nada foi copiado.`);
    const imprimirSaida = () => {
      console.log(`Saem do repositório no commit próprio (git rm), depois da conferência: ${todosRastreados.length}`);
      for (const r of todosRastreados) console.log(`  ${r}${fs.existsSync(path.join(REPO, ...r.split('/'))) ? '' : '  (já apagado no disco)'}`);
      const soltos = plano.filter(x => !x.rastreado);
      if (soltos.length) { console.log(`Não rastreados (apagar do disco depois do commit): ${soltos.length}`); for (const p of soltos) console.log(`  ${p.rel}`); }
    };
    if (!copiar) { imprimirSaida(); return; } // --seco não cria nem mesmo a trava.
    if (await portaOcupada()) throw new Error(`o painel está ligado (porta ${Number(process.env.GRANA_ADMIN_PORTA)||4317}). Desligue antes de copiar.`);
    reserva();
    const temps = new Set();
    let falha;
    try {
      for (const p of plano.filter(x => x.acao === 'copiar')) {
        reserva(); conferirCaminho(p.origem); criarPastas(path.dirname(p.destino));
        const tmp = `${p.destino}.${crypto.randomUUID()}.tmp`;
        if (destinoSeguro(tmp)) throw new Error(`temporário já existe: ${tmp}`);
        destinoSeguro(p.destino);
        fs.copyFileSync(p.origem, tmp, fs.constants.COPYFILE_EXCL); temps.add(tmp);
        destinoSeguro(tmp);
        if (sha256(tmp) !== p.sha256) throw new Error(`hash divergente na cópia: ${p.rel}`);
        reserva(); destinoSeguro(p.destino); destinoSeguro(tmp);
        fs.linkSync(tmp, p.destino); // Publicação exclusiva: nunca sobrescreve conflito tardio.
        fs.unlinkSync(tmp); temps.delete(tmp);
      }
      criarPastas(path.join(PAINEL, 'Registros'));
      imprimirSaida();
      const agora = new Date(), carimbo = new Date(agora.getTime()-agora.getTimezoneOffset()*60000).toISOString().slice(0,19).replace(/[-:]/g,'').replace('T','-');
      const recibo = path.join(PAINEL, 'Registros', `migracao-${carimbo}-${crypto.randomUUID()}.json`), tmp = `${recibo}.tmp`;
      if (destinoSeguro(recibo) || destinoSeguro(tmp)) throw new Error('recibo ou temporário já existe');
      const conteudo = JSON.stringify({ formato:1, em:agora.toISOString(), painel:PAINEL,
        arquivos:plano.map(({rel,destino,sha256:s,bytes,rastreado}) => ({origem:rel,destino:path.relative(PAINEL,destino),sha256:s,bytes,rastreado})) },null,2)+'\n';
      const fd = fs.openSync(tmp, 'wx', 0o600); temps.add(tmp);
      try { fs.writeFileSync(fd,conteudo,'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      // Corte final sob a mesma reserva: inventário E bytes atuais dos dois lados.
      reserva();
      if (JSON.stringify(inventario()) !== JSON.stringify(rels)) throw new Error('inventário da origem mudou durante a migração');
      for (const p of plano) {
        conferirCaminho(p.origem); destinoSeguro(p.destino);
        const atual = sha256(p.origem);
        if (atual !== p.sha256 || sha256(p.destino) !== atual) throw new Error(`conferência origem/destino falhou: ${p.rel}`);
      }
      if (JSON.stringify(inventario()) !== JSON.stringify(rels)) throw new Error('inventário da origem mudou no corte final');
      reserva(); destinoSeguro(tmp);
      if (fs.readFileSync(tmp,'utf8') !== conteudo) throw new Error('temporário do recibo mudou');
      if (destinoSeguro(recibo)) throw new Error('recibo já existe');
      fs.linkSync(tmp,recibo); // ÚLTIMO artefato publicado, atômico e sem sobrescrever recibo anterior.
      fs.unlinkSync(tmp); temps.delete(tmp);
      return {recibo,total:plano.length};
    } catch (e) { falha=e; throw e; }
    finally {
      for (const tmp of temps) {
        try { if (destinoSeguro(tmp)) fs.unlinkSync(tmp); }
        catch (e) { throw new AggregateError([...(falha?[falha]:[]),e],`falha ao limpar temporário; confira antes de repetir: ${tmp}${falha?' — '+falha.message:''}`); }
      }
    }
  }
  // No modo de leitura não adquirir arquivo de trava: nenhum efeito em --seco.
  const r = modo === '--seco' ? await executar(false)
    : await require('../tools/admin-local/marketing/catalogo.cjs').serializar(REPO, () => executar(true));
  if (r) console.log(`OK: ${r.total} arquivos conferidos por SHA-256. Recibo: ${r.recibo}`);
})().catch(e => { console.error(`PAROU: ${e.message}`); process.exitCode=1; });
