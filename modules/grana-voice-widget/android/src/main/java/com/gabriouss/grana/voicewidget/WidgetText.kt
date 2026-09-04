package com.gabriouss.grana.voicewidget

import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.roundToLong

object WidgetText {
  private val localeBrasil = Locale("pt", "BR")

  fun dinheiro(valor: Double): String = NumberFormat.getCurrencyInstance(localeBrasil).format(valor)

  fun valor(valor: Double, privado: Boolean): String = if (privado) "••••" else dinheiro(valor)

  fun atualizado(iso: String): String {
    val data = parseInstant(iso) ?: return "Última atualização"
    val hoje = Calendar.getInstance()
    val outra = Calendar.getInstance().apply { time = data }
    return if (
      hoje.get(Calendar.YEAR) == outra.get(Calendar.YEAR) &&
      hoje.get(Calendar.DAY_OF_YEAR) == outra.get(Calendar.DAY_OF_YEAR)
    ) {
      "Atualizado ${SimpleDateFormat("HH:mm", localeBrasil).format(data)}"
    } else {
      "Atualizado ${SimpleDateFormat("dd/MM", localeBrasil).format(data)}"
    }
  }

  fun vencimento(iso: String): String {
    val data = try {
      SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false }.parse(iso)
    } catch (_: Exception) {
      null
    } ?: return "Ver vencimento"

    val hoje = Calendar.getInstance().apply {
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    val alvo = Calendar.getInstance().apply {
      time = data
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    val dias = ((alvo.timeInMillis - hoje.timeInMillis) / 86_400_000.0).roundToLong().toInt()
    return when (dias) {
      0 -> "vence hoje"
      1 -> "vence amanhã"
      else -> if (dias < 0) {
        "venceu ${SimpleDateFormat("dd/MM", localeBrasil).format(data)}"
      } else {
        "vence ${SimpleDateFormat("dd/MM", localeBrasil).format(data)}"
      }
    }
  }

  private fun parseInstant(iso: String): Date? {
    val formatos = listOf(
      "yyyy-MM-dd'T'HH:mm:ss.SSSX",
      "yyyy-MM-dd'T'HH:mm:ssX",
    )
    for (formato in formatos) {
      try {
        return SimpleDateFormat(formato, Locale.US).apply {
          isLenient = false
          timeZone = TimeZone.getTimeZone("UTC")
        }.parse(iso)
      } catch (_: Exception) {}
    }
    return null
  }
}
