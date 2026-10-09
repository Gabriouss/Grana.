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
 * ── O que se exige, desde 08/10/2026 (R1 do Lynx) ──────────────────────────
 *
 * Pacote e versão lidos dos ATRIBUTOS do manifesto, assinatura v2/v3 conferida
 * de verdade, e certificado igual ao fixado em `CERTIFICADOS_GRANA`. Antes
 * bastava o texto do pacote aparecer no manifesto e existir a marca de um bloco
 * de assinatura: qualquer APK montado para isso passava. Testes em
 * `__tests__/verificar-apk.cjs`.
 *
 * Uso:
 *   node scripts/verificar-apk.mjs <arquivo.apk> <versao-esperada>
 *   node scripts/verificar-apk.mjs --autoteste
 *
 * Sai com código 0 e imprime `chave=valor` (formato de output do GitHub
 * Actions) quando tudo confere; sai 1 e explica o quê, quando não.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, createPublicKey, verify as verificarAssinaturaCripto, X509Certificate, constants as cripto } from 'node:crypto';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const ASSINATURA_EOCD = 0x06054b50;
const ASSINATURA_CENTRAL = 0x02014b50;

/** Pacote do Grana. Conferido como atributo `package` do manifesto, não como texto solto. */
export const PACOTE_GRANA = 'com.gabriouss.grana';

/**
 * SHA-256 do certificado que assina o Grana. (a chave que o EAS guarda).
 *
 * É dado público: qualquer um lê do APK publicado. Tirado da release v1.10.6 em
 * 08/10/2026 com `apksigner verify --print-certs` e igual ao que este script
 * calcula. Fixar aqui é o que impede o workflow de publicar, no endereço
 * permanente de download, um APK com o pacote e a versão certos mas assinado por
 * outra chave (achado R1 do Lynx). Se a chave do EAS for trocada de propósito,
 * acrescente o novo valor aqui num commit próprio; o Android também recusaria a
 * atualização por cima do app instalado, então a troca nunca é silenciosa.
 */
export const CERTIFICADOS_GRANA = Object.freeze([
  'c902cf9ec1e9a9ccfcd05189136f3de35bfa4c78c3f5ad524d4029622a17ef61',
]);

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

const ID_V2 = 0x7109871a;
const ID_V3 = 0xf05368c0;
const ID_V31 = 0x1b93ad61;
/* id -> [hash do Node, padding, tamanho do sal]. Os que o esquema v2/v3 define para
   APK comum; os de fs-verity (0x04xx) não entram no cálculo de conteúdo abaixo. */
const ALGORITMOS = new Map([
  [0x0101, ['sha256', 'pss', 32]], [0x0102, ['sha512', 'pss', 64]],
  [0x0103, ['sha256', 'pkcs1', 0]], [0x0104, ['sha512', 'pkcs1', 0]],
  [0x0201, ['sha256', 'ec', 0]], [0x0202, ['sha512', 'ec', 0]],
  [0x0301, ['sha256', 'dsa', 0]],
]);

/** Leitor de campos "tamanho (uint32) + bytes", o tijolo do bloco de assinatura. */
function leitor(buf) {
  let p = 0;
  return {
    fim: () => p >= buf.length,
    u32: () => { if (p + 4 > buf.length) throw new Error('truncado'); const v = buf.readUInt32LE(p); p += 4; return v; },
    campo() { const n = this.u32(); if (p + n > buf.length) throw new Error('truncado'); const v = buf.subarray(p, p + n); p += n; return v; },
    lista() { const r = leitor(this.campo()); const itens = []; while (!r.fim()) itens.push(r.campo()); return itens; },
  };
}

/**
 * Resumo do conteúdo como o Android calcula (APK Signature Scheme v2, "content
 * digest"): o arquivo sem o bloco de assinatura, em três seções (entradas do zip,
 * diretório central, rodapé com o offset do diretório apontando para onde o bloco
 * começa), cada uma em pedaços de 1 MB.
 */
