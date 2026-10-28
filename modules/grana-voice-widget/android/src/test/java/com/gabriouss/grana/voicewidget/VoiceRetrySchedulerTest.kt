package com.gabriouss.grana.voicewidget

import android.content.Context
import android.app.Application
import android.app.NotificationManager
import android.content.Intent
import androidx.work.Configuration
import androidx.work.NetworkType
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.ListenableWorker
import androidx.work.workDataOf
import androidx.work.testing.SynchronousExecutor
import androidx.work.testing.TestWorkerBuilder
import androidx.work.testing.WorkManagerTestInitHelper
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.util.concurrent.TimeUnit
import java.io.File

/** Scheduler real e banco real do WorkManager; a rede fica não satisfeita no test driver. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class VoiceRetrySchedulerTest {
  private lateinit var context: Context
  private lateinit var manager: WorkManager

  @Before fun preparar() {
    context = RuntimeEnvironment.getApplication()
    WorkManagerTestInitHelper.initializeTestWorkManager(context,
      Configuration.Builder().setExecutor(SynchronousExecutor()).build())
    manager = WorkManager.getInstance(context)
    VoiceRetryScheduler.definirDono(context, "AUDIT-A")
  }

  private fun ativos(): List<WorkInfo> = manager.getWorkInfosByTag(VoiceRetryScheduler.tagDoDono("AUDIT-A"))
    .get(5, TimeUnit.SECONDS).filter { !it.state.isFinished }

  @Test fun agendaUnicaPreservaIdentidadeEAntecipaWatchdogSemAdiar() {
    assertTrue(VoiceRetryScheduler.agendar(context, "fala-1", "AUDIT-A", 150_000))
    val primeiro = ativos().single()
    assertEquals(NetworkType.CONNECTED, primeiro.constraints.requiredNetworkType)
    assertTrue(primeiro.nextScheduleTimeMillis > System.currentTimeMillis() + 100_000)
    assertTrue(VoiceRetryScheduler.agendar(context, "fala-1", "AUDIT-A"))
    val pronto = ativos().single()
    assertEquals(primeiro.id, pronto.id)
    assertTrue(pronto.nextScheduleTimeMillis <= System.currentTimeMillis() + 1000)
    assertTrue(VoiceRetryScheduler.agendar(context, "fala-1", "AUDIT-A", 150_000))
    assertEquals(pronto.id, ativos().single().id)
    assertTrue(ativos().single().nextScheduleTimeMillis <= System.currentTimeMillis() + 1000)
  }

  @Test fun contaMudouCancelaAgendaAntigaERecusaSeuReagendamento() {
    assertTrue(VoiceRetryScheduler.agendar(context, "fala-1", "AUDIT-A", 150_000))
    val anterior = ativos().single().id
    VoiceRetryScheduler.definirDono(context, "AUDIT-B")
    assertEquals(WorkInfo.State.CANCELLED, requireNotNull(manager.getWorkInfoById(anterior).get()).state)
    assertFalse(VoiceRetryScheduler.agendar(context, "fala-1", "AUDIT-A"))
    assertTrue(VoiceRetryScheduler.agendar(context, "fala-1", "AUDIT-B", 150_000))
    assertTrue(ativos().isEmpty())
    val nova = manager.getWorkInfosByTag(VoiceRetryScheduler.tagDoDono("AUDIT-B")).get().single()
    assertNotEquals(anterior, nova.id)
  }

  @Test fun cancelamentoExplicitoELogoutEncerramTrabalhoDoDono() {
    assertTrue(VoiceRetryScheduler.agendar(context, "fala-1", "AUDIT-A", 150_000))
    VoiceRetryScheduler.cancelar(context, "fala-1", "AUDIT-A")
    assertTrue(ativos().isEmpty())
    assertTrue(VoiceRetryScheduler.agendar(context, "fala-2", "AUDIT-A", 150_000))
    VoiceRetryScheduler.definirDono(context, null)
    assertNull(VoiceRetryScheduler.dono(context))
    assertTrue(ativos().isEmpty())
    assertFalse(VoiceRetryScheduler.agendar(context, "fala-3", "AUDIT-A"))
  }

  @Test(expected = IllegalArgumentException::class)
  fun requestIdNaoPodeEscaparDaPastaPrivada() {
    VoiceRetryScheduler.agendar(context, "../outra-fala", "AUDIT-A")
  }

  private fun worker(requestId: String, userId: String) = TestWorkerBuilder<GranaVoiceRetryWorker>(
    context = context, executor = SynchronousExecutor(),
    inputData = workDataOf("requestId" to requestId, "userId" to userId),
  ).build()

  @Test fun workerRecusaCaminhoInvalidoAntesDeLerArquivos() {
    assertEquals(ListenableWorker.Result.failure(), worker("../fora", "AUDIT-A").doWork())
  }

  @Test fun workerNaoAdotaNemDescartaCapturaDeOutraConta() {
    val pasta = File(context.filesDir, GranaVoiceCaptureService.PASTA_ORFA).apply { mkdirs() }
    val audio = File(pasta, "fala-antiga.capturando").apply { writeText("audio-A") }
    val meta = File(pasta, "fala-antiga.json").apply { writeText("{\"userId\":\"AUDIT-A\",\"capturaFinalizada\":false}") }
    VoiceRetryScheduler.definirDono(context, "AUDIT-B")
    assertEquals(ListenableWorker.Result.success(), worker("fala-antiga", "AUDIT-A").doWork())
    assertEquals("audio-A", audio.readText())
    assertTrue(meta.exists())
  }

  @Test fun workerNaoEntregaCapturaSemConfirmacaoDeStopAoJavaScript() {
    EstadoWidget.preparar(context, "fala-parcial")
    val pasta = File(context.filesDir, GranaVoiceCaptureService.PASTA_ORFA).apply { mkdirs() }
    val audio = File(pasta, "fala-parcial.capturando").apply { writeText("audio-parcial") }
    val meta = File(pasta, "fala-parcial.json").apply { writeText("{\"userId\":\"AUDIT-A\",\"capturaFinalizada\":false}") }
    assertEquals(ListenableWorker.Result.success(), worker("fala-parcial", "AUDIT-A").doWork())
    assertFalse(audio.exists())
    assertFalse(meta.exists())
    assertFalse(File(pasta, "fala-parcial.m4a").exists())
    assertEquals(EstadoWidget.REPETIR, EstadoWidget.atual(context))
  }

  @Test fun workerRecuperaPreparacaoSemArquivoOuJournalComRecibo() {
    EstadoWidget.preparar(context, "antes-journal", System.currentTimeMillis() - 60_001)
    assertEquals(ListenableWorker.Result.success(), worker("antes-journal", "AUDIT-A").doWork())
    assertEquals(EstadoWidget.REPETIR, EstadoWidget.atual(context))
    val notificacoes = shadowOf(context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).allNotifications
    assertEquals(1, notificacoes.size)
    assertEquals(context.getString(R.string.grana_voice_interrompida_titulo), notificacoes.single().extras.getString("android.title"))
  }

  @Test fun toqueRecuperaMorteAntesDaAgendaSemAbrirActivity() {
    EstadoWidget.preparar(context, "antes-agenda")
    context.getSharedPreferences("grana_voice_widget", Context.MODE_PRIVATE).edit()
      .putString("processoCaptura", "processo-encerrado").commit()
    GranaVoiceWidgetProvider().onReceive(context, Intent(GranaVoiceWidgetProvider.ACAO_TOQUE))
    assertEquals(EstadoWidget.PREPARANDO, EstadoWidget.atual(context))
    assertFalse(EstadoWidget.pertenceACaptura(context, "antes-agenda"))
    val app = shadowOf(context as Application)
    assertNull(app.nextStartedActivity)
    val servico = requireNotNull(app.nextStartedService)
    assertEquals(GranaVoiceCaptureService.ACAO_INICIAR, servico.action)
    assertTrue(EstadoWidget.pertenceACaptura(context, requireNotNull(servico.getStringExtra("requestId"))))
  }

  @Test fun toqueNaoReiniciaPreparacaoViva() {
    EstadoWidget.preparar(context, "preparacao-viva")
    GranaVoiceWidgetProvider().onReceive(context, Intent(GranaVoiceWidgetProvider.ACAO_TOQUE))
    assertTrue(EstadoWidget.pertenceACaptura(context, "preparacao-viva"))
    assertEquals(EstadoWidget.PREPARANDO, EstadoWidget.atual(context))
    assertNull(shadowOf(context as Application).nextStartedService)
    assertNull(shadowOf(context as Application).nextStartedActivity)
  }

  @Test fun recuperacaoAntigaNaoSobrescreveCapturaNova() {
    EstadoWidget.preparar(context, "captura-nova")
    assertFalse(EstadoWidget.recuperarCapturaInterrompida(context, "captura-antiga", System.currentTimeMillis() + 150_000))
    assertTrue(EstadoWidget.pertenceACaptura(context, "captura-nova"))
    assertEquals(EstadoWidget.PREPARANDO, EstadoWidget.atual(context))
  }

  @Test fun parcialAntigaNaoSobrescreveNemNotificaDuranteCapturaNova() {
    EstadoWidget.preparar(context, "captura-nova")
    val pasta = File(context.filesDir, GranaVoiceCaptureService.PASTA_ORFA).apply { mkdirs() }
    File(pasta, "parcial-antiga.capturando").writeText("audio-parcial")
    File(pasta, "parcial-antiga.json").writeText("{\"userId\":\"AUDIT-A\",\"capturaFinalizada\":false}")
    assertEquals(ListenableWorker.Result.success(), worker("parcial-antiga", "AUDIT-A").doWork())
    assertTrue(EstadoWidget.pertenceACaptura(context, "captura-nova"))
    assertEquals(EstadoWidget.PREPARANDO, EstadoWidget.atual(context))
    assertTrue(shadowOf(context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).allNotifications.isEmpty())
  }
}
