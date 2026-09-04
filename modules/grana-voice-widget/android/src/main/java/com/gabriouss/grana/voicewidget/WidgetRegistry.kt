package com.gabriouss.grana.voicewidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

object WidgetRegistry {
  private val TIPOS = mapOf<String, Class<out AppWidgetProvider>>(
    "voz" to GranaVoiceWidgetProvider::class.java,
    "livre" to LivreParaGastarWidgetProvider::class.java,
    "central" to CentralLancamentoWidgetProvider::class.java,
    "compromisso" to ProximoCompromissoWidgetProvider::class.java,
    "cofrinho" to CofrinhoWidgetProvider::class.java,
  )

  fun classe(tipo: String): Class<out AppWidgetProvider>? = TIPOS[tipo]

  fun quantidade(context: Context, tipo: String): Int {
    val classe = classe(tipo) ?: return 0
    return AppWidgetManager.getInstance(context)
      .getAppWidgetIds(ComponentName(context, classe)).size
  }

  fun redesenharTodos(context: Context) {
    EstadoWidget.redesenhar(context)
    for ((tipo, classe) in TIPOS) {
      if (tipo == "voz") continue
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, classe))
      if (ids.isEmpty()) continue
      val intent = Intent(context, classe).apply {
        action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        addFlags(Intent.FLAG_RECEIVER_FOREGROUND)
      }
      context.sendBroadcast(intent)
    }
  }

  fun pendingDeepLink(context: Context, widgetId: Int, codigo: Int, url: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags = flags or PendingIntent.FLAG_IMMUTABLE
    /* Um bloco de 10 códigos por instância; cada provider usa uma centena de
       milhar própria. Assim nenhuma ação substitui o PendingIntent vizinho. */
    return PendingIntent.getActivity(context, codigo + widgetId * 10, intent, flags)
  }
}
