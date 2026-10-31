package com.gabriouss.grana.avisos

import com.gabriouss.grana.avisos.AvisosFiltro.Destino
import org.junit.Assert.assertEquals
import org.junit.Test

class AvisosFiltroTest {
  private fun decidir(
    pacote: String = "com.banco",
    resumo: Boolean = false,
    dono: Boolean = true,
    ativadoEm: Long? = 100L,
    postadoEm: Long = 200L,
    depuravel: Boolean = false,
  ) = AvisosFiltro.decidir(pacote, "com.gabriouss.grana", resumo, dono, ativadoEm, postadoEm, depuravel)

  @Test fun appDaListaEhLido() = assertEquals(Destino.LER, decidir())
  @Test fun appForaDaListaSoConta() = assertEquals(Destino.CONTAR, decidir(ativadoEm = null))
  @Test fun proprioPacoteDescarta() = assertEquals(Destino.DESCARTAR, decidir(pacote = "com.gabriouss.grana"))
  @Test fun resumoDeGrupoDescarta() = assertEquals(Destino.DESCARTAR, decidir(resumo = true))
  @Test fun semDonoDescarta() = assertEquals(Destino.DESCARTAR, decidir(dono = false, ativadoEm = null))
  @Test fun anteriorAoLigarDescarta() = assertEquals(Destino.DESCARTAR, decidir(ativadoEm = 300L))
  @Test fun shellSoEmDepuracao() {
    assertEquals(Destino.DESCARTAR, decidir(pacote = AvisosFiltro.PACOTE_DO_SHELL))
    assertEquals(Destino.LER, decidir(pacote = AvisosFiltro.PACOTE_DO_SHELL, depuravel = true))
  }
}
