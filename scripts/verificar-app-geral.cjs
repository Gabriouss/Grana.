#!/usr/bin/env node
'use strict';
// Núcleo da 8A. Chamadas automáticas só serão ligadas depois da revisão independente.
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const CATALOGO = path.join(__dirname, 'marcadores-app-de-teste.json');
const SUPORTE = new Set(['scripts/marcadores-app-de-teste.json', 'scripts/verificar-app-geral.cjs', '__tests__/app-geral.cjs']);
const IGNORADOS = new Set(['.git', 'node_modules', '.agents', '.claude', '.codex', '.maestri', '.expo', 'Feedbacks', 'Screenshots']);
const CODIGO = /\.(?:[cm]?jsx?|[cm]?tsx?|json|xml|kt|kts|java|gradle|properties|plist|html|css|scss|ya?ml|toml|sh|bash|ps1|sql|py|swift|[cmh]|cpp|hpp|rs|go|dart|rb)$/i;
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const ZERO = /^0+$/;
const BINARY = /\.(?:png|jpe?g|gif|webp|ico|ttf|otf|woff2?|mp4|mp3|wav|pdf|zip|apk|aab|hbc)$/i;
const textoAplicavel = nome => !BINARY.test(nome) && !/\.md$/i.test(nome);

function caminhoSeguro(p) {
  return typeof p === 'string' && p.length > 0 && !/[\\\0\r\n]/.test(p) &&
    !p.startsWith('/') && !p.includes(':') && p.split('/').every(x => x && x !== '.' && x !== '..');
}
function carregarCatalogo(arquivo = CATALOGO) {
  const c = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  if (c?.versao !== 1 || !c.fonte || !SHA.test(c.fonte.main) || !SHA.test(c.fonte.clone)) throw Error('Catálogo inválido: versão ou fonte');
  for (const chave of ['caminhos', 'prefixos', 'identificadores', 'fragmentos', 'seletores']) {
    if (!Array.isArray(c[chave]) || !c[chave].length) throw Error('Catálogo inválido: lista obrigatória');
  }
  for (const p of c.caminhos) if (!caminhoSeguro(p)) throw Error('Catálogo inválido: caminho');
  for (const p of c.prefixos) if (!p.endsWith('/') || !caminhoSeguro(p.slice(0, -1))) throw Error('Catálogo inválido: prefixo');
  for (const id of c.identificadores) if (typeof id !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(id)) throw Error('Catálogo inválido: identificador');
  for (const t of c.fragmentos) if (typeof t !== 'string' || !t || /[\0\r\n]/.test(t)) throw Error('Catálogo inválido: fragmento');
  for (const s of c.seletores) {
    if (!caminhoSeguro(s.arquivo) || !Array.isArray(s.caminho) || !s.caminho.length ||
      !s.caminho.every(p => typeof p === 'string' && p.length && !/[\0\r\n]/.test(p))) throw Error('Catálogo inválido: seletor');
  }
  return c;
}
function ignorado(nome) { return IGNORADOS.has(nome.split('/')[0]); }
function temSeletor(objeto, partes) {
  if (!partes.length) return true;
  if (!objeto || typeof objeto !== 'object') return false;
  const [p, ...resto] = partes;
  return p === '*' ? Object.values(objeto).some(v => temSeletor(v, resto)) :
    Object.hasOwn(objeto, p) && temSeletor(objeto[p], resto);
}
function textoDoArquivo(buf, nome) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) return Buffer.from(buf.subarray(2)).swap16().toString('utf16le');
  if (buf.includes(0)) {
    if (CODIGO.test(nome)) throw Error('Código com codificação ilegível: ' + nome);
    return null; // binário sem extensão conhecida; paths continuam verificados.
  }
  return buf.toString('utf8');
}
function verificarArquivo(nome, buf, c) {
  if (!caminhoSeguro(nome)) throw Error('Caminho fora da raiz');
  const achados = [];
  const add = regra => achados.push({ arquivo: nome, regra });
  if (c.caminhos.includes(nome) || c.prefixos.some(p => nome.startsWith(p))) add('caminho-exclusivo');
  // Exceção apenas de TEXTO nos três arquivos da própria guarda; nunca de caminho.
  if (SUPORTE.has(nome) || ignorado(nome) || !textoAplicavel(nome)) return achados;
  const texto = textoDoArquivo(buf, nome);
  if (texto === null) return achados;
  for (const s of c.seletores.filter(s => s.arquivo === nome)) {
    if (temSeletor(JSON.parse(texto), s.caminho)) add('config-exclusiva');
  }
  for (const id of c.identificadores) {
    const literal = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp('(^|[^A-Za-z0-9_$])' + literal + '(?![A-Za-z0-9_$])').test(texto)) add('identificador-exclusivo');
  }
  if (c.fragmentos.some(t => texto.includes(t))) add('fragmento-exclusivo');
  return achados;
}
function varrerArvore(raiz, c = carregarCatalogo(), usarGit = true) {
  const achados = [];
  raiz = path.resolve(raiz);
  // No checkout, examina o que é versionável, incluindo WIP novo. O pacote
  // EAS é sempre percorrido por inteiro, mesmo se ainda contiver .git.
  if (usarGit && fs.existsSync(path.join(raiz, '.git'))) {
    const nomes = git(raiz, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
    for (const nome of new Set(nomes)) {
      if (!caminhoSeguro(nome)) throw Error('Caminho fora da raiz');
      if (ignorado(nome)) continue;
      let atual = raiz;
      for (const parte of nome.split('/')) {
        atual = path.join(atual, parte);
        if (fs.lstatSync(atual).isSymbolicLink()) throw Error('Link não inspecionado: ' + nome);
      }
      const relevante = textoAplicavel(nome) || c.caminhos.includes(nome) || c.prefixos.some(p => nome.startsWith(p));
      if (relevante) achados.push(...verificarArquivo(nome, fs.readFileSync(atual), c));
    }
    return achados;
  }
  function andar(dir, prefixo = '') {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const nome = prefixo + item.name;
      if (usarGit ? ignorado(nome) : ['.git', 'node_modules'].includes(nome.split('/')[0])) continue;
      if (!usarGit && ['Feedbacks', 'Screenshots'].includes(nome.split('/')[0])) throw Error('Material local dentro do pacote EAS');
      const absoluto = path.join(dir, item.name);
      if (item.isSymbolicLink()) throw Error('Link não inspecionado: ' + nome);
      if (item.isDirectory()) andar(absoluto, nome + '/');
      else if (item.isFile()) {
        // Caminhos binários também são proibidos; só a leitura textual é seletiva.
        const relevante = textoAplicavel(nome) || c.caminhos.includes(nome) || c.prefixos.some(p => nome.startsWith(p));
        if (relevante) achados.push(...verificarArquivo(nome, fs.readFileSync(absoluto), c));
      } else throw Error('Arquivo não inspecionado: ' + nome);
    }
  }
  andar(raiz);
  return achados;
}
function git(raiz, args, buffer = false, input) {
  return execFileSync('git', ['--no-optional-locks', ...args], { cwd: raiz, encoding: buffer ? undefined : 'utf8',
    input, windowsHide: true, maxBuffer: 128 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
}
function validarSha(sha) { if (!SHA.test(sha)) throw Error('Hash de commit inválido'); }
const chaveEntrada = e => [e.modo, e.tipo, e.oid, e.nome].join('\0');
function arquivosCommit(raiz, sha, inspecionados = new Set()) {
  validarSha(sha);
  const entradas = git(raiz, ['ls-tree', '-r', '-z', '--full-tree', sha]).split('\0').filter(Boolean).map(l => {
    const m = /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/.exec(l);
    if (!m || !caminhoSeguro(m[4])) throw Error('Árvore Git inválida');
    return { modo: m[1], tipo: m[2], oid: m[3], nome: m[4] };
  });
  const blobs = entradas.filter(e => e.tipo === 'blob' && !BINARY.test(e.nome) && !inspecionados.has(chaveEntrada(e)));
  // Uma chamada batch evita milhares de processos git em cada corte do histórico.
  const dados = blobs.length ? git(raiz, ['cat-file', '--batch'], true, blobs.map(e => e.oid).join('\n') + '\n') : Buffer.alloc(0);
  let pos = 0;
  for (const b of blobs) {
    const fim = dados.indexOf(10, pos);
    const m = /^([a-f0-9]+) blob (\d+)$/.exec(dados.subarray(pos, fim).toString('utf8'));
    if (!m || m[1] !== b.oid) throw Error('Blob Git ilegível');
    const tamanho = Number(m[2]), inicio = fim + 1;
    if (inicio + tamanho >= dados.length || dados[inicio + tamanho] !== 10) throw Error('Blob Git truncado');
    b.buf = dados.subarray(inicio, inicio + tamanho); pos = inicio + tamanho + 1;
  }
  return entradas.map(e => ({ ...e, buf: e.buf || Buffer.alloc(0) }));
}
function varrerCommit(raiz, sha, c = carregarCatalogo()) {
  return arquivosCommit(raiz, sha).flatMap(e => {
    if (ignorado(e.nome)) return [];
    if (e.tipo !== 'blob' || e.modo === '120000') throw Error('Entrada Git não inspecionada: ' + e.nome);
    return verificarArquivo(e.nome, e.buf, c);
  });
}
function varrerIntervalo(raiz, base, fim, c = carregarCatalogo()) {
  validarSha(fim);
  if (!ZERO.test(base)) {
    validarSha(base);
    git(raiz, ['merge-base', '--is-ancestor', base, fim]);
  } else if (!SHA.test(base)) throw Error('Hash remoto inválido');
  const commits = git(raiz, ['rev-list', '--reverse', ZERO.test(base) ? fim : base + '..' + fim]).trim().split('\n').filter(Boolean);
  const { varrerTexto, lerEnv } = require('./varrer-segredos.cjs');
  const valores = lerEnv(path.join(raiz, '.env'));
  const achados = [];
  const inspecionados = new Set();
  // Mesmo intervalo vazio precisa validar a árvore efetivamente enviada.
  const cortes = new Set([...commits, fim]);
  for (const sha of cortes) {
    const mensagem = git(raiz, ['show', '-s', '--format=%B', sha]);
    if (commits.includes(sha)) {
      const pais = git(raiz, ['show', '-s', '--format=%P', sha]).trim().split(' ').filter(Boolean);
      if (pais.length > 1) achados.push({ arquivo: sha, regra: 'merge-no-main' });
      if (/\(cherry picked from commit\b/i.test(mensagem)) achados.push({ arquivo: sha, regra: 'cherry-pick-no-main' });
    }
    achados.push(...varrerTexto(mensagem, 'mensagem:' + sha, valores).filter(a => !a.aviso).map(a => ({ arquivo: a.arquivo, regra: 'segredo:' + a.regra })));
    for (const e of arquivosCommit(raiz, sha, inspecionados)) {
      const chave = chaveEntrada(e);
      if (inspecionados.has(chave)) continue;
      inspecionados.add(chave);
      if (!ignorado(e.nome)) {
        if (e.tipo !== 'blob' || e.modo === '120000') throw Error('Entrada Git não inspecionada: ' + e.nome);
        achados.push(...verificarArquivo(e.nome, e.buf, c));
      }
      if (!BINARY.test(e.nome) && !e.buf.includes(0)) {
        achados.push(...varrerTexto(e.buf.toString('utf8'), e.nome, valores).filter(a => !a.aviso)
          .map(a => ({ arquivo: a.arquivo, regra: 'segredo:' + a.regra })));
      }
    }
  }
  return achados;
}
function ehMainNoCi(raiz, env = process.env) {
  if (env.GITHUB_ACTIONS === 'true') {
    try {
      const padrao = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')).repository.default_branch;
      if (typeof padrao !== 'string' || !padrao) return true;
      if (env.GITHUB_BASE_REF) return env.GITHUB_BASE_REF === padrao;
      if (!env.GITHUB_REF?.startsWith('refs/heads/')) return true;
      return env.GITHUB_REF === 'refs/heads/' + padrao;
    } catch { return true; } // metadado ausente nunca transforma main contaminado em clone.
  }
  try {
    const padrao = git(raiz, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).trim();
    const atual = git(raiz, ['symbolic-ref', '--quiet', '--short', 'HEAD']).trim();
    return !padrao.startsWith('origin/') || atual === padrao.slice('origin/'.length);
  } catch { return true; }
}
function principal(args, env = process.env, cwd = path.resolve(__dirname, '..'), entrada) {
  try {
    const c = carregarCatalogo();
    const i = args.indexOf('--raiz');
    if (i >= 0 && (!args[i + 1] || args[i + 1].startsWith('--'))) throw Error('Raiz ausente');
    const raiz = path.resolve(i >= 0 ? args[i + 1] : cwd);
    const parametros = i >= 0 ? args.filter((_, j) => j !== i && j !== i + 1) : args;
    const modo = parametros[0] || '--arvore';
    let achados;
    if (['--arvore', '--eas', '--ci'].includes(modo)) {
      if (parametros.length > 1) throw Error('Argumentos inesperados');
      if (modo === '--eas') {
        if (!['preview', 'production', 'development', 'play'].includes(env.EAS_BUILD_PROFILE)) throw Error('EAS_BUILD_PROFILE ausente ou desconhecido');
        if (['development', 'play'].includes(env.EAS_BUILD_PROFILE)) { console.log('[app-geral] perfil de teste explícito; filtro geral dispensado'); return 0; }
      }
      if (modo === '--ci' && !ehMainNoCi(raiz, env)) { console.log('[app-geral] ref fora da branch padrão; filtro geral dispensado'); return 0; }
      achados = varrerArvore(raiz, c, modo !== '--eas');
    } else if (modo === '--intervalo') {
      if (parametros.length !== 3) throw Error('Uso: --intervalo <base> <fim> [--raiz pasta]');
      achados = varrerIntervalo(raiz, parametros[1], parametros[2], c);
    } else if (modo === '--pre-push') {
      if (parametros.length !== 2 || !/^[A-Za-z0-9_.-]+$/.test(parametros[1])) throw Error('Remoto inválido');
      const remoto = parametros[1];
      // Ausência de default remoto reprova, em vez de ignorar o destino protegido.
      const padrao = git(raiz, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/' + remoto + '/HEAD']).trim();
      if (!padrao.startsWith(remoto + '/')) throw Error('Branch padrão do remoto indisponível');
      const linhas = (entrada ?? fs.readFileSync(0, 'utf8')).trim().split('\n').filter(Boolean);
      if (!linhas.length) throw Error('Pre-push sem refs');
      achados = [];
      for (const linha of linhas) {
        const campos = linha.trim().split(/\s+/);
        if (campos.length !== 4) throw Error('Ref pre-push inválida');
        const [, localSha, remotoRef, remotoSha] = campos;
        if (remotoRef !== 'refs/heads/' + padrao.slice(remoto.length + 1)) continue;
        if (ZERO.test(localSha)) throw Error('Exclusão da branch padrão bloqueada');
        achados.push(...varrerIntervalo(raiz, remotoSha, localSha, c));
      }
    } else throw Error('Modo desconhecido');
    for (const a of achados) console.error('[app-geral] ' + JSON.stringify(a));
    console.log('[app-geral] ' + (achados.length ? 'BLOQUEADO' : 'OK') + ': ' + achados.length + ' achados; nenhum conteúdo de arquivo impresso');
    return achados.length ? 1 : 0;
  } catch (e) {
    // Não ecoar stderr do git/JSON: ele pode conter dados de arquivos inspecionados.
    console.error('[app-geral] ERRO de configuração ou leitura; inspeção não concluída (' + (e?.code || 'invalido') + ')');
    return 2;
  }
}
module.exports = { carregarCatalogo, verificarArquivo, varrerArvore, varrerCommit, varrerIntervalo, ehMainNoCi, principal };
if (require.main === module) process.exitCode = principal(process.argv.slice(2));
