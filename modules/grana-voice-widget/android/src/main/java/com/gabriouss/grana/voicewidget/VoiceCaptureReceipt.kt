package com.gabriouss.grana.voicewidget

import android.app.NotificationManager
import android.app.NotificationChannel
import android.os.Build
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat

/** Recibos nativos de captura usam o próprio widget para repetir, sem Activity. */
object VoiceCaptureReceipt {
  fun publicar(context: Context, titulo: Int, texto: Int) {
    try {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      // A preparação pode falhar antes de o serviço criar o canal pela primeira vez.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(GranaVoiceCaptureService.CANAL) == null) {
        val canal = NotificationChannel(GranaVoiceCaptureService.CANAL, context.getString(R.string.grana_voice_canal), NotificationManager.IMPORTANCE_LOW)
        canal.setShowBadge(false)
        manager.createNotificationChannel(canal)
      }
      val toque = PendingIntent.getBroadcast(context, 4712,
        Intent(context, GranaVoiceWidgetProvider::class.java).setAction(GranaVoiceWidgetProvider.ACAO_TOQUE),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      val recibo = NotificationCompat.Builder(context, GranaVoiceCaptureService.CANAL)
        .setContentTitle(context.getString(titulo)).setContentText(context.getString(texto))
        .setStyle(NotificationCompat.BigTextStyle().bigText(context.getString(texto)))
        .setSmallIcon(android.R.drawable.ic_btn_speak_now).setAutoCancel(true).setContentIntent(toque).build()
      manager.notify(4712, recibo)
    } catch (erro: Exception) {
      Log.e("GranaVoz", "recibo da captura não foi publicado", erro)
    }
  }
}
