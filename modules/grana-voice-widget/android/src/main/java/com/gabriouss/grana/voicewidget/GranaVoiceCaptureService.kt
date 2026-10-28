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
import android.media.AudioManager
import android.media.AudioRecordingConfiguration
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.io.File
import java.util.UUID
import org.json.JSONObject

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
    private const val NOTIF_RECIBO_ID = 4712
    /** Mesma pasta de `PASTA_ORFA` em lib/widget-voz-pendentes.ts (`documentDirectory` = `filesDir`). */
    const val PASTA_ORFA = "voz-orfa"

    /* Teto absoluto. Espelha MAX_SEGUNDOS_GRAVACAO de lib/voz.ts e o teto de
       tamanho da Edge Function — um comando de lançamento não passa disso, e
       o que passa é bolso ou esquecimento. */
    private const val LIMITE_MS = 20_000L

    /* Silêncio: só corta DEPOIS de ter ouvido fala. Cortar por silêncio
       inicial pegaria quem toca e leva um segundo pra começar a falar.

       O botão de voz do app usa a MESMA regra e os mesmos números, copiados
       em lib/voz-captura.ts (regra 13). Mudou algum valor aqui, ou a régua de
       1024 bytes do `encerrarEEntregar`? Mude lá também:
       __tests__/voz-captura-paridade.cjs falha se os dois divergirem. */
    private const val INTERVALO_AMOSTRA_MS = 200L
    private const val SILENCIO_PARA_CORTAR_MS = 1_600L
    /* Em aparelhos com microfone mais distante, a fala normal fica abaixo de
       1.800. O limiar alto fazia `ouviuFala` permanecer falso e o corte por
       silêncio nunca era armado; a gravação só terminava no segundo toque ou
       no teto de 20s, capturando a explicação seguinte junto. */
    private const val LIMIAR_FALA = 600
  }

  private var recorder: MediaRecorder? = null
  private var arquivo: File? = null
  private var requestId: String? = null
  private var donoDaCaptura: String? = null
  private var microfoneSilenciado = false
  private var callbackGravacao: AudioManager.AudioRecordingCallback? = null
  /* A captura (data na voz, 30/09/2026): o instante e a data civil local do
     INÍCIO da gravação. Vão ao JavaScript com a fala, e ao lado da órfã em
     `<requestId>.json`, para "ontem" contar do dia em que ela foi dita, e
     não da hora em que o app a processa. Mesmo par que o botão do app anota
     (regra 13). */
  private var capturadoEm = 0L
  private var dataCaptura: String? = null
  private var wakelock: PowerManager.WakeLock? = null
  private val handler = Handler(Looper.getMainLooper())

  private var ouviuFala = false
  private var silencioDesde = 0L
  private var gravando = false
  private var preparando = false
  private var destruido = false

  /* Referência nomeada, e não uma lambda solta em postDelayed: sem poder
     remover o callback, uma gravação encerrada aos 5s deixaria um corte
     agendado pros 20s que derrubaria a PRÓXIMA gravação no meio. */
  private val corteDuro = Runnable { if (gravando) encerrarEEntregar() }

  private val amostrador = object : Runnable {
    override fun run() {
      val r = recorder ?: return
      if (VoiceRetryScheduler.dono(this@GranaVoiceCaptureService) != donoDaCaptura) {
        abortar("sessao_mudou_durante_captura", EstadoWidget.REPETIR)
        return
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && r.activeRecordingConfiguration?.isClientSilenced == true) {
        interromperPorSilenciamento()
        return
      }
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
    /* Subir a primeiro plano vem antes de QUALQUER decisão, inclusive num
       "encerrar" que não vai encerrar nada. O provider chama
       `startForegroundService` em todo toque, e o Android derruba o app com
       ForegroundServiceDidNotStartInTimeException se o serviço não chamar
       `startForeground` em até cinco segundos — mesmo quando o comando era só
       "pare". Cenário real: o processo morre com o widget mostrando "ouvindo",
       a pessoa toca pra encerrar, e uma instância NOVA do serviço nasce com
       `gravando = false`; sem aquela chamada ela sairia sem nunca ter ido a
       primeiro plano, e o app inteiro cairia.

       A ÚNICA coisa que passa na frente é a checagem de permissão de
       microfone, logo abaixo, e por um motivo que é o oposto de descuido.

       A permissão é conferida AQUI, antes de subir a primeiro
       plano, e não só dentro de `iniciar()`.

       Motivo, que é o achado S4 da auditoria de 22/09/2026: a partir do
       Android 14, `startForeground` com o tipo `microphone` EXIGE
       `RECORD_AUDIO` e lança `SecurityException` sem ela. Ou seja, quem nunca
       tinha usado a voz dentro do app e tocava no widget nem chegava na
       checagem de `iniciar()`: estourava aqui, caía no `catch` abaixo e
       voltava ao repouso em silêncio, com um `erro_interno` só no logcat. Do
       lado de fora, a ferramenta simplesmente não fazia nada.

       Sair sem ter subido a primeiro plano é seguro porque `finalizar` chama
       `stopSelf` na hora: o prazo de cinco segundos do
       `ForegroundServiceDidNotStartInTimeException` vale para serviço que
       continua vivo sem ter ido a primeiro plano, não para um que encerra. */
    val comandoDeIniciar = intent?.action != ACAO_ENCERRAR && intent?.action != ACAO_CANCELAR
    if (comandoDeIniciar && !temPermissaoDeMicrofone()) {
      abortar("sem_permissao", EstadoWidget.ATENCAO)
      return START_NOT_STICKY
    }

    try {
      subirEmPrimeiroPlano()
    } catch (e: Exception) {
      /* Estado de ATENÇÃO, e não repouso: qualquer falha aqui deixa a pessoa
         sem microfone, e voltar ao repouso é indistinguível de "o toque não
         pegou" — que é o desfecho que a regra 9 do AGENTS.md proíbe. O toque
         no estado de atenção abre o app, que é onde dá para resolver. */
      android.util.Log.w("GranaVoz", "não consegui subir a primeiro plano", e)
      abortar("erro_interno", EstadoWidget.ATENCAO)
      return START_NOT_STICKY
    }

    when (intent?.action) {
      ACAO_ENCERRAR -> if (gravando) encerrarEEntregar() else finalizar(EstadoWidget.OCIOSO)
      ACAO_CANCELAR -> abortar(null)
      else -> iniciar(intent?.getStringExtra("requestId"))
    }
    return START_NOT_STICKY
  }

  private fun temPermissaoDeMicrofone(): Boolean =
    ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

  private fun iniciar(idPedido: String?) {
    val novoRequestId = idPedido ?: UUID.randomUUID().toString()
    if (gravando || preparando) {
      if (requestId == novoRequestId) return
      gravando = false
      preparando = false
      cancelarAgendados()
      liberar()
      arquivo?.delete()
      arquivo = null
    }
    requestId = novoRequestId
    if (!EstadoWidget.pertenceACaptura(this, novoRequestId)) EstadoWidget.preparar(this, novoRequestId)
    val dono = VoiceRetryScheduler.dono(this)
    if (dono == null) {
      abortar("sessao_ausente", EstadoWidget.ATENCAO)
      return
    }
    donoDaCaptura = dono
    microfoneSilenciado = false

    /* Continua aqui, além da checagem de `onStartCommand`: a permissão pode
       ser revogada entre uma coisa e outra, e esta função também é o caminho
       de quem já estava a primeiro plano. */
    if (!temPermissaoDeMicrofone()) {
      /* O widget não tem como pedir permissão: quem pede é uma tela. Aqui só
         resta acender o estado de atenção — cujo toque abre o app — em vez de
         voltar ao repouso como se o toque não tivesse pegado. */
      abortar("sem_permissao", EstadoWidget.ATENCAO)
      return
    }

    /* Notificação é pré-requisito para GRAVAR, não só para avisar no fim.
       Duas coisas dependem dela e as duas são inegociáveis: a notificação do
       serviço em primeiro plano carrega os botões Encerrar e Cancelar (sem
       ela o microfone abre sem nenhum controle visível), e o recibo do
       lançamento sai por notificação (sem ela o dinheiro entra calado).
       Abrir o microfone sabendo que nenhuma das duas vai aparecer é pior do
       que não gravar. */
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(this, "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED
    ) {
      abortar("sem_notificacao", EstadoWidget.ATENCAO)
      return
    }

    val destino = File(File(filesDir, PASTA_ORFA), "$novoRequestId.capturando")

    preparando = true
    // Sem agenda durável não abre o microfone. Um processo morto entre o
    // fechamento do M4A e o handoff já deixou uma retomada no WorkManager.
    Thread {
      try {
        check(VoiceRetryScheduler.agendar(this, novoRequestId, dono, 150_000)) { "sessão mudou" }
        destino.parentFile?.mkdirs()
        // O sufixo .capturando nunca é adotado pela fila JS.
        gravarMetadados(novoRequestId, dono, System.currentTimeMillis(), null, false)
        handler.post {
          if (requestId != novoRequestId || !EstadoWidget.pertenceACaptura(this, novoRequestId)) return@post
          preparando = false
          if (!destruido) {
            if (VoiceRetryScheduler.dono(this) == dono) iniciarGravador(destino, novoRequestId)
            else abortar("sessao_mudou_antes_da_captura", EstadoWidget.REPETIR)
          }
        }
      } catch (erro: Exception) {
        android.util.Log.e("GranaVoz", "não consegui preparar a retomada da captura", erro)
        handler.post {
          if (requestId != novoRequestId || !EstadoWidget.pertenceACaptura(this, novoRequestId)) return@post
          preparando = false
          if (!destruido) {
            publicarRecibo(R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto)
            abortar("agenda_indisponivel", EstadoWidget.REPETIR)
          }
        }
      }
    }.start()
  }

  private fun iniciarGravador(destino: File, novoRequestId: String) {

    val novoRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this) else @Suppress("DEPRECATION") MediaRecorder()
    try {
      novoRecorder.apply {
        setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) setPrivacySensitive(true)
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          callbackGravacao = object : AudioManager.AudioRecordingCallback() {
            override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>?) {
              if (configs.orEmpty().any { it.isClientSilenced }) interromperPorSilenciamento()
            }
          }.also { registerAudioRecordingCallback(mainExecutor, it) }
        }
        prepare()
        start()
      }
    } catch (e: Exception) {
      try { novoRecorder.release() } catch (_: Exception) {}
      destino.delete()
      android.util.Log.w("GranaVoz", "não consegui preparar a captura", e)
      publicarRecibo(R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto)
      abortar("microfone_ocupado", EstadoWidget.REPETIR)
      return
    }

    recorder = novoRecorder
    arquivo = destino
    requestId = novoRequestId
    capturadoEm = System.currentTimeMillis()
    dataCaptura = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(capturadoEm))
    try {
      gravarMetadados(novoRequestId, checkNotNull(donoDaCaptura), capturadoEm, dataCaptura, false)
    } catch (erro: Exception) {
      android.util.Log.e("GranaVoz", "não consegui persistir a referência da captura", erro)
      publicarRecibo(R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto)
      abortar("metadados_indisponiveis", EstadoWidget.REPETIR)
      return
    }
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

    EstadoWidget.definirDaCaptura(this, novoRequestId, EstadoWidget.OUVINDO)
    handler.postDelayed(amostrador, INTERVALO_AMOSTRA_MS)
    handler.postDelayed(corteDuro, LIMITE_MS)
  }

  private fun encerrarEEntregar() {
    if (!gravando) return
    gravando = false
    cancelarAgendados()

    val destino = arquivo
    val id = requestId
    val inicio = capturadoEm
    val dataDaFala = dataCaptura
    val dono = donoDaCaptura
    var arquivoValido = false
    try {
      recorder?.stop()
      arquivoValido = destino != null && destino.exists() && destino.length() > 1024
    } catch (e: Exception) {
      /* `stop()` lança quando a gravação foi curta demais pro encoder fechar
         um arquivo válido: toque duplo acidental, quase sempre. É "não falou
         nada", e ganha o recibo curto logo abaixo. */
      arquivoValido = false
    } finally {
      liberar()
    }

    if (!arquivoValido || destino == null || id == null) {
      destino?.delete()
      /* Até 26/09/2026 voltava ao repouso sem aviso (achado V3 do Watchtower).
         O mesmo recibo do botão do app (`RECIBOS_VOZ.naoOuvi` em
         lib/voz-recibos.ts; o texto aqui é a cópia vigiada por
         __tests__/voz-recibos-paridade.cjs). Nada é enviado nem transcrito. */
      publicarRecibo(R.string.grana_voice_nao_ouvi_titulo, R.string.grana_voice_nao_ouvi_texto)
      finalizar(EstadoWidget.OCIOSO)
      return
    }

    if (dono == null || VoiceRetryScheduler.dono(this) != dono) {
      destino.delete()
      finalizar(EstadoWidget.REPETIR)
      return
    }
    EstadoWidget.definirDaCaptura(this, id, EstadoWidget.PROCESSANDO)
    // O watchdog já está durável. Disco fora da UI; a tentativa imediata
    // começa AINDA com o FGS vivo, e o Worker fica como proteção de retomada.
    Thread {
      var persistida = false
      try {
        guardarParaOApp(destino, id, dono, inicio, dataDaFala)
        persistida = true
      } catch (erro: Exception) {
        android.util.Log.e("GranaVoz", "não consegui agendar a fala guardada", erro)
      }
      handler.post {
        if (requestId != id || !EstadoWidget.pertenceACaptura(this, id)) return@post
        if (VoiceRetryScheduler.dono(this) != dono) {
          finalizar(EstadoWidget.REPETIR)
          return@post
        }
        if (persistida) {
          val ponte = Intent(this, GranaVoiceHeadlessService::class.java).apply {
            putExtra("caminho", File(File(filesDir, PASTA_ORFA), "$id.m4a").absolutePath)
            putExtra("requestId", id)
            putExtra("userId", dono)
            putExtra("source", "widget")
            putExtra("capturadoEm", inicio.toDouble())
            putExtra("dataCaptura", dataDaFala)
          }
          try {
            startService(ponte)
            finalizar(null)
          } catch (erro: Exception) {
            android.util.Log.w("GranaVoz", "ponte imediata recusada; watchdog preservado", erro)
            publicarRecibo(R.string.grana_voice_guardada_titulo, R.string.grana_voice_guardada_texto)
            finalizar(EstadoWidget.PENDENTE)
            Thread {
              try { VoiceRetryScheduler.agendar(this, id, dono, 0) }
              catch (erroAgenda: Exception) { android.util.Log.e("GranaVoz", "watchdog não pôde ser antecipado", erroAgenda) }
            }.start()
          }
        } else {
          publicarRecibo(R.string.grana_voice_guardada_titulo, R.string.grana_voice_guardada_texto)
          finalizar(EstadoWidget.PENDENTE)
        }
      }
    }.start()
  }

  private fun interromperPorSilenciamento() {
    if (!gravando) return
    microfoneSilenciado = true
    publicarRecibo(R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto)
    abortar("captura_silenciada_pelo_android", EstadoWidget.REPETIR)
  }

  /**
   * Sai sem entregar nada. `motivo` é só pro log — nunca vai pra tela.
   *
   * `estado` decide o que a pessoa vê depois: `OCIOSO` quando ela mesma
   * cancelou ou quando dá pra tentar de novo na hora, e `ATENCAO` quando falta
   * algo que só se resolve dentro do app.
   */
  private fun abortar(motivo: String?, estado: String = EstadoWidget.OCIOSO) {
    gravando = false
    cancelarAgendados()
    liberar()
    arquivo?.delete()
    arquivo = null
    if (motivo != null) android.util.Log.w("GranaVoz", "gravação abortada: $motivo")
    finalizar(estado)
  }

  /** Move o áudio do cache para a pasta que o app adota ao abrir. Se nem isso
   *  der, o arquivo fica onde está: melhor sobrar no cache que sumir. */
  private fun guardarParaOApp(arquivoGravado: File, id: String, userId: String, inicio: Long, dataDaFala: String?) {
      val pasta = File(filesDir, PASTA_ORFA).apply { mkdirs() }
      // Sem dono persistido não há áudio adotável. Nunca atribuir ao próximo login.
      gravarMetadados(id, userId, inicio, dataDaFala, true)
      val alvo = File(pasta, "$id.m4a")
      if (!arquivoGravado.renameTo(alvo)) {
        arquivoGravado.copyTo(alvo, overwrite = true)
        arquivoGravado.delete()
      }
  }

  private fun gravarMetadados(id: String, userId: String, inicio: Long, dataDaFala: String?, finalizada: Boolean) {
    val pasta = File(filesDir, PASTA_ORFA).apply { mkdirs() }
    val texto = JSONObject().put("userId", userId).put("requestId", id)
      .put("capturadoEm", inicio).put("dataCaptura", dataDaFala).put("source", "widget")
      .put("capturaFinalizada", finalizada).toString()
    val temporario = File(pasta, "$id.json.tmp")
    java.io.FileOutputStream(temporario).use { saida ->
      saida.write(texto.toByteArray(Charsets.UTF_8))
      saida.fd.sync()
    }
    check(temporario.renameTo(File(pasta, "$id.json"))) { "não consegui finalizar metadados" }
  }

  /** Recibo curto no canal do lançamento por voz. Tocar abre o app. Falhar ao
   *  publicar deixa log: o recibo não pode derrubar o resto da saída. */
  private fun publicarRecibo(titulo: Int, texto: Int) {
    VoiceCaptureReceipt.publicar(this, titulo, texto)
  }

  private fun cancelarAgendados() {
    handler.removeCallbacks(amostrador)
    handler.removeCallbacks(corteDuro)
  }

  private fun liberar() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      callbackGravacao?.let { callback ->
        try { recorder?.unregisterAudioRecordingCallback(callback) } catch (erro: Exception) {
          android.util.Log.w("GranaVoz", "não consegui remover monitor da captura", erro)
        }
      }
    }
    callbackGravacao = null
    try { recorder?.reset() } catch (_: Exception) {}
    try { recorder?.release() } catch (_: Exception) {}
    recorder = null
    try { if (wakelock?.isHeld == true) wakelock?.release() } catch (_: Exception) {}
    wakelock = null
  }

  private fun finalizar(estado: String?) {
    if (estado != null) {
      val id = requestId
      if (id != null) EstadoWidget.definirDaCaptura(this, id, estado) else EstadoWidget.definir(this, estado)
    }
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
    destruido = true
    cancelarAgendados()
    liberar()
    super.onDestroy()
  }
}
