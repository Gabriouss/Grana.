package android.content
import android.app.NotificationManager
open class Context {
  val packageName="qa.item24"
  val packageManager=PackageManager()
  val prefs=SharedPreferences()
  val starts=mutableListOf<Intent>()
  val notifications=NotificationManager()
  var startAttempts=0
  var failStart=false
  var failPrefs=false
  var failApply=false
  var failCommit=false
  var commits=0
  fun getSharedPreferences(name:String,mode:Int):SharedPreferences { if(failPrefs) error("prefs unavailable"); return prefs }
  fun getString(id:Int)="resource-$id"
  fun getSystemService(name:String):Any=notifications
  fun startForegroundService(i:Intent):Any? { startAttempts++; if(failStart) error("FGS unavailable"); starts.add(i); return null }
  fun startService(i:Intent):Any?=startForegroundService(i)
  init { prefs.owner=this }
  companion object { const val MODE_PRIVATE=0; const val NOTIFICATION_SERVICE="notification" }
}
class PackageManager { fun getLaunchIntentForPackage(name:String):Intent?=Intent() }
class ComponentName(packageName:String,name:String)
class Intent() {
  constructor(context:Context,target:Class<*>):this()
  @JvmField var action:String?=null
  val extras=mutableMapOf<String,Any>()
  fun setAction(value:String)=apply { action=value }
  fun putExtra(key:String,value:String)=apply { extras[key]=value }
  fun putExtra(key:String,value:Int)=apply { extras[key]=value }
  fun addFlags(flags:Int)=this
  companion object { const val FLAG_ACTIVITY_NEW_TASK=1; const val FLAG_ACTIVITY_CLEAR_TOP=2 }
}
class SharedPreferences {
  lateinit var owner:Context
  private val data=mutableMapOf<String,Any>()
  fun getString(k:String,default:String?):String?=data[k] as? String ?: default
  fun getLong(k:String,default:Long):Long=data[k] as? Long ?: default
  fun edit()=Editor()
  inner class Editor {
    private val pending=mutableMapOf<String,Any>()
    fun putString(k:String,v:String)=apply { pending[k]=v }
    fun putLong(k:String,v:Long)=apply { pending[k]=v }
    // Android commit false pode atualizar memoria apesar de falhar no disco.
    fun commit():Boolean { owner.commits++; data.putAll(pending); return !owner.failCommit }
    fun apply() { if(owner.failApply) error("apply unavailable"); data.putAll(pending) }
  }
}
