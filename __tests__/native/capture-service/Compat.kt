package androidx.core.app

import android.content.Context
import android.app.Notification
import android.app.PendingIntent

object NotificationCompat {
  const val PRIORITY_LOW=1
  class Builder(c:Context,n:String){
    private val notification=Notification()
    fun setContentTitle(v:String)=apply{notification.title=v};fun setContentText(v:String)=this;fun setSmallIcon(v:Int)=this
    fun setOngoing(v:Boolean)=this;fun setSilent(v:Boolean)=this;fun setPriority(v:Int)=this
    fun addAction(a:Int,t:String,i:PendingIntent)=this;fun setAutoCancel(v:Boolean)=this
    fun setContentIntent(i:PendingIntent)=this;fun setStyle(s:BigTextStyle)=this;fun build()=notification
  }
  class BigTextStyle{fun bigText(v:String)=this}
}
