package com.gabriouss.grana.voicewidget

import android.content.Context
import android.media.AudioManager
import android.media.AudioRecordingConfiguration
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper

/** Monitor da captura expo-audio do app. VOICE_COMMUNICATION é privacy-sensitive por padrão. */
class VoiceCaptureMonitor(context: Context) {
  private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  @Volatile var silenciada = false
    private set
  private val callback = object : AudioManager.AudioRecordingCallback() {
    override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>?) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && configs.orEmpty().any {
        it.clientAudioSource == MediaRecorder.AudioSource.VOICE_COMMUNICATION && it.isClientSilenced
      }) silenciada = true
    }
  }

  fun iniciar() {
    silenciada = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) audio.registerAudioRecordingCallback(callback, Handler(Looper.getMainLooper()))
  }

  fun parar() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) audio.unregisterAudioRecordingCallback(callback)
  }
}
