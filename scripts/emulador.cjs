#!/usr/bin/env node
/*
 * Ferramenta única para operar o Grana. no emulador Android (Expo Go ou APK de
 * desenvolvimento), pensada para agentes, Codex inclusive. Guia completo em
 * docs/operar-o-app-no-emulador.md.
 *
 *   node scripts/emulador.cjs estado            emulador, app em primeiro plano, Metro
 *   node scripts/emulador.cjs abrir go|dev      abre o Expo Go ou o APK de desenvolvimento
 *   node scripts/emulador.cjs login             entra com a conta de teste (E2E_TEST_*)
 *   node scripts/emulador.cjs listar            textos e posições da tela atual
 *   node scripts/emulador.cjs tem "texto"       SIM ou NAO
 *   node scripts/emulador.cjs tocar "texto" [n] toca no n-ésimo elemento com esse texto
 *   node scripts/emulador.cjs digitar "texto"   digita no campo em foco
 *   node scripts/emulador.cjs voltar            tecla voltar do Android
 *   node scripts/emulador.cjs print nome        salva um print em E:\Grana-temporarios\prints
 *
 * POR QUE O `login` EXISTE: a conta de teste mora no `.env` (E2E_TEST_EMAIL e
 * E2E_TEST_PASSWORD), e agente nenhum deve ler o `.env`. Um agente sem acesso
 * ao valor monta o texto com a variável vazia e digita "undefined" no campo
 * (aconteceu em 19/09/2026: o e-mail ficou "dundefined"). Este script lê o
 * arquivo DENTRO do processo, manda o valor direto para o `adb` e não imprime
 * nada dele. Nunca faça `console.log` de credencial aqui (regra 15).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RAIZ = path.resolve(__dirname, '..');
const PASTA_PRINTS = process.env.GRANA_PRINTS || 'E:/Grana-temporarios/prints';

function achaAdb() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'AppData/Local/Android/Sdk');
  const candidato = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  return fs.existsSync(candidato) ? candidato : 'adb';
}
const ADB = achaAdb();
const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'pipe'] });
const adbQuieto = (...args) => execFileSync(ADB, args, { stdio: 'ignore' });

function lerEnv() {
  const arquivo = path.join(RAIZ, '.env');
  if (!fs.existsSync(arquivo)) return {};
  const env = {};
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return env;
}

/* `input text` passa pelo shell do aparelho: espaço vira %s e qualquer símbolo
   precisa de barra. Sem isto, senha com caractere especial chega errada. */
function digitar(texto) {
  const escapado = texto.replace(/ /g, '%s').replace(/([^A-Za-z0-9%])/g, '\\$1');
  adbQuieto('shell', 'input', 'text', escapado);
}

/* O uiautomator grava cada atributo entre aspas DUPLAS, menos quando o valor
   contém aspas duplas: aí ele troca para aspas SIMPLES (text='… "desfaz".').
   Até 26/09/2026 este leitor só entendia a primeira forma, e toda resposta do
   Granabô com aspas sumia do `listar` e do `tem`. O Sentinel concluiu, por
   isso, que o Granabô ficava mudo em pedidos de registro ("Lançamento
   registrado: … é só dizer "desfaz"."), quando a bolha estava na tela. */
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodificar = (v) =>
  v.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) =>
    e[0] !== '#' ? ENTIDADES[e.toLowerCase()]
      : String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))));

