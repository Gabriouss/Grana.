// Módulo Expo e listener Kotlin reais; Android/Expo/tempo são dublês, sem aparelho.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),base=fs.mkdtempSync(path.join(os.tmpdir(),'grana-avisos-recuperacao-'));
const cache=path.join(process.env.GRADLE_USER_HOME||path.join(os.homedir(),'.gradle'),'caches/modules-2/files-2.1');
function jar(g,a){function find(d){for(const e of fs.readdirSync(d,{withFileTypes:true}).sort((x,y)=>y.name.localeCompare(x.name,undefined,{numeric:true}))){const p=path.join(d,e.name);if(e.isDirectory()){const f=find(p);if(f)return f;}else if(e.name.endsWith('.jar'))return p;}}const f=find(path.join(cache,g,a));if(!f)throw Error('JAR ausente: '+a);return f;}
const std=jar('org.jetbrains.kotlin','kotlin-stdlib'),json=jar('org.json','json'),ann=jar('org.jetbrains','annotations');
const compiler=[jar('org.jetbrains.kotlin','kotlin-compiler-embeddable'),std,jar('org.jetbrains.kotlin','kotlin-script-runtime'),jar('org.jetbrains.kotlin','kotlin-reflect'),jar('org.jetbrains.kotlin','kotlin-daemon-embeddable'),jar('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),jar('org.jetbrains.intellij.deps','trove4j'),ann];
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java';
const stubs={
 'Context.kt':`package android.content
import java.io.File
open class Context {
 val packageName="test"; val contentResolver=Any(); val applicationContext get()=this
 val noBackupFilesDir get()=baseDir; val applicationInfo=android.content.pm.ApplicationInfo()
 val packageManager=PackageManager();val resources=Resources()
 fun getSharedPreferences(name:String,mode:Int):SharedPreferences{beforePrefs?.invoke();return prefs.computeIfAbsent(name){SharedPreferences()}}
 fun getSystemService(name:String)=android.app.NotificationManager()
 fun startActivity(intent:Intent){};fun getString(id:Int)="fixture"
 companion object {const val MODE_PRIVATE=0;const val NOTIFICATION_SERVICE="notification";var baseDir=File(".");val prefs=java.util.concurrent.ConcurrentHashMap<String,SharedPreferences>();@Volatile var beforePrefs:(()->Unit)?=null}
}
class ComponentName(c:Context,k:Class<*>) {fun flattenToString()="test/GranaAvisosListener"}
class Intent {constructor(action:String);constructor(action:String,uri:android.net.Uri);fun addFlags(f:Int)=this;companion object{const val FLAG_ACTIVITY_NEW_TASK=1}}
class PackageManager {fun getLaunchIntentForPackage(p:String):Intent?=null}
class Resources{fun getIdentifier(a:String,b:String,c:String)=0}
class SharedPreferences {private val data=java.util.concurrent.ConcurrentHashMap<String,Any>();fun getString(k:String,d:String?)=data[k] as? String?:d;fun getLong(k:String,d:Long)=data[k] as? Long?:d;fun getBoolean(k:String,d:Boolean)=data[k] as? Boolean?:d;fun getInt(k:String,d:Int)=data[k] as? Int?:d;fun contains(k:String)=data.containsKey(k);fun edit()=Editor()
 inner class Editor{private val next=data.toMutableMap();fun putString(k:String,v:String?)=apply{if(v==null)next.remove(k)else next[k]=v};fun putLong(k:String,v:Long)=apply{next[k]=v};fun putInt(k:String,v:Int)=apply{next[k]=v};fun putBoolean(k:String,v:Boolean)=apply{next[k]=v};fun remove(k:String)=apply{next.remove(k)};fun clear()=apply{next.clear()};fun commit():Boolean{data.clear();data.putAll(next);return true};fun apply(){commit()}}
}`,
 'Os.kt':`package android.os
object Build{object VERSION{const val SDK_INT=36};object VERSION_CODES{const val N=24;const val O=26}}
object SystemClock{var time=100000L;fun elapsedRealtime()=time}
class Looper{companion object{private val main=Looper();fun getMainLooper()=main;fun myLooper()=main}}
class Handler(l:Looper){fun post(r:Runnable):Boolean{pending.add(r);return true};fun postDelayed(r:Runnable,d:Long):Boolean{tasks.add(SystemClock.time+d to r);return true};companion object{val tasks=java.util.concurrent.CopyOnWriteArrayList<Pair<Long,Runnable>>();val pending=java.util.concurrent.ConcurrentLinkedQueue<Runnable>();fun drain(){while(true)(pending.poll()?:break).run()};fun advance(ms:Long){SystemClock.time+=ms;val ready=tasks.filter{it.first<=SystemClock.time};tasks.removeAll(ready.toSet());ready.forEach{it.second.run()};drain()}}}
class Bundle{private val data=mutableMapOf<String,CharSequence>();var failRead=false;fun putCharSequence(k:String,v:CharSequence){data[k]=v};fun getCharSequence(k:String):CharSequence?{check(!failRead){"fixture"};return data[k]}}`,
 'ApplicationInfo.kt':`package android.content.pm
class ApplicationInfo{val flags=0;val icon=1;companion object{const val FLAG_DEBUGGABLE=2}}`,
 'Uri.kt':`package android.net
class Uri{companion object{fun parse(s:String)=Uri()}}`,
 'Settings.kt':`package android.provider
object Settings{const val ACTION_NOTIFICATION_LISTENER_SETTINGS="listener";const val ACTION_APPLICATION_DETAILS_SETTINGS="app";object Secure{var enabled="";fun getString(r:Any,k:String)=enabled}}`,
 'Log.kt':`package android.util
object Log{fun w(tag:String,msg:String)=0}`,
 'Notification.kt':`package android.app
import android.content.Context
import android.content.Intent
class Notification{var flags=0;var \`when\`=0L;val extras=android.os.Bundle();class Builder{constructor(c:Context);constructor(c:Context,channel:String);fun setSmallIcon(v:Int)=this;fun setContentTitle(v:String)=this;fun setContentText(v:String)=this;fun setContentIntent(v:PendingIntent?)=this;fun setAutoCancel(v:Boolean)=this;fun build()=Notification()};companion object{const val FLAG_GROUP_SUMMARY=512;const val EXTRA_TITLE="title";const val EXTRA_TEXT="text";const val EXTRA_BIG_TEXT="big"}}
class NotificationChannel(a:String,b:String,c:Int)
class NotificationManager{fun getNotificationChannel(s:String):NotificationChannel?=null;fun createNotificationChannel(c:NotificationChannel){};fun notify(i:Int,n:Notification){};companion object{const val IMPORTANCE_DEFAULT=3}}
class PendingIntent{companion object{const val FLAG_UPDATE_CURRENT=1;const val FLAG_IMMUTABLE=2;fun getActivity(c:Context,i:Int,n:Intent,f:Int)=PendingIntent()}}`,
 'Service.kt':`package android.service.notification
import android.content.Context
import android.content.ComponentName
import android.app.Notification
open class NotificationListenerService:Context(){open fun onListenerConnected(){};open fun onListenerDisconnected(){};open fun onNotificationPosted(s:StatusBarNotification){};open fun onDestroy(){};val activeNotifications get():Array<StatusBarNotification>{reads++;return active};companion object{var requests=0;var reads=0;var fail=false;var active=emptyArray<StatusBarNotification>();fun requestRebind(c:ComponentName){requests++;if(fail)throw IllegalStateException("fixture")}}}
class StatusBarNotification(val packageName:String,val key:String,val postTime:Long,val notification:Notification)`,
 'Exceptions.kt':`package expo.modules.kotlin.exception
object Exceptions{class ReactContextLost:IllegalStateException()}`,
 'Expo.kt':`@file:Suppress("INVISIBLE_REFERENCE","INVISIBLE_MEMBER")
package expo.modules.kotlin.modules
import android.content.Context
class AppContext{var reactContext:Context?=Context()}
abstract class Module{val appContext=AppContext();val emitted=mutableListOf<String>();abstract fun definition():ModuleDefinition;fun sendEvent(name:String,data:Map<String,Any?>){emitted.add(name)}}
class ModuleDefinition(body:ModuleDefinition.()->Unit){
 val functions=mutableMapOf<String,(Array<out Any?>)->Any?>();private val async=mutableSetOf<String>();var create:(()->Unit)?=null;var foreground:(()->Unit)?=null;var destroy:(()->Unit)?=null;init{body()}
 fun Name(n:String){};fun Events(vararg n:String){};fun OnCreate(f:()->Unit){create=f};fun OnActivityEntersForeground(f:()->Unit){foreground=f};fun OnDestroy(f:()->Unit){destroy=f}
 fun <R> Function(n:String,f:()->R){functions[n]={f()}}
 @kotlin.internal.LowPriorityInOverloadResolution fun <A,R> Function(n:String,f:(A)->R){functions[n]={@Suppress("UNCHECKED_CAST") f(it[0] as A)}}
 fun <A,B,R> Function(n:String,f:(A,B)->R){functions[n]={@Suppress("UNCHECKED_CAST") f(it[0] as A,it[1] as B)}}
 fun <R> AsyncFunction(n:String,f:()->R){async.add(n);Function(n,f)}
 @kotlin.internal.LowPriorityInOverloadResolution fun <A,R> AsyncFunction(n:String,f:(A)->R){async.add(n);Function(n,f)}
 fun <A,B,R> AsyncFunction(n:String,f:(A,B)->R){async.add(n);Function(n,f)}
 fun call(n:String,vararg a:Any?):Any?{val fn=functions[n]?:error("funcao ausente: $n");return if(n in async)java.util.concurrent.FutureTask<Any?>{fn(a)}.also{Thread(it,"fixture-Expo-AsyncFunction").apply{isDaemon=true;start()}}else fn(a)}
}`,
 'R.kt':`package com.gabriouss.grana.avisos
object R{object string{const val grana_avisos_canal=1;const val grana_avisos_titulo=2;const val grana_avisos_texto=3}}`,
};
// Escapa somente o identificador Kotlin reservado, sem alterar o módulo testado.
stubs['Notification.kt']=stubs['Notification.kt'].replace(/\\`/g,'`');
const files=Object.entries(stubs).map(([n,s])=>{const p=path.join(base,n);fs.writeFileSync(p,s);return p;});
const out=path.join(base,'classes');fs.mkdirSync(out);
const native=path.join(root,'modules/grana-avisos/android/src/main/java/com/gabriouss/grana/avisos');
function ram(){const n=os.freemem()/1024**3;console.log('RAM GiB='+n.toFixed(3));if(n<1.5)process.exit(75);}
ram();let r=cp.spawnSync(java,['-Dfile.encoding=UTF-8','-Xmx384m','-XX:MaxMetaspaceSize=192m','-cp',compiler.join(path.delimiter),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',[std,json,ann].join(path.delimiter),'-jvm-target','17','-d',out,...files,...fs.readdirSync(native).filter(f=>f.endsWith('.kt')).map(f=>path.join(native,f)),path.join(__dirname,'native/AvisosRecuperacaoTest.kt')],{encoding:'utf8',windowsHide:true,timeout:60000});
process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);
ram();r=cp.spawnSync(java,['-Dfile.encoding=UTF-8','-Xmx128m','-XX:MaxMetaspaceSize=96m','-cp',[out,std,json].join(path.delimiter),'com.gabriouss.grana.avisos.AvisosRecuperacaoTestKt',base,...process.argv.slice(2)],{encoding:'utf8',windowsHide:true,timeout:20000});
process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;process.exitCode=r.status??1;
