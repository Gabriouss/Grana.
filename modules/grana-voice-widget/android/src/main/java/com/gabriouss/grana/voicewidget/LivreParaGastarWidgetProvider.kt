package com.gabriouss.grana.voicewidget

import android.content.Context
import android.widget.RemoteViews

class LivreParaGastarWidgetProvider : GranaResumoWidgetProvider() {
  override fun montar(context: Context, widgetId: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.grana_livre_widget)
    val snapshot = WidgetSnapshotStore.ler(context)
    val privado = WidgetSnapshotStore.privacidade(context, snapshot)

    if (snapshot == null) {
      views.setTextViewText(R.id.grana_livre_valor, context.getString(R.string.grana_widget_sem_dados))
      views.setTextViewText(R.id.grana_livre_apoio, context.getString(R.string.grana_widget_abrir_atualizar))
      views.setTextViewText(R.id.grana_livre_atualizado, "")
    } else if (snapshot.safeToSpend.semSaldo) {
      views.setTextViewText(R.id.grana_livre_valor, context.getString(R.string.grana_livre_sem_saldo))
      views.setTextViewText(R.id.grana_livre_apoio, "${snapshot.safeToSpend.diasRestantes} dias restantes")
      views.setTextViewText(R.id.grana_livre_atualizado, WidgetText.atualizado(snapshot.updatedAt))
    } else {
      views.setTextViewText(
        R.id.grana_livre_valor,
        "${WidgetText.valor(snapshot.safeToSpend.livrePorDia, privado)}/dia",
      )
      views.setTextViewText(
        R.id.grana_livre_apoio,
        "${WidgetText.valor(snapshot.safeToSpend.livreTotal, privado)} no total · ${snapshot.safeToSpend.diasRestantes} dias",
      )
      views.setTextViewText(R.id.grana_livre_atualizado, WidgetText.atualizado(snapshot.updatedAt))
    }

    views.setOnClickPendingIntent(
      R.id.grana_livre_raiz,
      WidgetRegistry.pendingDeepLink(context, widgetId, 200_000, "com.gabriouss.grana://safe-to-spend"),
    )
    return views
  }
}
