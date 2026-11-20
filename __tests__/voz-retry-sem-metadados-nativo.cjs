// JVM/cache local do item 23. Worker, serviço, EstadoWidget, Scheduler e recibo reais.
// Executar pelo supervisor da rodada, com fonte Worker e clone explícitos.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), os = require('node:os');
const assert = require('node:assert/strict');
const [root = path.resolve(__dirname, `..`), requested] = process.argv.slice(2);
if (!path.isAbsolute(root) || (requested && !path.isAbsolute(requested))) throw Error('Use caminhos absolutos para clone e fonte Worker');
function requireRam() {
  const livre = os.freemem() / 1024 ** 3;
  console.log('RAM antes de Java GiB=' + livre.toFixed(3));
  if (livre < 1.5) throw Error('RAM abaixo do piso de 1,5 GiB');
}
const source = path.join(root, 'modules/grana-voice-widget/android/src/main/java/com/gabriouss/grana/voicewidget');
const fixture = path.join(root, '__tests__/native/capture-service');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-retry-sem-meta-'));
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
  const worker = fs.readFileSync(requested || path.join(source, 'GranaVoiceRetryWorker.kt'));
  const originalSHA = require('node:crypto').createHash('sha256').update(worker).digest('hex');
  const workerFile = path.join(base, 'GranaVoiceRetryWorker.kt');
  fs.writeFileSync(workerFile, worker);
  const files = fs.readdirSync(fixture).filter(name => name.endsWith('.kt') && name !== 'VoiceCaptureServiceTest.kt').map(name => {
    const file = path.join(fixture, name);
    if (!['React.kt', 'Headless.kt'].includes(name)) return file;
    // Only platform stubs: an initialized ReactHost makes incorrect JS dispatch observable.
    const text = fs.readFileSync(file, 'utf8');
    const before = name === 'React.kt' ? 'val currentReactContext:ReactContext?=null' : 'var starts=0';
    const after = name === 'React.kt' ? 'val currentReactContext:ReactContext?=ReactContext()' : '@Volatile var starts=0';
    assert.equal(text.split(before).length, 2, 'duble compartilhado mudou: ' + name);
    fs.writeFileSync(path.join(base, name), text.replace(before, after));
    return path.join(base, name);
  });
  files.push(requested ? path.join(__dirname, 'VoiceRetrySemMetadadosTest.kt') : path.join(root, '__tests__/native/VoiceRetrySemMetadadosTest.kt'));
  const texts = ['GranaVoiceCaptureService.kt','VoiceCaptureReceipt.kt'].map(name => fs.readFileSync(path.join(source,name),'utf8')).join('\n');
  const names = [...new Set([...texts.matchAll(/R\.string\.([A-Za-z0-9_]+)/g)].map(m => m[1]))];
  const resources = path.join(base, 'R.kt');
  fs.writeFileSync(resources, 'package com.gabriouss.grana.voicewidget\nobject R { object string {\n' + names.map((n,i) => `const val ${n} = ${i+1}`).join('\n') + '\n} }\n');
  files.push(resources);
  console.log('workerSHA256=' + originalSHA + ' produto sem instrumentacao');
  const std = jar('org.jetbrains.kotlin', 'kotlin-stdlib');
  const json = jar('org.json', 'json');
  const compiler = [jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable'), std,
    jar('org.jetbrains.kotlin', 'kotlin-script-runtime'), jar('org.jetbrains.kotlin', 'kotlin-reflect'),
    jar('org.jetbrains.kotlin', 'kotlin-daemon-embeddable'), jar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm'),
    jar('org.jetbrains.intellij.deps', 'trove4j'), jar('org.jetbrains', 'annotations')];
  const output = path.join(base, 'classes');
  const sources = [workerFile, ...['EstadoWidget.kt','VoiceCaptureReceipt.kt','VoiceRetryScheduler.kt','GranaVoiceCaptureService.kt'].map(name => path.join(source,name))];
  requireRam();
  let r = cp.spawnSync(java, ['-Xmx192m', '-cp', compiler.join(path.delimiter), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
    '-no-stdlib', '-no-reflect', '-classpath', [std, compiler.at(-1), json].join(path.delimiter), '-jvm-target', '17', '-d', output, ...sources, ...files],
    { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  if (r.error || r.status !== 0) throw r.error || Error('Compilacao Kotlin falhou: ' + r.status);
  requireRam();
  r = cp.spawnSync(java, ['-Xmx128m', '-cp', [output, std, json].join(path.delimiter), 'com.gabriouss.grana.voicewidget.VoiceRetrySemMetadadosTestKt'],
    { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  if (r.error) throw r.error;
  process.exitCode = r.status ?? 2;
} catch (e) { console.error('INFRA/FIXTURE (nao e RED causal):', e.stack); process.exitCode = 2; }
finally { fs.rmSync(base, { recursive: true, force: true }); }
