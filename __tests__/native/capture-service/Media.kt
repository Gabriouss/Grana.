package android.media

import android.content.Context
import com.gabriouss.grana.voicewidget.CaptureFixture
import java.util.concurrent.Executor

class AudioRecordingConfiguration(val isClientSilenced:Boolean=false)
class AudioManager { open class AudioRecordingCallback { open fun onRecordingConfigChanged(c:MutableList<AudioRecordingConfiguration>?){} } }
class MediaRecorder() {
  constructor(c:Context):this()
  val id=CaptureFixture.recorderIds.incrementAndGet()
  private var output=""
  var released=false
  val activeRecordingConfiguration:AudioRecordingConfiguration? get()=null
  val maxAmplitude:Int get() { CaptureFixture.point("amplitude",id); return 1000 }
  private var callback:AudioManager.AudioRecordingCallback?=null
  private var executor:Executor?=null
  fun setAudioSource(v:Int){CaptureFixture.point("source:$v",id)}
  fun setPrivacySensitive(v:Boolean){}
  fun setOutputFormat(v:Int){}
  fun setAudioEncoder(v:Int){}
  fun setAudioChannels(v:Int){CaptureFixture.config.add("channels:$v")}
  fun setAudioSamplingRate(v:Int){CaptureFixture.config.add("sample:$v")}
  fun setAudioEncodingBitRate(v:Int){CaptureFixture.config.add("bitrate:$v")}
  fun setOutputFile(v:String){output=v}
  fun registerAudioRecordingCallback(e:Executor,c:AudioManager.AudioRecordingCallback){executor=e;callback=c}
  fun unregisterAudioRecordingCallback(c:AudioManager.AudioRecordingCallback){CaptureFixture.point("unregister",id);callback=null}
  fun prepare(){CaptureFixture.point("prepare",id);if(CaptureFixture.failPrepare)error("prepare unavailable")}
  fun start(){CaptureFixture.point("start",id);java.io.File(output).writeBytes(ByteArray(CaptureFixture.audioBytes));CaptureFixture.recorders.add(this)}
  fun stop(){CaptureFixture.point("stop",id);if(CaptureFixture.failStop)error("encoder unavailable")}
  fun reset(){CaptureFixture.point("reset",id)}
  fun release(){CaptureFixture.point("release",id);check(!released){"double release"};released=true}
  fun silence(){callback?.let{c->executor?.execute{c.onRecordingConfigChanged(mutableListOf(AudioRecordingConfiguration(true)))}}}
  object AudioSource{const val VOICE_COMMUNICATION=7}
  object OutputFormat{const val MPEG_4=2}
  object AudioEncoder{const val AAC=3}
}
