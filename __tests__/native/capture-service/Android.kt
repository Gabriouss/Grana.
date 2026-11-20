package android.content

import android.app.NotificationManager
import android.os.PowerManager
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

open class Context: com.facebook.react.ReactApplication {
  override val reactHost = com.facebook.react.ReactHost()
  val packageName = "qa.capture"
  val filesDir = java.nio.file.Files.createTempDirectory("capture-fixture-").toFile()
  private val prefs = ConcurrentHashMap<String, SharedPreferences>()
  val notifications = NotificationManager()
  val power = PowerManager()
  val starts = CopyOnWriteArrayList<Intent>()
  var failBridge = false
  fun getSharedPreferences(n: String, m: Int) = prefs.computeIfAbsent(n) { SharedPreferences() }
  fun getSystemService(n: String): Any = if (n == POWER_SERVICE) power else notifications
  fun getString(i: Int) = "resource-$i"
  val mainExecutor: java.util.concurrent.Executor get() = java.util.concurrent.Executor { android.os.Handler(android.os.Looper.getMainLooper()).post(it) }
  fun startService(i: Intent): Any? { if (failBridge) error("bridge unavailable"); starts.add(i); return null }
  companion object { const val MODE_PRIVATE = 0; const val NOTIFICATION_SERVICE = "notification"; const val POWER_SERVICE = "power" }
}
class ComponentName(p: String, n: String)
class Intent() {
  constructor(c: Context, target: Class<*>): this()
  var action: String? = null
  val extras = ConcurrentHashMap<String, Any>()
  fun setAction(a: String) = apply { action = a }
  fun putExtra(k: String, v: String?) = apply { if (v != null) extras[k] = v }
  fun putExtra(k: String, v: Double) = apply { extras[k] = v }
  fun getStringExtra(k: String) = extras[k] as? String
}
class SharedPreferences {
  private val values = ConcurrentHashMap<String, Any>()
  fun getString(k: String, d: String?) = values[k] as? String ?: d
  fun getLong(k: String, d: Long) = values[k] as? Long ?: d
  fun edit() = Editor()
  inner class Editor {
    private val changes = mutableMapOf<String, Any?>()
    fun putString(k: String, v: String?) = apply { changes[k] = v }
    fun putLong(k: String, v: Long) = apply { changes[k] = v }
    fun remove(k: String) = apply { changes[k] = null }
    fun commit(): Boolean { changes.forEach { (k,v) -> if (v == null) values.remove(k) else values[k] = v }; return true }
    fun apply() { commit() }
  }
}
