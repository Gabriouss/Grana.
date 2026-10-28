package com.gabriouss.grana.voicewidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import java.util.UUID

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
  const val PREPARANDO = "preparando"
  const val OUVINDO = "ouvindo"
  const val PROCESSANDO = "processando"
  const val PENDENTE = "pendente"
  const val REPETIR = "repetir"

  /**
   * Precisa da pessoa antes de poder gravar de novo: falta a permissão de
   * microfone ou a de notificação, ou o serviço não conseguiu subir a
   * primeiro plano.
   *
   * Existe porque o widget não tem outro jeito de falar. Sem notificação ele
   * não entrega recibo nem "Desfazer", então não lança; e voltar ao repouso
   * calado faria parecer que o toque não pegou. Este estado FICA na tela até
   * alguém tocar, e o toque abre o app em vez de abrir o microfone.
   */
  const val ATENCAO = "atencao"

  private const val PREFS = "grana_voice_widget"
  private const val CHAVE_ESTADO = "estado"
  private const val CHAVE_REQUEST = "requestIdCaptura"
  private const val CHAVE_DESDE = "estadoDesde"
  private const val CHAVE_PROCESSO = "processoCaptura"
  private val processoAtual = UUID.randomUUID().toString()
  internal const val PREPARACAO_MAX_MS = 60_000L
  internal const val CAPTURA_MAX_MS = 25_000L

  @Synchronized
  fun preparar(context: Context, requestId: String, agora: Long = System.currentTimeMillis()) {
    check(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString(CHAVE_ESTADO, PREPARANDO).putString(CHAVE_REQUEST, requestId)
      .putLong(CHAVE_DESDE, agora).putString(CHAVE_PROCESSO, processoAtual).commit())
    redesenhar(context)
  }

  fun pertenceACaptura(context: Context, requestId: String): Boolean =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(CHAVE_REQUEST, null) == requestId

  @Synchronized
  fun definirDaCaptura(context: Context, requestId: String, estado: String): Boolean {
    if (!pertenceACaptura(context, requestId)) return false
    definir(context, estado)
    return true
  }

  /** Recupera também a morte ANTES da agenda/journal. Nunca altera outra intenção. */
  @Synchronized
  fun recuperarCapturaInterrompida(context: Context, requestId: String? = null, agora: Long = System.currentTimeMillis()): Boolean {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val estado = prefs.getString(CHAVE_ESTADO, OCIOSO)
    if (estado != PREPARANDO && estado != OUVINDO) return false
    if (requestId != null && !pertenceACaptura(context, requestId)) return false
    val idade = agora - prefs.getLong(CHAVE_DESDE, 0)
    val outroProcesso = prefs.getString(CHAVE_PROCESSO, null) != processoAtual
    val limite = if (estado == PREPARANDO) PREPARACAO_MAX_MS else CAPTURA_MAX_MS
    if (!outroProcesso && idade in 0 until limite) return false
    definir(context, REPETIR)
    VoiceCaptureReceipt.publicar(context, R.string.grana_voice_interrompida_titulo, R.string.grana_voice_interrompida_texto)
    return true
  }

  fun atual(context: Context): String =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(CHAVE_ESTADO, OCIOSO) ?: OCIOSO

  @Synchronized
  fun definir(context: Context, estado: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(CHAVE_ESTADO, estado)
      .putLong(CHAVE_DESDE, System.currentTimeMillis()).putString(CHAVE_PROCESSO, processoAtual).apply()
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
