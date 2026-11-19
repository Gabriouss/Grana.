package android.util
object Log {
  val errors=mutableListOf<String>()
  fun e(tag:String,message:String,error:Throwable):Int { errors.add(message); return 0 }
}
