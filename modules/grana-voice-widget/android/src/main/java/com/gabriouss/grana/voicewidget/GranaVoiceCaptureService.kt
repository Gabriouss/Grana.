package com.gabriouss.grana.voicewidget

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.io.File
import java.util.UUID

/**
 * Grava o áudio do widget e entrega o arquivo ao JavaScript.
 *
 * Serviço em primeiro plano do tipo `microphone` porque é a única forma de o
 * Android permitir captura com o app fechado — e porque o indicador de
 * microfone e a notificação em andamento têm que existir: a pessoa precisa
 * conseguir ver e cortar uma gravação que ela não lembra de ter começado.
 */
class GranaVoiceCaptureService : Service() {

  companion object {
    const val ACAO_INICIAR = "com.gabriouss.grana.voicewidget.INICIAR"
    const val ACAO_ENCERRAR = "com.gabriouss.grana.voicewidget.ENCERRAR"
    const val ACAO_CANCELAR = "com.gabriouss.grana.voicewidget.CANCELAR"

    const val CANAL = "lancamento-voz"
    private const val NOTIF_ID = 4711

    /* Teto absoluto. Espelha MAX_SEGUNDOS_GRAVACAO de lib/voz.ts e o teto de
       tamanho da Edge Function — um comando de lançamento não passa disso, e
       o que passa é bolso ou esquecimento. */
    private const val LIMITE_MS = 20_000L

    /* Silêncio: só corta DEPOIS de ter ouvido fala. Cortar por silêncio
       inicial pegaria quem toca e leva um segundo pra começar a falar. */
    private const val INTERVALO_AMOSTRA_MS = 200L
    private const val SILENCIO_PARA_CORTAR_MS = 1_600L
    private const val LIMIAR_FALA = 1_800
  }

  private var recorder: MediaRecorder? = null
  private var arquivo: File? = null
  private var requestId: String? = null
  private var wakelock: PowerManager.WakeLock? = null
  private val handler = Handler(Looper.getMainLooper())

  private var ouviuFala = false
  private var silencioDesde = 0L
  private var gravando = false

  /* Referência nomeada, e não uma lambda solta em postDelayed: sem poder
     remover o callback, uma gravação encerrada aos 5s deixaria um corte
     agendado pros 20s que derrubaria a PRÓXIMA gravação no meio. */
  private val corteDuro = Runnable { if (gravando) encerrarEEntregar() }

  private val amostrador = object : Runnable {
    override fun run() {
      val r = recorder ?: return
      val amplitude = try { r.maxAmplitude } catch (_: Exception) { 0 }
      val agora = System.currentTimeMillis()

      if (amplitude >= LIMIAR_FALA) {
        ouviuFala = true
        silencioDesde = 0L
      } else if (ouviuFala) {
        if (silencioDesde == 0L) silencioDesde = agora
        else if (agora - silencioDesde >= SILENCIO_PARA_CORTAR_MS) {
          encerrarEEntregar()
          return
        }
      }
      handler.postDelayed(this, INTERVALO_AMOSTRA_MS)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    /* SEMPRE antes de qualquer decisão, inclusive num "encerrar" que não vai
       encerrar nada.
       O provider chama `startForegroundService` em todo toque, e o Android
       derruba o app com ForegroundServiceDidNotStartInTimeException se o
       serviço não chamar `startForeground` em até cinco segundos — mesmo
       quando o comando era só "pare". Cenário real: o processo morre com o
       widget mostrando "ouvindo", a pessoa toca pra encerrar, e uma instância
       NOVA do serviço nasce com `gravando = false`; sem esta chamada ela sairia
       sem nunca ter ido a primeiro plano, e o app inteiro cairia. */
    try {
      subirEmPrimeiroPlano()
    } catch (e: Exception) {
      abortar("erro_interno")
      return START_NOT_STICKY
    }

    when (intent?.action) {
      ACAO_ENCERRAR -> if (gravando) encerrarEEntregar() else finalizar(EstadoWidget.OCIOSO)
      ACAO_CANCELAR -> abortar(null)
      else -> iniciar()
    }
    return START_NOT_STICKY
  }

  private fun iniciar() {
    if (gravando) return

    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      /* O widget não tem como pedir permissão: quem pede é uma tela. Aqui só
         resta devolver o widget pro ocioso e deixar o JS avisar quando o app
         abrir — pedir do nada aqui daria um diálogo sem contexto nenhum. */
      abortar("sem_permissao")
      return
    }

    val destino = File(cacheDir, "voz-${System.currentTimeMillis()}.m4a")
    val novoRequestId = UUID.randomUUID().toString()

    val novoRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this) else @Suppress("DEPRECATION") MediaRecorder()
    try {
      novoRecorder.apply {
        setAudioSource(MediaRecorder.AudioSource.MIC)
        setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        /* Mesma configuração do gravador do app (components/VoiceEntryButton):
           mono, 64 kbps. Áudio de canal diferente não pode chegar ao Whisper
           com qualidade diferente — é isso que a unificação existe pra evitar. */
        setAudioChannels(1)
        setAudioSamplingRate(44100)
        setAudioEncodingBitRate(64000)
        /* Sem `setMaxDuration`: quando o próprio MediaRecorder atinge o limite
           ele já para por dentro, e o `stop()` que viria depois lança —
           descartando uma gravação de 20 segundos perfeitamente boa. O corte
           é só nosso (`corteDuro`), que para pelo caminho normal. */
        setOutputFile(destino.absolutePath)
        prepare()
        start()
      }
    } catch (e: Exception) {
      try { novoRecorder.release() } catch (_: Exception) {}
      destino.delete()
      abortar("microfone_ocupado")
      return
    }

