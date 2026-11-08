// Filtro/configuração/diário Kotlin REAIS; só Context/SharedPreferences são dublês.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const raiz=path.resolve(__dirname,'..');
const cache=path.join(process.env.GRADLE_USER_HOME||path.join(os.homedir(),'.gradle'),'caches/modules-2/files-2.1');
function jar(grupo,artefato){
  function achar(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>b.name.localeCompare(a.name,undefined,{numeric:true}))){const p=path.join(dir,e.name);if(e.isDirectory()){const f=achar(p);if(f)return f;}else if(e.name.endsWith('.jar'))return p;}}
  const f=achar(path.join(cache,grupo,artefato));if(!f)throw Error('JAR ausente: '+artefato);return f;
}
function ram(etapa){const livre=os.freemem()/1024**3;console.log(`RAM antes de ${etapa}: ${livre.toFixed(2)} GiB`);if(livre<1.5){console.error('RAM_INSUFICIENTE: aguardar Supremo');process.exit(75);}}
const std=jar('org.jetbrains.kotlin','kotlin-stdlib'),json=jar('org.json','json'),anotacoes=jar('org.jetbrains','annotations');
const compiler=[jar('org.jetbrains.kotlin','kotlin-compiler-embeddable'),std,jar('org.jetbrains.kotlin','kotlin-script-runtime'),jar('org.jetbrains.kotlin','kotlin-reflect'),jar('org.jetbrains.kotlin','kotlin-daemon-embeddable'),jar('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),jar('org.jetbrains.intellij.deps','trove4j'),anotacoes];
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java';
const base=fs.mkdtempSync(path.join(os.tmpdir(),'grana-avisos-bancos-'));
const contexto=`package android.content
open class Context {
 private val prefs = mutableMapOf<String, SharedPreferences>()
 fun getSharedPreferences(name: String, mode: Int) = prefs.getOrPut(name) { SharedPreferences() }
 companion object { const val MODE_PRIVATE = 0 }
}
class SharedPreferences {
 private val dados = mutableMapOf<String, Any>()
 fun getString(k: String, padrao: String?): String? = dados[k] as? String ?: padrao
 fun getLong(k: String, padrao: Long): Long = dados[k] as? Long ?: padrao
 fun getInt(k: String, padrao: Int): Int = dados[k] as? Int ?: padrao
 fun getBoolean(k: String, padrao: Boolean): Boolean = dados[k] as? Boolean ?: padrao
 fun contains(k: String) = dados.containsKey(k)
 fun edit() = Editor()
 inner class Editor {
  private val novos = dados.toMutableMap()
  fun putString(k: String, v: String?) = apply { if(v == null) novos.remove(k) else novos[k]=v }
  fun putLong(k: String, v: Long) = apply { novos[k]=v }
  fun putInt(k: String, v: Int) = apply { novos[k]=v }
  fun putBoolean(k: String, v: Boolean) = apply { novos[k]=v }
  fun remove(k: String) = apply { novos.remove(k) }
  fun clear() = apply { novos.clear() }
  fun commit(): Boolean { dados.clear();dados.putAll(novos);return true }
  fun apply() { commit() }
 }
}`;
const stub=path.join(base,'Android.kt');fs.writeFileSync(stub,contexto);
const saida=path.join(base,'classes');fs.mkdirSync(saida);
const kotlin=path.join(raiz,'modules/grana-avisos/android/src/main/java/com/gabriouss/grana/avisos');
const catalogo=fs.readFileSync(path.join(raiz,'lib/avisos-banco/catalogo.ts'),'utf8');
const bancos=[...catalogo.matchAll(/pacote:\s*'([^']+)'[^\n]+classe:\s*'banco'/g)].map(m=>m[1]);
if(!bancos.length)throw Error('Catálogo bancário vazio no teste');
ram('compilar Kotlin');
let r=cp.spawnSync(java,['-Dfile.encoding=UTF-8','-Xmx512m','-cp',compiler.join(path.delimiter),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',[std,json,anotacoes].join(path.delimiter),'-jvm-target','17','-d',saida,stub,...['AvisosFiltro.kt','AvisosConfig.kt','AvisosDiario.kt'].map(f=>path.join(kotlin,f)),path.join(__dirname,'native/AvisosBancosCatalogoTest.kt')],{encoding:'utf8',windowsHide:true,timeout:60000});
if(r.error)throw r.error;process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)process.exit(r.status||1);
ram('executar Kotlin real');
r=cp.spawnSync(java,['-Dfile.encoding=UTF-8','-Xmx256m','-cp',[saida,std,json].join(path.delimiter),'com.gabriouss.grana.avisos.AvisosBancosCatalogoTestKt',base,bancos.join(',')],{encoding:'utf8',windowsHide:true,timeout:10000});
if(r.error)throw r.error;process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exitCode=r.status??1;
