package com.gabriouss.grana.voicewidget
import android.content.*
import android.appwidget.AppWidgetManager
import android.os.Build
import android.util.Log

fun main() {
  var checks=0
  val failures=mutableListOf<String>()
  fun expect(label:String,value:Boolean) { checks++; if(!value) failures.add(label) }
  fun fresh():Context { AppWidgetManager.current=AppWidgetManager(); Log.errors.clear(); return Context() }
  fun touch(c:Context):Throwable?=try {
    GranaVoiceWidgetProvider().onReceive(c,Intent().setAction(GranaVoiceWidgetProvider.ACAO_TOQUE)); null
  } catch(e:Throwable) { e }
  for(sdk in listOf(25,33)) {
    Build.VERSION.SDK_INT=sdk
    val c=fresh()
    expect("normal $sdk nao escapa",touch(c)==null)
    expect("normal $sdk inicia uma vez",c.starts.size==1)
    expect("normal $sdk acao iniciar",c.starts.singleOrNull()?.action==GranaVoiceCaptureService.ACAO_INICIAR)
    val request=c.starts.singleOrNull()?.extras?.get("requestId") as? String
    expect("normal $sdk request vinculado",request!=null && EstadoWidget.pertenceACaptura(c,request))
    expect("normal $sdk commit antes do servico",c.commits==1 && EstadoWidget.atual(c)==EstadoWidget.PREPARANDO)
    expect("normal $sdk sem recibo de erro",c.notifications.attempts==0)
  }
  Build.VERSION.SDK_INT=33
  for(failure in listOf("commit-false","commit-false-apply-throws","commit-false-notify-throws","prefs-throws","redraw-throws","start-throws")) {
    val c=fresh()
    c.failCommit=failure.startsWith("commit-false")
    c.failApply=failure=="commit-false-apply-throws"
    c.failPrefs=failure=="prefs-throws"
    c.notifications.fail=failure=="commit-false-notify-throws"
    AppWidgetManager.current.failUpdate=failure=="redraw-throws"
    c.failStart=failure=="start-throws"
    expect("$failure zero escape",touch(c)==null)
    expect("$failure zero captura iniciada",c.starts.isEmpty())
    expect("$failure chamadas de start",c.startAttempts==if(failure=="start-throws") 1 else 0)
    expect("$failure recibo independente tentado",c.notifications.attempts==1)
    if(!c.notifications.fail) expect("$failure recibo entregue com canal inicialmente ausente",c.notifications.delivered==listOf(4712))
    else expect("$failure notificacao falha deixa log",Log.errors.any { it.contains("recibo da captura") })
    if(failure=="commit-false") {
      expect("commit false real exercitado",c.commits==1)
      expect("estado repetir",EstadoWidget.atual(c)==EstadoWidget.REPETIR)
    }
    if(failure=="commit-false-apply-throws") expect("falha secundaria registrada",Log.errors.any { it.contains("mostrar a falha") })
  }
  run {
    val c=fresh(); EstadoWidget.preparar(c,"capture-live"); EstadoWidget.definir(c,EstadoWidget.OUVINDO)
    c.starts.clear(); c.commits=0
    expect("ouvindo encerra sem escape",touch(c)==null)
    expect("ouvindo nao prepara de novo",c.commits==0)
    expect("ouvindo envia encerrar",c.starts.singleOrNull()?.action==GranaVoiceCaptureService.ACAO_ENCERRAR)
    expect("ouvindo sem recibo erro",c.notifications.attempts==0)
  }
  for(state in listOf(EstadoWidget.PREPARANDO,EstadoWidget.PROCESSANDO,EstadoWidget.PENDENTE)) {
    val c=fresh(); EstadoWidget.preparar(c,"busy"); EstadoWidget.definir(c,state); c.commits=0
    expect("$state ignora toque",touch(c)==null && c.starts.isEmpty() && c.commits==0 && c.notifications.attempts==0)
  }
  run {
    val c=fresh(); c.failPrefs=true
    val escaped=try { GranaVoiceWidgetProvider().onReceive(c,Intent().setAction("unrelated")); false } catch(e:Throwable) { true }
    expect("acao alheia nao acessa prefs",!escaped && c.starts.isEmpty() && c.notifications.attempts==0)
  }
  println("item24: $checks assercoes; ${failures.size} falhas")
  failures.forEach { println("FAIL: $it") }
  check(failures.isEmpty()) { "item24 nao aprovado" }
}
