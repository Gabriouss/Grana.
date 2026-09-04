package com.gabriouss.grana.voicewidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Build
import android.widget.RemoteViews

/**
 * O widget 1x1 em si. Um toque alterna entre começar e encerrar a gravação.
 *
 * Nada aqui grava nem envia nada: o provider só desenha e repassa o toque pro
 * `GranaVoiceCaptureService`. É um BroadcastReceiver — tem alguns segundos de
 * vida por evento e é morto logo depois, então qualquer trabalho de verdade
 * feito aqui dentro seria interrompido no meio.
 */
class GranaVoiceWidgetProvider : AppWidgetProvider() {

  companion object {
    const val ACAO_TOQUE = "com.gabriouss.grana.voicewidget.TOQUE"

    fun desenhar(context: Context, manager: AppWidgetManager, ids: IntArray) {
      val estado = EstadoWidget.atual(context)
      for (id in ids) {
        val views = RemoteViews(context.packageName, R.layout.grana_voice_widget)

        when (estado) {
          EstadoWidget.OUVINDO -> {
            views.setInt(R.id.grana_voice_circulo, "setBackgroundResource", R.drawable.grana_voice_fundo_ativo)
            views.setImageViewResource(R.id.grana_voice_circulo, R.drawable.ic_grana_voice_mic_escuro)
            views.setTextViewText(R.id.grana_voice_rotulo, context.getString(R.string.grana_voice_ouvindo))
            views.setContentDescription(R.id.grana_voice_circulo, context.getString(R.string.grana_voice_ouvindo))
          }
          EstadoWidget.PROCESSANDO -> {
            views.setInt(R.id.grana_voice_circulo, "setBackgroundResource", R.drawable.grana_voice_fundo)
            views.setImageViewResource(R.id.grana_voice_circulo, R.drawable.ic_grana_voice_processando)
            views.setTextViewText(R.id.grana_voice_rotulo, context.getString(R.string.grana_voice_processando))
            views.setContentDescription(R.id.grana_voice_circulo, context.getString(R.string.grana_voice_processando))
          }
          else -> {
            views.setInt(R.id.grana_voice_circulo, "setBackgroundResource", R.drawable.grana_voice_fundo)
            views.setImageViewResource(R.id.grana_voice_circulo, R.drawable.ic_grana_voice_mic)
            views.setTextViewText(R.id.grana_voice_rotulo, context.getString(R.string.grana_voice_ocioso))
            views.setContentDescription(R.id.grana_voice_circulo, context.getString(R.string.grana_voice_ocioso))
          }
        }

        /* Enquanto processa, o toque não faz nada de propósito: um segundo
           comando por cima do primeiro criaria dois lançamentos da mesma
           fala. */
        if (estado != EstadoWidget.PROCESSANDO) {
          views.setOnClickPendingIntent(R.id.grana_voice_raiz, pendingDeToque(context, id))
        }

        manager.updateAppWidget(id, views)
      }
    }

    private fun pendingDeToque(context: Context, widgetId: Int): PendingIntent {
      val intent = Intent(context, GranaVoiceWidgetProvider::class.java).apply {
        action = ACAO_TOQUE
        /* Um requestCode por widget: sem isto, duas instâncias do widget na
           tela compartilhariam o mesmo PendingIntent e a segunda sobrescreveria
           os extras da primeira. */
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
      }
      var flags = PendingIntent.FLAG_UPDATE_CURRENT
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags = flags or PendingIntent.FLAG_IMMUTABLE
      return PendingIntent.getBroadcast(context, widgetId, intent, flags)
    }
  }

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    desenhar(context, manager, ids)
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action != ACAO_TOQUE) return

    val servico = Intent(context, GranaVoiceCaptureService::class.java)
    if (EstadoWidget.atual(context) == EstadoWidget.OUVINDO) {
      servico.action = GranaVoiceCaptureService.ACAO_ENCERRAR
    } else {
      servico.action = GranaVoiceCaptureService.ACAO_INICIAR
      /* O estado vira "ouvindo" já aqui, antes do serviço subir: o retorno
         visual precisa ser imediato pro toque não parecer perdido, e o
         serviço leva alguns instantes pra preparar o microfone. Se ele
         falhar, ele mesmo devolve o widget pro ocioso. */
      EstadoWidget.definir(context, EstadoWidget.OUVINDO)
    }

    /* Iniciar serviço em primeiro plano a partir de um toque em widget é
       permitido pelo Android mesmo com o app fechado — interação do usuário
       com um widget está na lista de exceções à restrição de FGS em segundo
       plano. */
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(servico)
    } else {
      context.startService(servico)
    }
  }

  override fun onEnabled(context: Context) {
    /* Widget recém-adicionado (ou app atualizado/aparelho reiniciado) nunca
       começa "ouvindo": um estado de gravação salvo em disco pode ter
       sobrevivido a um processo morto no meio. */
    EstadoWidget.definir(context, EstadoWidget.OCIOSO)
  }
}
