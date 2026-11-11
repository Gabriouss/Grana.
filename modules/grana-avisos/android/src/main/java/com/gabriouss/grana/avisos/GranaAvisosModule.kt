package com.gabriouss.grana.avisos

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
  private var pararObservacao: (() -> Unit)? = null

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

  private fun <T> configurar(acao: () -> T): T = try { acao() }
    catch (erro: Exception) { registrarFalha(erro); throw erro }

  private fun limparAoRetomar() {
    if (appContext.reactContext == null) return
    val app = context.applicationContext
    GranaAvisosListener.executar(app) {
      try { prepararCatalogo() }
      catch (erro: Exception) { registrarFalha(erro) }
    }
    // Limpeza falhada mantém leitura/replay fechados, mas não impede binding.
    GranaAvisosListener.recuperarConexao(app)
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun acessoConcedido(): Boolean {
    return GranaAvisosListener.acessoConcedido(context)
  }

  private fun estado(): String = JSONObject()
    .put("acesso", acessoConcedido())
    .put("aceite", AvisosConfig.temAceite(context))
    .put("conectado", GranaAvisosListener.conexao.conectado)
    .put("recuperando", GranaAvisosListener.conexao.recuperando)
    .put("falhaConexao", GranaAvisosListener.conexao.falha ?: JSONObject.NULL)
    .put("ultimoSinal", AvisosConfig.ultimoSinal(context))
    .put("desconectadoEm", AvisosConfig.desconectadoEm(context))
    .put("ultimaFalha", AvisosConfig.ultimaFalha(context) ?: JSONObject.NULL)
    .toString()

  private fun abrir(intent: Intent) {
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  override fun definition() = ModuleDefinition {
    Name("GranaAvisos")
    Events("estadoAlterado")

    OnCreate {
      pararObservacao = GranaAvisosListener.observarConexao { sendEvent("estadoAlterado", emptyMap<String, Any?>()) }
      limparAoRetomar()
    }
    OnDestroy { pararObservacao?.invoke(); pararObservacao = null }
    OnActivityEntersForeground { limparAoRetomar() }

    Function("estado") {
      estado()
    }
    Function("recuperarConexao") {
      limparAoRetomar()
      estado()
    }

    AsyncFunction("definirDono") { dono: String? -> configurar {
      synchronized(AvisosConfig) {
        if (AvisosConfig.definirDono(context, dono)) {
          GranaAvisosListener.diario(context).apagarTudo()
        }
        GranaAvisosListener.conexao.atualizarDono(dono)
      }
    } }
    AsyncFunction("garantirListaInicial") { pacotes: List<String> -> configurar {
      AvisosConfig.garantirListaInicial(context, pacotes, System.currentTimeMillis())
    } }
    Function("listarApps") { AvisosConfig.listarApps(context) { null } }
    AsyncFunction("definirApp") { pacote: String, ligado: Boolean -> configurar {
      AvisosConfig.definirApp(context, pacote, ligado, System.currentTimeMillis())
    } }

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
      synchronized(AvisosConfig) {
        GranaAvisosListener.diario(context).apagarTudo()
        AvisosConfig.limpar(context)
      }
    }

    AsyncFunction("definirAceite") { aceito: Boolean -> configurar {
      AvisosConfig.definirAceite(context, aceito, System.currentTimeMillis())
      GranaAvisosListener.recuperarConexao(context)
    } }
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