    recorder = novoRecorder
    arquivo = destino
    requestId = novoRequestId
    gravando = true
    ouviuFala = false
    silencioDesde = 0L

    /* Wakelock parcial: sem ele, um aparelho que adormece no meio da fala
       entrega um arquivo cortado. Liberado em todos os caminhos de saída. */
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakelock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "grana:voz").apply {
      setReferenceCounted(false)
      acquire(LIMITE_MS + 5_000L)
    }

    EstadoWidget.definir(this, EstadoWidget.OUVINDO)
    handler.postDelayed(amostrador, INTERVALO_AMOSTRA_MS)
    handler.postDelayed(corteDuro, LIMITE_MS)
  }

  private fun encerrarEEntregar() {
    if (!gravando) return
    gravando = false
    cancelarAgendados()

    val destino = arquivo
    val id = requestId
    var arquivoValido = false
    try {
      recorder?.stop()
      arquivoValido = destino != null && destino.exists() && destino.length() > 1024
    } catch (e: Exception) {
      /* `stop()` lança quando a gravação foi curta demais pro encoder fechar
         um arquivo válido — toque duplo acidental, quase sempre. Não é erro
         a relatar, é "não falou nada". */
      arquivoValido = false
    } finally {
      liberar()
    }

    if (!arquivoValido || destino == null || id == null) {
      destino?.delete()
      finalizar(EstadoWidget.OCIOSO)
      return
    }

    EstadoWidget.definir(this, EstadoWidget.PROCESSANDO)

    /* Entregue ao JavaScript ANTES de sair do primeiro plano: enquanto este
       serviço está vivo o app conta como em primeiro plano, e é isso que
       permite iniciar o serviço headless com o app fechado. Invertendo a
       ordem, o start seria recusado. */
    val ponte = Intent(this, GranaVoiceHeadlessService::class.java).apply {
      putExtra("caminho", destino.absolutePath)
      putExtra("requestId", id)
    }
    try {
      startService(ponte)
    } catch (e: Exception) {
      destino.delete()
      finalizar(EstadoWidget.OCIOSO)
      return
    }

    finalizar(null)
  }

  /** Sai sem entregar nada. `motivo` é só pro log — o widget volta ao ocioso. */
  private fun abortar(motivo: String?) {
    gravando = false
    cancelarAgendados()
    liberar()
    arquivo?.delete()
    arquivo = null
    if (motivo != null) android.util.Log.w("GranaVoz", "gravação abortada: $motivo")
    finalizar(EstadoWidget.OCIOSO)
  }

  private fun cancelarAgendados() {
    handler.removeCallbacks(amostrador)
    handler.removeCallbacks(corteDuro)
  }

  private fun liberar() {
    try { recorder?.reset() } catch (_: Exception) {}
    try { recorder?.release() } catch (_: Exception) {}
    recorder = null
    try { if (wakelock?.isHeld == true) wakelock?.release() } catch (_: Exception) {}
    wakelock = null
  }

  private fun finalizar(estado: String?) {
    if (estado != null) EstadoWidget.definir(this, estado)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION") stopForeground(true)
    }
    stopSelf()
  }

  private fun subirEmPrimeiroPlano() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CANAL) == null) {
      /* Canal próprio, separado de "lembretes-contas": quem desliga lembrete
         de boleto não pode perder o aviso de que o microfone está aberto. */
      val canal = NotificationChannel(CANAL, getString(R.string.grana_voice_canal), NotificationManager.IMPORTANCE_LOW)
      canal.setShowBadge(false)
      manager.createNotificationChannel(canal)
    }

    val encerrar = PendingIntent.getService(
      this, 1,
      Intent(this, GranaVoiceCaptureService::class.java).setAction(ACAO_ENCERRAR),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val cancelar = PendingIntent.getService(
      this, 2,
      Intent(this, GranaVoiceCaptureService::class.java).setAction(ACAO_CANCELAR),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notificacao: Notification = NotificationCompat.Builder(this, CANAL)
      .setContentTitle(getString(R.string.grana_voice_gravando_titulo))
      .setContentText(getString(R.string.grana_voice_gravando_texto))
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .addAction(0, getString(R.string.grana_voice_encerrar), encerrar)
      .addAction(0, getString(R.string.grana_voice_cancelar), cancelar)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, notificacao, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else {
      startForeground(NOTIF_ID, notificacao)
    }
  }

  override fun onDestroy() {
    cancelarAgendados()
    liberar()
    super.onDestroy()
  }
}
