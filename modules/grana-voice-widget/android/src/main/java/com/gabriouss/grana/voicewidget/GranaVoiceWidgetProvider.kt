package com.gabriouss.grana.voicewidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Build
import android.widget.RemoteViews
import java.util.UUID

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
            // Inverte o repouso de propósito: ocioso é círculo claro com
            // ícone escuro, ativo vira círculo escuro com ícone menta —
            // mesmo padrão que "Lançando…" (processando) já usava, então os
            // dois estados "o sistema está fazendo algo" ficam consistentes
            // entre si. Nunca usa a cor de atenção/coral aqui: essa é a
            // exceção reservada só pra "não dá pra gravar".
            views.setInt(R.id.grana_voice_circulo, "setBackgroundResource", R.drawable.grana_voice_fundo)
            views.setImageViewResource(R.id.grana_voice_circulo, R.drawable.ic_grana_voice_mic_menta)
            views.setTextViewText(R.id.grana_voice_rotulo, context.getString(R.string.grana_voice_ouvindo))
            views.setContentDescription(R.id.grana_voice_circulo, context.getString(R.string.grana_voice_ouvindo))
          }
          EstadoWidget.PREPARANDO, EstadoWidget.PENDENTE, EstadoWidget.PROCESSANDO -> {
            views.setInt(R.id.grana_voice_circulo, "setBackgroundResource", R.drawable.grana_voice_fundo)
            views.setImageViewResource(R.id.grana_voice_circulo, R.drawable.ic_grana_voice_processando)
            val rotulo = when (estado) {
              EstadoWidget.PREPARANDO -> R.string.grana_voice_preparando
              EstadoWidget.PENDENTE -> R.string.grana_voice_pendente
              else -> R.string.grana_voice_processando
            }
            views.setTextViewText(R.id.grana_voice_rotulo, context.getString(rotulo))
            views.setContentDescription(R.id.grana_voice_circulo, context.getString(rotulo))
          }
          EstadoWidget.REPETIR -> {
            views.setInt(R.id.grana_voice_circulo, "setBackgroundResource", R.drawable.grana_voice_fundo_gradiente)
            views.setImageViewResource(R.id.grana_voice_circulo, R.drawable.ic_grana_voice_mic)
            views.setTextViewText(R.id.grana_voice_rotulo, context.getString(R.string.grana_voice_repetir))
            views.setContentDescription(R.id.grana_voice_circulo, context.getString(R.string.grana_voice_repetir))
          }
          EstadoWidget.ATENCAO -> {
            views.setInt(R.id.grana_voice_circulo, "setBackgroundResource", R.drawable.grana_voice_fundo)
            views.setImageViewResource(R.id.grana_voice_circulo, R.drawable.ic_grana_voice_atencao)
            views.setTextViewText(R.id.grana_voice_rotulo, context.getString(R.string.grana_voice_atencao))
            views.setContentDescription(R.id.grana_voice_circulo, context.getString(R.string.grana_voice_atencao_desc))
          }
          else -> {
            views.setInt(R.id.grana_voice_circulo, "setBackgroundResource", R.drawable.grana_voice_fundo_gradiente)
            views.setImageViewResource(R.id.grana_voice_circulo, R.drawable.ic_grana_voice_mic)
            views.setTextViewText(R.id.grana_voice_rotulo, context.getString(R.string.grana_voice_ocioso))
            views.setContentDescription(R.id.grana_voice_circulo, context.getString(R.string.grana_voice_ocioso))
          }
        }

        when (estado) {
          /* Em atenção o toque ABRE O APP, não o microfone: falta uma
             permissão, e permissão só se resolve numa tela. Abrir o microfone
             aqui daria a terceira gravação perdida seguida. */
          EstadoWidget.ATENCAO -> {
            val abrir = pendingDeAbrirApp(context, id)
            if (abrir != null) views.setOnClickPendingIntent(R.id.grana_voice_raiz, abrir)
          }
          else -> views.setOnClickPendingIntent(R.id.grana_voice_raiz, pendingDeToque(context, id))
        }

        manager.updateAppWidget(id, views)
      }
    }

    /** Abre a tela inicial do próprio app. `null` se o launcher não expuser
     *  intent de abertura — nesse caso o widget fica só informativo. */
    private fun pendingDeAbrirApp(context: Context, widgetId: Int): PendingIntent? {
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      var flags = PendingIntent.FLAG_UPDATE_CURRENT
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags = flags or PendingIntent.FLAG_IMMUTABLE
      /* requestCode deslocado pra não colidir com o PendingIntent de toque
         deste mesmo widget, que usa o próprio id. */
      return PendingIntent.getActivity(context, 100_000 + widgetId, intent, flags)
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

    EstadoWidget.recuperarCapturaInterrompida(context)

    // O trabalho já está duravelmente agendado. Um toque não abre Activity
    // nem grava de novo o gasto cujo desfecho ainda não se conhece.
    if (EstadoWidget.atual(context) in setOf(EstadoWidget.PREPARANDO, EstadoWidget.PROCESSANDO, EstadoWidget.PENDENTE)) return

    val servico = Intent(context, GranaVoiceCaptureService::class.java)
    if (EstadoWidget.atual(context) == EstadoWidget.OUVINDO) {
      servico.action = GranaVoiceCaptureService.ACAO_ENCERRAR
    } else {
      servico.action = GranaVoiceCaptureService.ACAO_INICIAR
      // Só o serviço, depois de MediaRecorder.start(), pode dizer "Ouvindo".
      val requestId = UUID.randomUUID().toString()
      EstadoWidget.preparar(context, requestId)
      servico.putExtra("requestId", requestId)
    }

    /* Iniciar serviço em primeiro plano a partir de um toque em widget é
       permitido pelo Android mesmo com o app fechado — interação do usuário
       com um widget está na lista de exceções à restrição de FGS em segundo
       plano. */
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(servico)
      else context.startService(servico)
    } catch (erro: Exception) {
      android.util.Log.e("GranaVoz", "não consegui iniciar a captura do widget", erro)
      EstadoWidget.definir(context, EstadoWidget.REPETIR)
    }
  }

  override fun onEnabled(context: Context) {
    /* Widget recém-adicionado (ou app atualizado/aparelho reiniciado) nunca
       começa "ouvindo": um estado de gravação salvo em disco pode ter
       sobrevivido a um processo morto no meio. */
    EstadoWidget.definir(context, EstadoWidget.OCIOSO)
  }
}