function resumoDoConteudo(buf, hash, inicioBloco, inicioCentral, eocd) {
  const rodape = Buffer.from(buf.subarray(eocd));
  rodape.writeUInt32LE(inicioBloco, 16);
  const secoes = [buf.subarray(0, inicioBloco), buf.subarray(inicioCentral, eocd), rodape];
  const MB = 1024 * 1024;
  const resumos = [];
  for (const s of secoes) {
    for (let i = 0; i < s.length; i += MB) {
      const pedaco = s.subarray(i, Math.min(i + MB, s.length));
      const cab = Buffer.alloc(5); cab[0] = 0xa5; cab.writeUInt32LE(pedaco.length, 1);
      resumos.push(createHash(hash).update(cab).update(pedaco).digest());
    }
  }
  const cab = Buffer.alloc(5); cab[0] = 0x5a; cab.writeUInt32LE(resumos.length, 1);
  return createHash(hash).update(cab).update(Buffer.concat(resumos)).digest();
}

/**
 * Verifica DE VERDADE a assinatura v2/v3 e devolve o SHA-256 do certificado de
 * cada assinante.
 *
 * Só ler o certificado do bloco não prova nada: basta colar o certificado certo
 * num bloco falso. Aqui, para cada assinante: (1) a assinatura confere com a
 * chave pública sobre os dados assinados; (2) a chave pública é a do certificado;
 * (3) o resumo assinado é o do conteúdo deste arquivo. Qualquer falha devolve
 * `{ erro }` e nenhum certificado.
 */
export function conferirAssinatura(buf) {
  try {
    const eocd = acharEocd(buf);
    if (eocd < 0) return { erro: 'sem rodapé de zip' };
    const inicioCentral = buf.readUInt32LE(eocd + 16);
    /* O bloco fica imediatamente antes do diretório central; a marca em outro
       lugar do arquivo não é o bloco que o Android lê. */
    if (inicioCentral < 32 || buf.toString('latin1', inicioCentral - 16, inicioCentral) !== 'APK Sig Block 42') return { erro: 'sem bloco de assinatura v2/v3' };
    const tamanho = Number(buf.readBigUInt64LE(inicioCentral - 24));
    const inicioBloco = inicioCentral - tamanho - 8;
    if (inicioBloco < 0 || Number(buf.readBigUInt64LE(inicioBloco)) !== tamanho) return { erro: 'bloco de assinatura inconsistente' };

    const pares = new Map();
    for (let p = inicioBloco + 8; p < inicioCentral - 24;) {
      const tam = Number(buf.readBigUInt64LE(p));
      if (tam < 4 || p + 8 + tam > inicioCentral - 24) return { erro: 'bloco de assinatura inconsistente' };
      const id = buf.readUInt32LE(p + 8);
      /* O bloco de assinatura fica FORA do resumo de conteúdo, então dá para
         acrescentar pares a um APK genuíno sem quebrar a assinatura dele. Com o
         id repetido, este script leria um par e o Android outro (D1 do Lynx). */
      if (pares.has(id)) return { erro: 'bloco de assinatura com id repetido' };
      pares.set(id, buf.subarray(p + 12, p + 8 + tam));
      p += 8 + tam;
    }
    /* O Android 13+ consulta o v3.1 antes dos outros, e aqui ele não é conferido:
       um par v3.1 de terceiro passaria pela assinatura v2 do Grana. (D2). As
       releases do Grana. são só v2; se um dia vierem com v3.1, implementar antes. */
    if (pares.has(ID_V31)) return { erro: 'esquema v3.1 presente, não conferido por este script' };
    /* Cada versão do Android lê um esquema (v3 no 9+, v2 no 7 e 8): todos os
       presentes são conferidos, e os certificados de todos entram na resposta. */
    const esquemas = [ID_V2, ID_V3].filter((id) => pares.has(id));
    if (esquemas.length === 0) return { erro: 'sem assinatura v2/v3' };

    /* Par presente e sem assinante nenhum não prova nada. */
    if (esquemas.some((id) => leitor(pares.get(id)).lista().length === 0)) return { erro: 'nenhum assinante' };

    const certificados = [];
    for (const esquema of esquemas) for (const bruto of leitor(pares.get(esquema)).lista()) {
      const v3 = esquema === ID_V3;
      const s = leitor(bruto);
      const dadosAssinados = s.campo();
      if (v3) { s.u32(); s.u32(); }
      const assinaturas = s.lista().map((a) => { const r = leitor(a); return { id: r.u32(), valor: r.campo() }; });
      const chavePublica = s.campo();

      const d = leitor(dadosAssinados);
      const resumos = d.lista().map((x) => { const r = leitor(x); return { id: r.u32(), valor: r.campo() }; });
      const certs = d.lista();
      if (certs.length === 0) return { erro: 'assinante sem certificado' };

      /* Como o Android: a mais forte entre as suportadas (SHA-512 antes de SHA-256). */
      const escolhida = assinaturas.filter((a) => ALGORITMOS.has(a.id) && resumos.some((r) => r.id === a.id))
        .sort((a, b) => (ALGORITMOS.get(b.id)[0] === 'sha512') - (ALGORITMOS.get(a.id)[0] === 'sha512'))[0];
      if (!escolhida) return { erro: 'algoritmo de assinatura não suportado' };
      const [hash, tipo, sal] = ALGORITMOS.get(escolhida.id);
      const chave = createPublicKey({ key: chavePublica, format: 'der', type: 'spki' });
      const opcoes = tipo === 'pss' ? { key: chave, padding: cripto.RSA_PKCS1_PSS_PADDING, saltLength: sal }
        : tipo === 'pkcs1' ? { key: chave, padding: cripto.RSA_PKCS1_PADDING } : { key: chave };
      if (!verificarAssinaturaCripto(hash, dadosAssinados, opcoes, escolhida.valor)) return { erro: 'assinatura não confere com a chave' };

      const doCert = new X509Certificate(certs[0]).publicKey.export({ type: 'spki', format: 'der' });
      if (!doCert.equals(chavePublica)) return { erro: 'chave pública diferente da do certificado' };

      const esperado = resumos.find((r) => r.id === escolhida.id).valor;
      if (!resumoDoConteudo(buf, hash, inicioBloco, inicioCentral, eocd).equals(esperado)) return { erro: 'conteúdo alterado depois de assinado' };

      certificados.push(createHash('sha256').update(certs[0]).digest('hex'));
    }
    return { certificados: [...new Set(certificados)], esquema: esquemas.map((id) => (id === ID_V3 ? 'v3' : 'v2')).join('+') };
  } catch {
    return { erro: 'bloco de assinatura ilegível' };
  }
}

