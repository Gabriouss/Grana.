package com.gabriouss.grana.voicewidget

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.facebook.react.jstasks.HeadlessJsTaskContext
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit

private const val ID = "fala"
private const val DONO = "fixture-A"
private var checks = 0
private var failures = 0

private fun expect(ok: Boolean, label: String) {
  checks++
  if (!ok) failures++
  println("${if (ok) "OK" else "FAIL"} $label")
}

private fun fixture(body: (Context, File, VoiceRetryScheduler.Sessao) -> Unit) {
  val context = Context()
  try {
    VoiceRetryScheduler.definirDono(context, DONO)
    val origem = checkNotNull(VoiceRetryScheduler.sessao(context))
    EstadoWidget.preparar(context, ID)
    EstadoWidget.definir(context, EstadoWidget.PROCESSANDO)
    val pasta = File(context.filesDir, GranaVoiceCaptureService.PASTA_ORFA).apply { check(mkdir()) }
    Handler.errors.clear()
    HeadlessJsTaskContext.starts = 0
    body(context, pasta, origem)
    val drenou = CountDownLatch(1)
    Handler(Looper.getMainLooper()).post { drenou.countDown() }
    check(drenou.await(2, TimeUnit.SECONDS)) { "main sintético sem progresso" }
    check(Handler.errors.isEmpty()) { "callback de teste falhou: ${Handler.errors}" }
  } finally {
    context.filesDir.deleteRecursively()
  }
}

private fun worker(context: Context, origem: VoiceRetryScheduler.Sessao) = GranaVoiceRetryWorker(
  context, WorkerParameters(workDataOf("requestId" to ID, "userId" to origem.userId, "geracao" to origem.geracao)),
)

private fun parcial(pasta: File) = File(pasta, "$ID.capturando").apply { writeText("bytes-sinteticos") }
private fun meta(pasta: File) = File(pasta, "$ID.json")
private fun audio(pasta: File) = File(pasta, "$ID.m4a")

