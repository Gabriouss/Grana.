package com.gabriouss.grana.avisos

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.io.File

/**
 * Lê o aviso do banco com o app fechado. Só captura: não interpreta e não grava
 * dinheiro. Título e texto nunca vão para o logcat.
 */
class GranaAvisosListener : NotificationListenerService() {

  override fun onListenerConnected() {
    /* O que chegou enquanto o serviço estava fora e ainda está na bandeja. O id
       do diário impede a duplicata, e `notificar = false` evita uma rajada. */
    try {
      AvisosConfig.limparLegado(this)
      diario(this).limparForaDoCatalogo()
      AvisosConfig.confirmarLimpeza(this)
      AvisosConfig.registrarSinal(this, System.currentTimeMillis())
      activeNotifications?.forEach { receber(it, notificar = false) }
    } catch (erro: Exception) {
      registrarFalha(erro)
    }
  }

  override fun onListenerDisconnected() {
    AvisosConfig.registrarDesconexao(this, System.currentTimeMillis())
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      requestRebind(ComponentName(this, GranaAvisosListener::class.java))
    }
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    try {
      receber(sbn, notificar = true)
    } catch (erro: Exception) {
      registrarFalha(erro)
    }
  }

  private fun receber(sbn: StatusBarNotification, notificar: Boolean) {
    val destino = AvisosFiltro.decidir(
      pacote = sbn.packageName,
      pacoteProprio = packageName,
      resumoDeGrupo = sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0,
      temDono = AvisosConfig.dono(this) != null,
      ativadoEm = AvisosConfig.inicioDaLeitura(this, sbn.packageName),
      postadoEm = sbn.postTime,
      depuravel = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0,
    )
    if (destino == AvisosFiltro.Destino.DESCARTAR) return
    val agora = System.currentTimeMillis()
    AvisosConfig.registrarSinal(this, agora)

    val extras = sbn.notification.extras
    val titulo = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val texto = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
      ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
    if (titulo.isBlank() && texto.isBlank()) return

    val quando = sbn.notification.`when`.takeIf { it > 0L } ?: sbn.postTime
    val novo = diario(this).guardar(AvisosDiario.Aviso(sbn.packageName, sbn.key, quando, titulo, texto))
    if (!novo || !notificar) return
    /* Compra recusada fica no diário (o app a ignora), mas não pede conferência. */
    if (AvisosFiltro.ehRecusa(titulo, texto)) return
    val valor = VALOR_EM_REAIS.find("$titulo $texto")?.value ?: return
    publicarNotificacao(valor)
  }

  /** Sem permissão de notificar, o item continua na faixa da próxima abertura. */
  private fun publicarNotificacao(valor: String) {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CANAL) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CANAL, getString(R.string.grana_avisos_canal), NotificationManager.IMPORTANCE_DEFAULT)
      )
    }
    val abrir = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val construtor = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CANAL)
    } else {
      @Suppress("DEPRECATION") Notification.Builder(this)
    }
    val notificacao = construtor
      .setSmallIcon(iconeDaNotificacao())
      .setContentTitle(getString(R.string.grana_avisos_titulo))
      .setContentText(if (valorEscondido()) getString(R.string.grana_avisos_texto) else valor)
      .setContentIntent(abrir)
      .setAutoCancel(true)
      .build()
    manager.notify(ID_NOTIFICACAO, notificacao)
  }

  /**
   * O Android desenha o ícone pequeno só pelo alfa, então o do launcher perde a forma.
   * O `notification_icon` é gerado no app pelo plugin do expo-notifications, e um módulo
   * não enxerga o `R` do app. Sem o recurso, o aviso sai do mesmo jeito.
   */
  private fun iconeDaNotificacao(): Int {
    val icone = resources.getIdentifier("notification_icon", "drawable", packageName)
    if (icone != 0) return icone
    Log.w(TAG, "notification_icon ausente, usando o icone do app")
    return applicationInfo.icon
  }

  /**
   * Mesma chave que os widgets gravam em `WidgetSnapshotStore`, só lida aqui.
   * Na dúvida esconde, como o widget, que nasce oculto.
   */
  private fun valorEscondido(): Boolean =
    getSharedPreferences(PREFS_DO_WIDGET, Context.MODE_PRIVATE).getBoolean(CHAVE_PRIVACIDADE_DO_WIDGET, true)

  private fun registrarFalha(erro: Exception) {
    val tipo = erro.javaClass.simpleName
    Log.w(TAG, "falha ao receber aviso: $tipo")
    AvisosConfig.registrarFalha(this, tipo, System.currentTimeMillis())
  }

  companion object {
    private const val TAG = "GranaAvisos"
    private const val CANAL = "grana_avisos_conferir"
    private const val ID_NOTIFICACAO = 0x47524156
    private const val PREFS_DO_WIDGET = "grana_home_widgets"
    private const val CHAVE_PRIVACIDADE_DO_WIDGET = "privacy_hidden"
    private val VALOR_EM_REAIS = Regex("""R\$\s?\d[\d.]*(?:,\d{2})?""")

    internal fun diario(context: Context) = AvisosDiario(File(context.noBackupFilesDir, "grana_avisos"))
  }
}
