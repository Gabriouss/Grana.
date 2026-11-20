package com.gabriouss.grana.voicewidget

import android.content.Intent
import android.os.*
import java.io.File
import java.util.concurrent.*

private var assertions=0
private var failed=0
private fun expect(v:Boolean,why:String="callback returns"){assertions++;if(!v){failed++;println("FAIL $why")}else println("OK $why")}
private fun mainCall(f:()->Unit):FutureTask<Unit> = FutureTask<Unit>{f()}.also{Handler(Looper.getMainLooper()).post(it)}
private fun done(f:FutureTask<Unit>):Boolean=try{f.get(350,TimeUnit.MILLISECONDS);true}catch(e:TimeoutException){false}
private fun waitFor(why:String,condition:()->Boolean) {
  val until=System.nanoTime()+TimeUnit.SECONDS.toNanos(3)
  while(!condition()&&System.nanoTime()<until)Thread.sleep(2)
  check(condition()){ "fixture prerequisite missing: $why" }
}
private fun command(s:GranaVoiceCaptureService,a:String,id:String?=null)=mainCall{
  s.onStartCommand(Intent().setAction(a).apply{if(id!=null)putExtra("requestId",id)},0,1)
}
private fun start(s:GranaVoiceCaptureService,id:String="speech") {
  VoiceRetryScheduler.definirDono(s,"A")
  EstadoWidget.preparar(s,id)
  check(done(command(s,GranaVoiceCaptureService.ACAO_INICIAR,id))){"initial callback did not return"}
}
private fun eventually(condition:()->Boolean):Boolean { val until=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(350);while(!condition()&&System.nanoTime()<until)Thread.sleep(2);return condition() }
private fun count(stage:String)=CaptureFixture.calls.count{it.stage==stage}
private fun orphan(s:GranaVoiceCaptureService,id:String,ext:String)=File(File(s.filesDir,GranaVoiceCaptureService.PASTA_ORFA),"$id.$ext")
private fun recover(s:GranaVoiceCaptureService,id:String="speech") {
  val origem=checkNotNull(VoiceRetryScheduler.sessao(s))
  val w=GranaVoiceRetryWorker(s,androidx.work.WorkerParameters(androidx.work.workDataOf("requestId" to id,"userId" to origem.userId,"geracao" to origem.geracao)))
  val task=FutureTask{w.doWork()}
  Thread(task,"fixture-real-recovery").apply{isDaemon=true}.start()
  try { check(eventually{task.isDone||orphan(s,id,"m4a").exists()}){"real Worker made no progress"} }
  finally { w.onStopped();task.get(2,TimeUnit.SECONDS) }
}
private fun finalized(s:GranaVoiceCaptureService,id:String="speech"):Boolean = try {
  org.json.JSONObject(orphan(s,id,"json").readText()).optBoolean("capturaFinalizada")
} catch(e:Exception){false}
private fun scenario(name:String,stage:String?=null,body:(GranaVoiceCaptureService)->Unit){
  println("CASE $name")
  CaptureFixture.reset(stage)
  val s=GranaVoiceCaptureService()
  try{body(s)}finally{
    CaptureFixture.release.countDown()
    mainCall{s.onDestroy()}.get(3,TimeUnit.SECONDS)
    waitFor("native cleanup"){CaptureFixture.recorders.all{it.released}}
    // I/O may be finishing and posting a now-invalid continuation.
    Thread.sleep(80)
    expect(CaptureFixture.overlap.get()==0,"$name: no overlapping native access")
    expect(Handler.errors.isEmpty(),"$name: no uncaught callback error: ${Handler.errors}")
    expect(s.power.locks.none{it.isHeld},"$name: wakelock released")
    s.filesDir.deleteRecursively()
  }
}