function lerNos(xml) {
  const nos = [];
  for (const m of xml.matchAll(/<node ((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g)) {
    const a = m[1];
    const pega = (nome) => {
      const r = new RegExp(`(?:^|\\s)${nome}=(?:"([^"]*)"|'([^']*)')`).exec(a);
      return r ? decodificar(r[1] ?? r[2]) : '';
    };
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(pega('bounds'));
    if (!b) continue;
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    nos.push({
      texto: pega('text') || pega('content-desc'),
      classe: pega('class'),
      x: Math.round((x1 + x2) / 2),
      y: Math.round((y1 + y2) / 2),
    });
  }
  return nos;
}

function dump() {
  adbQuieto('shell', 'uiautomator', 'dump', '/sdcard/grana-ui.xml');
  return lerNos(adb('exec-out', 'cat', '/sdcard/grana-ui.xml'));
}

const achar = (nos, texto) => nos.filter((n) => n.texto && n.texto.toLowerCase().includes(texto.toLowerCase()));
const tocarEm = (n) => adbQuieto('shell', 'input', 'tap', String(n.x), String(n.y));
const espera = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function estado() {
  const dispositivos = adb('devices').split('\n').slice(1).filter((l) => /\tdevice/.test(l));
  console.log(dispositivos.length ? `emulador: ${dispositivos.map((l) => l.split('\t')[0]).join(', ')}` : 'emulador: NENHUM (abra o Pixel_8 no Android Studio)');
  if (!dispositivos.length) return;
  const pacotes = adb('shell', 'pm', 'list', 'packages');
  console.log(`Expo Go instalado: ${/host\.exp\.exponent/.test(pacotes) ? 'sim' : 'nao'}`);
  console.log(`APK de desenvolvimento (com.gabriouss.grana) instalado: ${/com\.gabriouss\.grana/.test(pacotes) ? 'sim' : 'nao'}`);
  const foco = /mCurrentFocus=.*? ([\w.]+)\//.exec(adb('shell', 'dumpsys', 'window')) ;
  console.log(`app em primeiro plano: ${foco ? foco[1] : 'desconhecido'}`);
  const reverso = adb('reverse', '--list');
  console.log(`adb reverse 8081: ${/tcp:8081/.test(reverso) ? 'ok' : 'FALTA (rode: node scripts/emulador.cjs abrir go)'}`);
  try {
    const r = execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl', ['-s', '-m', '3', 'http://localhost:8081/status'], { encoding: 'utf8' });
    console.log(`Metro: ${/running/.test(r) ? 'rodando' : 'NAO respondeu (rode em outro terminal: npx expo start -c)'}`);
  } catch {
    console.log('Metro: NAO respondeu (rode em outro terminal: npx expo start -c)');
  }
}

function abrir(alvo) {
  adbQuieto('reverse', 'tcp:8081', 'tcp:8081');
  if (alvo === 'go') {
    adbQuieto('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'exp://localhost:8081', 'host.exp.exponent');
  } else if (alvo === 'dev') {
    adbQuieto('shell', 'monkey', '-p', 'com.gabriouss.grana', '-c', 'android.intent.category.LAUNCHER', '1');
  } else {
    throw new Error('use: abrir go | abrir dev');
  }
  console.log(`aberto (${alvo}). O primeiro bundle leva de 20 a 60 s; use "tem" para esperar uma tela.`);
}

function login() {
  const env = lerEnv();
  if (!env.E2E_TEST_EMAIL || !env.E2E_TEST_PASSWORD) {
    throw new Error('E2E_TEST_EMAIL ou E2E_TEST_PASSWORD ausente no .env desta maquina. Peca ao autor; nao invente valor.');
  }
  let nos = dump();
  if (!achar(nos, 'Entrar').length) {
    console.log('A tela de login nao esta aberta (ja logado, ou o app ainda carrega). Nada feito.');
    return;
  }
  const campos = nos.filter((n) => /EditText/.test(n.classe)).sort((a, b) => a.y - b.y);
  if (campos.length < 2) throw new Error('nao achei os dois campos de texto do login; rode "listar"');
  const limpaEDigita = (campo, valor) => {
    tocarEm(campo);
    espera(300);
    adbQuieto('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END');
    for (let i = 0; i < 6; i++) adbQuieto('shell', 'input', 'keyevent', ...Array(10).fill('KEYCODE_DEL'));
    digitar(valor);
    espera(300);
  };
  limpaEDigita(campos[0], env.E2E_TEST_EMAIL);
  limpaEDigita(campos[1], env.E2E_TEST_PASSWORD);
  /* O teclado cobre o botão. Voltar fecha só o teclado quando ele está aberto. */
  if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) adbQuieto('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  espera(500);
  nos = dump();
  const entrar = achar(nos, 'Entrar').filter((n) => !/EditText/.test(n.classe)).pop();
  if (!entrar) throw new Error('nao achei o botao Entrar depois de digitar');
  tocarEm(entrar);
  console.log('login enviado (valores nao sao impressos). Confira com: node scripts/emulador.cjs tem "Início"');
}

function main() {
  const [cmd, arg, extra] = process.argv.slice(2);
  switch (cmd) {
    case 'estado': return estado();
    case 'abrir': return abrir(arg);
    case 'login': return login();
    case 'listar': return dump().filter((n) => n.texto).forEach((n) => console.log(`${n.texto.replace(/\n/g, ' ')} @ ${n.x},${n.y}`));
    case 'tem': return console.log(achar(dump(), arg || '').length ? 'SIM' : 'NAO');
    case 'tocar': {
      const n = achar(dump(), arg || '')[Number(extra || 0)];
      if (!n) { console.log(`NAO ACHEI "${arg}"`); process.exit(1); }
      tocarEm(n);
      return console.log(`toquei em "${n.texto}"`);
    }
    case 'digitar': return digitar(arg || '');
    case 'voltar': return adbQuieto('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    case 'print': {
      fs.mkdirSync(PASTA_PRINTS, { recursive: true });
      const destino = path.join(PASTA_PRINTS, `${arg || 'print'}.png`);
      const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 1e8 });
      /* Com o bloqueio de captura ligado (FLAG_SECURE, padrão do app logado),
         o Android devolve zero byte. Salvar o arquivo vazio e imprimir o
         caminho parecia sucesso; agora a falha é dita. */
      if (!png.length) {
        console.log('PRINT VAZIO: o app bloqueia captura (FLAG_SECURE). Use "listar", ou desligue o bloqueio de captura no Perfil da conta de teste.');
        process.exit(1);
      }
      fs.writeFileSync(destino, png);
      return console.log(destino);
    }
    default:
      console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
  }
}

module.exports = { lerNos };

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(`ERRO: ${e.message}`);
    process.exit(1);
  }
}
