package com.gabriouss.grana.voicewidget

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Ponte entre o áudio gravado e o JavaScript do app, sem abrir tela nenhuma.
 *
 * O JS que roda aqui é o mesmo bundle do app — ou seja, a tarefa tem acesso à
 * sessão do Supabase e a `lib/heuristics.ts`, o mesmo parser do bot do
 * WhatsApp. É por isso que o widget não precisa de um parser próprio nem de
 * um endpoint que interprete: ele já sabe interpretar, só não sabe transcrever
 * (a chave do Whisper não pode morar no APK).
 *
 * A tarefa se chama `GranaVoiceTask` e é registrada em `lib/widget-voz-task.ts`.
 */
class GranaVoiceHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    return HeadlessJsTaskConfig(
      "GranaVoiceTask",
      Arguments.fromBundle(extras),
      /* Transcrição em rede ruim mais a gravação do lançamento: 2 minutos é
         folgado de propósito. O que o timeout evita é tarefa pendurada pra
         sempre segurando o processo, não demora legítima. */
      120_000,
      /* Permitido também com o app aberto: quem toca no widget pode estar com
         o Grana. em segundo plano na mesma hora, e sem isto o React Native
         recusa a tarefa com "Tried to start task while in foreground". */
      true
    )
  }
}
