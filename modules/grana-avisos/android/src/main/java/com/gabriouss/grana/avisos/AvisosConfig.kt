package com.gabriouss.grana.avisos

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Bancos habilitados, dono, aceite explícito e sinais do serviço.
 */
internal object AvisosConfig {
  private const val PREFS = "grana_avisos"
  private const val CHAVE_DONO = "dono"
  private const val CHAVE_LIGADOS = "ligados"
  private const val CHAVE_INICIADA = "lista_iniciada"
  private const val CHAVE_FORA = "fora_da_lista"
  private const val CHAVE_SINAL = "ultimo_sinal"
  private const val CHAVE_DESCONECTADO = "desconectado_em"
  private const val CHAVE_FALHA = "ultima_falha"
  private const val CHAVE_ACEITE = "aceite_bancos_v1"

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun dono(context: Context): String? = prefs(context).getString(CHAVE_DONO, null)

  /** Devolve true quando trocou de conta: quem chama apaga o diário da anterior. */
  fun definirDono(context: Context, dono: String?): Boolean {
    limparLegado(context)
    val anterior = dono(context)
    if (anterior == dono) return false
    check(prefs(context).edit().putString(CHAVE_DONO, dono).remove(CHAVE_ACEITE).commit()) { "nao gravou o dono" }
    return anterior != null
  }

  /** Nada ligado até o JavaScript mandar a lista inicial: falha fechada. */
  fun garantirListaInicial(context: Context, pacotes: List<String>, agora: Long) {
    limparLegado(context)
    val p = prefs(context)
    if (p.getBoolean(CHAVE_INICIADA, false)) return
    val ligados = JSONObject()
    pacotes.filter(AvisosFiltro::ehBanco).forEach { ligados.put(it, agora) }
    p.edit().putString(CHAVE_LIGADOS, ligados.toString()).putBoolean(CHAVE_INICIADA, true).commit()
  }

  private fun lerObjeto(context: Context, chave: String): JSONObject = try {
    JSONObject(prefs(context).getString(chave, null) ?: "{}")
  } catch (_: Exception) {
    JSONObject()
  }

  fun ativadoEm(context: Context, pacote: String): Long? {
    if (!AvisosFiltro.ehBanco(pacote)) return null
    val ligados = lerObjeto(context, CHAVE_LIGADOS)
    return if (ligados.has(pacote)) ligados.optLong(pacote) else null
  }

  fun definirApp(context: Context, pacote: String, ligado: Boolean, agora: Long) {
    require(AvisosFiltro.ehBanco(pacote)) { "app fora do catalogo bancario" }
    val ligados = lerObjeto(context, CHAVE_LIGADOS)
    if (ligado) ligados.put(pacote, agora) else ligados.remove(pacote)
    check(prefs(context).edit().putString(CHAVE_LIGADOS, ligados.toString()).commit()) { "nao gravou a escolha" }
  }

  fun limparLegado(context: Context) {
    val p = prefs(context)
    val ligados = lerObjeto(context, CHAVE_LIGADOS)
    val proibidos = ligados.keys().asSequence().filterNot(AvisosFiltro::ehBanco).toList()
    if (!p.contains(CHAVE_FORA) && proibidos.isEmpty()) return
    proibidos.forEach { ligados.remove(it) }
    check(p.edit().remove(CHAVE_FORA).putString(CHAVE_LIGADOS, ligados.toString()).commit()) { "nao limpou o legado" }
  }

  fun temAceite(context: Context): Boolean = dono(context) != null && prefs(context).getLong(CHAVE_ACEITE, 0L) > 0L

  fun definirAceite(context: Context, aceito: Boolean, agora: Long) {
    require(!aceito || dono(context) != null) { "aceite precisa de conta" }
    // Reabrir os ajustes não revoga o aceite nem corta o replay de avisos já autorizados.
    if (aceito && temAceite(context)) return
    val editor = prefs(context).edit()
    if (aceito) editor.putLong(CHAVE_ACEITE, agora) else editor.remove(CHAVE_ACEITE)
    check(editor.commit()) { "nao gravou o aceite" }
  }

  /** Permissão do Android sozinha não basta, nem autoriza recuperar avisos anteriores. */
  fun inicioDaLeitura(context: Context, pacote: String): Long? {
    if (!temAceite(context)) return null
    val ativado = ativadoEm(context, pacote) ?: return null
    return maxOf(ativado, prefs(context).getLong(CHAVE_ACEITE, 0L))
  }

  /** Só os bancos do catálogo, inclusive os desligados. */
  fun listarApps(context: Context, nomeDoApp: (String) -> String?): String {
    limparLegado(context)
    val ligados = lerObjeto(context, CHAVE_LIGADOS)
    val saida = JSONArray()
    AvisosFiltro.BANCOS.sorted().forEach { pacote ->
      saida.put(JSONObject()
        .put("pacote", pacote)
        .put("nome", nomeDoApp(pacote) ?: JSONObject.NULL)
        .put("ligado", ligados.has(pacote))
        .put("contagem", 0)
        .put("ultimo", 0L))
    }
    return saida.toString()
  }

  fun registrarSinal(context: Context, agora: Long) {
    prefs(context).edit().putLong(CHAVE_SINAL, agora).remove(CHAVE_DESCONECTADO).apply()
  }

  fun registrarDesconexao(context: Context, agora: Long) {
    prefs(context).edit().putLong(CHAVE_DESCONECTADO, agora).apply()
  }

  /** Recibo de falha: só o tipo do erro, porque a mensagem pode citar o texto. */
  fun registrarFalha(context: Context, tipo: String, agora: Long) {
    prefs(context).edit().putString(CHAVE_FALHA, "$tipo@$agora").apply()
  }

  fun ultimoSinal(context: Context): Long = prefs(context).getLong(CHAVE_SINAL, 0L)
  fun desconectadoEm(context: Context): Long = prefs(context).getLong(CHAVE_DESCONECTADO, 0L)
  fun ultimaFalha(context: Context): String? = prefs(context).getString(CHAVE_FALHA, null)

  fun confirmarLimpeza(context: Context) {
    if (ultimaFalha(context)?.startsWith("FalhaLimpezaDiario@") == true) {
      prefs(context).edit().remove(CHAVE_FALHA).apply()
    }
  }

  fun limpar(context: Context) {
    prefs(context).edit().clear().commit()
  }
}
