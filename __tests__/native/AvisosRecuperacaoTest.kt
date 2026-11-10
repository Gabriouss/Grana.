package com.gabriouss.grana.avisos

import android.content.Context
import android.os.Handler
import android.provider.Settings
import android.service.notification.NotificationListenerService as Service
import android.service.notification.StatusBarNotification
import android.app.Notification
import java.io.File
import org.json.JSONObject

fun main(args:Array<String>) {
 Context.baseDir=File(args[0],"diario")
 val module=GranaAvisosModule();val api=module.definition();val ctx=module.appContext.reactContext!!
 fun state()=JSONObject(api.call("estado") as String)
 fun recover(){api.call("recuperarConexao")}
 fun owner(id:String?){api.call("definirDono",id)}
 fun consent(value:Boolean){api.call("definirAceite",value)}
 fun count()=JSONObject(GranaAvisosListener.diario(ctx).listar()).getJSONArray("itens").length()
 var passed=0
 fun ok(s:String){passed++;println("OK $s")}
 api.create?.invoke()
 check(state().has("conectado")) {"permissao nao prova conexao viva: estado nao expoe conectado"}
 check(!state().getBoolean("conectado"));ok("processo novo nasce desconectado sem callback de desconexao")
 owner("fixture-A");recover();check(Service.requests==0);consent(true);recover();check(Service.requests==0)
 Settings.Secure.enabled="test/GranaAvisosListener";consent(false);recover();check(Service.requests==0)
 owner(null);recover();check(Service.requests==0);ok("sem dono, aceite ou permissao nao solicita rebind")
 owner("fixture-A");AvisosConfig.definirAceite(ctx,true,System.currentTimeMillis())
 val cutoff=System.currentTimeMillis()-1000;AvisosConfig.definirApp(ctx,"com.nu.production",true,cutoff)
 val before=AvisosConfig.inicioDaLeitura(ctx,"com.nu.production")!!
 api.foreground?.invoke();check(Service.requests==1);check(state().getBoolean("recuperando"));check(Service.reads==0)
 repeat(5){recover();api.foreground?.invoke()};check(Service.requests==1);ok("foreground apos update sem disconnect solicita uma vez; singleflight")
 Handler.advance(8001);check(!state().getBoolean("recuperando"));check(!state().isNull("falhaConexao"));val req=Service.requests
 repeat(5){recover()};check(Service.requests==req);check(Service.reads==0);ok("prazo encerra com falha visivel e cooldown sem loop/replay")
 val listener=GranaAvisosListener()
 fun notification(pkg:String,key:String,post:Long)=StatusBarNotification(pkg,key,post,Notification().apply{extras.putCharSequence(Notification.EXTRA_TITLE,"fixture");extras.putCharSequence(Notification.EXTRA_TEXT,"Compra R$ 1,00");`when`=post})
 Service.active=arrayOf(notification("com.nu.production","novo",System.currentTimeMillis()),notification("com.nu.production","velho",before-1),notification("com.whatsapp","fora",System.currentTimeMillis()))
 listener.onListenerConnected();check(state().getBoolean("conectado"));check(state().isNull("falhaConexao"));check(count()==1);check(Service.reads==1)
 listener.onListenerConnected();recover();check(Service.reads==1);check(Service.requests==req);ok("callback tardio recupera uma vez, cutoff/filtros preservados; conectado nao rebind")
 Handler.advance(8001);check(state().getBoolean("conectado"));check(state().isNull("falhaConexao"));ok("timer antigo nao regride conexao confirmada")
 listener.onListenerDisconnected();Handler.advance(31000);recover();check(Service.requests==req+1)
 listener.onListenerConnected();check(Service.reads==2);check(count()==1);ok("nova conexao usa dedupe real sem apagar diario nem renovar aceite")
 check(AvisosConfig.inicioDaLeitura(ctx,"com.nu.production")==before)
 listener.onNotificationPosted(notification("com.nu.production","futuro",System.currentTimeMillis()+1));check(count()==2);ok("captura futura sintetica segue apos replay, sem depender de reconexao")
 listener.onDestroy();Handler.advance(31000);Service.fail=true;recover();check(!state().getBoolean("recuperando"));check(!state().isNull("falhaConexao"));Service.fail=false;ok("requestRebind que lanca deixa falha visivel, sem loop")
 Handler.advance(31000);recover();val reads=Service.reads;owner("fixture-B");consent(true);listener.onListenerConnected();check(Service.reads==reads);ok("callback da tentativa antiga nao recupera avisos para outro usuario")
 check(module.emitted.isNotEmpty());api.destroy?.invoke();println("$passed grupos de recuperacao Kotlin real passaram")
}
