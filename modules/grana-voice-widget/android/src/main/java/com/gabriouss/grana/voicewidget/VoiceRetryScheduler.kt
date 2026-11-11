package com.gabriouss.grana.voicewidget

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkInfo
import androidx.work.workDataOf
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.concurrent.Executors
import java.util.UUID
import android.util.Log

/** O dono é anotado pela sessão ANTES de abrir o microfone, nunca na adoção. */
object VoiceRetryScheduler {
  private const val PREFS = "grana_voice_owner"
  private const val DONO = "userId"
  private const val GERACAO = "geracao"
  private val limpeza = Executors.newSingleThreadExecutor { tarefa ->
    Thread(tarefa, "grana-voz-agendas-antigas").apply { isDaemon = true }
  }

  internal data class Sessao(val userId: String, val geracao: String)

  @Synchronized
  internal fun sessao(context: Context): Sessao? = dono(context)?.let {
    Sessao(it, context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(GERACAO, "").orEmpty())
  }

  @Synchronized
  internal fun atual(context: Context, origem: Sessao): Boolean = sessao(context) == origem

  fun dono(context: Context): String? = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    .getString(DONO, null)?.takeIf { it.isNotBlank() }

  fun definirDono(context: Context, userId: String?) {
    val novo = userId?.takeIf { it.isNotBlank() }
    val anterior = synchronized(this) {
      val antes = sessao(context)
      if (antes?.userId == novo) return
      check(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
        if (novo == null) remove(DONO) else putString(DONO, novo)
        putString(GERACAO, UUID.randomUUID().toString())
      }.commit()) { "Não foi possível guardar o dono da captura" }
      antes
    }
    // Nenhuma espera do WorkManager segura o monitor que o ACK/receiver usa.
    if (anterior != null) {
      val manager = WorkManager.getInstance(context)
      manager.cancelAllWorkByTag(tagDaGeracao(anterior))
      if (anterior.geracao.isEmpty()) limpeza.execute {
        try {
          // Upgrade: os trabalhos legados não têm tag de geração. Cancelar
          // seus IDs, nunca a tag do dono, que também alcançaria um novo A.
          manager.getWorkInfosByTag(tagDoDono(anterior.userId)).get(10, TimeUnit.SECONDS)
            .filter { info -> info.tags.none { it.startsWith(PREFIXO_GERACAO) } }
            .forEach { manager.cancelWorkById(it.id) }
        } catch (erro: Exception) {
          Log.w("GranaVoz", "não consegui cancelar agendas da sessão anterior", erro)
        }
      }
    }
  }

  private fun hash(texto: String): String = MessageDigest.getInstance("SHA-256")
    .digest(texto.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

  private fun nome(requestId: String, userId: String) = "grana-voz-${hash("$userId:$requestId")}" 
  internal fun tagDoDono(userId: String) = "grana-voz-dono-${hash(userId)}"
  private const val PREFIXO_GERACAO = "grana-voz-geracao-"
  private fun tagDaGeracao(sessao: Sessao) = PREFIXO_GERACAO + hash("${sessao.userId}:${sessao.geracao}")
  private fun nome(requestId: String, sessao: Sessao) = if (sessao.geracao.isEmpty()) nome(requestId, sessao.userId)
    else "${nome(requestId, sessao.userId)}-${hash(sessao.geracao)}"

  fun agendar(context: Context, requestId: String, userId: String, atrasoMs: Long = 0, geracaoEsperada: String? = null): Boolean {
    require(requestId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "requestId inválido" }
    val origem = sessao(context) ?: return false
    if (origem.userId != userId || (geracaoEsperada != null && origem.geracao != geracaoEsperada)) return false
    fun pedido() = OneTimeWorkRequestBuilder<GranaVoiceRetryWorker>()
      .setInputData(workDataOf("requestId" to requestId, "userId" to userId, "geracao" to origem.geracao))
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
      .setInitialDelay(atrasoMs.coerceAtLeast(0), TimeUnit.MILLISECONDS)
      .addTag(tagDoDono(userId))
      .addTag(tagDaGeracao(origem))
    // Só confirma a agenda depois que o WorkManager a gravou no banco.
    val manager = WorkManager.getInstance(context)
    val nomeDaAgenda = nome(requestId, origem)
    try {
      manager.enqueueUniqueWork(nomeDaAgenda, ExistingWorkPolicy.KEEP, pedido().build())
        .result.get(10, TimeUnit.SECONDS)
      if (!atual(context, origem)) return false
      if (atrasoMs == 0L) {
        val existente = manager.getWorkInfosForUniqueWork(nomeDaAgenda).get(10, TimeUnit.SECONDS)
          .firstOrNull { !it.state.isFinished }
        if (!atual(context, origem)) return false
        // Antecipa o watchdog da captura, conservando a MESMA WorkRequest.
        // Nunca substitui/cancela uma execução nem afrouxa seu backoff.
        if (existente?.state == WorkInfo.State.ENQUEUED && existente.runAttemptCount == 0 &&
          existente.nextScheduleTimeMillis > System.currentTimeMillis() + 100) {
          manager.updateWork(pedido().setId(existente.id).build()).get(10, TimeUnit.SECONDS)
        }
      }
      return atual(context, origem)
    } finally {
      // Mesmo se enqueue concluiu DEPOIS da troca/limpeza, só esta geração
      // é cancelada. A->B->A tem outro nome e permanece durável.
      if (!atual(context, origem)) manager.cancelUniqueWork(nomeDaAgenda)
    }
  }

  fun cancelar(context: Context, requestId: String, userId: String) {
    val origem = sessao(context) ?: return
    if (origem.userId != userId) return
    WorkManager.getInstance(context).cancelUniqueWork(nome(requestId, origem)).result.get(10, TimeUnit.SECONDS)
  }
}
