package android.util
object Log {
  val errors=java.util.concurrent.CopyOnWriteArrayList<String>()
  fun w(t:String,m:String)=0
  fun w(t:String,m:String,e:Throwable):Int{println("LOG $m $e");return 0}
  fun e(t:String,m:String,e:Throwable):Int{errors.add(m);println("LOG $m $e");return 0}
}
