package android.widget
import android.app.PendingIntent
class RemoteViews(name:String,layout:Int) {
  val texts=mutableMapOf<Int,String>()
  fun setInt(id:Int,method:String,value:Int) {}
  fun setImageViewResource(id:Int,value:Int) {}
  fun setTextViewText(id:Int,value:String) { texts[id]=value }
  fun setContentDescription(id:Int,value:String) {}
  fun setOnClickPendingIntent(id:Int,pending:PendingIntent) {}
}
