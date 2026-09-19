package com.gabriouss.grana.voicewidget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.res.Configuration
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews

/**
 * Widget de contas do mês: as atrasadas de qualquer mês e as pendentes do mês
 * atual, uma por linha, com "+N contas" quando não cabem todas.
 *
 * Até 19/09/2026 mostrava UMA conta, a de vencimento mais antigo. Um único
 * boleto atrasado prendia o widget nele e as contas do mês nunca apareciam.
 * Pedido do autor: "se a gente tem um boleto de agosto atrasado, esse boleto de
 * agosto precisa aparecer junto com os boletos de setembro, e vai aparecer como
 * atrasado mesmo". A escolha das contas é feita no app
 * (`selecionarCompromissosDoMes`, lib/widgets-home-snapshot.ts); aqui só se
 * desenha.
 */
class ProximoCompromissoWidgetProvider : GranaResumoWidgetProvider() {
  override fun montar(context: Context, widgetId: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.grana_compromisso_widget)
    val snapshot = WidgetSnapshotStore.ler(context)
    val privado = WidgetSnapshotStore.privacidade(context, snapshot)
    val contas = snapshot?.commitments.orEmpty()

    /* A linha de exemplo do XML só serve à prévia do seletor de widgets. */
    views.removeAllViews(R.id.grana_compromisso_lista)
    views.setTextViewText(R.id.grana_compromisso_mais, "")

    if (snapshot == null || contas.isEmpty()) {
      views.setViewVisibility(R.id.grana_compromisso_lista, View.GONE)
      views.setViewVisibility(R.id.grana_compromisso_vazio, View.VISIBLE)
      if (snapshot == null) {
        views.setTextViewText(R.id.grana_compromisso_status, context.getString(R.string.grana_widget_sem_dados))
        views.setTextViewText(R.id.grana_compromisso_vazio, context.getString(R.string.grana_widget_abrir_atualizar))
        views.setTextViewText(R.id.grana_compromisso_atualizado, "")
      } else {
        views.setTextViewText(R.id.grana_compromisso_status, context.getString(R.string.grana_compromisso_em_dia))
        views.setTextViewText(R.id.grana_compromisso_vazio, context.getString(R.string.grana_compromisso_nada))
        views.setTextViewText(R.id.grana_compromisso_mais, context.getString(R.string.grana_compromisso_abrir))
        views.setTextViewText(R.id.grana_compromisso_atualizado, WidgetText.atualizado(snapshot.updatedAt))
      }
      views.setTextColor(R.id.grana_compromisso_status, context.getColor(R.color.grana_widget_menta))
    } else {
      views.setViewVisibility(R.id.grana_compromisso_lista, View.VISIBLE)
      views.setViewVisibility(R.id.grana_compromisso_vazio, View.GONE)

      val atrasadas = contas.count { it.overdue }
      if (atrasadas > 0) {
        views.setTextViewText(
          R.id.grana_compromisso_status,
          context.resources.getQuantityString(R.plurals.grana_compromisso_atrasadas, atrasadas, atrasadas),
        )
        views.setTextColor(R.id.grana_compromisso_status, context.getColor(R.color.grana_widget_perigo))
      } else {
        views.setTextViewText(R.id.grana_compromisso_status, context.getString(R.string.grana_compromisso_proximo))
        views.setTextColor(R.id.grana_compromisso_status, context.getColor(R.color.grana_widget_menta))
      }

      val visiveis = contas.take(linhasQueCabem(context, widgetId))
      for (conta in visiveis) views.addView(R.id.grana_compromisso_lista, linha(context, conta, privado))

      val restantes = snapshot.commitmentsCount - visiveis.size
      if (restantes > 0) {
        views.setTextViewText(
          R.id.grana_compromisso_mais,
          context.resources.getQuantityString(R.plurals.grana_compromisso_mais, restantes, restantes),
        )
      }
      views.setTextViewText(R.id.grana_compromisso_atualizado, WidgetText.atualizado(snapshot.updatedAt))
    }

    views.setOnClickPendingIntent(
      R.id.grana_compromisso_raiz,
      WidgetRegistry.pendingDeepLink(context, widgetId, 400_000, "com.gabriouss.grana://bills"),
    )
    return views
  }

  /* Redimensionar o widget muda quantas linhas cabem. */
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, widgetId: Int, novas: Bundle) {
    super.onAppWidgetOptionsChanged(context, manager, widgetId, novas)
    manager.updateAppWidget(widgetId, montar(context, widgetId))
  }

  private fun linha(context: Context, conta: CompromissoWidget, privado: Boolean): RemoteViews {
    val linha = RemoteViews(context.packageName, R.layout.grana_compromisso_linha)
    linha.setTextViewText(R.id.grana_compromisso_linha_descricao, conta.description)
    linha.setTextViewText(R.id.grana_compromisso_linha_valor, WidgetText.valor(conta.amount, privado))

    val vencimento = WidgetText.vencimento(conta.dueDate)
    val data = when {
      conta.overdue -> context.getString(R.string.grana_compromisso_linha_atrasado, vencimento)
      conta.recurring -> context.getString(R.string.grana_compromisso_linha_recorrente, vencimento)
      else -> vencimento
    }
    linha.setTextViewText(R.id.grana_compromisso_linha_data, data)

    /* Atrasada se lê pela cor E pelo texto "atrasado": cor sozinha não basta. */
    val cor = context.getColor(if (conta.overdue) R.color.grana_widget_perigo else R.color.grana_widget_texto_suave)
    linha.setTextColor(R.id.grana_compromisso_linha_data, cor)
    if (conta.overdue) {
      linha.setTextColor(R.id.grana_compromisso_linha_valor, context.getColor(R.color.grana_widget_perigo))
    }
    return linha
  }

  /**
   * Quantas contas desenhar. A altura do widget vem do launcher (opções do
   * widget); as duas constantes abaixo são ESTIMATIVAS do layout, não medidas:
   * uma linha de grana_compromisso_linha.xml (12sp + 9sp + 5dp de margem) e o
   * cabeçalho, o rodapé e o padding de grana_compromisso_widget.xml. RemoteViews
   * não deixa medir. Se o layout mudar, estas mudam junto. Errar para mais só
   * corta a última linha, porque a lista tem peso 1 e não empurra o rodapé; o
   * resto sempre aparece no "+N contas". Na menor altura cabe ao menos uma.
   */
  private fun linhasQueCabem(context: Context, widgetId: Int): Int {
    val opcoes = AppWidgetManager.getInstance(context).getAppWidgetOptions(widgetId)
    /* O launcher informa duas alturas: a MÍNIMA é a do widget em paisagem e a
       MÁXIMA, a em retrato. A primeira versão lia sempre a mínima, e no emulador,
       em retrato, um widget com espaço para quatro contas desenhou duas. */
    val retrato = context.resources.configuration.orientation == Configuration.ORIENTATION_PORTRAIT
    val chave = if (retrato) AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT else AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT
    val altura = opcoes?.getInt(chave, 0) ?: 0
    if (altura <= 0) return 3
    return ((altura - ESTIMATIVA_MOLDURA_DP) / ESTIMATIVA_LINHA_DP).coerceIn(1, 8)
  }

  private companion object {
    const val ESTIMATIVA_LINHA_DP = 34
    const val ESTIMATIVA_MOLDURA_DP = 56
  }
}
