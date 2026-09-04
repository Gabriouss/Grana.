package com.gabriouss.grana.voicewidget

import android.content.Context
import android.widget.RemoteViews

class CentralLancamentoWidgetProvider : GranaResumoWidgetProvider() {
  override fun montar(context: Context, widgetId: Int): RemoteViews {
    return RemoteViews(context.packageName, R.layout.grana_central_widget).apply {
      setOnClickPendingIntent(
        R.id.grana_central_entrada,
        WidgetRegistry.pendingDeepLink(context, widgetId, 300_001, "com.gabriouss.grana://add-tx?type=in"),
      )
      setOnClickPendingIntent(
        R.id.grana_central_saida,
        WidgetRegistry.pendingDeepLink(context, widgetId, 300_002, "com.gabriouss.grana://add-tx?type=out"),
      )
      setOnClickPendingIntent(
        R.id.grana_central_credito,
        WidgetRegistry.pendingDeepLink(context, widgetId, 300_003, "com.gabriouss.grana://add-credit"),
      )
      setOnClickPendingIntent(
        R.id.grana_central_boleto,
        WidgetRegistry.pendingDeepLink(context, widgetId, 300_004, "com.gabriouss.grana://add-bill"),
      )
    }
  }
}
