package com.gabriouss.grana.voicewidget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/** Ciclo comum dos widgets que só leem o snapshot local. */
abstract class GranaResumoWidgetProvider : AppWidgetProvider() {
  protected abstract fun montar(context: Context, widgetId: Int): RemoteViews

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) manager.updateAppWidget(id, montar(context, id))
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (
      intent.action == Intent.ACTION_DATE_CHANGED ||
      intent.action == Intent.ACTION_TIMEZONE_CHANGED ||
      intent.action == Intent.ACTION_LOCALE_CHANGED
    ) {
      redesenhar(context)
    }
  }

  private fun redesenhar(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    val ids = manager.getAppWidgetIds(ComponentName(context, javaClass))
    onUpdate(context, manager, ids)
  }
}
