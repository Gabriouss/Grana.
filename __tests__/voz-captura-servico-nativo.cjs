// JVM/cache local existente. Serviço, EstadoWidget, Scheduler e recibo REAIS.
// Argumento opcional: cópia baseline para RED; sem argumento: arquivo de produto.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'modules/grana-voice-widget/android/src/main/java/com/gabriouss/grana/voicewidget');
const fixture = path.join(__dirname, 'native/capture-service');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-capture-service-'));
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
  const requested = process.argv[2];
  const real = path.join(source, 'GranaVoiceCaptureService.kt');
  let service = fs.readFileSync(requested || real, 'utf8');
  const originalSHA = require('node:crypto').createHash('sha256').update(service).digest('hex');
  // Neutral boundary instrumentation in BOTH baseline and candidate: calls the real fd.sync after the latch.
  assert.equal((service.match(/saida\.fd\.sync\(\)/g) || []).length, 1);
  service = service.replace('saida.fd.sync()', 'CaptureFixture.sync(saida.fd)');
  // Windows renameTo does not replace; Android/POSIX does. Same boundary overlay in both cuts.
  assert.equal((service.match(/temporario\.renameTo/g) || []).length, 1);
  service = service.replace('temporario.renameTo(File(pasta, ' + String.fromCharCode(34) + '$id.json' + String.fromCharCode(34) + '))', 'CaptureFixture.rename(temporario, File(pasta, ' + String.fromCharCode(34) + '$id.json' + String.fromCharCode(34) + '))');
  const serviceFile = path.join(base, 'GranaVoiceCaptureService.kt');
  fs.writeFileSync(serviceFile, service);
  const files = fs.readdirSync(fixture).filter(name => name.endsWith('.kt')).map(name => path.join(fixture, name));
  const texts = ['GranaVoiceCaptureService.kt','VoiceCaptureReceipt.kt'].map(name => fs.readFileSync(path.join(source,name),'utf8')).join('\n');
  const names = [...new Set([...texts.matchAll(/R\.string\.([A-Za-z0-9_]+)/g)].map(m => m[1]))];
  const resources = path.join(base, 'R.kt');
  fs.writeFileSync(resources, 'package com.gabriouss.grana.voicewidget\nobject R { object string {\n' + names.map((n,i) => `const val ${n} = ${i+1}`).join('\n') + '\n} }\n');
  files.push(resources);
  console.log('serviceSHA256=' + originalSHA + ' instrumentation=single-fd-sync-boundary');
  const std = jar('org.jetbrains.kotlin', 'kotlin-stdlib');
  const json = jar('org.json', 'json');
  const compiler = [jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable'), std,
    jar('org.jetbrains.kotlin', 'kotlin-script-runtime'), jar('org.jetbrains.kotlin', 'kotlin-reflect'),
    jar('org.jetbrains.kotlin', 'kotlin-daemon-embeddable'), jar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm'),
    jar('org.jetbrains.intellij.deps', 'trove4j'), jar('org.jetbrains', 'annotations')];
  const output = path.join(base, 'classes');
  const sources = [serviceFile, ...['EstadoWidget.kt','VoiceCaptureReceipt.kt','VoiceRetryScheduler.kt','GranaVoiceRetryWorker.kt'].map(name => path.join(source,name))];
  let r = cp.spawnSync(java, ['-Xmx192m', '-cp', compiler.join(path.delimiter), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
    '-no-stdlib', '-no-reflect', '-classpath', [std, compiler.at(-1), json].join(path.delimiter), '-jvm-target', '17', '-d', output, ...sources, ...files],
    { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  if (r.error || r.status !== 0) throw r.error || Error('Compilacao Kotlin falhou: ' + r.status);
  r = cp.spawnSync(java, ['-Xmx128m', '-cp', [output, std, json].join(path.delimiter), 'com.gabriouss.grana.voicewidget.VoiceCaptureServiceTestKt'],
    { encoding: 'utf8', windowsHide: true, timeout: 45000 });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  if (r.error) throw r.error;
  process.exitCode = r.status ?? 2;
} catch (e) { console.error('INFRA/FIXTURE (nao e RED causal):', e.stack); process.exitCode = 2; }
finally { fs.rmSync(base, { recursive: true, force: true }); }
