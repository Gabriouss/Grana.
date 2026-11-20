package com.gabriouss.grana.voicewidget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.RemoteViews
import java.util.concurrent.Executors

/** Ciclo comum dos widgets que só leem o snapshot local. */
abstract class GranaResumoWidgetProvider : AppWidgetProvider() {
  protected abstract fun montar(context: Context, widgetId: Int): RemoteViews

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    if (ids.isEmpty()) return
    if (this is CentralLancamentoWidgetProvider) {
      for (id in ids) manager.updateAppWidget(id, montar(context, id))
      return
    }
    val resultado = goAsync()
    var terminou = false
    val concluir = Runnable {
      if (!terminou) {
        terminou = true
        resultado?.finish()
      }
    }
    if (resultado != null) principal.postDelayed(concluir, 7_000L)
    val pedido = Pedido(this, context.applicationContext, manager, ids.toSet(), concluir)
    synchronized(pendentes) {
      val anterior = pendentes.put(javaClass, pedido)
      if (anterior != null) {
        pendentes[javaClass] = pedido.copy(ids = anterior.ids + pedido.ids)
        principal.post { terminarPedido(anterior) }
      }
      if (!ocupado) {
        ocupado = true
        disco.execute { drenar(pedido.contexto) }
      }
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    val ids = when (intent.action) {
      Intent.ACTION_DATE_CHANGED, Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_LOCALE_CHANGED ->
        AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, javaClass))
      AppWidgetManager.ACTION_APPWIDGET_OPTIONS_CHANGED -> {
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID || intent.getBundleExtra(AppWidgetManager.EXTRA_APPWIDGET_OPTIONS) == null) return
        intArrayOf(id)
      }
      else -> { super.onReceive(context, intent); return }
    }
    onUpdate(context, AppWidgetManager.getInstance(context), ids)
  }

  companion object {
    private val principal = Handler(Looper.getMainLooper())
    private val disco = Executors.newSingleThreadExecutor { Thread(it, "grana-widget-snapshot") }
    private data class Pedido(
      val provider: GranaResumoWidgetProvider, val contexto: Context, val manager: AppWidgetManager,
      val ids: Set<Int>, val concluir: Runnable,
    )
    private val pendentes = LinkedHashMap<Class<*>, Pedido>()
    private var ocupado = false

    private fun terminarPedido(pedido: Pedido) {
      principal.removeCallbacks(pedido.concluir)
      pedido.concluir.run()
    }

    private fun drenar(context: Context) {
      var ultimaLeitura: WidgetSnapshotStore.Lote? = null
      while (true) {
        val lote = synchronized(pendentes) {
          if (pendentes.isEmpty()) { ocupado = false; return }
          pendentes.values.toList().also { pendentes.clear() }
        }
        try {
          val leitura = ultimaLeitura?.takeIf { it.snapshot != null && WidgetSnapshotStore.loteAtual(it) }
            ?: WidgetSnapshotStore.lerLote(context)
          ultimaLeitura = leitura
          principal.post {
            for (pedido in lote) {
              try {
                WidgetSnapshotStore.publicarSeAtual(leitura) {
                  publicar(pedido.provider, pedido.contexto, pedido.manager, pedido.ids, leitura)
                }
              } catch (erro: Exception) {
                Log.e("GranaWidget", "não consegui publicar o snapshot", erro)
              } finally { terminarPedido(pedido) }
            }
          }
        } catch (erro: Exception) {
          Log.e("GranaWidget", "não consegui preparar o lote", erro)
          principal.post { lote.forEach(::terminarPedido) }
        }
      }
    }

    private fun publicar(provider: GranaResumoWidgetProvider, context: Context, manager: AppWidgetManager, ids: Set<Int>, lote: WidgetSnapshotStore.Lote) {
      WidgetSnapshotStore.comLote(lote) {
        for (id in ids) manager.updateAppWidget(id, provider.montar(context, id))
      }
    }

    internal fun neutralizar(context: Context, lote: WidgetSnapshotStore.Lote) {
      val manager = AppWidgetManager.getInstance(context) ?: return
      for (provider in listOf(LivreParaGastarWidgetProvider(), ProximoCompromissoWidgetProvider(), CofrinhoWidgetProvider())) {
        try {
          val ids = manager.getAppWidgetIds(ComponentName(context, provider.javaClass)).toSet()
          publicar(provider, context, manager, ids, lote)
        } catch (erro: Exception) {
          Log.e("GranaWidget", "não consegui limpar a exibição de um widget", erro)
        }
      }
    }
  }
}
