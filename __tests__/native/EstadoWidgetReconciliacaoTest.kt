package com.gabriouss.grana.voicewidget

import android.content.Context
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicReference

/** Executado por voz-widget-reconciliacao-nativa.cjs contra EstadoWidget.kt real. */
fun main() {
  var checks = 0
  val estados = listOf("pendente", "processando", "preparando", "ouvindo", "repetir", "atencao", "ocioso")
  val retornos = listOf("pendente", "processando", "repetir", "atencao", "ocioso")
  for (estado in estados) {
    for (mesmoRequest in listOf(true, false)) for (mesmoDono in listOf(true, false)) {
      for (retorno in retornos) {
        val context = Context()
        VoiceRetryScheduler.usuario = if (mesmoDono) "a" else "b"
        EstadoWidget.preparar(context, if (mesmoRequest) "antiga" else "nova")
        EstadoWidget.definir(context, estado)
        val esperado = mesmoRequest && mesmoDono && estado in listOf("pendente", "processando")
        check(EstadoWidget.definirDaRetomada(context, "antiga", "a", retorno) == esperado) {
          "retorno: $estado -> $retorno / $mesmoRequest / $mesmoDono"
        }; checks++
        check(EstadoWidget.atual(context) == if (esperado) retorno else estado) {
          "estado: $estado -> $retorno / $mesmoRequest / $mesmoDono"
        }; checks++
      }
      val context = Context()
      VoiceRetryScheduler.usuario = if (mesmoDono) "a" else "b"
      EstadoWidget.preparar(context, if (mesmoRequest) "antiga" else "nova")
      EstadoWidget.definir(context, estado)
      val esperado = mesmoRequest && mesmoDono && estado in listOf("pendente", "processando")
      check(EstadoWidget.reconciliarConcluida(context, "antiga", "a") == esperado); checks++
      check(EstadoWidget.atual(context) == if (esperado) "ocioso" else estado); checks++
    }
  }

  // Compete a preparação da captura nova com o retorno financeiro antigo.
  // Independentemente da ordem dos dois, o resultado deve ser PREPARANDO nova.
  for (retorno in retornos) repeat(20) {
    val context = Context()
    VoiceRetryScheduler.usuario = "a"
    EstadoWidget.preparar(context, "antiga")
    EstadoWidget.definir(context, "pendente")
    val inicio = CountDownLatch(1)
    val erro = AtomicReference<Throwable?>()
    val nova = Thread {
      try { inicio.await(); EstadoWidget.preparar(context, "nova") }
      catch (e: Throwable) { erro.set(e) }
    }
    val antiga = Thread {
      try { inicio.await(); EstadoWidget.definirDaRetomada(context, "antiga", "a", retorno) }
      catch (e: Throwable) { erro.set(e) }
    }
    nova.start(); antiga.start(); inicio.countDown()
    nova.join(5000); antiga.join(5000)
    check(!nova.isAlive && !antiga.isAlive && erro.get() == null); checks++
    check(EstadoWidget.atual(context) == "preparando" && EstadoWidget.pertenceACaptura(context, "nova")); checks++
  }
  println("OK: $checks verificacoes JVM EstadoWidget.kt real; dono, requestId, estados e disputa entre threads.")
}
