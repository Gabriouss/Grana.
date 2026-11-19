package com.gabriouss.grana.voicewidget
import android.content.Context
class GranaVoiceCaptureService {
  companion object { const val ACAO_INICIAR="start"; const val ACAO_ENCERRAR="stop"; const val CANAL="voice" }
}
object VoiceRetryScheduler { fun dono(context:Context):String?="synthetic-owner" }
object R {
  object layout { const val grana_voice_widget=1 }
  object id { const val grana_voice_circulo=1; const val grana_voice_rotulo=2; const val grana_voice_raiz=3 }
  object drawable {
    const val grana_voice_fundo=1; const val ic_grana_voice_mic_menta=2; const val ic_grana_voice_processando=3
    const val grana_voice_fundo_gradiente=4; const val ic_grana_voice_mic=5; const val ic_grana_voice_atencao=6
  }
  object string {
    const val grana_voice_ouvindo=1; const val grana_voice_preparando=2; const val grana_voice_pendente=3
    const val grana_voice_processando=4; const val grana_voice_repetir=5; const val grana_voice_atencao=6
    const val grana_voice_atencao_desc=7; const val grana_voice_ocioso=8
    const val grana_voice_canal=11; const val grana_voice_interrompida_titulo=9; const val grana_voice_interrompida_texto=10
  }
}
