package com.gabriouss.grana.avisos

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

/** A parte da leitura de avisos que o JavaScript enxerga. */
class GranaAvisosModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun acessoConcedido(): Boolean {
    val habilitados = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners").orEmpty()
    val componente = ComponentName(context, GranaAvisosListener::class.java).flattenToString()
    return habilitados.split(':').contains(componente)
  }

  private fun nomeDoApp(pacote: String): String? = try {
    val pm = context.packageManager
    pm.getApplicationLabel(pm.getApplicationInfo(pacote, 0)).toString()
  } catch (_: PackageManager.NameNotFoundException) {
    null
  }

  private fun abrir(intent: Intent) {
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  override fun definition() = ModuleDefinition {
    Name("GranaAvisos")

    Function("estado") {
      JSONObject()
        .put("acesso", acessoConcedido())
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
    Function("listarApps") { AvisosConfig.listarApps(context, ::nomeDoApp) }
    Function("definirApp") { pacote: String, ligado: Boolean ->
      AvisosConfig.definirApp(context, pacote, ligado, System.currentTimeMillis())
    }

    AsyncFunction("lerDiario") { GranaAvisosListener.diario(context).listar() }
    AsyncFunction("apagarDiario") { GranaAvisosListener.diario(context).apagarTudo() }
    AsyncFunction("limparTudo") {
      GranaAvisosListener.diario(context).apagarTudo()
      AvisosConfig.limpar(context)
    }

    Function("abrirAcesso") { abrir(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
    /* O caminho oficial de "Permitir configurações restritas" sai daqui. */
    Function("abrirInformacoesDoApp") {
      abrir(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")))
    }
  }
}
