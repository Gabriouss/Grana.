package com.gabriouss.grana.avisos

/** Estado desta execução do serviço, nunca inferido da permissão ou de um sinal antigo. */
internal class AvisosConexao(
  private val agora: () -> Long,
  private val agendar: (Long, () -> Unit) -> Unit,
  private val publicar: () -> Unit,
  private val registrarFalha: (String) -> Unit,
) {
  @Volatile var conectado = false; private set
  @Volatile var recuperando = false; private set
  @Volatile var falha: String? = null; private set
  private var dono: String? = null
  private var geracao = 0L
  private var geracaoDaTentativa: Long? = null
  private var tentativa = 0L
  private var ultimaTentativa: Long? = null

  @Synchronized fun atualizarDono(atual: String?) {
    if (dono == atual) return
    dono = atual
    geracao++
    tentativa++
    recuperando = false
    falha = null
    publicar()
  }

  @Synchronized fun recuperar(atual: String?, aceite: Boolean, permissao: Boolean, pedir: () -> Unit) {
    atualizarDono(atual)
    if (atual == null || !aceite || !permissao) {
      if (recuperando) { tentativa++; recuperando = false; publicar() }
      return
    }
    if (conectado || recuperando) return
    val tempo = agora()
    if (ultimaTentativa?.let { tempo - it < COOLDOWN_MS } == true) return
    ultimaTentativa = tempo
    val id = ++tentativa
    geracaoDaTentativa = geracao
    recuperando = true
    falha = null
    publicar()
    agendar(PRAZO_MS) {
      synchronized(this) {
        if (id == tentativa && recuperando) falhar("ConexaoSemResposta")
      }
    }
    try { pedir() } catch (_: Exception) { falhar("FalhaAoReconectar") }
  }

  @Synchronized fun falhar(tipo: String) {
    tentativa++
    recuperando = false
    falha = tipo
    registrarFalha(tipo)
    publicar()
  }

  /** Callback tardio só pode recuperar para a mesma geração de conta. */
  @Synchronized fun conectar(atual: String?, aceite: Boolean, permissao: Boolean): Boolean {
    atualizarDono(atual)
    val recuperarAtivos = !conectado && atual != null && aceite && permissao &&
      (geracaoDaTentativa == null || geracaoDaTentativa == geracao)
    conectado = true
    recuperando = false
    tentativa++
    falha = null
    publicar()
    return recuperarAtivos
  }

  @Synchronized fun desconectar() {
    conectado = false
    recuperando = false
    tentativa++
    publicar()
  }

  companion object {
    const val PRAZO_MS = 8_000L
    const val COOLDOWN_MS = 30_000L
  }
}
