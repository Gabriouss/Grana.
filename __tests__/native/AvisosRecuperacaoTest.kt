package com.gabriouss.grana.avisos

import android.content.Context
import android.os.Handler
import android.provider.Settings
import android.service.notification.NotificationListenerService as Service
import android.service.notification.StatusBarNotification
import android.app.Notification
import java.io.File
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.Collections
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicReference

fun main(args:Array<String>) {
 Context.baseDir=File(args[0],"diario")
 val module=GranaAvisosModule();val api=module.definition();val ctx=module.appContext.reactContext!!
 if(args.contains("--config-concorrente")) {
   AvisosConfig.definirDono(ctx,"fixture-A")
   AvisosConfig.definirAceite(ctx,true,System.currentTimeMillis()-1000)
   AvisosConfig.definirApp(ctx,"com.nu.production",true,System.currentTimeMillis()-1000)
   val listener=GranaAvisosListener()
   val trava=AvisosDiario::class.java.getDeclaredField("TRAVA").apply{isAccessible=true}.get(null)
   val consumindo=CountDownLatch(1);val devolveu=CountDownLatch(1)
   val resposta=AtomicReference<Any?>();val falha=AtomicReference<Throwable?>()
   Context.beforePrefs={consumindo.countDown()}
   synchronized(trava) {
     try {
       listener.onNotificationPosted(StatusBarNotification("com.nu.production","aviso-antigo",System.currentTimeMillis(),Notification().apply{extras.putCharSequence(Notification.EXTRA_TEXT,"fixture R$ 1,00")}))
       check(consumindo.await(2,TimeUnit.SECONDS)){"fila não entrou na cerca de autorização"}
       Thread({try{resposta.set(api.call("definirDono","fixture-B"))}catch(e:Throwable){falha.set(e)}finally{devolveu.countDown()}},"fixture-ponte-JS").apply{isDaemon=true;start()}
       check(devolveu.await(1,TimeUnit.SECONDS)){"REGRESSAO: chamada da ponte definirDono espera IO/monitor AvisosConfig"}
       check(falha.get()==null){"ponte lançou ${falha.get()?.javaClass?.simpleName}"}
       val promessa=resposta.get()
       check(promessa is Future<*> && !promessa.isDone){"configuração deve devolver promessa sem confirmar troca antes do IO"}
     } finally {Context.beforePrefs=null}
   }
   (resposta.get() as Future<*>).get(2,TimeUnit.SECONDS)
   check(AvisosConfig.dono(ctx)=="fixture-B")
   check(JSONObject(GranaAvisosListener.diario(ctx).listar()).getJSONArray("itens").length()==0){"troca resolveu sem apagar diário anterior"}
   println("OK ponte/config devolve sem esperar IO, promessa confirma dono e limpeza depois da barreira")
   return
 }
 fun state()=JSONObject(api.call("estado") as String)
 fun settle(){repeat(3){val done=CountDownLatch(1);check(GranaAvisosListener.fila.enviar({throw it}){done.countDown()});check(done.await(2,TimeUnit.SECONDS)){"fila não concluiu"};Handler.drain()}}
 fun recover(){api.call("recuperarConexao");settle()}
 fun owner(id:String?){(api.call("definirDono",id) as Future<*>).get(2,TimeUnit.SECONDS)}
 fun consent(value:Boolean){(api.call("definirAceite",value) as Future<*>).get(2,TimeUnit.SECONDS)}
 fun count()=JSONObject(GranaAvisosListener.diario(ctx).listar()).getJSONArray("itens").length()
 var passed=0
 fun ok(s:String){passed++;println("OK $s")}
 api.create?.invoke()
 settle()
 check(state().has("conectado")) {"permissao nao prova conexao viva: estado nao expoe conectado"}
 check(!state().getBoolean("conectado"));ok("processo novo nasce desconectado sem callback de desconexao")
 owner("fixture-A");recover();check(Service.requests==0);consent(true);recover();check(Service.requests==0)
 Settings.Secure.enabled="test/GranaAvisosListener";consent(false);recover();check(Service.requests==0)
 owner(null);recover();check(Service.requests==0);ok("sem dono, aceite ou permissao nao solicita rebind")
 owner("fixture-A");AvisosConfig.definirAceite(ctx,true,System.currentTimeMillis())
 val cutoff=System.currentTimeMillis()-1000;AvisosConfig.definirApp(ctx,"com.nu.production",true,cutoff)
 val before=AvisosConfig.inicioDaLeitura(ctx,"com.nu.production")!!
 api.foreground?.invoke();settle();check(Service.requests==1);check(state().getBoolean("recuperando"));check(Service.reads==0)
 repeat(5){recover();api.foreground?.invoke()};check(Service.requests==1);ok("foreground apos update sem disconnect solicita uma vez; singleflight")
 Handler.advance(8001);check(!state().getBoolean("recuperando"));check(!state().isNull("falhaConexao"));val req=Service.requests
 repeat(5){recover()};check(Service.requests==req);check(Service.reads==0);ok("prazo encerra com falha visivel e cooldown sem loop/replay")
 val listener=GranaAvisosListener()
 fun notification(pkg:String,key:String,post:Long)=StatusBarNotification(pkg,key,post,Notification().apply{extras.putCharSequence(Notification.EXTRA_TITLE,"fixture");extras.putCharSequence(Notification.EXTRA_TEXT,"Compra R$ 1,00");`when`=post})
 Service.active=arrayOf(notification("com.nu.production","novo",System.currentTimeMillis()),notification("com.nu.production","velho",before-1),notification("com.whatsapp","fora",System.currentTimeMillis()))
 listener.onListenerConnected();settle();check(state().getBoolean("conectado"));check(state().isNull("falhaConexao"));check(count()==1);check(Service.reads==1)
 listener.onListenerConnected();recover();check(Service.reads==1);check(Service.requests==req);ok("callback tardio recupera uma vez, cutoff/filtros preservados; conectado nao rebind")
 Handler.advance(8001);check(state().getBoolean("conectado"));check(state().isNull("falhaConexao"));ok("timer antigo nao regride conexao confirmada")
 listener.onListenerDisconnected();Handler.advance(31000);recover();check(Service.requests==req+1)
 listener.onListenerConnected();settle();check(Service.reads==2);check(count()==1);ok("nova conexao usa dedupe real sem apagar diario nem renovar aceite")
 check(AvisosConfig.inicioDaLeitura(ctx,"com.nu.production")==before)
 listener.onNotificationPosted(notification("com.nu.production","futuro",System.currentTimeMillis()+1));settle();check(count()==2);ok("captura futura sintetica segue apos replay, sem depender de reconexao")
 listener.onDestroy();Handler.advance(31000);Service.fail=true;recover();check(!state().getBoolean("recuperando"));check(!state().isNull("falhaConexao"));Service.fail=false;ok("requestRebind que lanca deixa falha visivel, sem loop")
 Handler.advance(31000);recover();val reads=Service.reads;owner("fixture-B");consent(true);listener.onListenerConnected();settle();check(Service.reads==reads);ok("callback da tentativa antiga nao recupera avisos para outro usuario")
 // A E/S do diário fica presa em outra thread. Ambos os callbacks retornam
 // ainda dentro deste monitor, sem ler preferências no main ou tocar disco.
 val novoListener=GranaAvisosListener()
 val trava=AvisosDiario::class.java.getDeclaredField("TRAVA").apply{isAccessible=true}.get(null)
 val main=Thread.currentThread()
 val entrou=CountDownLatch(1)
 Context.beforePrefs={check(Thread.currentThread()!=main){"preferência lida no callback main"};entrou.countDown()}
 synchronized(trava){
   novoListener.onListenerConnected()
   novoListener.onNotificationPosted(notification("com.nu.production","sem-main",System.currentTimeMillis()+1))
   check(entrou.await(2,TimeUnit.SECONDS)){"worker não tentou a E/S concorrente"}
 }
 Context.beforePrefs=null;settle();check(count()==1);ok("callbacks retornam com diario ocupado; preferencias/disco ficam fora do main")
 // Uma postagem enfileirada antes da troca não migra para a conta seguinte.
 val segurou=CountDownLatch(1);val liberar=CountDownLatch(1)
 check(GranaAvisosListener.fila.enviar({throw it}){segurou.countDown();check(liberar.await(2,TimeUnit.SECONDS))})
 check(segurou.await(2,TimeUnit.SECONDS))
 novoListener.onNotificationPosted(notification("com.nu.production","dono-antigo",System.currentTimeMillis()+1))
 owner("fixture-C");consent(true);liberar.countDown();settle();check(count()==0);ok("geracao enfileirada antiga nao grava para dono novo")
 // Um item inválido não pode matar o replay nem as próximas postagens.
 novoListener.onListenerDisconnected();settle();Handler.advance(31000);recover()
 val ruim=notification("com.nu.production","quebrado",System.currentTimeMillis()+1).apply{notification.extras.failRead=true}
 Service.active=arrayOf(ruim,notification("com.nu.production","integro",System.currentTimeMillis()+2))
 novoListener.onListenerConnected();settle();check(count()==1);check(!state().isNull("ultimaFalha"));ok("falha individual deixa recibo e proximo aviso valido permanece")
 val preso=CountDownLatch(1);val soltar=CountDownLatch(1)
 check(GranaAvisosListener.fila.enviar({throw it}){preso.countDown();check(soltar.await(2,TimeUnit.SECONDS))})
 check(preso.await(2,TimeUnit.SECONDS))
 novoListener.onNotificationPosted(notification("com.nu.production","aceite-antigo",System.currentTimeMillis()+1))
 consent(false);consent(true);soltar.countDown();settle();check(count()==1)
 AvisosConfig.definirApp(ctx,"com.nu.production",true,System.currentTimeMillis()+10000)
 novoListener.onNotificationPosted(notification("com.nu.production","antes-do-corte",System.currentTimeMillis()+1));settle();check(count()==1)
 AvisosConfig.definirApp(ctx,"com.nu.production",false,System.currentTimeMillis())
 novoListener.onNotificationPosted(notification("com.nu.production","banco-desligado",System.currentTimeMillis()+1));settle();check(count()==1)
 ok("consumo respeita revogacao/reaceite, novo cutoff e banco desligado")
 // Saturação: capacidade real limitada, sem CallerRunsPolicy nem execução no main.
 val limitada=FilaAvisos(2);val inicio=CountDownLatch(1);val fim=CountDownLatch(1);val acabou=CountDownLatch(1)
 val ordem=Collections.synchronizedList(mutableListOf<Int>());val erros=Collections.synchronizedList(mutableListOf<Exception>())
 check(limitada.enviar({erros.add(it)}){inicio.countDown();check(fim.await(2,TimeUnit.SECONDS));ordem.add(1)})
 check(inicio.await(2,TimeUnit.SECONDS))
 check(limitada.enviar({erros.add(it)}){ordem.add(2);throw IllegalStateException("fixture")})
 check(limitada.enviar({erros.add(it)}){ordem.add(3);acabou.countDown()})
 check(!limitada.enviar({erros.add(it)}){ordem.add(4)})
 fim.countDown();check(acabou.await(2,TimeUnit.SECONDS));check(ordem==listOf(1,2,3));check(erros.size==2);ok("fila limitada preserva ordem e resto apos rejeicao/falha individual")
 // N7: falha de limpeza continua visível e fechada, mas não suprime rebind.
 novoListener.onDestroy();settle();Handler.advance(31000)
 Context.baseDir=File(args[0],"limpeza-falhada").apply{mkdirs()}
 File(Context.baseDir,"grana_avisos").writeText("fixture sem diretorio legivel")
 val falho=GranaAvisosModule();val falhaApi=falho.definition();val antesRebind=Service.requests;val antesAtivos=Service.reads
 falhaApi.call("recuperarConexao");settle()
 check(Service.requests==antesRebind+1){"limpeza impediu pedido de reconexao"}
 check(AvisosConfig.ultimaFalha(ctx)?.startsWith("FalhaLimpezaDiario@") == true)
 val semLimpeza=GranaAvisosListener();semLimpeza.onListenerConnected();settle()
 check(Service.reads==antesAtivos){"replay liberado sem limpeza confirmada"};ok("erro de limpeza nao impede rebind nem libera replay")
 check(module.emitted.isNotEmpty());api.destroy?.invoke();println("$passed grupos de recuperacao Kotlin real passaram")
}
