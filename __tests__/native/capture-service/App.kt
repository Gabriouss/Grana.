package android.app

import android.content.*
import android.os.IBinder
import java.util.concurrent.CopyOnWriteArrayList

open class Service: Context() {
  @Volatile var foreground = false
  @Volatile var stopped = false
  val lifecycle = CopyOnWriteArrayList<String>()
  open fun onBind(i: Intent?): IBinder? = null
  open fun onStartCommand(i: Intent?, f: Int, s: Int) = 2
  open fun onDestroy() {}
  fun startForeground(id: Int, n: Notification) { foreground=true; lifecycle.add("foreground") }
  fun startForeground(id: Int, n: Notification, type:Int) = startForeground(id,n)
  fun stopForeground(v:Int){foreground=false;lifecycle.add("remove")}
  fun stopForeground(v:Boolean){foreground=false;lifecycle.add("remove")}
  fun stopSelf(){stopped=true;lifecycle.add("stopSelf")}
  companion object { const val START_NOT_STICKY=2; const val STOP_FOREGROUND_REMOVE=1 }
}
class Notification { var title="" }
class NotificationChannel(val id:String,n:String,importance:Int){fun setShowBadge(v:Boolean){}}
class NotificationManager {
  val channels=java.util.concurrent.ConcurrentHashMap<String,NotificationChannel>()
  val receipts=CopyOnWriteArrayList<Int>()
  val titles=CopyOnWriteArrayList<String>()
  var failNotify=false
  fun getNotificationChannel(id:String)=channels[id]
  fun createNotificationChannel(c:NotificationChannel){channels[c.id]=c}
  fun notify(id:Int,n:Notification){if(failNotify)error("notification unavailable");receipts.add(id);titles.add(n.title)}
  companion object{const val IMPORTANCE_LOW=1}
}
class PendingIntent { companion object {
  const val FLAG_UPDATE_CURRENT=1;const val FLAG_IMMUTABLE=2
  fun getService(c:Context,id:Int,i:Intent,f:Int)=PendingIntent()
  fun getBroadcast(c:Context,id:Int,i:Intent,f:Int)=PendingIntent()
} }
