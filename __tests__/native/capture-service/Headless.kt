package com.facebook.react.jstasks
import com.facebook.react.bridge.*
class HeadlessJsTaskConfig(n:String,d:WritableMap,t:Long,a:Boolean)
class HeadlessJsTaskContext{fun startTask(c:HeadlessJsTaskConfig):Int{starts++;return 1};fun finishTask(i:Int){};companion object{var starts=0;fun getInstance(c:ReactContext)=HeadlessJsTaskContext()}}
