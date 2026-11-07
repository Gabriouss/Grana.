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
  @Test fun recusaNaoPedeConferencia() {
    assertEquals(true, AvisosFiltro.ehRecusa(
      "Compra recusada: limite insuficiente",
      "A compra no cartão final 1234********0000 em 07/11/2026, de R$ 12.34, em DL *UberRides Sao Paulo BRA, foi recusada por limite de crédito insuficiente.",
    ))
    assertEquals(true, AvisosFiltro.ehRecusa("Compra não autorizada", "Compra de R$ 45,90 em LOJA MODELO"))
    assertEquals(true, AvisosFiltro.ehRecusa("Tentativa de compra", "Tentativa de compra de R$ 45,90"))
    assertEquals(false, AvisosFiltro.ehRecusa("Compra aprovada", "Compra de R$ 45,90 em Loja Modelo"))
    assertEquals(false, AvisosFiltro.ehRecusa("Pix enviado", "Pix enviado de R$ 45,90 para Maria Modelo"))
  }
  @Test fun shellSoEmDepuracao() {
    assertEquals(Destino.DESCARTAR, decidir(pacote = AvisosFiltro.PACOTE_DO_SHELL))
    assertEquals(Destino.LER, decidir(pacote = AvisosFiltro.PACOTE_DO_SHELL, depuravel = true))
  }
}
