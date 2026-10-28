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

/** O dono é anotado pela sessão ANTES de abrir o microfone, nunca na adoção. */
object VoiceRetryScheduler {
  private const val PREFS = "grana_voice_owner"
  private const val DONO = "userId"

  fun dono(context: Context): String? = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    .getString(DONO, null)?.takeIf { it.isNotBlank() }

  @Synchronized
  fun definirDono(context: Context, userId: String?) {
    val anterior = dono(context)
    if (anterior == userId) return
    check(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
      if (userId.isNullOrBlank()) remove(DONO) else putString(DONO, userId)
    }.commit()) { "Não foi possível guardar o dono da captura" }
    if (anterior != null) WorkManager.getInstance(context).cancelAllWorkByTag(tagDoDono(anterior))
  }

  private fun hash(texto: String): String = MessageDigest.getInstance("SHA-256")
    .digest(texto.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

  private fun nome(requestId: String, userId: String) = "grana-voz-${hash("$userId:$requestId")}" 
  internal fun tagDoDono(userId: String) = "grana-voz-dono-${hash(userId)}"

  @Synchronized
  fun agendar(context: Context, requestId: String, userId: String, atrasoMs: Long = 0): Boolean {
    require(requestId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "requestId inválido" }
    if (userId.isBlank() || dono(context) != userId) return false
    fun pedido() = OneTimeWorkRequestBuilder<GranaVoiceRetryWorker>()
      .setInputData(workDataOf("requestId" to requestId, "userId" to userId))
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
      .setInitialDelay(atrasoMs.coerceAtLeast(0), TimeUnit.MILLISECONDS)
      .addTag(tagDoDono(userId))
    // Só confirma a agenda depois que o WorkManager a gravou no banco.
    val manager = WorkManager.getInstance(context)
    manager.enqueueUniqueWork(nome(requestId, userId), ExistingWorkPolicy.KEEP, pedido().build())
      .result.get(10, TimeUnit.SECONDS)
    if (atrasoMs == 0L) {
      val existente = manager.getWorkInfosForUniqueWork(nome(requestId, userId)).get(10, TimeUnit.SECONDS)
        .firstOrNull { !it.state.isFinished }
      // Antecipa o watchdog da captura, conservando a MESMA WorkRequest.
      // Nunca substitui/cancela uma execução nem afrouxa seu backoff.
      if (existente?.state == WorkInfo.State.ENQUEUED && existente.runAttemptCount == 0 &&
        existente.nextScheduleTimeMillis > System.currentTimeMillis() + 100) {
        manager.updateWork(pedido().setId(existente.id).build()).get(10, TimeUnit.SECONDS)
      }
    }
    return true
  }

  fun cancelar(context: Context, requestId: String, userId: String) {
    WorkManager.getInstance(context).cancelUniqueWork(nome(requestId, userId)).result.get(10, TimeUnit.SECONDS)
  }
}
