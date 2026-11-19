// Mesma infraestrutura JVM/cache local de voz-widget-reconciliacao-nativa.cjs.
// Compila receiver, EstadoWidget e recibo REAIS; somente Android/servico sao dubles.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'modules/grana-voice-widget/android/src/main/java/com/gabriouss/grana/voicewidget');
const fixture = path.join(__dirname, 'native/receiver-falhas');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-receiver-falhas-'));
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
const cache = path.join(process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle'), 'caches/modules-2/files-2.1');
function jar(group, artifact) {
  function scan(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) { const found = scan(file); if (found) return found; }
      else if (e.name.endsWith('.jar')) return file;
    }
  }
  const file = scan(path.join(cache, group, artifact));
  if (!file) throw Error('JAR local ausente: ' + artifact);
  return file;
}
try {
  const service = fs.readFileSync(path.join(source, 'GranaVoiceCaptureService.kt'), 'utf8');
  const constants = Object.fromEntries(['ACAO_INICIAR', 'ACAO_ENCERRAR', 'CANAL'].map(name => {
    const match = service.match(new RegExp('const val ' + name + '\\s*=\\s*("[^"\\n]+")'));
    assert.ok(match, 'constante real ausente: ' + name);
    return [name, match[1]];
  }));
  const strings = fs.readFileSync(path.join(root, 'modules/grana-voice-widget/android/src/main/res/values/strings.xml'), 'utf8');
  const resources = Object.fromEntries([...strings.matchAll(/<string name="([^"]+)">([^<]*)<\/string>/g)].map(m => [m[1], m[2]]));
  assert.equal(resources.grana_voice_canal, 'Lançamento por voz');
  assert.equal(resources.grana_voice_interrompida_titulo, 'O microfone foi interrompido');
  assert.equal(resources.grana_voice_interrompida_texto, 'Nada foi lançado. Toque no microfone e repita a fala.');
  const files = fs.readdirSync(fixture).filter(name => name.endsWith('.kt')).map(name => {
    let text = fs.readFileSync(path.join(fixture, name), 'utf8');
    if (name === 'Boundaries.kt') {
      for (const [key, value] of Object.entries(constants)) text = text.replace(new RegExp('(const val ' + key + '=)"[^"]*"'), '$1' + value);
    }
    if (name === 'Notifications.kt') text = text.replace('channels.containsKey("voice")', 'channels.containsKey(' + constants.CANAL + ')');
    const file = path.join(base, name); fs.writeFileSync(file, text); return file;
  });
  const std = jar('org.jetbrains.kotlin', 'kotlin-stdlib');
  const compiler = [jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable'), std,
    jar('org.jetbrains.kotlin', 'kotlin-script-runtime'), jar('org.jetbrains.kotlin', 'kotlin-reflect'),
    jar('org.jetbrains.kotlin', 'kotlin-daemon-embeddable'), jar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm'),
    jar('org.jetbrains.intellij.deps', 'trove4j'), jar('org.jetbrains', 'annotations')];
  const output = path.join(base, 'classes');
  const sources = ['GranaVoiceWidgetProvider.kt', 'EstadoWidget.kt', 'VoiceCaptureReceipt.kt'].map(name => path.join(source, name));
  let r = cp.spawnSync(java, ['-Xmx192m', '-cp', compiler.join(path.delimiter), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
    '-no-stdlib', '-no-reflect', '-classpath', [std, compiler.at(-1)].join(path.delimiter), '-jvm-target', '17', '-d', output, ...sources, ...files],
    { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  if (r.error || r.status !== 0) throw r.error || Error('Compilacao Kotlin falhou: ' + r.status);
  r = cp.spawnSync(java, ['-Xmx128m', '-cp', [output, std].join(path.delimiter), 'com.gabriouss.grana.voicewidget.Item24ReceiverTestKt'],
    { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  if (r.error) throw r.error;
  process.exitCode = r.status ?? 2;
} catch (e) { console.error('INFRA/FIXTURE (nao e RED causal):', e.stack); process.exitCode = 2; }
finally { fs.rmSync(base, { recursive: true, force: true }); }
