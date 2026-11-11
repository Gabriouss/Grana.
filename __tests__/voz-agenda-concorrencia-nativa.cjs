// Scheduler e EstadoWidget REAIS; WorkManager/Android são fronteiras controladas.
// Executar somente pelo dono da janela global de RAM. Sem Gradle/download.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const cache=path.join(process.env.GRADLE_USER_HOME||path.join(os.homedir(),'.gradle'),'caches/modules-2/files-2.1');
function jar(g,a){function find(d){for(const e of fs.readdirSync(d,{withFileTypes:true}).sort((x,y)=>y.name.localeCompare(x.name,undefined,{numeric:true}))){const p=path.join(d,e.name);if(e.isDirectory()){const f=find(p);if(f)return f;}else if(e.name.endsWith('.jar'))return p;}}const f=find(path.join(cache,g,a));if(!f)throw Error('JAR ausente: '+a);return f;}
const std=jar('org.jetbrains.kotlin','kotlin-stdlib'),ann=jar('org.jetbrains','annotations'),json=jar('org.json','json');
const compiler=[jar('org.jetbrains.kotlin','kotlin-compiler-embeddable'),std,jar('org.jetbrains.kotlin','kotlin-script-runtime'),jar('org.jetbrains.kotlin','kotlin-reflect'),jar('org.jetbrains.kotlin','kotlin-daemon-embeddable'),jar('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),jar('org.jetbrains.intellij.deps','trove4j'),ann];
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java';
function ram(){const livre=os.freemem()/1024**3;console.log('RAM GiB='+livre.toFixed(3));if(livre<1.5){console.error('RAM_INSUFICIENTE');process.exit(75);}}
const base=fs.mkdtempSync(path.join(os.tmpdir(),'grana-voz-agenda-concorrencia-'));
const stubs={
 'Android.kt':`package android.content
import java.util.concurrent.ConcurrentHashMap
open class Context { val packageName="qa";val filesDir=java.nio.file.Files.createTempDirectory("grana-voz-worker-fixture-").toFile();private val prefs=ConcurrentHashMap<String,SharedPreferences>();fun getSharedPreferences(n:String,m:Int)=prefs.computeIfAbsent(n){SharedPreferences()};companion object{const val MODE_PRIVATE=0} }
class ComponentName(p:String,n:String)
class SharedPreferences {private val data=ConcurrentHashMap<String,Any>();fun getString(k:String,d:String?)=data[k] as? String?:d;fun getLong(k:String,d:Long)=data[k] as? Long?:d;fun edit()=Editor()
 inner class Editor {private val updates=mutableMapOf<String,Any?>();fun putString(k:String,v:String?)=apply{updates[k]=v};fun putLong(k:String,v:Long)=apply{updates[k]=v};fun remove(k:String)=apply{updates[k]=null};fun commit():Boolean{updates.forEach{(k,v)->if(v==null)data.remove(k)else data[k]=v};return true};fun apply(){commit()}} }
`,
 'Widget.kt':`package android.appwidget
import android.content.*
class AppWidgetManager {fun getAppWidgetIds(c:ComponentName)=intArrayOf();companion object{fun getInstance(c:Context):AppWidgetManager?=null}}
`,
 'Fronteiras.kt':`package com.gabriouss.grana.voicewidget
import android.content.*
import android.appwidget.*
class GranaVoiceCaptureService{companion object{const val PASTA_ORFA="voz-orfa"}}
class GranaVoiceWidgetProvider {companion object{fun desenhar(c:Context,m:AppWidgetManager,ids:IntArray){}}}
object VoiceCaptureReceipt {fun publicar(c:Context,t:Int,x:Int){}}
object R {object string{const val grana_voice_interrompida_titulo=1;const val grana_voice_interrompida_texto=2}}
`,
 'Log.kt':`package android.util
object Log{fun w(t:String,m:String,e:Throwable)=0;fun w(t:String,m:String)=0;fun e(t:String,m:String,e:Throwable)=0}
`,
 'Os.kt':`package android.os
class Looper{companion object{fun getMainLooper()=Looper()}}
class Handler(l:Looper){fun post(r:Runnable):Boolean{r.run();return true}}
`,
 'React.kt':`package com.facebook.react
import com.facebook.react.bridge.ReactContext
interface ReactApplication{val reactHost:ReactHost?}
interface ReactInstanceEventListener{fun onReactContextInitialized(context:ReactContext)}
class ReactHost{val currentReactContext:ReactContext?=null;fun removeReactInstanceEventListener(l:ReactInstanceEventListener){};fun addReactInstanceEventListener(l:ReactInstanceEventListener){};fun start(){}}
`,
 'ReactBridge.kt':`package com.facebook.react.bridge
class ReactContext
class WritableMap{fun putString(k:String,v:String){}}
object Arguments{fun createMap()=WritableMap()}
`,
 'Headless.kt':`package com.facebook.react.jstasks
import com.facebook.react.bridge.*
class HeadlessJsTaskConfig(n:String,d:WritableMap,t:Long,a:Boolean)
class HeadlessJsTaskContext{fun startTask(c:HeadlessJsTaskConfig):Int{starts++;return 1};fun finishTask(i:Int){};companion object{var starts=0;fun getInstance(c:ReactContext)=HeadlessJsTaskContext()}}
`,
 'Work.kt':`package androidx.work
import android.content.Context
import com.gabriouss.grana.voicewidget.VoiceRetryScheduler
import com.gabriouss.grana.voicewidget.EstadoWidget
import java.util.UUID
import java.util.concurrent.*
enum class BackoffPolicy{EXPONENTIAL};enum class ExistingWorkPolicy{KEEP};enum class NetworkType{CONNECTED}
class Constraints{class Builder{fun setRequiredNetworkType(n:NetworkType)=this;fun build()=Constraints()}}
class Data(val values:Map<String,Any?>){fun getString(k:String)=values[k] as? String}
fun workDataOf(vararg p:Pair<String,Any?>)=Data(mapOf(*p))
class WorkerParameters(val data:Data)
open class Worker(val applicationContext:Context,params:WorkerParameters){val inputData=params.data;val isStopped=false;open fun doWork()=Result.success();open fun onStopped(){};data class Result(val kind:String){companion object{fun success()=Result("success");fun failure()=Result("failure");fun retry()=Result("retry")}}}
data class OneTimeWorkRequest(val id:UUID,val inputData:Data,val tags:Set<String>,val delay:Long)
class OneTimeWorkRequestBuilder<T>{private var id=UUID.randomUUID();private var data=Data(emptyMap());private var delay=0L;private val tags=mutableSetOf<String>();fun setInputData(d:Data)=apply{data=d};fun setConstraints(c:Constraints)=this;fun setBackoffCriteria(b:BackoffPolicy,n:Long,u:TimeUnit)=this;fun setInitialDelay(n:Long,u:TimeUnit)=apply{delay=u.toMillis(n)};fun addTag(t:String)=apply{tags.add(t)};fun setId(v:UUID)=apply{id=v};fun build()=OneTimeWorkRequest(id,data,tags.toSet(),delay)}
data class WorkInfo(val id:UUID,val state:State,val tags:Set<String>,val runAttemptCount:Int=0,val nextScheduleTimeMillis:Long){enum class State{ENQUEUED,CANCELLED;val isFinished get()=this==CANCELLED}}
class Operation(val result:CompletableFuture<Unit>)
class WorkManager {
 val requests=ConcurrentHashMap<String,OneTimeWorkRequest>();val cancelled=ConcurrentHashMap.newKeySet<UUID>();val calls=CopyOnWriteArrayList<String>();val deferred=CopyOnWriteArrayList<()->Unit>()
 @Volatile var blocked:String?=null;@Volatile var waitEntered=CountDownLatch(1);@Volatile var release:()->Unit={};@Volatile var deferCancel=false;@Volatile var legacyCancelled=CountDownLatch(1)
 fun reset(){requests.clear();cancelled.clear();calls.clear();deferred.clear();blocked=null;deferCancel=false;waitEntered=CountDownLatch(1);legacyCancelled=CountDownLatch(1)}
 private fun <T> future(stage:String,action:()->T):CompletableFuture<T>{
  val f=object:CompletableFuture<T>(){override fun get(n:Long,u:TimeUnit):T{
   check(!Thread.holdsLock(VoiceRetryScheduler)){"future $stage sob monitor Scheduler"};check(!Thread.holdsLock(EstadoWidget)){"future $stage sob monitor EstadoWidget"}
   if(!isDone)waitEntered.countDown();return super.get(n,u)
  }}
  val finish={if(!f.isDone){try{f.complete(action())}catch(e:Throwable){f.completeExceptionally(e)}};Unit}
  if(blocked==stage){release=finish;blocked=null}else finish();return f
 }
 private fun info(r:OneTimeWorkRequest)=WorkInfo(r.id,if(r.id in cancelled)WorkInfo.State.CANCELLED else WorkInfo.State.ENQUEUED,r.tags,nextScheduleTimeMillis=System.currentTimeMillis()+r.delay)
 fun enqueueUniqueWork(n:String,p:ExistingWorkPolicy,r:OneTimeWorkRequest):Operation{calls.add("enqueue:$n");return Operation(future("enqueue"){requests.compute(n){_,old->if(old==null||old.id in cancelled)r else old};Unit})}
 fun getWorkInfosForUniqueWork(n:String):CompletableFuture<List<WorkInfo>>{calls.add("query:$n");return future("query"){requests[n]?.let{listOf(info(it))}?:emptyList()}}
 fun getWorkInfosByTag(t:String):CompletableFuture<List<WorkInfo>> = future("legacy"){requests.values.filter{t in it.tags}.map(::info)}
 fun updateWork(r:OneTimeWorkRequest):CompletableFuture<Unit>{calls.add("update");return future("update"){requests.entries.firstOrNull{it.value.id==r.id}?.let{requests[it.key]=r};Unit}}
 private fun cancel(label:String,action:()->Unit):Operation {calls.add(label);if(deferCancel)deferred.add(action)else action();return Operation(CompletableFuture.completedFuture(Unit))}
 fun cancelAllWorkByTag(t:String)=cancel("cancelTag:$t"){requests.values.filter{t in it.tags}.forEach{cancelled.add(it.id)}}
 fun cancelUniqueWork(n:String)=cancel("cancelName:$n"){requests[n]?.let{cancelled.add(it.id)}}
 fun cancelWorkById(id:UUID)=cancel("cancelId"){cancelled.add(id);legacyCancelled.countDown()}
 fun active()=requests.values.filter{it.id !in cancelled}
 companion object{val instance=WorkManager();fun getInstance(c:Context)=instance}
}
`,
};
const files=Object.entries(stubs).map(([name,body])=>{const p=path.join(base,name);fs.writeFileSync(p,body);return p;});
const native=path.join(root,'modules/grana-voice-widget/android/src/main/java/com/gabriouss/grana/voicewidget');
const out=path.join(base,'classes');fs.mkdirSync(out);
ram();let r=cp.spawnSync(java,['-Dfile.encoding=UTF-8','-Xmx384m','-XX:MaxMetaspaceSize=192m','-cp',compiler.join(path.delimiter),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',[std,ann,json].join(path.delimiter),'-jvm-target','17','-d',out,...files,...['VoiceRetryScheduler.kt','EstadoWidget.kt','GranaVoiceRetryWorker.kt'].map(f=>path.join(native,f)),path.join(__dirname,'native/VoiceRetryConcorrenciaTest.kt')],{encoding:'utf8',windowsHide:true,timeout:60000});
process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);
ram();r=cp.spawnSync(java,['-Dfile.encoding=UTF-8','-Xmx128m','-XX:MaxMetaspaceSize=96m','-cp',[out,std,json].join(path.delimiter),'com.gabriouss.grana.voicewidget.VoiceRetryConcorrenciaTestKt'],{encoding:'utf8',windowsHide:true,timeout:20000});
process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;process.exitCode=r.status??1;
