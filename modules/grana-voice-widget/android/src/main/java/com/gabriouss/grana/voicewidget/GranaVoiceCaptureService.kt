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
import android.os.HandlerThread
import android.os.SystemClock
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
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
  private var sessaoDaCaptura: VoiceRetryScheduler.Sessao? = null
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
  private val main = Handler(Looper.getMainLooper())
  private val filaGravador = HandlerThread("grana-voz-recorder").apply { start() }
  private val handler = Handler(filaGravador.looper)
  private val disco = Executors.newSingleThreadExecutor { Thread(it, "grana-voz-disco") }
  private class Intencao(val id: String, val origem: VoiceRetryScheduler.Sessao?, val prazo: Long) {
    // A publicação vence o cancelamento uma única vez, antes de tornar o JSON adotável.
    private val decisao = AtomicInteger(0) // 0: em curso; 1: cancelada; 2: entrega aceita.
    var cancelada: Boolean
      get() = decisao.get() == 1
      set(valor) { if (valor) decisao.compareAndSet(0, 1) }
    val entregaAceita: Boolean get() = decisao.get() == 2
    fun aceitarEntrega(): Boolean = decisao.compareAndSet(0, 2)
    @Volatile var jsonPublicado = false
    fun recusarPublicacao() { if (!jsonPublicado) decisao.compareAndSet(2, 1) }
    @Volatile var prazoEntrega = Long.MAX_VALUE
    @Volatile var concluida = false
    @Volatile var encerrando = false
    @Volatile var preparada = false
    @Volatile var vencida = false
    @Volatile var registrada = false
  }
  @Volatile private var ativa: Intencao? = null
  private var emUso: Intencao? = null // Somente a fila do gravador acessa seus recursos.
  private val donosArquivos = mutableMapOf<String, Intencao>() // Somente a fila de disco.

  private fun vigente(i: Intencao): Boolean = !destruido && ativa === i && !i.cancelada &&
    i.origem?.let { VoiceRetryScheduler.atual(this, it) } == true &&
    (!i.registrada || EstadoWidget.pertenceACaptura(this, i.id))

  private fun limparArquivos(i: Intencao) {
    if (donosArquivos[i.id] !== i || i.entregaAceita) return
    for (ext in listOf("capturando", "json.tmp", "json", "m4a")) File(File(filesDir, PASTA_ORFA), "${i.id}.$ext").delete()
    donosArquivos.remove(i.id)
  }

  private fun expirar(i: Intencao) {
    if (ativa !== i || i.concluida || i.cancelada || i.entregaAceita) return
    i.cancelada = true
    i.vencida = true
    publicarRecibo(R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto)
    try { EstadoWidget.definirDaCaptura(this, i.id, EstadoWidget.REPETIR) }
    catch (erro: Exception) { android.util.Log.e("GranaVoz", "não consegui mostrar o prazo da captura", erro) }
    handler.post { if (emUso === i) abortar("microfone_ocupado", EstadoWidget.REPETIR) }
  }

  private var ouviuFala = false
  private var silencioDesde = 0L
  private var gravando = false
  private var preparando = false
  @Volatile private var destruido = false

  /* Referência nomeada, e não uma lambda solta em postDelayed: sem poder
     remover o callback, uma gravação encerrada aos 5s deixaria um corte
     agendado pros 20s que derrubaria a PRÓXIMA gravação no meio. */
  private val corteDuro = Runnable { if (gravando) encerrarEEntregar() }

  private val amostrador = object : Runnable {
    override fun run() {
      val r = recorder ?: return
      if (sessaoDaCaptura?.let { VoiceRetryScheduler.atual(this@GranaVoiceCaptureService, it) } != true) {
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
      ativa?.cancelada = true
      handler.post { abortar("sem_permissao", EstadoWidget.ATENCAO) }
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
      ativa?.cancelada = true
      handler.post { abortar("erro_interno", EstadoWidget.ATENCAO) }
      return START_NOT_STICKY
    }

    when (intent?.action) {
      ACAO_ENCERRAR -> {
        val i = ativa
        if (i != null && !i.concluida && !i.cancelada && !i.encerrando) {
          i.prazoEntrega = SystemClock.elapsedRealtime() + 5_000L
          main.postDelayed({ expirar(i) }, 5_000L)
          i.encerrando = true
          handler.post { if (emUso === i && vigente(i)) {
            if (gravando) encerrarEEntregar() else abortar(null)
          } }
        } else if (i == null) handler.post { finalizar(EstadoWidget.OCIOSO) }
      }
      ACAO_CANCELAR -> {
        val i = ativa
        i?.cancelada = true
        if (i?.entregaAceita != true) handler.post { if (emUso === i) abortar(null) }
      }
      else -> {
        val id = intent?.getStringExtra("requestId") ?: UUID.randomUUID().toString()
        val anterior = ativa
        if (anterior?.id == id && (anterior.entregaAceita || (!anterior.cancelada && !anterior.concluida))) return START_NOT_STICKY
        anterior?.cancelada = true
        val i = Intencao(id, VoiceRetryScheduler.sessao(this), SystemClock.elapsedRealtime() + EstadoWidget.PREPARACAO_MAX_MS)
        ativa = i
        main.postDelayed({ if (!i.preparada) expirar(i) }, EstadoWidget.PREPARACAO_MAX_MS)
        handler.post {
          if (!vigente(i)) {
            if (ativa === i) { emUso = i; requestId = id; abortar("sessao_ausente", EstadoWidget.ATENCAO) }
            return@post
          }
          cancelarAgendados()
          liberar()
          anterior?.let { disco.execute { limparArquivos(it) } }
          arquivo = null
          gravando = false
          preparando = false
          emUso = i
          iniciar(id)
        }
      }
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
    val intencao = checkNotNull(emUso)
    val dono = VoiceRetryScheduler.dono(this)
    if (dono == null) {
      abortar("sessao_ausente", EstadoWidget.ATENCAO)
      return
    }
    donoDaCaptura = dono
    val origem = VoiceRetryScheduler.sessao(this)
    if (origem == null || origem.userId != dono) {
      abortar("sessao_mudou_antes_da_agenda", EstadoWidget.REPETIR)
      return
    }
    sessaoDaCaptura = origem
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
    disco.execute {
      try {
        if (!vigente(intencao)) return@execute
        donosArquivos[novoRequestId] = intencao
        if (!EstadoWidget.pertenceACaptura(this, novoRequestId)) EstadoWidget.preparar(this, novoRequestId)
        intencao.registrada = true
        check(VoiceRetryScheduler.agendar(this, novoRequestId, dono, 150_000, origem.geracao)) { "sessão mudou" }
        destino.parentFile?.mkdirs()
        // O sufixo .capturando nunca é adotado pela fila JS.
        gravarMetadados(novoRequestId, dono, System.currentTimeMillis(), null, false, intencao)
        handler.post {
          if (emUso !== intencao) return@post
          if (!vigente(intencao)) {
            if (ativa === intencao && !intencao.cancelada) {
              publicarRecibo(R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto)
              abortar("sessao_mudou_antes_da_captura", EstadoWidget.REPETIR)
            }
            return@post
          }
          preparando = false
          if (!destruido) {
            if (VoiceRetryScheduler.atual(this, origem)) iniciarGravador(destino, novoRequestId)
            else abortar("sessao_mudou_antes_da_captura", EstadoWidget.REPETIR)
          }
        }
      } catch (erro: Exception) {
        android.util.Log.e("GranaVoz", "não consegui preparar a retomada da captura", erro)
        handler.post {
          if (emUso !== intencao) return@post
          if (!vigente(intencao)) {
            if (ativa === intencao && !intencao.cancelada) {
              publicarRecibo(R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto)
              abortar("sessao_mudou_antes_da_captura", EstadoWidget.REPETIR)
            }
            return@post
          }
          preparando = false
          if (!destruido) {
            publicarRecibo(R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto)
            abortar("agenda_indisponivel", EstadoWidget.REPETIR)
          }
        }
      }
    }
  }

  private fun iniciarGravador(destino: File, novoRequestId: String) {
    val intencao = checkNotNull(emUso)
    if (!vigente(intencao) || intencao.encerrando || SystemClock.elapsedRealtime() >= intencao.prazo) {
      abortar("microfone_ocupado", EstadoWidget.REPETIR)
      return
    }

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
              handler.post { if (emUso === intencao && vigente(intencao) && configs.orEmpty().any { it.isClientSilenced }) interromperPorSilenciamento() }
            }
          }.also { registerAudioRecordingCallback(mainExecutor, it) }
        }
        prepare()
        if (!vigente(intencao) || intencao.encerrando || SystemClock.elapsedRealtime() >= intencao.prazo) {
          release()
          disco.execute { limparArquivos(intencao) }
          if (!intencao.cancelada) publicarRecibo(R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto)
          finalizar(if (intencao.cancelada && !intencao.vencida) EstadoWidget.OCIOSO else EstadoWidget.REPETIR)
          return
        }
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
    val dono = checkNotNull(donoDaCaptura)
    val inicio = capturadoEm
    val data = dataCaptura
    disco.execute {
      try { gravarMetadados(novoRequestId, dono, inicio, data, false, intencao) }
      catch (erro: Exception) {
        android.util.Log.e("GranaVoz", "não consegui persistir a referência da captura", erro)
        handler.post { if (emUso === intencao && vigente(intencao)) {
          publicarRecibo(R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto)
          abortar("metadados_indisponiveis", EstadoWidget.REPETIR)
        } }
      }
    }
    if (!vigente(intencao)) { abortar(null); return }
    intencao.preparada = true
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
    main.postDelayed({ if (!intencao.encerrando) expirar(intencao) }, LIMITE_MS + 5_000L)
  }

  private fun encerrarEEntregar() {
    if (!gravando) return
    gravando = false
    val intencao = checkNotNull(emUso)
    if (!intencao.encerrando) intencao.prazoEntrega = SystemClock.elapsedRealtime() + 5_000L
    intencao.encerrando = true
    main.postDelayed({ expirar(intencao) }, (intencao.prazoEntrega - SystemClock.elapsedRealtime()).coerceAtLeast(0))
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

    if (!vigente(intencao)) {
      if (!intencao.cancelada) publicarRecibo(R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto)
      disco.execute { limparArquivos(intencao) }
      finalizar(if (intencao.cancelada && !intencao.vencida) EstadoWidget.OCIOSO else EstadoWidget.REPETIR)
      return
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

    val origem = sessaoDaCaptura
    if (dono == null || origem == null || !VoiceRetryScheduler.atual(this, origem)) {
      destino.delete()
      finalizar(EstadoWidget.REPETIR)
      return
    }
    EstadoWidget.definirDaCaptura(this, id, EstadoWidget.PROCESSANDO)
    // O watchdog já está durável. Disco fora da UI; a tentativa imediata
    // começa AINDA com o FGS vivo, e o Worker fica como proteção de retomada.
    disco.execute {
      var persistida = false
      try {
        persistida = guardarParaOApp(destino, id, dono, inicio, dataDaFala)
      } catch (erro: Exception) {
        android.util.Log.e("GranaVoz", "não consegui agendar a fala guardada", erro)
        if (!intencao.jsonPublicado) {
          intencao.recusarPublicacao()
          limparArquivos(intencao)
        }
      }
      handler.post {
        if (emUso !== intencao) return@post
        if (!persistida && !intencao.jsonPublicado) {
          if (ativa === intencao && !intencao.concluida) {
            publicarRecibo(R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto)
            abortar("metadados_indisponiveis", EstadoWidget.REPETIR)
          }
          return@post
        }
          if (!vigente(intencao)) {
            if (ativa === intencao && !intencao.cancelada) {
              publicarRecibo(R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto)
              abortar("sessao_mudou_antes_da_captura", EstadoWidget.REPETIR)
            }
            return@post
          }
        if (!VoiceRetryScheduler.atual(this, origem)) {
          finalizar(EstadoWidget.REPETIR)
          return@post
        }
        if (persistida && File(File(filesDir, PASTA_ORFA), "$id.m4a").isFile) {
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
            intencao.concluida = true
            finalizar(null)
          } catch (erro: Exception) {
            android.util.Log.w("GranaVoz", "ponte imediata recusada; watchdog preservado", erro)
            publicarRecibo(R.string.grana_voice_guardada_titulo, R.string.grana_voice_guardada_texto)
            finalizar(EstadoWidget.PENDENTE)
            disco.execute {
              try { VoiceRetryScheduler.agendar(this, id, dono, 0, origem.geracao) }
              catch (erroAgenda: Exception) { android.util.Log.e("GranaVoz", "watchdog não pôde ser antecipado", erroAgenda) }
            }
          }
        } else {
          publicarRecibo(R.string.grana_voice_guardada_titulo, R.string.grana_voice_guardada_texto)
          finalizar(EstadoWidget.PENDENTE)
        }
      }
    }
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
    if (emUso?.entregaAceita == true) { finalizar(EstadoWidget.PENDENTE); return }
    gravando = false
    preparando = false
    emUso?.let { i -> i.cancelada = true; disco.execute { limparArquivos(i) } }
    cancelarAgendados()
    liberar()
    arquivo = null
    if (motivo != null) android.util.Log.w("GranaVoz", "gravação abortada: $motivo")
    finalizar(estado)
  }

  /** Move o áudio do cache para a pasta que o app adota ao abrir. Se nem isso
   *  der, o arquivo fica onde está: melhor sobrar no cache que sumir. */
  private fun guardarParaOApp(arquivoGravado: File, id: String, userId: String, inicio: Long, dataDaFala: String?): Boolean {
      val intencao = donosArquivos[id] ?: return false
      if (!vigente(intencao)) { limparArquivos(intencao); return false }
      val pasta = File(filesDir, PASTA_ORFA).apply { mkdirs() }
      // Sem dono persistido não há áudio adotável. Nunca atribuir ao próximo login.
      if (!gravarMetadados(id, userId, inicio, dataDaFala, true, intencao)) return false
      if (!intencao.entregaAceita) { limparArquivos(intencao); return false }
      val alvo = File(pasta, "$id.m4a")
      if (!arquivoGravado.exists() && alvo.isFile) return alvo.length() > 1024 // O Worker já recuperou esta entrega aceita.
      if (!arquivoGravado.renameTo(alvo)) {
        arquivoGravado.copyTo(alvo, overwrite = true)
        arquivoGravado.delete()
      }
      return alvo.isFile && alvo.length() > 1024
  }

  private fun gravarMetadados(id: String, userId: String, inicio: Long, dataDaFala: String?, finalizada: Boolean, intencao: Intencao): Boolean {
    if (!vigente(intencao)) { limparArquivos(intencao); return false }
    val pasta = File(filesDir, PASTA_ORFA).apply { mkdirs() }
    val texto = JSONObject().put("userId", userId).put("requestId", id)
      .put("capturadoEm", inicio).put("dataCaptura", dataDaFala).put("source", "widget")
      .put("capturaFinalizada", finalizada).toString()
    val temporario = File(pasta, "$id.json.tmp")
    java.io.FileOutputStream(temporario).use { saida ->
      saida.write(texto.toByteArray(Charsets.UTF_8))
      saida.fd.sync()
    }
    if (!vigente(intencao) || (finalizada && SystemClock.elapsedRealtime() >= intencao.prazoEntrega)) {
      limparArquivos(intencao)
      return false
    }
    if (finalizada) {
      val aceita = synchronized(VoiceRetryScheduler) {
        vigente(intencao) && SystemClock.elapsedRealtime() < intencao.prazoEntrega && intencao.aceitarEntrega()
      }
      if (!aceita) { limparArquivos(intencao); return false }
    }
    check(temporario.renameTo(File(pasta, "$id.json"))) { "não consegui finalizar metadados" }
    if (finalizada) intencao.jsonPublicado = true
    return true
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
    val intencao = emUso
    intencao?.concluida = true
    main.post {
      if (ativa !== intencao || destruido) return@post
      try {
        if (estado != null) {
          val id = requestId
          if (id != null) EstadoWidget.definirDaCaptura(this, id, estado) else EstadoWidget.definir(this, estado)
        }
      } catch (erro: Exception) {
        android.util.Log.e("GranaVoz", "não consegui finalizar o estado da captura", erro)
        publicarRecibo(R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE)
      else @Suppress("DEPRECATION") stopForeground(true)
      stopSelf()
    }
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
    val i = ativa
    if (i?.concluida != true) i?.cancelada = true
    handler.post {
      cancelarAgendados()
      liberar()
      if (i != null && i.cancelada) disco.execute { limparArquivos(i) }
      disco.shutdown()
      filaGravador.quitSafely()
    }
    super.onDestroy()
  }
}
