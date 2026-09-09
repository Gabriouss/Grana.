package com.gabriouss.grana.voicewidget

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.SystemClock
import java.io.File

/** Decodifica AAC/M4A antes de entregar bytes PCM ao SpeechRecognizer. */
object VoicePcmDecoder {
  fun decode(context: Context, uri: String): Map<String, Any> {
    val input = File(Uri.parse(uri).path ?: error("Áudio ausente")).canonicalFile
    require(listOf(context.cacheDir, context.filesDir).any {
      input.path.startsWith(it.canonicalPath + File.separator)
    }) { "Áudio fora do armazenamento privado" }
    require(input.exists() && input.length() in 1..2_097_152) { "Áudio inválido" }
    val output = File.createTempFile("grana-voz-", ".pcm", context.cacheDir)
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    var started = false
    try {
      extractor.setDataSource(input.path)
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: error("Áudio sem faixa sonora")
      extractor.selectTrack(track)
      val format = extractor.getTrackFormat(track)
      var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      val decoder = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
      codec = decoder
      decoder.configure(format, null, null, 0)
      decoder.start()
      started = true
      var inputEnded = false
      var outputEnded = false
      val info = MediaCodec.BufferInfo()
      val deadline = SystemClock.elapsedRealtime() + 5_000
      output.outputStream().use { stream ->
        while (!outputEnded) {
          check(SystemClock.elapsedRealtime() < deadline) { "Tempo de decodificação excedido" }
          if (!inputEnded) {
            val index = decoder.dequeueInputBuffer(10_000)
            if (index >= 0) {
              val buffer = decoder.getInputBuffer(index) ?: error("Buffer indisponível")
              val size = extractor.readSampleData(buffer, 0)
              if (size < 0) {
                decoder.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                inputEnded = true
              } else {
                decoder.queueInputBuffer(index, 0, size, extractor.sampleTime, 0)
                extractor.advance()
              }
            }
          }
          val index = decoder.dequeueOutputBuffer(info, 10_000)
          if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            val decoded = decoder.outputFormat
            sampleRate = decoded.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            channels = decoded.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            require(!decoded.containsKey(MediaFormat.KEY_PCM_ENCODING) ||
              decoded.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_16BIT) {
              "Formato PCM não suportado"
            }
          } else if (index >= 0) {
            try {
              if (info.size > 0) {
                val buffer = decoder.getOutputBuffer(index) ?: error("Buffer indisponível")
                buffer.position(info.offset)
                buffer.limit(info.offset + info.size)
                val bytes = ByteArray(info.size)
                buffer.get(bytes)
                stream.write(bytes)
                check(output.length() <= 8_000_000) { "Áudio decodificado muito grande" }
              }
              outputEnded = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            } finally { decoder.releaseOutputBuffer(index, false) }
          }
        }
      }
      check(output.length() > 0) { "Áudio vazio" }
      return mapOf("uri" to Uri.fromFile(output).toString(), "sampleRate" to sampleRate,
        "audioChannels" to channels, "audioEncoding" to AudioFormat.ENCODING_PCM_16BIT)
    } catch (error: Exception) {
      output.delete()
      throw error
    } finally {
      try { if (started) codec?.stop() } finally {
        try { codec?.release() } finally { extractor.release() }
      }
    }
  }
}
