package androidx.work
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
