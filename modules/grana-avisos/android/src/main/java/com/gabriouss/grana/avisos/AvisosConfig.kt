package com.gabriouss.grana.avisos

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Lista de apps, dono e sinais do serviço. Guarda o nome do pacote e a contagem
 * dos apps fora da lista, nunca título ou texto.
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
  private const val MAXIMO_DE_APPS_CONTADOS = 200

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun dono(context: Context): String? = prefs(context).getString(CHAVE_DONO, null)

  /** Devolve true quando trocou de conta: quem chama apaga o diário da anterior. */
  fun definirDono(context: Context, dono: String?): Boolean {
    val anterior = dono(context)
    if (anterior == dono) return false
    prefs(context).edit().putString(CHAVE_DONO, dono).commit()
    return anterior != null
  }

  /** Nada ligado até o JavaScript mandar a lista inicial: falha fechada. */
  fun garantirListaInicial(context: Context, pacotes: List<String>, agora: Long) {
    val p = prefs(context)
    if (p.getBoolean(CHAVE_INICIADA, false)) return
    val ligados = JSONObject()
    pacotes.forEach { ligados.put(it, agora) }
    p.edit().putString(CHAVE_LIGADOS, ligados.toString()).putBoolean(CHAVE_INICIADA, true).commit()
  }

  private fun lerObjeto(context: Context, chave: String): JSONObject = try {
    JSONObject(prefs(context).getString(chave, null) ?: "{}")
  } catch (_: Exception) {
    JSONObject()
  }

  fun ativadoEm(context: Context, pacote: String): Long? {
    val ligados = lerObjeto(context, CHAVE_LIGADOS)
    return if (ligados.has(pacote)) ligados.optLong(pacote) else null
  }

  fun definirApp(context: Context, pacote: String, ligado: Boolean, agora: Long) {
    val ligados = lerObjeto(context, CHAVE_LIGADOS)
    if (ligado) ligados.put(pacote, agora) else ligados.remove(pacote)
    prefs(context).edit().putString(CHAVE_LIGADOS, ligados.toString()).commit()
  }

  fun contarForaDaLista(context: Context, pacote: String, agora: Long) {
    val fora = lerObjeto(context, CHAVE_FORA)
    if (!fora.has(pacote) && fora.length() >= MAXIMO_DE_APPS_CONTADOS) return
    val atual = fora.optJSONObject(pacote)
    fora.put(pacote, JSONObject().put("contagem", (atual?.optInt("contagem") ?: 0) + 1).put("ultimo", agora))
    prefs(context).edit().putString(CHAVE_FORA, fora.toString()).apply()
  }

  /** Apps ligados e apps que só notificaram, cada um uma vez. */
  fun listarApps(context: Context, nomeDoApp: (String) -> String?): String {
    val ligados = lerObjeto(context, CHAVE_LIGADOS)
    val fora = lerObjeto(context, CHAVE_FORA)
    val saida = JSONArray()
    val pacotes = (ligados.keys().asSequence() + fora.keys().asSequence()).toSortedSet()
    pacotes.forEach { pacote ->
      val contado = fora.optJSONObject(pacote)
      saida.put(JSONObject()
        .put("pacote", pacote)
        .put("nome", nomeDoApp(pacote) ?: JSONObject.NULL)
        .put("ligado", ligados.has(pacote))
        .put("contagem", contado?.optInt("contagem") ?: 0)
        .put("ultimo", contado?.optLong("ultimo") ?: 0L))
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

  fun limpar(context: Context) {
    prefs(context).edit().clear().commit()
  }
}