/**
 * Atributos `package` e `versionName` da tag <manifest>, lidos do XML binário.
 *
 * Procurar o texto no arquivo (como `manifestoDeclara` faz) aceitaria qualquer app
 * que apenas CITE o pacote do Grana. em outro lugar do manifesto. Aqui o valor é o
 * do atributo. `null` se o formato não for o esperado: recusa, nunca adivinha.
 */
export function atributosDoManifesto(axml) {
  try {
    if (axml.readUInt16LE(0) !== 0x0003) return null;
    let textos = null;
    for (let p = axml.readUInt16LE(2); p + 8 <= axml.length;) {
      const tipo = axml.readUInt16LE(p), cab = axml.readUInt16LE(p + 2), tam = axml.readUInt32LE(p + 4);
      if (tam < 8 || p + tam > axml.length) return null;
      if (tipo === 0x0001) {
        const total = axml.readUInt32LE(p + 8), utf8 = (axml.readUInt32LE(p + 16) & 0x100) !== 0, inicio = p + axml.readUInt32LE(p + 20);
        const indice = p + cab; // fixado aqui: `p` anda antes de `textos` ser chamada
        textos = (i) => {
          if (i >= total) return null;
          let q = inicio + axml.readUInt32LE(indice + i * 4);
          if (utf8) {
            if (axml[q] & 0x80) q += 2; else q += 1;
            let n = axml[q++]; if (n & 0x80) n = ((n & 0x7f) << 8) | axml[q++];
            return axml.toString('utf8', q, q + n);
          }
          let n = axml.readUInt16LE(q); q += 2;
          if (n & 0x8000) { n = ((n & 0x7fff) << 16) | axml.readUInt16LE(q); q += 2; }
          return axml.toString('utf16le', q, q + n * 2);
        };
      } else if (tipo === 0x0102 && textos) {
        const base = p + cab;
        if (textos(axml.readUInt32LE(base + 4)) !== 'manifest') return null; // a primeira tag tem de ser <manifest>
        const inicioAttr = base + axml.readUInt16LE(base + 8), tamAttr = axml.readUInt16LE(base + 10), n = axml.readUInt16LE(base + 12);
        const achados = {};
        for (let i = 0; i < n; i++) {
          const a = inicioAttr + i * tamAttr;
          const nome = textos(axml.readUInt32LE(a + 4));
          if (axml[a + 15] !== 0x03) continue; // só valor de texto
          if (nome === 'package' || nome === 'versionName') achados[nome] = textos(axml.readUInt32LE(a + 16));
        }
        return achados;
      }
      p += tam;
    }
    return null;
  } catch {
    return null;
  }
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

/**
 * Tudo o que se exige de um APK antes de publicar, sem tocar em disco nem sair do
 * processo: é o que o teste chama. `problemas` vazio quer dizer aceito.
 */
export function analisar(buf, versaoEsperada, certificadosAceitos = CERTIFICADOS_GRANA) {
  const problemas = [];

  const entradas = listarEntradas(buf);
  if (entradas.length === 0) problemas.push('não é um zip válido (sem diretório central)');
  if (!entradas.includes('AndroidManifest.xml')) problemas.push('sem AndroidManifest.xml');
  if (!entradas.some((n) => /^classes\d*\.dex$/.test(n))) problemas.push('sem classes.dex (não é um APK)');

  /* Assinatura conferida de verdade e certificado fixado: é isto que separa o
     APK do Grana. de um APK qualquer que declare o mesmo pacote e a mesma versão. */
  const assinatura = entradas.length === 0 ? { erro: 'sem assinatura v2/v3' } : conferirAssinatura(buf);
  if (assinatura.erro) {
    problemas.push(`assinatura recusada: ${assinatura.erro}`);
  } else {
    const estranhos = assinatura.certificados.filter((c) => !certificadosAceitos.includes(c));
    if (estranhos.length > 0) problemas.push(`assinado por certificado que não é o do Grana. (sha256 ${estranhos.join(', ')})`);
  }

  const manifesto = entradas.length === 0 ? null : lerEntrada(buf, 'AndroidManifest.xml');
  if (!manifesto) {
    problemas.push('não consegui ler o AndroidManifest.xml');
  } else {
    const atributos = atributosDoManifesto(manifesto);
    if (!atributos) {
      problemas.push('AndroidManifest.xml fora do formato esperado');
    } else {
      if (atributos.versionName !== versaoEsperada) problemas.push(`o manifesto não declara a versão ${versaoEsperada}`);
      if (atributos.package !== PACOTE_GRANA) problemas.push(`o pacote do manifesto não é ${PACOTE_GRANA}`);
    }
  }

  return { problemas, sha256: createHash('sha256').update(buf).digest('hex'), certificados: assinatura.certificados ?? [] };
}

function verificar(caminho, versaoEsperada) {
  const buf = readFileSync(caminho);
  const { problemas, sha256, certificados } = analisar(buf, versaoEsperada);
  if (problemas.length > 0) {
    console.error(`APK RECUSADO (${caminho}):`);
    for (const p of problemas) console.error('  - ' + p);
    process.exit(1);
  }

  const saida = [`sha256=${sha256}`, `tamanho=${buf.length}`, `versao=${versaoEsperada}`];
  console.log(saida.join('\n'));
  console.log(`certificado=${certificados.join(',')}`);
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

/* Só age quando chamado direto: o teste importa as funções sem disparar a CLI. */
const [, , arg1, arg2] = process.argv;
const chamadoDireto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (!chamadoDireto) { /* importado */ } else if (arg1 === '--autoteste') autoteste();
else if (!arg1 || !arg2) {
  console.error('uso: node scripts/verificar-apk.mjs <arquivo.apk> <versao-esperada>');
  console.error('     node scripts/verificar-apk.mjs --autoteste');
  process.exit(2);
} else verificar(arg1, arg2);
