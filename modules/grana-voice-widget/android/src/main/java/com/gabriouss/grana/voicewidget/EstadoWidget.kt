package com.gabriouss.grana.voicewidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context

/**
 * Estado visível do widget, guardado em SharedPreferences.
 *
 * Precisa ser persistido, e não guardado numa variável: quem desenha o widget
 * é o `AppWidgetProvider`, um BroadcastReceiver que o Android cria e destrói a
 * cada evento — não existe instância viva entre um toque e o próximo. Sem
 * disco, o widget voltaria pro estado ocioso a cada redesenho do launcher,
 * inclusive no meio de uma gravação.
 */
object EstadoWidget {
  const val OCIOSO = "ocioso"
  const val OUVINDO = "ouvindo"
  const val PROCESSANDO = "processando"

  private const val PREFS = "grana_voice_widget"
  private const val CHAVE_ESTADO = "estado"

  fun atual(context: Context): String =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(CHAVE_ESTADO, OCIOSO) ?: OCIOSO

  fun definir(context: Context, estado: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(CHAVE_ESTADO, estado).apply()
    redesenhar(context)
  }

  /** Redesenha todas as instâncias do widget na tela inicial. */
  fun redesenhar(context: Context) {
    val manager = AppWidgetManager.getInstance(context) ?: return
    val componente = ComponentName(context.packageName, GranaVoiceWidgetProvider::class.java.name)
    val ids = manager.getAppWidgetIds(componente)
    if (ids.isEmpty()) return
    GranaVoiceWidgetProvider.desenhar(context, manager, ids)
  }
}
