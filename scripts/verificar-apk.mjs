#!/usr/bin/env node
/**
 * Abre um APK e confere que ele é o que se diz ser, antes de virar release
 * pública.
 *
 * ── Por que isto existe ────────────────────────────────────────────────────
 *
 * O `eas-build-webhook` publica versão e notas em `app_release` a partir do
 * PAYLOAD do EAS, sem nunca tocar no arquivo. Isso funciona enquanto o payload
 * e o artefato concordarem, e não há nada garantindo que concordem: um
 * download truncado, um artefato de outra build, um `--message` de uma versão
 * e um binário de outra passam iguais.
 *
 * O estrago de errar aqui é maior que o normal porque o destino é uma release
 * pública num endereço permanente (`/downloads/grana-latest.apk`): quem baixa
 * instala, e um APK errado publicado fica no ar até alguém perceber.
 *
 * ── Por que um leitor de zip escrito à mão ─────────────────────────────────
 *
 * O Node não traz leitor de zip, e o alvo é UM arquivo dentro do APK. Trazer
 * uma dependência para ler uma entrada, ou depender do `unzip` do sistema
 * (que não existe no Windows do autor), custa mais do que as ~40 linhas
 * abaixo. Zip é um formato de diretório no fim do arquivo; achar uma entrada
 * é ler o rodapé e caminhar.
 *
 * Uso:
 *   node scripts/verificar-apk.mjs <arquivo.apk> <versao-esperada>
 *   node scripts/verificar-apk.mjs --autoteste
 *
 * Sai com código 0 e imprime `chave=valor` (formato de output do GitHub
 * Actions) quando tudo confere; sai 1 e explica o quê, quando não.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateRawSync, deflateRawSync } from 'node:zlib';

const ASSINATURA_EOCD = 0x06054b50;
const ASSINATURA_CENTRAL = 0x02014b50;

/** Índice do "fim do diretório central" — o rodapé que diz onde tudo está. */
function acharEocd(buf) {
  /* O comentário do zip pode ter até 65535 bytes depois do rodapé, então a
     busca começa do fim e anda para trás no máximo esse tanto. */
  const minimo = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= minimo; i--) {
    if (buf.readUInt32LE(i) === ASSINATURA_EOCD) return i;
  }
  return -1;
}

/** Bytes de uma entrada do zip, já descomprimidos. `null` se não existir. */
export function lerEntrada(buf, alvo) {
  const eocd = acharEocd(buf);
  if (eocd < 0) return null;
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== ASSINATURA_CENTRAL) return null;
    const metodo = buf.readUInt16LE(p + 10);
    const tamComprimido = buf.readUInt32LE(p + 20);
    const tamNome = buf.readUInt16LE(p + 28);
    const tamExtra = buf.readUInt16LE(p + 30);
    const tamComentario = buf.readUInt16LE(p + 32);
    const offsetLocal = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + tamNome);

    if (nome === alvo) {
      /* O cabeçalho local repete nome e extra com tamanhos PRÓPRIOS, que
         podem diferir dos do diretório central — usar os de lá é o erro
         clássico que faz o leitor cair no meio dos dados. */
      const tamNomeLocal = buf.readUInt16LE(offsetLocal + 26);
      const tamExtraLocal = buf.readUInt16LE(offsetLocal + 28);
      const inicio = offsetLocal + 30 + tamNomeLocal + tamExtraLocal;
      const dados = buf.subarray(inicio, inicio + tamComprimido);
      return metodo === 0 ? dados : inflateRawSync(dados);
    }
    p += 46 + tamNome + tamExtra + tamComentario;
  }
  return null;
}

/** Nomes de todas as entradas — para conferir que o APK tem o que precisa. */
export function listarEntradas(buf) {
  const eocd = acharEocd(buf);
  if (eocd < 0) return [];
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const nomes = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== ASSINATURA_CENTRAL) break;
    const tamNome = buf.readUInt16LE(p + 28);
    nomes.push(buf.toString('utf8', p + 46, p + 46 + tamNome));
    p += 46 + tamNome + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return nomes;
}

/**
 * O APK está assinado no esquema v2 ou superior?
 *
 * A assinatura moderna NÃO é uma entrada do zip: vive num bloco próprio entre
 * o conteúdo e o diretório central, marcado pela string mágica. Procurar por
 * `META-INF/*.RSA` (o esquema v1, de 2008) devolve "não assinado" para todo
 * APK atual, que foi o primeiro palpite errado ao verificar a 1.8.4 à mão.
 */
export function assinadoV2(buf) {
  const i = buf.lastIndexOf('APK Sig Block 42');
  if (i < 0) return false;
  const tamanhoBloco = Number(buf.readBigUInt64LE(i - 8));
  let p = i + 16 - tamanhoBloco; // início dos pares id-valor
  const fim = i - 8;
  const ESQUEMAS = new Set([0x7109871a, 0xf05368c0, 0x1b93ad61]); // v2, v3, v3.1
  while (p > 0 && p < fim) {
    const tam = Number(buf.readBigUInt64LE(p));
    if (tam < 4 || p + 8 + tam > buf.length) break;
    if (ESQUEMAS.has(buf.readUInt32LE(p + 8))) return true;
    p += 8 + tam;
  }
  return false;
}

