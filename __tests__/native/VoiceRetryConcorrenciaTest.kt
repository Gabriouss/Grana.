package com.gabriouss.grana.voicewidget

import android.content.Context
import androidx.work.WorkManager
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.workDataOf
import androidx.work.WorkerParameters
import androidx.work.Worker
import com.facebook.react.jstasks.HeadlessJsTaskContext
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit

private fun <T> concorrente(acao: () -> T): FutureTask<T> = FutureTask<T> { acao() }.also {
  Thread(it, "fixture-concorrencia").apply { isDaemon = true }.start()
}

fun main() {
  val manager = WorkManager.instance
  for (etapa in listOf("enqueue", "query", "update")) {
    manager.reset()
    val ctx = Context()
    VoiceRetryScheduler.definirDono(ctx, "fixture-A")
    val primeira = checkNotNull(VoiceRetryScheduler.sessao(ctx))
    EstadoWidget.preparar(ctx, "fala")
    EstadoWidget.definir(ctx, EstadoWidget.PENDENTE)
    if (etapa != "enqueue") check(VoiceRetryScheduler.agendar(ctx, "fala", "fixture-A", 150_000))
    manager.blocked = etapa
    manager.waitEntered = CountDownLatch(1)
    val antiga = concorrente { VoiceRetryScheduler.agendar(ctx, "fala", "fixture-A") }
    check(manager.waitEntered.await(2, TimeUnit.SECONDS)) { "não chegou ao future $etapa" }
    try {
      // Estas duas entradas usam os monitores reais que antes esperavam o get.
      val ack = concorrente {
        VoiceRetryScheduler.definirDono(ctx, "fixture-A")
        EstadoWidget.definirDaRetomada(ctx, "fala", "fixture-A", EstadoWidget.OCIOSO)
      }
      check(ack.get(1, TimeUnit.SECONDS)) { "ACK não concluiu com $etapa bloqueado" }
      check(!antiga.isDone) { "a agenda confirmou sem persistência" }
      val novoToque = concorrente { EstadoWidget.preparar(ctx, "captura-nova") }
      novoToque.get(1, TimeUnit.SECONDS)
      check(EstadoWidget.pertenceACaptura(ctx, "captura-nova"))
      manager.deferCancel = true
      concorrente {
        VoiceRetryScheduler.definirDono(ctx, "fixture-B")
        VoiceRetryScheduler.definirDono(ctx, "fixture-A")
      }.get(1, TimeUnit.SECONDS)
      val nova = checkNotNull(VoiceRetryScheduler.sessao(ctx))
      check(primeira != nova && !VoiceRetryScheduler.atual(ctx, primeira))
      // Mesmo requestId, mesmo A, geração nova: a limpeza antiga não o alcança.
      check(VoiceRetryScheduler.agendar(ctx, "fala", "fixture-A", 150_000, nova.geracao))
      val idNovo = manager.active().single { it.inputData.getString("geracao") == nova.geracao }.id
      manager.release()
      check(!antiga.get(2, TimeUnit.SECONDS)) { "agenda antiga voltou true após A->B->A" }
      manager.deferred.forEach { it() }
      check(manager.active().map { it.id } == listOf(idNovo)) { "cancelamento antigo atingiu geração nova" }
      check(manager.calls.none { it == "cancelTag:${VoiceRetryScheduler.tagDoDono("fixture-A")}" })
      check(!VoiceRetryScheduler.agendar(ctx, "outro", "fixture-A", 150_000, primeira.geracao))
      println("OK $etapa bloqueado: ACK/toque/dono livres, durabilidade e A->B->A preservados")
    } finally { manager.release() }
  }
  manager.reset()
  val ctx = Context()
  VoiceRetryScheduler.definirDono(ctx, "fixture-A")
  check(VoiceRetryScheduler.agendar(ctx, "identidade", "fixture-A", 150_000))
  val id = manager.active().single().id
  check(VoiceRetryScheduler.agendar(ctx, "identidade", "fixture-A"))
  check(manager.active().single().id == id && manager.active().single().delay == 0L)
  VoiceRetryScheduler.cancelar(ctx, "identidade", "fixture-A")
  check(manager.active().isEmpty())
  println("OK KEEP conserva identidade, antecipa watchdog e cancelamento explícito continua funcionando")
  manager.reset()
  val legado = Context()
  legado.getSharedPreferences("grana_voice_owner", Context.MODE_PRIVATE).edit().putString("userId", "fixture-A").commit()
  val antiga = OneTimeWorkRequestBuilder<GranaVoiceRetryWorker>()
    .setInputData(workDataOf("requestId" to "legada", "userId" to "fixture-A"))
    .addTag(VoiceRetryScheduler.tagDoDono("fixture-A")).build()
  manager.requests["legado"] = antiga
  manager.blocked = "legacy"
  VoiceRetryScheduler.definirDono(legado, "fixture-B")
  check(manager.waitEntered.await(2, TimeUnit.SECONDS)) { "consulta do legado não esperou fora do monitor" }
  try {
    concorrente { VoiceRetryScheduler.definirDono(legado, "fixture-A") }.get(1, TimeUnit.SECONDS)
    check(VoiceRetryScheduler.agendar(legado, "legada", "fixture-A", 150_000))
    val nova = manager.active().single { it.id != antiga.id }.id
    manager.release()
    check(manager.legacyCancelled.await(2, TimeUnit.SECONDS))
    check(manager.active().single().id == nova) { "limpeza legada atingiu nova geração" }
    println("OK migração de agenda sem geração cancela por ID e preserva o novo A")
  } finally { manager.release() }
  val origem = checkNotNull(VoiceRetryScheduler.sessao(ctx))
  VoiceRetryScheduler.definirDono(ctx, "fixture-B")
  VoiceRetryScheduler.definirDono(ctx, "fixture-A")
  EstadoWidget.preparar(ctx, "audio-antigo")
  EstadoWidget.definir(ctx, EstadoWidget.PENDENTE)
  val pasta = File(ctx.filesDir, GranaVoiceCaptureService.PASTA_ORFA).apply { mkdirs() }
  val parcial = File(pasta, "audio-antigo.capturando").apply { writeText("fixture") }
  val meta = File(pasta, "audio-antigo.json").apply { writeText("{\"userId\":\"fixture-A\",\"capturaFinalizada\":false}") }
  for (geracao in listOf(origem.geracao, "")) {
    val worker = GranaVoiceRetryWorker(ctx, WorkerParameters(workDataOf("requestId" to "audio-antigo", "userId" to "fixture-A", "geracao" to geracao)))
    check(worker.doWork() == Worker.Result.success())
    check(parcial.exists() && meta.exists() && EstadoWidget.atual(ctx) == EstadoWidget.PENDENTE)
  }
  check(HeadlessJsTaskContext.starts == 0)
  println("OK Worker real recusa geração antiga/legada após A->B->A, sem mexer áudio/estado/JS")
  EstadoWidget.preparar(legado, "parcial-legada")
  // Geração ausente é compatível enquanto a sessão legada não foi trocada.
  val intacta = Context()
  intacta.getSharedPreferences("grana_voice_owner", Context.MODE_PRIVATE).edit().putString("userId", "fixture-A").commit()
  EstadoWidget.preparar(intacta, "parcial-legada")
  val pastaLegada = File(intacta.filesDir, GranaVoiceCaptureService.PASTA_ORFA).apply { mkdirs() }
  val audioLegado = File(pastaLegada, "parcial-legada.capturando").apply { writeText("fixture") }
  val metaLegada = File(pastaLegada, "parcial-legada.json").apply { writeText("{\"userId\":\"fixture-A\",\"capturaFinalizada\":false}") }
  val workerLegado = GranaVoiceRetryWorker(intacta, WorkerParameters(workDataOf("requestId" to "parcial-legada", "userId" to "fixture-A")))
  check(workerLegado.doWork() == Worker.Result.success())
  check(!audioLegado.exists() && !metaLegada.exists() && EstadoWidget.atual(intacta) == EstadoWidget.REPETIR)
  println("OK Worker real mantém recuperação segura de captura legada sem stop confirmado")
}
