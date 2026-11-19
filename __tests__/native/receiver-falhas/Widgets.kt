package android.appwidget
import android.content.*
import android.widget.RemoteViews
open class AppWidgetProvider {
  open fun onReceive(context:Context,intent:Intent) {}
  open fun onUpdate(context:Context,manager:AppWidgetManager,ids:IntArray) {}
  open fun onEnabled(context:Context) {}
}
class AppWidgetManager {
  var failUpdate=false
  val updates=mutableListOf<RemoteViews>()
  fun updateAppWidget(id:Int,view:RemoteViews) { if(failUpdate) error("launcher unavailable"); updates.add(view) }
  fun getAppWidgetIds(component:ComponentName)=intArrayOf(1)
  companion object {
    const val EXTRA_APPWIDGET_ID="widgetId"
    var current=AppWidgetManager()
    fun getInstance(context:Context):AppWidgetManager?=current
  }
}
