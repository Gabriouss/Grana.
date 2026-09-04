package com.gabriouss.grana.voicewidget

import android.content.Context
import android.view.View
import android.widget.RemoteViews

class ProximoCompromissoWidgetProvider : GranaResumoWidgetProvider() {
  override fun montar(context: Context, widgetId: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.grana_compromisso_widget)
    val snapshot = WidgetSnapshotStore.ler(context)
    val compromisso = snapshot?.nextCommitment
    val privado = WidgetSnapshotStore.privacidade(context, snapshot)

    when {
      snapshot == null -> {
        views.setTextViewText(R.id.grana_compromisso_status, context.getString(R.string.grana_widget_sem_dados))
        views.setTextViewText(R.id.grana_compromisso_descricao, context.getString(R.string.grana_widget_abrir_atualizar))
        views.setTextViewText(R.id.grana_compromisso_valor, "")
        views.setTextViewText(R.id.grana_compromisso_data, "")
        views.setTextViewText(R.id.grana_compromisso_atualizado, "")
        views.setViewVisibility(R.id.grana_compromisso_recorrente, View.GONE)
      }
      compromisso == null -> {
        views.setTextViewText(R.id.grana_compromisso_status, context.getString(R.string.grana_compromisso_em_dia))
        views.setTextViewText(R.id.grana_compromisso_descricao, context.getString(R.string.grana_compromisso_nada))
        views.setTextViewText(R.id.grana_compromisso_valor, "")
        views.setTextViewText(R.id.grana_compromisso_data, context.getString(R.string.grana_compromisso_abrir))
        views.setTextViewText(R.id.grana_compromisso_atualizado, WidgetText.atualizado(snapshot.updatedAt))
        views.setViewVisibility(R.id.grana_compromisso_recorrente, View.GONE)
      }
      else -> {
        views.setTextViewText(
          R.id.grana_compromisso_status,
          context.getString(if (compromisso.overdue) R.string.grana_compromisso_atrasado else R.string.grana_compromisso_proximo),
        )
        views.setTextViewText(R.id.grana_compromisso_descricao, compromisso.description)
        views.setTextViewText(R.id.grana_compromisso_valor, WidgetText.valor(compromisso.amount, privado))
        views.setTextViewText(R.id.grana_compromisso_data, WidgetText.vencimento(compromisso.dueDate))
        views.setTextViewText(R.id.grana_compromisso_atualizado, WidgetText.atualizado(snapshot.updatedAt))
        views.setViewVisibility(R.id.grana_compromisso_recorrente, if (compromisso.recurring) View.VISIBLE else View.GONE)
      }
    }

    views.setOnClickPendingIntent(
      R.id.grana_compromisso_raiz,
      WidgetRegistry.pendingDeepLink(context, widgetId, 400_000, "com.gabriouss.grana://bills"),
    )
    return views
  }
}
