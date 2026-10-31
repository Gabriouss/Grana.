package com.gabriouss.grana.avisos

/**
 * A decisão de entrada, sem nada do Android, para o teste poder afirmar que app
 * fora da lista nunca chega à leitura do título e do texto (trava T3).
 */
internal object AvisosFiltro {
  const val PACOTE_DO_SHELL = "com.android.shell"

  enum class Destino {
    /** Nada é gravado. */
    DESCARTAR,
    /** Grava só o nome do pacote e a contagem. Título e texto não são abertos. */
    CONTAR,
    /** Só aqui título e texto podem ser lidos. */
    LER,
  }

  /**
   * @param ativadoEm quando o app foi ligado, ou null se não está na lista
   * @param depuravel só a build de depuração aceita `com.android.shell`, que é
   *   como `adb shell cmd notification post` publica no emulador
   */
  fun decidir(
    pacote: String,
    pacoteProprio: String,
    resumoDeGrupo: Boolean,
    temDono: Boolean,
    ativadoEm: Long?,
    postadoEm: Long,
    depuravel: Boolean,
  ): Destino {
    if (pacote == pacoteProprio) return Destino.DESCARTAR
    if (resumoDeGrupo) return Destino.DESCARTAR
    if (!temDono) return Destino.DESCARTAR
    if (pacote == PACOTE_DO_SHELL && !depuravel) return Destino.DESCARTAR
    if (ativadoEm == null) return Destino.CONTAR
    /* "Ligado, passa a ser lido daquele momento em diante": o que já estava na
       bandeja ao ligar não entra na recuperação de onListenerConnected. */
    return if (postadoEm >= ativadoEm) Destino.LER else Destino.DESCARTAR
  }
}