fun main() {
  for (tipo in listOf("ausente", "corrompido", "apenas temporário")) fixture { ctx, pasta, origem ->
    val fonte = parcial(pasta)
    if (tipo == "corrompido") meta(pasta).writeText("{invalid")
    val temporario = File(pasta, "$ID.json.tmp")
    if (tipo == "apenas temporário") temporario.writeText("""{"userId":"$DONO","capturaFinalizada":true}""")
    if (tipo == "corrompido") EstadoWidget.definir(ctx, EstadoWidget.PENDENTE)
    if (tipo == "apenas temporário") EstadoWidget.definir(ctx, EstadoWidget.OUVINDO)
    val comprovantes = mapOf(fonte to fonte.readBytes()) + listOf(meta(pasta), temporario)
      .filter { it.isFile }.associateWith { it.readBytes() }
    repeat(3) { tentativa ->
      expect(worker(ctx, origem).doWork() == Worker.Result.success(), "$tipo #${tentativa + 1}: encerra retry")
    }
    expect(EstadoWidget.atual(ctx) == EstadoWidget.REPETIR, "$tipo: widget pode tentar de novo")
    expect(ctx.notifications.receipts.size == 1, "$tipo: um recibo visível, sem duplicar")
    expect(ctx.notifications.titles.singleOrNull() == ctx.getString(R.string.grana_voice_interrompida_titulo), "$tipo: recibo de interrupção")
    expect(comprovantes.all { (f, bytes) -> f.isFile && f.readBytes().contentEquals(bytes) }, "$tipo: artefatos sem dono comprovado preservados")
    expect(!audio(pasta).exists() && HeadlessJsTaskContext.starts == 0, "$tipo: zero promoção/JS")
  }

  fixture { ctx, pasta, origem ->
    val fonte = parcial(pasta)
    EstadoWidget.preparar(ctx, "outra-fala")
    expect(worker(ctx, origem).doWork() == Worker.Result.success(), "nova captura: retry antigo termina")
    expect(EstadoWidget.pertenceACaptura(ctx, "outra-fala") && EstadoWidget.atual(ctx) == EstadoWidget.PREPARANDO,
      "nova captura conserva estado e identidade")
    expect(ctx.notifications.receipts.isEmpty(), "nova captura: sem recibo da intenção antiga")
    expect(fonte.exists() && !audio(pasta).exists() && HeadlessJsTaskContext.starts == 0,
      "nova captura: nenhuma adoção/destruição pela tentativa antiga")
  }

  fixture { ctx, pasta, origem ->
    val fonte = parcial(pasta)
    VoiceRetryScheduler.definirDono(ctx, "fixture-B")
    VoiceRetryScheduler.definirDono(ctx, DONO)
    expect(origem != VoiceRetryScheduler.sessao(ctx), "controle: geração mudou em A→B→A")
    expect(worker(ctx, origem).doWork() == Worker.Result.success(), "geração antiga termina sem retry")
    expect(EstadoWidget.atual(ctx) == EstadoWidget.PROCESSANDO && ctx.notifications.receipts.isEmpty(), "geração antiga não altera widget")
    expect(fonte.exists() && !audio(pasta).exists() && HeadlessJsTaskContext.starts == 0, "geração antiga não toca áudio/JS")
  }

  fixture { ctx, pasta, origem ->
    val fonte = parcial(pasta)
    check(meta(pasta).mkdir()) // O nome existe, mas abri-lo para ler como arquivo falha.
    check(runCatching { meta(pasta).readText() }.exceptionOrNull() is java.io.IOException)
    expect(worker(ctx, origem).doWork() == Worker.Result.retry(), "erro de leitura com entrada presente conserva retry")
    expect(EstadoWidget.atual(ctx) == EstadoWidget.PENDENTE && ctx.notifications.receipts.isEmpty(), "erro de leitura mantém pendente")
    expect(fonte.exists() && !audio(pasta).exists() && HeadlessJsTaskContext.starts == 0, "erro de leitura não toca áudio/JS")
    check(meta(pasta).delete())
    meta(pasta).writeText("""{"userId":"$DONO","capturaFinalizada":true}""")
    val retomada = worker(ctx, origem)
    val task = FutureTask { retomada.doWork() }
    Thread(task, "fixture-positive-retry").apply { isDaemon = true }.start()
    try {
      val fim = System.nanoTime() + TimeUnit.SECONDS.toNanos(2)
      while (HeadlessJsTaskContext.starts == 0 && !task.isDone && System.nanoTime() < fim) Thread.sleep(2)
      expect(!fonte.exists() && audio(pasta).isFile && audio(pasta).readText() == "bytes-sinteticos", "JSON finalizado válido permite promoção")
      expect(HeadlessJsTaskContext.starts == 1, "JSON finalizado válido inicia exatamente uma tarefa JS")
    } finally {
      retomada.onStopped()
      task.get(2, TimeUnit.SECONDS)
    }
  }

  fixture { ctx, pasta, origem ->
    val fonte = parcial(pasta)
    meta(pasta).writeText("""{"userId":"fixture-B","capturaFinalizada":true}""")
    expect(worker(ctx, origem).doWork() == Worker.Result.success(), "JSON de outro dono termina sem retry")
    expect(fonte.exists() && meta(pasta).exists() && !audio(pasta).exists() && HeadlessJsTaskContext.starts == 0,
      "JSON de outro dono preservado sem promover")
    expect(EstadoWidget.atual(ctx) == EstadoWidget.PROCESSANDO && ctx.notifications.receipts.isEmpty(), "outro dono não altera widget")
  }

  fixture { ctx, pasta, origem ->
    val fonte = parcial(pasta)
    meta(pasta).writeText("""{"userId":"$DONO","capturaFinalizada":false}""")
    expect(worker(ctx, origem).doWork() == Worker.Result.success(), "captura comprovadamente incompleta encerra")
    expect(!fonte.exists() && !meta(pasta).exists() && !audio(pasta).exists() && HeadlessJsTaskContext.starts == 0,
      "mantém limpeza existente de parcial com dono comprovado")
    expect(EstadoWidget.atual(ctx) == EstadoWidget.REPETIR && ctx.notifications.receipts.size == 1, "mantém recibo de parcial conhecido")
  }

  println("RESULT item=25 assertions=$checks failed=$failures")
  if (failures != 0) kotlin.system.exitProcess(1)
}
