package com.gabriouss.grana.avisos

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.util.Log
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

/** A parte da leitura de avisos que o JavaScript enxerga. */
class GranaAvisosModule : Module() {
  private var catalogoPreparado = false

  private fun prepararCatalogo() {
    if (!catalogoPreparado) {
      AvisosConfig.limparLegado(context)
      GranaAvisosListener.diario(context).limparForaDoCatalogo()
      catalogoPreparado = true
    }
    GranaAvisosListener.diario(context).limparVencidos()
    AvisosConfig.confirmarLimpeza(context)
  }

  private fun registrarFalha(erro: Exception) {
    Log.w("GranaAvisos", "falha no diario: ${erro.javaClass.simpleName}")
    AvisosConfig.registrarFalha(context, erro.javaClass.simpleName, System.currentTimeMillis())
  }

  private fun limparAoRetomar() {
    if (appContext.reactContext == null) return
    try { prepararCatalogo() } catch (erro: Exception) { registrarFalha(erro) }
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun acessoConcedido(): Boolean {
    val habilitados = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners").orEmpty()
    val componente = ComponentName(context, GranaAvisosListener::class.java).flattenToString()
    return habilitados.split(':').contains(componente)
  }

  private fun abrir(intent: Intent) {
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  override fun definition() = ModuleDefinition {
    Name("GranaAvisos")

    OnCreate { limparAoRetomar() }
    OnActivityEntersForeground { limparAoRetomar() }

    Function("estado") {
      limparAoRetomar()
      JSONObject()
        .put("acesso", acessoConcedido())
        .put("aceite", AvisosConfig.temAceite(context))
        .put("ultimoSinal", AvisosConfig.ultimoSinal(context))
        .put("desconectadoEm", AvisosConfig.desconectadoEm(context))
        .put("ultimaFalha", AvisosConfig.ultimaFalha(context) ?: JSONObject.NULL)
        .toString()
    }

    Function("definirDono") { dono: String? ->
      if (AvisosConfig.definirDono(context, dono)) {
        GranaAvisosListener.diario(context).apagarTudo()
      }
    }
    Function("garantirListaInicial") { pacotes: List<String> ->
      AvisosConfig.garantirListaInicial(context, pacotes, System.currentTimeMillis())
    }
    Function("listarApps") { AvisosConfig.listarApps(context) { null } }
    Function("definirApp") { pacote: String, ligado: Boolean ->
      AvisosConfig.definirApp(context, pacote, ligado, System.currentTimeMillis())
    }

    AsyncFunction("lerDiario") {
      try { GranaAvisosListener.diario(context).listar() }
      catch (erro: Exception) { registrarFalha(erro); throw erro }
    }
    AsyncFunction("apagarDiario") {
      try {
        GranaAvisosListener.diario(context).apagarTudo()
        AvisosConfig.confirmarLimpeza(context)
      } catch (erro: Exception) { registrarFalha(erro); throw erro }
    }
    AsyncFunction("limparTudo") {
      GranaAvisosListener.diario(context).apagarTudo()
      AvisosConfig.limpar(context)
    }

    Function("definirAceite") { aceito: Boolean ->
      AvisosConfig.definirAceite(context, aceito, System.currentTimeMillis())
    }
    Function("abrirAcesso") {
      check(AvisosConfig.temAceite(context)) { "aceite obrigatorio" }
      abrir(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }
    /* O caminho oficial de "Permitir configurações restritas" sai daqui. */
    Function("abrirInformacoesDoApp") {
      abrir(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")))
    }
  }
}
