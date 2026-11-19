package android.app
import android.content.*
import android.os.Build
class PendingIntent {
  companion object {
    const val FLAG_UPDATE_CURRENT=1; const val FLAG_IMMUTABLE=2
    fun getBroadcast(c:Context,id:Int,i:Intent,flags:Int)=PendingIntent()
    fun getActivity(c:Context,id:Int,i:Intent,flags:Int)=PendingIntent()
  }
}
class NotificationChannel(val id:String,name:String,importance:Int) { fun setShowBadge(value:Boolean) {} }
class Notification
class NotificationManager {
  var fail=false
  var attempts=0
  val delivered=mutableListOf<Int>()
  val channels=mutableMapOf<String,NotificationChannel>()
  fun getNotificationChannel(id:String):NotificationChannel?=channels[id]
  fun createNotificationChannel(channel:NotificationChannel) { channels[channel.id]=channel }
  fun notify(id:Int,value:Notification) {
    attempts++
    if(fail) error("notifications unavailable")
    check(Build.VERSION.SDK_INT<26 || channels.containsKey("voice")) { "canal ausente" }
    delivered.add(id)
  }
  companion object { const val IMPORTANCE_LOW=2 }
}
