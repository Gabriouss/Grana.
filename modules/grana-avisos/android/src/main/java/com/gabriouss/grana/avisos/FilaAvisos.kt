package com.gabriouss.grana.avisos

import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import android.util.Log

/** Uma execução de disco por vez; nunca devolve trabalho ao callback do Android. */
internal class FilaAvisos(limite: Int = 128) {
  private val excedeu = AtomicBoolean(false)
  private val executor = ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS,
    ArrayBlockingQueue<Runnable>(limite), { tarefa ->
      Thread(tarefa, "grana-avisos-diario").apply { isDaemon = true }
    }, ThreadPoolExecutor.AbortPolicy())

  fun enviar(falhar: (Exception) -> Unit, trabalho: () -> Unit): Boolean = try {
    executor.execute {
      fun recibo(erro: Exception) {
        try { falhar(erro) }
        catch (falha: Exception) { Log.w("GranaAvisos", "falha no recibo da fila: ${falha.javaClass.simpleName}") }
      }
      if (excedeu.getAndSet(false)) recibo(RejectedExecutionException("fila de avisos cheia"))
      try { trabalho() } catch (erro: Exception) { recibo(erro) }
    }
    true
  } catch (_: RejectedExecutionException) {
    excedeu.set(true)
    false
  }
}
