package android.os

import java.util.concurrent.*
import java.util.concurrent.CopyOnWriteArrayList

interface IBinder
object SystemClock { @Volatile var now = 0L; fun elapsedRealtime() = now }
class Looper(name: String) {
  val executor = ScheduledThreadPoolExecutor(1) { r -> Thread(r, name).apply { isDaemon = true } }
  companion object { val main = Looper("fixture-main"); fun getMainLooper() = main }
}
class HandlerThread(name: String) {
  val looper = Looper(name)
  fun start() {}
  fun quitSafely(): Boolean { looper.executor.shutdown(); return true }
}
class Handler(val looper: Looper) {
  data class Delayed(val h: Handler, val r: Runnable, val due: Long)
  fun post(r: Runnable): Boolean { if (looper.executor.isShutdown) return false; looper.executor.execute { try { r.run() } catch (e: Throwable) { errors.add(e) } }; return true }
  fun postDelayed(r: Runnable, ms: Long): Boolean { delayed.add(Delayed(this, r, SystemClock.now + ms)); return true }
  fun removeCallbacks(r: Runnable) { delayed.removeIf { it.h === this && it.r === r } }
  companion object {
    val delayed = CopyOnWriteArrayList<Delayed>()
    val errors = CopyOnWriteArrayList<Throwable>()
    fun advance(ms: Long) { SystemClock.now += ms; delayed.filter { it.due <= SystemClock.now }.forEach { if (delayed.remove(it)) it.h.post(it.r) } }
  }
}
object Build {
  object VERSION { const val SDK_INT = 34 }
  object VERSION_CODES { const val M=23; const val N=24; const val O=26; const val Q=29; const val R=30; const val S=31 }
}
class PowerManager {
  val locks = CopyOnWriteArrayList<WakeLock>()
  class WakeLock { @Volatile var isHeld=false; var timeout=0L; fun setReferenceCounted(v:Boolean){}; fun acquire(ms:Long){isHeld=true;timeout=ms};fun release(){isHeld=false} }
  fun newWakeLock(level:Int,tag:String)=WakeLock().also { locks.add(it) }
  companion object { const val PARTIAL_WAKE_LOCK=1 }
}
