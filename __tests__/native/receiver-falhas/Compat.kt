package androidx.core.app
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
object NotificationCompat {
  class BigTextStyle { fun bigText(value:String)=this }
  class Builder(context:Context,channel:String) {
    fun setContentTitle(v:String)=this
    fun setContentText(v:String)=this
    fun setStyle(v:BigTextStyle)=this
    fun setSmallIcon(v:Int)=this
    fun setAutoCancel(v:Boolean)=this
    fun setContentIntent(v:PendingIntent)=this
    fun build()=Notification()
  }
}
