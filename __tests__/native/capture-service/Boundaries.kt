package com.gabriouss.grana.voicewidget

import android.content.Context
import android.appwidget.AppWidgetManager
import android.media.MediaRecorder
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicInteger
import java.io.FileDescriptor

class GranaVoiceHeadlessService
class GranaVoiceWidgetProvider { companion object {
  const val ACAO_TOQUE="touch"
  fun desenhar(c:Context,m:AppWidgetManager,ids:IntArray){}
} }

/** Only platform/syscall boundaries are controlled; service/state/scheduler/receipt are real. */
object CaptureFixture {
  data class Call(val stage:String,val recorder:Int,val thread:String)
  val calls=CopyOnWriteArrayList<Call>()
  val config=CopyOnWriteArrayList<String>()
  val recorders=CopyOnWriteArrayList<MediaRecorder>()
  val recorderIds=AtomicInteger()
  val syncs=AtomicInteger()
  @Volatile var blocked:String?=null
  @Volatile var entered=CountDownLatch(1)
  @Volatile var release=CountDownLatch(1)
  @Volatile var failPrepare=false
  @Volatile var failStop=false
  @Volatile var failSync=0
  @Volatile var audioBytes=2048
  @Volatile var failFinalRename=false
  private val busy=ConcurrentHashMap<Int,AtomicInteger>()
  val overlap=AtomicInteger()
  fun point(stage:String,id:Int=0) {
    calls.add(Call(stage,id,Thread.currentThread().name))
    val n=if(id==0)null else busy.computeIfAbsent(id){AtomicInteger()}
    if(n?.incrementAndGet()?.let{it>1}==true)overlap.incrementAndGet()
    try { if(blocked==stage){entered.countDown();check(release.await(5,TimeUnit.SECONDS)){"fixture gate not released: $stage"}} }
    finally {n?.decrementAndGet()}
  }
  fun rename(src:java.io.File,dst:java.io.File):Boolean {
    val finalizada=org.json.JSONObject(src.readText()).optBoolean("capturaFinalizada")
    if(finalizada)point("beforeFinalJsonRename")
    if(finalizada&&failFinalRename)return false
    if(dst.exists())check(dst.delete())
    val ok=src.renameTo(dst)
    if(finalizada)point("afterFinalJsonRename")
    return ok
  }
  fun sync(fd:FileDescriptor) {
    val n=syncs.incrementAndGet()
    point("sync:$n")
    if(failSync==n)throw java.io.IOException("sync unavailable")
    fd.sync()
    point("afterSync:$n")
  }
  fun reset(stage:String?=null) {
    release.countDown()
    calls.clear();config.clear();recorders.clear();busy.clear();recorderIds.set(0);syncs.set(0);overlap.set(0)
    entered=CountDownLatch(1);release=CountDownLatch(1);blocked=stage
    failPrepare=false;failStop=false;failSync=0;audioBytes=2048;failFinalRename=false
    android.util.Log.errors.clear()
    android.os.Handler.errors.clear();android.os.Handler.delayed.clear()
    android.os.SystemClock.now=0
    androidx.work.WorkManager.instance.reset()
  }
}
