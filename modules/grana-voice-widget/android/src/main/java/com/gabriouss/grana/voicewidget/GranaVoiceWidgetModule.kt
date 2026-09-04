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

    Function("estadoAtual") {
      EstadoWidget.atual(context)
    }

    Function("definirEstado") { estado: String ->
      EstadoWidget.definir(context, estado)
    }

    /** Quantas instâncias do widget estão na tela inicial. Zero = não instalado. */
    Function("quantidadeInstalada") {
      val manager = AppWidgetManager.getInstance(context)
      val componente = ComponentName(context.packageName, GranaVoiceWidgetProvider::class.java.name)
      manager?.getAppWidgetIds(componente)?.size ?: 0
    }

    /* Nem todo launcher implementa o "fixar" — o Android expõe isso como uma
       capacidade opcional, e vários launchers de fabricante não têm. Quem
       chama precisa saber ANTES de mostrar um botão que não faria nada. */
    Function("podeFixar") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) false
      else AppWidgetManager.getInstance(context)?.isRequestPinAppWidgetSupported ?: false
    }

    /**
     * Pede ao launcher para adicionar o widget. Devolve false quando o
     * launcher recusa ou não suporta — nesse caso só resta a pessoa adicionar
     * pelo gesto padrão do Android.
     */
    Function("fixarNaTelaInicial") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function false
      val manager = AppWidgetManager.getInstance(context) ?: return@Function false
      if (!manager.isRequestPinAppWidgetSupported) return@Function false
      val componente = ComponentName(context.packageName, GranaVoiceWidgetProvider::class.java.name)
      try {
        manager.requestPinAppWidget(componente, null, null)
      } catch (e: Exception) {
        false
      }
    }
  }
}
