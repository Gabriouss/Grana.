// Compila EstadoWidget.kt REAL. Android/prefs e dono são fronteiras JVM simuladas.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const os = require('node:os');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-estado-widget-'));
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
const cache = path.join(process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle'), 'caches/modules-2/files-2.1');
function jar(group, artifact) {
  const folder=path.join(cache,group,artifact);
  function scan(d){for(const e of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>b.name.localeCompare(a.name,undefined,{numeric:true}))){const p=path.join(d,e.name);if(e.isDirectory()){const f=scan(p);if(f)return f;}else if(e.name.endsWith('.jar'))return p;}}
  const file=scan(folder);if(!file)throw Error('JAR ausente '+artifact);return file;
}
const std=jar('org.jetbrains.kotlin','kotlin-stdlib');
const compiler=[jar('org.jetbrains.kotlin','kotlin-compiler-embeddable'),std,
 jar('org.jetbrains.kotlin','kotlin-script-runtime'),jar('org.jetbrains.kotlin','kotlin-reflect'),
 jar('org.jetbrains.kotlin','kotlin-daemon-embeddable'),jar('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),jar('org.jetbrains.intellij.deps','trove4j'),jar('org.jetbrains','annotations')];
const files={
 'Android.kt':`package android.content
open class Context {
 val packageName = "qa"
 private val prefs = mutableMapOf<String, SharedPreferences>()
 fun getSharedPreferences(name: String, mode: Int) = prefs.getOrPut(name) { SharedPreferences() }
 companion object { const val MODE_PRIVATE = 0 }
}
class ComponentName(packageName: String, name: String)
class SharedPreferences {
 private val data = mutableMapOf<String, Any>()
 fun getString(key: String, fallback: String?): String? = data[key] as? String ?: fallback
 fun getLong(key: String, fallback: Long): Long = data[key] as? Long ?: fallback
 fun edit() = Editor()
 inner class Editor {
  fun putString(key: String, value: String) = apply { data[key] = value }
  fun putLong(key: String, value: Long) = apply { data[key] = value }
  fun commit() = true
  fun apply() {}
 }
}`,
 'Manager.kt':`package android.appwidget
import android.content.*
class AppWidgetManager {
 companion object { fun getInstance(context: Context): AppWidgetManager? = null }
 fun getAppWidgetIds(component: ComponentName) = intArrayOf()
}`,
 'Fronteiras.kt':`package com.gabriouss.grana.voicewidget
import android.content.*
import android.appwidget.*
object VoiceRetryScheduler { @Volatile var usuario: String? = "a"; fun dono(context: Context) = usuario }
object VoiceCaptureReceipt { fun publicar(context: Context, titulo: Int, texto: Int) {} }
object R { object string { const val grana_voice_interrompida_titulo = 1; const val grana_voice_interrompida_texto = 2 } }
class GranaVoiceWidgetProvider { companion object { fun desenhar(context: Context, manager: AppWidgetManager, ids: IntArray) {} } }
`,
 'EstadoWidgetReconciliacaoTest.kt': fs.readFileSync(path.join(__dirname, 'native/EstadoWidgetReconciliacaoTest.kt'), 'utf8'),
};
for(const [name,body] of Object.entries(files))fs.writeFileSync(path.join(base,name),body);
const output=path.join(base,'classes');fs.mkdirSync(output,{recursive:true});
const source=path.join(__dirname, '../modules/grana-voice-widget/android/src/main/java/com/gabriouss/grana/voicewidget/EstadoWidget.kt');
let r=cp.spawnSync(java,['-cp',compiler.join(path.delimiter),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',[std,compiler.at(-1)].join(path.delimiter),'-jvm-target','17','-d',output,source,...Object.keys(files).map(f=>path.join(base,f))],{encoding:'utf8',windowsHide:true,timeout:60000});
if(r.error)throw r.error;
process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)process.exit(r.status||1);
r=cp.spawnSync(java,['-cp',[output,std].join(path.delimiter),'com.gabriouss.grana.voicewidget.EstadoWidgetReconciliacaoTestKt'],{encoding:'utf8',windowsHide:true,timeout:10000});
if(r.error)throw r.error;
process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exitCode=r.status ?? 1;