/**
 * `versionName` lido do AndroidManifest.xml binário.
 *
 * Sem decodificar o formato: as strings do manifesto ficam num pool em UTF-16
 * little-endian, então procurar o texto esperado nessa codificação responde
 * "esta versão está declarada aqui?" sem um parser de AXML inteiro. É o
 * bastante para a pergunta que importa (o binário é da versão que o EAS
 * anunciou?) e erra para o lado seguro: se não achar, recusa.
 */
export function manifestoDeclara(manifesto, texto) {
  return manifesto.includes(Buffer.from(texto, 'utf16le'));
}

function verificar(caminho, versaoEsperada) {
  const buf = readFileSync(caminho);
  const problemas = [];

  const entradas = listarEntradas(buf);
  if (entradas.length === 0) problemas.push('não é um zip válido (sem diretório central)');
  if (!entradas.includes('AndroidManifest.xml')) problemas.push('sem AndroidManifest.xml');
  if (!entradas.some((n) => /^classes\d*\.dex$/.test(n))) problemas.push('sem classes.dex (não é um APK)');
  if (!assinadoV2(buf)) problemas.push('sem assinatura v2/v3');

  const manifesto = lerEntrada(buf, 'AndroidManifest.xml');
  if (!manifesto) {
    problemas.push('não consegui ler o AndroidManifest.xml');
  } else {
    if (!manifestoDeclara(manifesto, versaoEsperada)) {
      problemas.push(`o manifesto não declara a versão ${versaoEsperada}`);
    }
    if (!manifestoDeclara(manifesto, 'com.gabriouss.grana')) {
      problemas.push('o manifesto não declara o pacote com.gabriouss.grana');
    }
  }

  const sha256 = createHash('sha256').update(buf).digest('hex');
  if (problemas.length > 0) {
    console.error(`APK RECUSADO (${caminho}):`);
    for (const p of problemas) console.error('  - ' + p);
    process.exit(1);
  }

  const saida = [`sha256=${sha256}`, `tamanho=${buf.length}`, `versao=${versaoEsperada}`];
  console.log(saida.join('\n'));
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, saida.join('\n') + '\n', { flag: 'a' });
}

/**
 * Autoteste: monta um zip mínimo em memória e confere que o leitor acha a
 * entrada, comprimida e não comprimida.
 *
 * Existe porque a alternativa seria versionar um APK de 129 MB como fixture,
 * e porque um leitor de zip escrito à mão é exatamente o tipo de código que
 * parece certo lendo e erra por um offset. Roda em `npm run test:ci`.
 */
function autoteste() {
  const assert = (cond, msg) => {
    if (!cond) {
      console.error('FALHOU: ' + msg);
      process.exitCode = 1;
    }
  };

  const montarZip = (nome, conteudo, comprimir) => {
    const nomeBuf = Buffer.from(nome, 'utf8');
    const dados = comprimir ? deflateRawSync(conteudo) : conteudo;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(comprimir ? 8 : 0, 8);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(conteudo.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    const offsetLocal = 0;
    const corpo = Buffer.concat([local, nomeBuf, dados]);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(ASSINATURA_CENTRAL, 0);
    central.writeUInt16LE(comprimir ? 8 : 0, 10);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(conteudo.length, 24);
    central.writeUInt16LE(nomeBuf.length, 28);
    central.writeUInt32LE(offsetLocal, 42);
    const dirCentral = Buffer.concat([central, nomeBuf]);

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(ASSINATURA_EOCD, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(dirCentral.length, 12);
    eocd.writeUInt32LE(corpo.length, 16);
    return Buffer.concat([corpo, dirCentral, eocd]);
  };

  const conteudo = Buffer.from('conteúdo de teste do manifesto', 'utf8');
  for (const comprimir of [false, true]) {
    const zip = montarZip('AndroidManifest.xml', conteudo, comprimir);
    assert(listarEntradas(zip).includes('AndroidManifest.xml'), `listar entradas (comprimido=${comprimir})`);
    const lido = lerEntrada(zip, 'AndroidManifest.xml');
    assert(lido !== null && lido.equals(conteudo), `ler entrada (comprimido=${comprimir})`);
    assert(lerEntrada(zip, 'nao-existe') === null, 'entrada ausente devolve null');
  }

  const utf16 = Buffer.from('1.8.4', 'utf16le');
  assert(manifestoDeclara(Buffer.concat([Buffer.from('lixo'), utf16]), '1.8.4'), 'acha versão em UTF-16');
  assert(!manifestoDeclara(Buffer.from('1.8.4', 'utf8'), '1.8.4'), 'não confunde UTF-8 com UTF-16');
  assert(!assinadoV2(Buffer.from('um arquivo qualquer sem bloco de assinatura')), 'sem bloco = não assinado');

  if (!process.exitCode) console.log('OK verificador de APK: leitor de zip, versão no manifesto e bloco de assinatura.');
}

const [, , arg1, arg2] = process.argv;
if (arg1 === '--autoteste') autoteste();
else if (!arg1 || !arg2) {
  console.error('uso: node scripts/verificar-apk.mjs <arquivo.apk> <versao-esperada>');
  console.error('     node scripts/verificar-apk.mjs --autoteste');
  process.exit(2);
} else verificar(arg1, arg2);
