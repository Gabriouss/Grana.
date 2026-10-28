package com.gabriouss.grana.voicewidget

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat

/** Recibos nativos de captura usam o próprio widget para repetir, sem Activity. */
object VoiceCaptureReceipt {
  fun publicar(context: Context, titulo: Int, texto: Int) {
    try {
      val toque = PendingIntent.getBroadcast(context, 4712,
        Intent(context, GranaVoiceWidgetProvider::class.java).setAction(GranaVoiceWidgetProvider.ACAO_TOQUE),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      val recibo = NotificationCompat.Builder(context, GranaVoiceCaptureService.CANAL)
        .setContentTitle(context.getString(titulo)).setContentText(context.getString(texto))
        .setStyle(NotificationCompat.BigTextStyle().bigText(context.getString(texto)))
        .setSmallIcon(android.R.drawable.ic_btn_speak_now).setAutoCancel(true).setContentIntent(toque).build()
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(4712, recibo)
    } catch (erro: Exception) {
      Log.e("GranaVoz", "recibo da captura não foi publicado", erro)
    }
  }
}
