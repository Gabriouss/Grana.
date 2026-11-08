package com.gabriouss.grana.avisos

import java.text.Normalizer

/**
 * A decisão de entrada, sem nada do Android, para o teste poder afirmar que app
 * fora da lista nunca chega à leitura do título e do texto (trava T3).
 */
internal object AvisosFiltro {
  /* Mesmo catálogo bancário do TypeScript; avisos-bancos-nativo.cjs confere os
     conjuntos inteiros. Não aceitar pacotes vindos de preferências antigas. */
  val BANCOS = setOf(
    "com.nu.production", "com.itau", "br.com.intermedium", "com.bradesco",
    "com.santander.app", "com.c6bank.app", "com.mercadopago.wallet",
    "br.com.gabba.Caixa", "br.com.bb.android", "com.btg.pactual.banking",
  )
  fun ehBanco(pacote: String): Boolean = pacote in BANCOS

  enum class Destino {
    /** Nada é gravado. */
    DESCARTAR,
    /** Só aqui título e texto podem ser lidos. */
    LER,
  }

  /**
   * @param ativadoEm quando o app foi ligado, ou null se não está na lista
   * @param depuravel mantido na assinatura; depuração não abre exceção ao catálogo
   */
  fun decidir(
    pacote: String,
    pacoteProprio: String,
    resumoDeGrupo: Boolean,
    temDono: Boolean,
    ativadoEm: Long?,
    postadoEm: Long,
    @Suppress("UNUSED_PARAMETER") depuravel: Boolean,
  ): Destino {
    if (!ehBanco(pacote)) return Destino.DESCARTAR
    if (pacote == pacoteProprio) return Destino.DESCARTAR
    if (resumoDeGrupo) return Destino.DESCARTAR
    if (!temDono) return Destino.DESCARTAR
    if (ativadoEm == null) return Destino.DESCARTAR
    /* "Ligado, passa a ser lido daquele momento em diante": o que já estava na
       bandeja ao ligar não entra na recuperação de onListenerConnected. */
    return if (postadoEm >= ativadoEm) Destino.LER else Destino.DESCARTAR
  }

  /**
   * Cópia exata de `RECUSA` em lib/avisos-banco/interpretar.ts: o teste
   * __tests__/avisos-recusa-estorno.cjs reprova se os dois divergirem. Aqui só
   * decide se o Grana. publica "Novo aviso para conferir"; quem decide o que vira
   * item continua sendo o app, que também ignora a recusa (pedido do autor,
   * 07/11/2026: recusa avisada como se fosse compra).
   */
  internal const val PADRAO_DE_RECUSA = """\b(?:recusad|negad|rejeitad|reprovad|bloquead|impedid)|\bnao\s+(?:foi\s+|pode\s+ser\s+)?(?:autorizad|aprovad|concluid|realizad|efetuad|processad|finalizad|completad|permitid)|\bnao foi possivel|\bnao conseguimos|\bfalhou\b|\bfalha\s+n[ao]\b|\b(?:limite|saldo)\s+(?:\S+\s+){0,3}?insuficiente|\btentativa\s+de\s+(?:compra|pagamento|transacao|pix|uso)|\b(?:compra|transacao|pagamento|pix)\s+(?:\S+\s+){0,4}?(?:em|sob)\s+analise\b|\bcancelad[ao]s?\s+(?:\S+\s+){0,2}?por\s+(?:sua\s+)?seguranca\b|\b(?:suspeita\s+de\s+fraude|compra\s+suspeita|transacao\s+suspeita)"""
  private val RECUSA = Regex(PADRAO_DE_RECUSA)
  private val MARCAS = Regex("""\p{Mn}+""")
  private val ESPACOS = Regex("""[   ]""")

  /** Sem acento, em minúsculas e com os espaços do banco trocados, como no app. */
  fun ehRecusa(titulo: String, texto: String): Boolean {
    val base = Normalizer.normalize("$titulo $texto", Normalizer.Form.NFD)
      .replace(MARCAS, "").replace(ESPACOS, " ").lowercase()
    return RECUSA.containsMatchIn(base)
  }
}

