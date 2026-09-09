package com.gabriouss.grana.voicewidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * A parte do widget que o JavaScript enxerga.
 *
 * Existe por dois motivos: a tarefa headless precisa devolver o widget ao
 * estado ocioso quando termina de lançar, e a tela de Perfil precisa poder
 * oferecer "adicionar à tela inicial" sem a pessoa ter que descobrir sozinha
 * o gesto de segurar a tela e procurar na lista de widgets.
 */
class GranaVoiceWidgetModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("GranaVoiceWidget")

    AsyncFunction("prepararAudioLocal") { uri: String ->
      VoicePcmDecoder.decode(context, uri)
    }

    Function("estadoAtual") {
      EstadoWidget.atual(context)
    }

    Function("definirEstado") { estado: String ->
      EstadoWidget.definir(context, estado)
    }

    /* Nem todo launcher implementa o "fixar" — o Android expõe isso como uma
       capacidade opcional, e vários launchers de fabricante não têm. Quem
       chama precisa saber ANTES de mostrar um botão que não faria nada. Não
       depende do tipo de widget: é uma capacidade do launcher, não da classe. */
    Function("podeFixar") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) false
      else AppWidgetManager.getInstance(context)?.isRequestPinAppWidgetSupported ?: false
    }

    /** Quantas instâncias de um widget estão na tela inicial. Zero = não instalado. */
    Function("quantidadeInstaladaPorTipo") { tipo: String ->
      WidgetRegistry.quantidade(context, tipo)
    }

    Function("fixarPorTipo") { tipo: String ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function false
      val manager = AppWidgetManager.getInstance(context) ?: return@Function false
      if (!manager.isRequestPinAppWidgetSupported) return@Function false
      val classe = WidgetRegistry.classe(tipo) ?: return@Function false
      try {
        manager.requestPinAppWidget(ComponentName(context, classe), null, null)
      } catch (_: Exception) {
        false
      }
    }

    Function("atualizarSnapshot") { json: String ->
      WidgetSnapshotStore.salvar(context, json)
      WidgetRegistry.redesenharTodos(context)
    }

    Function("limparSnapshot") {
      WidgetSnapshotStore.limpar(context)
      WidgetRegistry.redesenharTodos(context)
    }

    Function("garantirUsuario") { userId: String ->
      WidgetSnapshotStore.garantirUsuario(context, userId)
      WidgetRegistry.redesenharTodos(context)
    }

    Function("definirPrivacidade") { hidden: Boolean ->
      WidgetSnapshotStore.definirPrivacidade(context, hidden)
      WidgetRegistry.redesenharTodos(context)
    }

    Function("redesenharTodos") {
      WidgetRegistry.redesenharTodos(context)
    }
  }
}
