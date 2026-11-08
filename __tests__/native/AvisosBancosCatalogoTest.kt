package com.gabriouss.grana.avisos

import android.content.Context
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

private var falhas = 0
private var passaram = 0
private fun caso(nome: String, fn: () -> Unit) {
  try { fn(); passaram++; println("OK $nome") }
  catch (erro: Throwable) { falhas++; println("FALHA $nome: ${erro.message}") }
}

fun main(args: Array<String>) {
  val raiz = File(args[0])
  val bancos = args[1].split(',').toSet()
  val nubank = "com.nu.production"
  fun decidir(pacote: String, ativado: Long? = 10L) =
    AvisosFiltro.decidir(pacote, "com.gabriouss.grana", false, true, ativado, 20L, true)
  caso("catálogo inteiro é aceito quando ligado") {
    check(AvisosFiltro.BANCOS == bancos) { "catálogos Kotlin/TypeScript divergiram" }
    check(bancos.all { decidir(it) == AvisosFiltro.Destino.LER })
  }
  caso("fora do catálogo nunca lê, mesmo ligado e depurável") {
    listOf("com.whatsapp", "com.instagram.android", "com.openai.chatgpt", "com.tinder", "com.android.shell",
      "com.google.android.apps.walletnfcrel", "com.samsung.android.spay").forEach {
      check(decidir(it) == AvisosFiltro.Destino.DESCARTAR) { "pacote fora do catálogo foi aceito" }
    }
  }
  caso("banco desligado descarta, sem contagem") {
    check(decidir(nubank, null) == AvisosFiltro.Destino.DESCARTAR)
  }
  caso("prévia anterior à ativação não entra") {
    check(AvisosFiltro.decidir(nubank, "proprio", false, true, 30L, 20L, false) == AvisosFiltro.Destino.DESCARTAR)
  }
  caso("configuração limpa chave antiga e só lista o catálogo") {
    val ctx = Context()
    val p = ctx.getSharedPreferences("grana_avisos", 0)
    p.edit().putString("fora_da_lista", """{"com.whatsapp":{"contagem":3,"ultimo":999}}""")
      .putString("ligados", """{"com.whatsapp":10,"com.nu.production":10}""")
      .putBoolean("lista_iniciada", true).commit()
    AvisosConfig.garantirListaInicial(ctx, listOf(nubank, "com.whatsapp"), 100L)
    val apps = JSONArray(AvisosConfig.listarApps(ctx) { "nome-do-sistema" })
    val pacotes = (0 until apps.length()).map { apps.getJSONObject(it).getString("pacote") }.toSet()
    check(pacotes == bancos) { "lista não corresponde ao catálogo" }
    check(p.getString("fora_da_lista", null) == null) { "metadados antigos persistiram" }
    check(!JSONObject(p.getString("ligados", "{}")).has("com.whatsapp"))
    check(AvisosConfig.ativadoEm(ctx, nubank) == 10L) { "escolha bancária anterior não foi preservada" }
  }
  caso("API nativa não liga pacote fora do catálogo") {
    val ctx = Context()
    try { AvisosConfig.definirApp(ctx, "com.whatsapp", true, 10L) } catch (_: IllegalArgumentException) {}
    check(AvisosConfig.ativadoEm(ctx, "com.whatsapp") == null)
  }
  caso("diário não grava pacote de fora nem cria pasta") {
    val pasta = File(raiz, "guardar-fora")
    val diario = AvisosDiario(pasta) { 100L }
    check(!diario.guardar(AvisosDiario.Aviso("com.whatsapp", "a", 100L, "titulo", "texto")))
    check(!pasta.exists())
  }
  caso("leitura limpa legado de fora e conserva aviso do banco") {
    val pasta = File(raiz, "legado").apply { mkdirs() }
    fun arquivo(nome: String, pacote: String) {
      File(pasta, nome).writeText(JSONObject().put("pacote", pacote).put("titulo", "titulo")
        .put("texto", "texto").put("quando", 100L).toString())
    }
    arquivo("fora.json", "com.whatsapp")
    arquivo("banco.json", nubank)
    File(pasta, "interrompido.tmp").writeText("texto parcial antigo")
    val diario = AvisosDiario(pasta) { 100L }
    val retorno = JSONObject(diario.listar()).getJSONArray("itens")
    check(!File(pasta, "fora.json").exists())
    check(!File(pasta, "interrompido.tmp").exists())
    check(File(pasta, "banco.json").exists())
    check(retorno.length() == 1 && retorno.getJSONObject(0).getString("pacote") == nubank)
  }
  caso("aceite é obrigatório, revogável e não migra entre contas") {
    val ctx = Context()
    val classe = AvisosConfig.javaClass
    val aceitar = classe.getMethod("definirAceite", Context::class.java, Boolean::class.javaPrimitiveType, Long::class.javaPrimitiveType)
    val inicio = classe.getMethod("inicioDaLeitura", Context::class.java, String::class.java)
    AvisosConfig.definirDono(ctx, "conta-de-teste")
    AvisosConfig.definirApp(ctx, nubank, true, 10L)
    check(inicio.invoke(AvisosConfig, ctx, nubank) == null) { "permissão antiga iniciou leitura sem aceite" }
    aceitar.invoke(AvisosConfig, ctx, true, 30L)
    check(inicio.invoke(AvisosConfig, ctx, nubank) == 30L) { "leu avisos anteriores ao aceite" }
    check(inicio.invoke(AvisosConfig, ctx, "com.whatsapp") == null)
    aceitar.invoke(AvisosConfig, ctx, false, 40L)
    check(inicio.invoke(AvisosConfig, ctx, nubank) == null)
    aceitar.invoke(AvisosConfig, ctx, true, 50L)
    AvisosConfig.definirDono(ctx, "outra-conta-de-teste")
    check(inicio.invoke(AvisosConfig, ctx, nubank) == null)
  }
  println("avisos bancos nativo: $passaram OK, $falhas falhas")
  check(falhas == 0)
}
