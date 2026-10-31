package com.gabriouss.grana.avisos

import java.io.File
import java.security.MessageDigest
import org.json.JSONArray
import org.json.JSONObject

/**
 * Um arquivo por aviso em `noBackupFilesDir`, fora do backup do Android. A
 * escrita vai para um temporário e só depois troca de nome: processo morto no
 * meio deixa um `.tmp`, nunca um aviso pela metade.
 */
internal class AvisosDiario(private val pasta: File, private val agora: () -> Long = System::currentTimeMillis) {

  data class Aviso(
    val pacote: String,
    val chave: String,
    val quando: Long,
    val titulo: String,
    val texto: String,
  ) {
    val id: String get() = idDoAviso(pacote, chave, quando, texto)
  }

  /** @return true só quando o aviso é novo. Atualização igual não duplica. */
  fun guardar(aviso: Aviso): Boolean {
    garantirPasta()
    val destino = File(pasta, "${aviso.id}.json")
    if (destino.exists()) return false
    val json = JSONObject()
      .put("id", aviso.id)
      .put("pacote", aviso.pacote)
      .put("chave", aviso.chave)
      .put("quando", aviso.quando)
      .put("titulo", aviso.titulo)
      .put("texto", aviso.texto)
    val temporario = File(pasta, "${aviso.id}.tmp")
    temporario.writeText(json.toString(), Charsets.UTF_8)
    if (!temporario.renameTo(destino)) {
      temporario.delete()
      throw IllegalStateException("nao gravou o aviso")
    }
    limparVencidos()
    return true
  }

  /**
   * Pasta sem permissão ou ilegível lança: erro de leitura não pode virar
   * "nenhum aviso" (lição do WT-02). Arquivo corrompido conta em `ilegiveis`.
   */
  fun listar(): String {
    limparVencidos()
    val itens = JSONArray()
    var ilegiveis = 0
    if (pasta.exists()) {
      val arquivos = pasta.listFiles() ?: throw IllegalStateException("nao listou o diario")
      arquivos.filter { it.name.endsWith(".json") }.sortedBy { it.name }.forEach { arquivo ->
        try {
          itens.put(JSONObject(arquivo.readText(Charsets.UTF_8)))
        } catch (_: Exception) {
          ilegiveis++
        }
      }
    }
    return JSONObject().put("itens", itens).put("ilegiveis", ilegiveis).toString()
  }

  fun apagarTudo() {
    pasta.listFiles()?.forEach { it.delete() }
  }

  fun limparVencidos() {
    val limite = agora() - RETENCAO_MS
    pasta.listFiles()?.forEach { if (it.lastModified() < limite) it.delete() }
  }

  private fun garantirPasta() {
    if (!pasta.isDirectory && !pasta.mkdirs()) throw IllegalStateException("nao criou o diario")
  }

  companion object {
    const val RETENCAO_MS = 7L * 24 * 60 * 60 * 1000

    fun idDoAviso(pacote: String, chave: String, quando: Long, texto: String): String =
      MessageDigest.getInstance("SHA-256")
        .digest("$pacote\u0000$chave\u0000$quando\u0000$texto".toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
  }
}