fun main(){
  scenario("prepare cancel","prepare"){s->
    start(s);check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    val sentinel=mainCall{}
    val cancel=command(s,GranaVoiceCaptureService.ACAO_CANCELAR)
    expect(done(sentinel),"main free while prepare blocked")
    expect(done(cancel),"cancel callback returns while prepare blocked")
    CaptureFixture.release.countDown();cancel.get(3,TimeUnit.SECONDS)
    waitFor("prepare release"){count("release")>0}
    expect(count("start")==0,"cancelled preparation never starts")
    expect(s.starts.isEmpty(),"cancelled preparation never bridges")
  }
  scenario("prepare destroy","prepare"){s->
    start(s);check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    val destroy=mainCall{s.onDestroy()}
    expect(done(destroy),"onDestroy returns while prepare blocked")
    CaptureFixture.release.countDown();destroy.get(3,TimeUnit.SECONDS)
    waitFor("destroy release"){count("release")>0}
    expect(count("start")==0,"destroyed preparation never starts")
  }
  scenario("stop cancel","stop"){s->
    start(s);waitFor("listening"){EstadoWidget.atual(s)==EstadoWidget.OUVINDO}
    val stop=command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)
    check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    expect(done(stop),"stop callback returns before native stop")
    expect(done(command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)),"duplicate stop callback returns while native stop blocked")
    val cancel=command(s,GranaVoiceCaptureService.ACAO_CANCELAR)
    expect(done(cancel),"cancel callback returns while native stop blocked")
    CaptureFixture.release.countDown();cancel.get(3,TimeUnit.SECONDS)
    waitFor("stop cleanup"){count("release")>0};Thread.sleep(80)
    expect(count("stop")==1,"stop is idempotent")
    expect(s.starts.isEmpty()&&!orphan(s,"speech","m4a").exists(),"cancelled stop has no late promotion/bridge")
  }
  for(stage in listOf("reset","release"))scenario("slow $stage",stage){s->
    start(s);waitFor("listening"){EstadoWidget.atual(s)==EstadoWidget.OUVINDO}
    val cancel=command(s,GranaVoiceCaptureService.ACAO_CANCELAR)
    check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    expect(done(cancel),"cancel returns before $stage")
    expect(done(mainCall{}),"main sentinel during $stage")
    CaptureFixture.release.countDown();cancel.get(3,TimeUnit.SECONDS)
  }
  scenario("active fsync cancel","sync:2"){s->
    start(s);check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    val stop=command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)
    expect(done(stop),"main callback returns during active fsync")
    Thread.sleep(100)
    expect(count("stop")==1,"recorder stop runs while fsync is still blocked")
    val cancel=command(s,GranaVoiceCaptureService.ACAO_CANCELAR)
    expect(done(cancel),"cancel returns during fsync")
    CaptureFixture.release.countDown();cancel.get(3,TimeUnit.SECONDS);Thread.sleep(100)
    expect(s.starts.isEmpty()&&!orphan(s,"speech","m4a").exists(),"fsync cancellation cannot promote/bridge")
  }
  scenario("final fsync cancel","sync:3"){s->
    start(s);waitFor("listening and reference"){EstadoWidget.atual(s)==EstadoWidget.OUVINDO&&CaptureFixture.syncs.get()>=2}
    check(done(command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)))
    check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    expect(!orphan(s,"speech","m4a").exists(),"not promoted before final metadata durable")
    expect(done(command(s,GranaVoiceCaptureService.ACAO_CANCELAR)),"cancel during final fsync returns")
    CaptureFixture.release.countDown();Thread.sleep(100)
    expect(!orphan(s,"speech","m4a").exists()&&s.starts.isEmpty(),"no promotion after final fsync cancelled")
  }
  scenario("replace during prepare","prepare"){s->
    start(s,"old");check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    EstadoWidget.preparar(s,"new")
    val next=command(s,GranaVoiceCaptureService.ACAO_INICIAR,"new")
    expect(done(next),"replacement callback returns during old prepare")
    CaptureFixture.release.countDown();next.get(3,TimeUnit.SECONDS)
    waitFor("replacement listening"){EstadoWidget.atual(s)==EstadoWidget.OUVINDO}
    expect(count("start")==1,"replacement starts only one recorder")
    expect(EstadoWidget.pertenceACaptura(s,"new"),"old callback preserves new widget owner")
    expect(done(command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)))
    waitFor("new bridge"){s.starts.isNotEmpty()}
    expect(s.starts.single().getStringExtra("requestId")=="new","only new intention delivered")
  }
  scenario("owner ABA during prepare","prepare"){s->
    start(s);check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    VoiceRetryScheduler.definirDono(s,"B");VoiceRetryScheduler.definirDono(s,"A")
    CaptureFixture.release.countDown();Thread.sleep(100)
    expect(count("start")==0&&s.starts.isEmpty(),"same owner with new generation cannot revive prepare")
    expect(eventually{s.notifications.receipts.isNotEmpty()},"owner invalidation leaves receipt")
  }
  scenario("prepare budget","prepare"){s->
    start(s);check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    Handler.advance(60_000);expect(done(mainCall{}),"preparation deadline main remains free")
    CaptureFixture.release.countDown();Thread.sleep(100)
    expect(count("start")==0,"expired prepare never starts")
    expect(s.notifications.receipts.isNotEmpty(),"preparation deadline visible receipt")
  }
  scenario("stop budget","stop"){s->
    start(s);waitFor("listening"){EstadoWidget.atual(s)==EstadoWidget.OUVINDO}
    val stop=command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)
    check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    Handler.advance(5_000);expect(done(mainCall{}),"closing deadline does not wait native stop")
    CaptureFixture.release.countDown();stop.get(3,TimeUnit.SECONDS);Thread.sleep(100)
    expect(s.starts.isEmpty()&&!orphan(s,"speech","m4a").exists(),"expired stop cannot deliver")
    expect(s.notifications.receipts.isNotEmpty(),"stop deadline receipt")
  }
  scenario("same id replacement with old fsync","sync:2"){s->
    start(s);check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    expect(done(command(s,GranaVoiceCaptureService.ACAO_CANCELAR)),"same id cancel admitted before I/O returns")
    expect(done(command(s,GranaVoiceCaptureService.ACAO_INICIAR,"speech")),"same id new intention admitted")
    CaptureFixture.release.countDown()
    waitFor("same id replacement starts"){count("start")>=2}
    waitFor("same id state listening"){EstadoWidget.atual(s)==EstadoWidget.OUVINDO}
    expect(done(command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)),"same id new stop returns")
    waitFor("same id new bridge"){s.starts.isNotEmpty()}
    expect(s.starts.size==1&&orphan(s,"speech","m4a").exists(),"late cleanup preserves same id new audio")
  }
  scenario("hard cut while fsync retained","sync:2"){s->
    start(s);check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    Handler.advance(20_000)
    expect(eventually{count("stop")==1},"20s hard cut runs independently of fsync")
    Handler.advance(5_000);expect(done(mainCall{}),"main remains free through retained I/O budget")
    expect(s.notifications.receipts.isNotEmpty(),"shared closure budget expires while I/O retained")
    CaptureFixture.release.countDown();Thread.sleep(100)
    expect(s.starts.isEmpty()&&!orphan(s,"speech","m4a").exists(),"expired finalization cannot promote after I/O returns")
  }
  scenario("notification unavailable"){s->
    s.notifications.failNotify=true;CaptureFixture.failPrepare=true
    start(s)
    waitFor("notification failure handled"){s.stopped}
    expect(android.util.Log.errors.contains("recibo da captura não foi publicado"),"notification failure logged without crash")
    expect(EstadoWidget.atual(s)==EstadoWidget.REPETIR,"failure state remains visible without notification")
  }
  scenario("cancel after actual fsync before delivery decision","afterSync:3"){s->
    start(s);waitFor("listening"){EstadoWidget.atual(s)==EstadoWidget.OUVINDO}
    check(done(command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)))
    check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    expect(done(command(s,GranaVoiceCaptureService.ACAO_CANCELAR)),"pre-delivery cancel callback returns")
    expect(!finalized(s),"fsynced temporary is not adoptable before decision")
    recover(s)
    expect(!orphan(s,"speech","m4a").exists(),"real Worker cannot promote invalidated pre-delivery audio")
    CaptureFixture.release.countDown();Thread.sleep(100)
    expect(!orphan(s,"speech","m4a").exists()&&s.starts.isEmpty(),"pre-delivery invalidation remains terminal after publication task resumes")
  }
  scenario("cancel after decision before JSON replacement","beforeFinalJsonRename"){s->
    start(s);waitFor("listening"){EstadoWidget.atual(s)==EstadoWidget.OUVINDO}
    check(done(command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)))
    check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    expect(done(command(s,GranaVoiceCaptureService.ACAO_CANCELAR)),"post-decision cancel callback returns")
    CaptureFixture.release.countDown()
    expect(eventually{finalized(s)},"accepted delivery remains recoverable after cancel before JSON rename")
    if(finalized(s))recover(s)
    expect(orphan(s,"speech","m4a").exists(),"accepted audio survives post-decision cancellation")
  }
  scenario("real recovery between JSON and audio promotion","afterFinalJsonRename"){s->
    start(s);waitFor("listening"){EstadoWidget.atual(s)==EstadoWidget.OUVINDO}
    check(done(command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)))
    check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    expect(finalized(s),"published finalized JSON is the existing recovery boundary")
    expect(done(command(s,GranaVoiceCaptureService.ACAO_CANCELAR)),"cancel after finalized JSON returns")
    recover(s)
    expect(orphan(s,"speech","m4a").exists(),"real Worker promotes accepted delivery")
    CaptureFixture.release.countDown();Thread.sleep(100)
    expect(orphan(s,"speech","m4a").exists(),"late cancellation cleanup never deletes Worker-recovered accepted delivery")
  }
  scenario("same-session replacement before acceptance","afterSync:3"){s->
    start(s);waitFor("listening"){EstadoWidget.atual(s)==EstadoWidget.OUVINDO}
    check(done(command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)))
    check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    val origem=VoiceRetryScheduler.sessao(s)
    EstadoWidget.preparar(s,"new-same-owner")
    expect(done(command(s,GranaVoiceCaptureService.ACAO_INICIAR,"new-same-owner")),"same-session new start invalidates old delivery")
    expect(origem==VoiceRetryScheduler.sessao(s),"control: account/session generation unchanged")
    CaptureFixture.release.countDown()
    waitFor("new same-owner listening"){count("start")==2&&EstadoWidget.atual(s)==EstadoWidget.OUVINDO}
    expect(!orphan(s,"speech","m4a").exists()&&!finalized(s),"old intent cannot publish for same owner new start")
    expect(EstadoWidget.pertenceACaptura(s,"new-same-owner"),"old completion does not take new capture ownership")
    check(done(command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)))
    waitFor("new same-owner bridge"){s.starts.isNotEmpty()}
    expect(s.starts.single().getStringExtra("requestId")=="new-same-owner","only new same-owner intention delivered")
  }
  scenario("duplicate stop keeps original deadline","stop"){s->
    start(s);waitFor("listening"){EstadoWidget.atual(s)==EstadoWidget.OUVINDO}
    val stop=command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)
    check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    Handler.advance(4_000);expect(done(mainCall{}),"main free at closing second4")
    expect(done(command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)),"duplicate stop admitted at second4")
    Handler.advance(999);expect(done(mainCall{}),"main free before original deadline")
    expect(s.notifications.receipts.isEmpty(),"control: no premature closing expiry")
    Handler.advance(1);expect(done(mainCall{}),"original deadline callback returns")
    expect(s.notifications.receipts.isNotEmpty(),"duplicate stop does not renew original5s budget")
    CaptureFixture.release.countDown();stop.get(3,TimeUnit.SECONDS);Thread.sleep(100)
    expect(!finalized(s)&&s.starts.isEmpty(),"no accepted delivery after original deadline")
  }
  scenario("deadline without main timeout dispatch","afterSync:3"){s->
    start(s);waitFor("listening"){EstadoWidget.atual(s)==EstadoWidget.OUVINDO}
    check(done(command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)))
    check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    // Advance only the clock. Handler.advance would dispatch the delayed timeout and hide this bug.
    SystemClock.now += 5_000
    expect(Handler.delayed.any{it.due<=SystemClock.now},"control: elapsed timeout remains queued on main")
    expect(s.notifications.receipts.isEmpty(),"control: main timeout callback has not produced receipt")
    CaptureFixture.release.countDown()
    expect(eventually{s.stopped},"elapsed delivery terminates without waiting main timeout")
    expect(s.starts.isEmpty(),"expired return without promotion never starts bridge")
    expect(!orphan(s,"speech","m4a").exists()&&!finalized(s),"elapsed delivery did not publish audio or finalized JSON")
    expect(EstadoWidget.atual(s)==EstadoWidget.REPETIR,"elapsed delivery visibly requests repeat")
    expect(s.notifications.titles.contains(s.getString(R.string.grana_voice_interrompida_titulo)),"elapsed delivery interruption receipt")
    expect(!s.notifications.titles.contains(s.getString(R.string.grana_voice_guardada_titulo)),"elapsed delivery never claims audio saved")
  }
  scenario("final JSON rename failure"){s->
    CaptureFixture.failFinalRename=true
    start(s);waitFor("listening"){EstadoWidget.atual(s)==EstadoWidget.OUVINDO}
    check(done(command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)))
    expect(eventually{s.stopped},"failed JSON publication terminates")
    expect(s.starts.isEmpty(),"failed JSON publication zero bridge")
    expect(!finalized(s)&&!orphan(s,"speech","m4a").exists(),"failed JSON publication leaves no adoptable audio")
    expect(EstadoWidget.atual(s)==EstadoWidget.REPETIR,"failed JSON publication repeat state")
    expect(s.notifications.titles.contains(s.getString(R.string.grana_voice_interrompida_titulo)),"failed JSON publication interruption receipt")
    expect(!s.notifications.titles.contains(s.getString(R.string.grana_voice_guardada_titulo)),"failed JSON publication never claims saved")
  }
  scenario("failure after finalized JSON confirmed","afterFinalJsonRename"){s->
    start(s);waitFor("listening"){EstadoWidget.atual(s)==EstadoWidget.OUVINDO}
    check(done(command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)))
    check(CaptureFixture.entered.await(2,TimeUnit.SECONDS))
    val obstacle=orphan(s,"speech","m4a")
    check(obstacle.mkdir());File(obstacle,"busy").writeText("fixture")
    CaptureFixture.release.countDown()
    expect(eventually{s.stopped},"post-JSON audio promotion failure terminates")
    expect(finalized(s)&&orphan(s,"speech","capturando").exists(),"confirmed JSON/audio preserved for recovery after failure")
    expect(s.starts.isEmpty(),"failed immediate promotion zero bridge")
    expect(EstadoWidget.atual(s)==EstadoWidget.PENDENTE,"confirmed JSON failure remains pending")
    expect(s.notifications.titles.contains(s.getString(R.string.grana_voice_guardada_titulo)),"confirmed JSON failure saved receipt matches recoverability")
    expect(!s.notifications.titles.contains(s.getString(R.string.grana_voice_interrompida_titulo)),"confirmed JSON failure not mislabeled lost capture")
    check(done(command(s,GranaVoiceCaptureService.ACAO_CANCELAR)))
    expect(finalized(s)&&orphan(s,"speech","capturando").exists(),"cancel after durable JSON still preserves recovery")
    check(obstacle.deleteRecursively());recover(s)
    expect(orphan(s,"speech","m4a").isFile,"real Worker recovers after confirmed JSON promotion failure")
  }
  scenario("normal"){s->
    start(s);waitFor("listening"){EstadoWidget.atual(s)==EstadoWidget.OUVINDO}
    check(done(command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)))
    waitFor("normal bridge"){s.starts.isNotEmpty()}
    expect(s.starts.size==1,"normal one bridge")
    val extras=s.starts.single().extras
    expect(extras["userId"]=="A"&&extras["source"]=="widget"&&extras["dataCaptura"] is String&&extras["capturadoEm"] is Double,"normal bridge contract preserved")
    val meta=org.json.JSONObject(orphan(s,"speech","json").readText())
    expect(meta.optBoolean("capturaFinalizada")&&meta.getString("userId")=="A"&&meta.getString("requestId")=="speech","normal durable metadata contract")
    expect(count("prepare")==1&&count("start")==1&&count("stop")==1&&count("reset")==1&&count("release")==1,"normal native operations once")
    expect(CaptureFixture.calls.filter{it.recorder>0}.map{it.thread}.distinct().size==1,"all native access serialized on same thread")
    expect(CaptureFixture.calls.none{it.recorder>0&&it.thread=="fixture-main"},"no recorder calls on main")
    expect(CaptureFixture.calls.filter{it.stage.startsWith("sync:")}.none{it.thread=="fixture-main"||it.thread.contains("recorder")},"fsync off main and recorder queue")
    expect(CaptureFixture.config.containsAll(listOf("channels:1","sample:44100","bitrate:64000")),"normal audio config unchanged")
  }
  for(kind in listOf("short","stop","prepare","sync","bridge"))scenario("failure $kind"){s->
    if(kind=="short")CaptureFixture.audioBytes=128
    if(kind=="stop")CaptureFixture.failStop=true
    if(kind=="prepare")CaptureFixture.failPrepare=true
    if(kind=="sync")CaptureFixture.failSync=2
    if(kind=="bridge")s.failBridge=true
    start(s)
    if(kind !in listOf("prepare","sync")) {
      waitFor("failure listening"){EstadoWidget.atual(s)==EstadoWidget.OUVINDO}
      check(done(command(s,GranaVoiceCaptureService.ACAO_ENCERRAR)))
    }
    waitFor("failure receipt"){s.notifications.receipts.isNotEmpty()}
    expect(s.starts.isEmpty(),"$kind: no invalid bridge")
    expect(s.notifications.receipts.isNotEmpty(),"$kind: receipt visible")
    if(kind=="bridge")expect(orphan(s,"speech","m4a").exists(),"bridge rejection preserves durable audio")
  }
  println("RESULT assertions=$assertions failed=$failed")
  if(failed>0)kotlin.system.exitProcess(1)
  kotlin.system.exitProcess(0)
}
