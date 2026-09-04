package com.gabriouss.grana.voicewidget

import android.content.Context
import android.net.Uri
import android.widget.RemoteViews

class CofrinhoWidgetProvider : GranaResumoWidgetProvider() {
  override fun montar(context: Context, widgetId: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.grana_cofrinho_widget)
    val snapshot = WidgetSnapshotStore.ler(context)
    val cofrinho = snapshot?.goal
    val privado = WidgetSnapshotStore.privacidade(context, snapshot)

    val destino: String
    when {
      snapshot == null -> {
        views.setTextViewText(R.id.grana_cofrinho_titulo, context.getString(R.string.grana_widget_sem_dados))
        views.setTextViewText(R.id.grana_cofrinho_valor, context.getString(R.string.grana_widget_abrir_atualizar))
        views.setTextViewText(R.id.grana_cofrinho_pct, "")
        views.setTextViewText(R.id.grana_cofrinho_atualizado, "")
        views.setProgressBar(R.id.grana_cofrinho_progresso, 100, 0, false)
        destino = "com.gabriouss.grana://goals"
      }
      cofrinho == null -> {
        views.setTextViewText(R.id.grana_cofrinho_titulo, context.getString(R.string.grana_cofrinho_criar))
        views.setTextViewText(R.id.grana_cofrinho_valor, context.getString(R.string.grana_cofrinho_criar_apoio))
        views.setTextViewText(R.id.grana_cofrinho_pct, "")
        views.setTextViewText(R.id.grana_cofrinho_atualizado, WidgetText.atualizado(snapshot.updatedAt))
        views.setProgressBar(R.id.grana_cofrinho_progresso, 100, 0, false)
        destino = "com.gabriouss.grana://goals"
      }
      else -> {
        views.setTextViewText(R.id.grana_cofrinho_titulo, cofrinho.title)
        views.setTextViewText(
          R.id.grana_cofrinho_valor,
          "${WidgetText.valor(cofrinho.currentAmount, privado)} de ${WidgetText.valor(cofrinho.targetAmount, privado)}",
        )
        views.setTextViewText(
          R.id.grana_cofrinho_pct,
          if (cofrinho.completed) context.getString(R.string.grana_cofrinho_concluido) else "${cofrinho.progress}%",
        )
        views.setTextViewText(R.id.grana_cofrinho_atualizado, WidgetText.atualizado(snapshot.updatedAt))
        views.setProgressBar(R.id.grana_cofrinho_progresso, 100, cofrinho.progress, false)
        destino = "com.gabriouss.grana://deposit-goal?goalId=${Uri.encode(cofrinho.id)}"
      }
    }

    views.setOnClickPendingIntent(
      R.id.grana_cofrinho_raiz,
      WidgetRegistry.pendingDeepLink(context, widgetId, 500_000, destino),
    )
    return views
  }
}
