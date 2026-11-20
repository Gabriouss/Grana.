package com.gabriouss.grana.voicewidget

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.io.File
import java.io.FileNotFoundException
import org.json.JSONException
import org.json.JSONObject

/** WorkManager mantém o processo; ReactHost inicia JS diretamente, sem FGS ou Activity. */
class GranaVoiceRetryWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  companion object {
    const val WATCHDOG_MS = 150_000L
    private data class Execucao(val sinal: CountDownLatch = CountDownLatch(1), @Volatile var resultado: String? = null)
    private val execucoes = ConcurrentHashMap<String, Execucao>()

    fun concluir(execucaoId: String, resultado: String) {
      require(resultado in setOf("concluida", "tentar_novamente", "aguardar_usuario"))
      execucoes[execucaoId]?.let {
        synchronized(it) {
          if (it.resultado == null) it.resultado = resultado
          it.sinal.countDown()
        }
      }
    }
  }

  private val main = Handler(Looper.getMainLooper())
  private val execucaoId = UUID.randomUUID().toString()
  @Volatile private var tarefa: Pair<HeadlessJsTaskContext, Int>? = null
  @Volatile private var encerrado = false
  private var removerListener: (() -> Unit)? = null

  override fun doWork(): Result {
    val requestId = inputData.getString("requestId") ?: return Result.failure()
    if (!requestId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) return Result.failure()
    val userId = inputData.getString("userId") ?: return Result.failure()
    val origem = VoiceRetryScheduler.Sessao(userId, inputData.getString("geracao").orEmpty())
    if (!VoiceRetryScheduler.atual(applicationContext, origem)) return Result.success()
    try {
      val pasta = File(applicationContext.filesDir, GranaVoiceCaptureService.PASTA_ORFA)
      val parcial = File(pasta, "$requestId.capturando")
      if (parcial.exists()) {
        val metadados = File(pasta, "$requestId.json")
        val meta = try {
          JSONObject(metadados.readText())
        } catch (erro: FileNotFoundException) {
          // FileNotFoundException também pode indicar falha de acesso: confirme a ausência.
          if (pasta.list()?.contains(metadados.name) != false) throw erro
          return encerrarSemMetadados(requestId, origem)
        } catch (_: JSONException) {
          // O serviço publica o JSON por rename; o temporário nunca serve como prova de dono.
          return encerrarSemMetadados(requestId, origem)
        }
        if (meta.optString("userId") != userId) return Result.success()
        if (!meta.optBoolean("capturaFinalizada", false)) {
          // Áudio cujo stop não foi confirmado nunca vai para a transcrição.
          parcial.delete()
          File(pasta, "$requestId.json").delete()
          if (EstadoWidget.definirDaCaptura(applicationContext, requestId, EstadoWidget.REPETIR)) {
            VoiceCaptureReceipt.publicar(applicationContext, R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto)
          }
          return Result.success()
        }
        check(parcial.renameTo(File(pasta, "$requestId.m4a"))) { "áudio concluído não pôde ser recuperado" }
      }
      // WT01: o processo pode morrer antes do journal/arquivo, inclusive
      // antes da agenda. A recuperação é da mesma intenção e deixa recibo.
      if (EstadoWidget.recuperarCapturaInterrompida(applicationContext, requestId)) return Result.success()
    } catch (erro: Exception) {
      Log.e("GranaVoz", "captura guardada não pôde ser recuperada", erro)
      EstadoWidget.definirDaCaptura(applicationContext, requestId, EstadoWidget.PENDENTE)
      return Result.retry()
    }
    val execucao = Execucao()
    execucoes[execucaoId] = execucao
    try {
      main.post {
        try {
          if (encerrado || isStopped || !VoiceRetryScheduler.atual(applicationContext, origem)) {
            concluir(execucaoId, "aguardar_usuario")
            return@post
          }
          val app = applicationContext as ReactApplication
          val host = checkNotNull(app.reactHost) { "ReactHost ausente" }
          fun iniciar(context: ReactContext) {
            if (encerrado || isStopped || !VoiceRetryScheduler.atual(applicationContext, origem)) return
            val dados = Arguments.createMap().apply {
              putString("requestId", requestId)
              putString("userId", userId)
              putString("execucaoId", execucaoId)
            }
            val headless = HeadlessJsTaskContext.getInstance(context)
            tarefa = headless to headless.startTask(HeadlessJsTaskConfig("GranaVoiceRetryTask", dados, 120_000, true))
          }
          val contexto = host.currentReactContext
          if (contexto != null) iniciar(contexto)
          else {
            val listener = object : ReactInstanceEventListener {
              override fun onReactContextInitialized(context: ReactContext) {
                host.removeReactInstanceEventListener(this)
                removerListener = null
                try { iniciar(context) } catch (erro: Exception) {
                  Log.e("GranaVoz", "não consegui iniciar a retomada JS", erro)
                  concluir(execucaoId, "tentar_novamente")
                }
              }
            }
            removerListener = { host.removeReactInstanceEventListener(listener) }
            host.addReactInstanceEventListener(listener)
            host.start()
          }
        } catch (erro: Exception) {
          Log.e("GranaVoz", "não consegui preparar a retomada JS", erro)
          concluir(execucaoId, "tentar_novamente")
        }
      }
      // A conclusão da tarefa RN sozinha não é ACK: JS precisa confirmar seu desfecho.
      if (!execucao.sinal.await(WATCHDOG_MS, TimeUnit.MILLISECONDS) || isStopped) {
        Log.w("GranaVoz", "retomada sem confirmação no prazo; WorkManager tentará novamente")
        if (VoiceRetryScheduler.atual(applicationContext, origem)) EstadoWidget.definirDaCaptura(applicationContext, requestId, EstadoWidget.PENDENTE)
        return Result.retry()
      }
      return if (execucao.resultado == "tentar_novamente") Result.retry() else Result.success()
    } catch (erro: InterruptedException) {
      Thread.currentThread().interrupt()
      return Result.retry()
    } finally {
      encerrar()
    }
  }

  private fun encerrarSemMetadados(requestId: String, origem: VoiceRetryScheduler.Sessao): Result {
    Log.w("GranaVoz", "captura parcial sem metadados públicos válidos; não será retomada")
    // Sem prova de dono, mantenha o parcial isolado e não o promova nem o apague.
    try {
      val sinalizar = synchronized(EstadoWidget) {
        synchronized(VoiceRetryScheduler) {
          val podeSinalizar = VoiceRetryScheduler.atual(applicationContext, origem) &&
            EstadoWidget.atual(applicationContext) in setOf(
              EstadoWidget.PREPARANDO, EstadoWidget.OUVINDO, EstadoWidget.PROCESSANDO, EstadoWidget.PENDENTE,
            ) && EstadoWidget.pertenceACaptura(applicationContext, requestId)
          if (podeSinalizar) {
            try { EstadoWidget.definirDaCaptura(applicationContext, requestId, EstadoWidget.REPETIR) }
            catch (falha: Exception) { Log.e("GranaVoz", "não consegui atualizar o widget após a captura interrompida", falha) }
          }
          podeSinalizar
        }
      }
      if (sinalizar) VoiceCaptureReceipt.publicar(
        applicationContext, R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto,
      )
    } catch (falha: Exception) {
      Log.e("GranaVoz", "não consegui indicar a captura interrompida", falha)
    }
    return Result.success()
  }

  private fun encerrar() {
    encerrado = true
    execucoes.remove(execucaoId)?.sinal?.countDown()
    main.post {
      removerListener?.invoke()
      removerListener = null
      tarefa?.let { (contexto, id) -> contexto.finishTask(id) }
      tarefa = null
    }
  }

  override fun onStopped() { encerrar() }
}
