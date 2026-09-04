package com.gabriouss.grana.voicewidget

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class LivreWidget(
  val livrePorDia: Double,
  val livreTotal: Double,
  val diasRestantes: Int,
  val semSaldo: Boolean,
)

data class CompromissoWidget(
  val id: String,
  val description: String,
  val amount: Double,
  val dueDate: String,
  val overdue: Boolean,
  val recurring: Boolean,
)

data class CofrinhoWidget(
  val id: String,
  val title: String,
  val currentAmount: Double,
  val targetAmount: Double,
  val progress: Int,
  val completed: Boolean,
)

data class SnapshotWidgets(
  val userId: String,
  val updatedAt: String,
  val privacyHidden: Boolean,
  val safeToSpend: LivreWidget,
  val nextCommitment: CompromissoWidget?,
  val goal: CofrinhoWidget?,
)

/** Snapshot mínimo cifrado em AES/GCM com chave não exportável do Keystore. */
object WidgetSnapshotStore {
  private const val PREFS = "grana_home_widgets"
  private const val CHAVE_PAYLOAD = "snapshot_payload"
  private const val CHAVE_IV = "snapshot_iv"
  private const val CHAVE_PRIVACIDADE = "privacy_hidden"
  private const val ALIAS = "grana_home_widgets_v1"
  private const val TRANSFORMACAO = "AES/GCM/NoPadding"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun chave(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }

    val gerador = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gerador.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .build()
    )
    return gerador.generateKey()
  }

  fun salvar(context: Context, json: String) {
    /* Valida antes de substituir o último snapshot bom. */
    val snapshot = interpretar(json) ?: throw IllegalArgumentException("Snapshot de widgets inválido")
    val cipher = Cipher.getInstance(TRANSFORMACAO).apply { init(Cipher.ENCRYPT_MODE, chave()) }
    val cifrado = cipher.doFinal(json.toByteArray(Charsets.UTF_8))
    prefs(context).edit()
      .putString(CHAVE_IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
      .putString(CHAVE_PAYLOAD, Base64.encodeToString(cifrado, Base64.NO_WRAP))
      .apply()
  }

  fun ler(context: Context): SnapshotWidgets? {
    val preferencias = prefs(context)
    val iv = preferencias.getString(CHAVE_IV, null) ?: return null
    val payload = preferencias.getString(CHAVE_PAYLOAD, null) ?: return null
    return try {
      val cipher = Cipher.getInstance(TRANSFORMACAO).apply {
        init(
          Cipher.DECRYPT_MODE,
          chave(),
          GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)),
        )
      }
      interpretar(String(cipher.doFinal(Base64.decode(payload, Base64.NO_WRAP)), Charsets.UTF_8))
        ?: run { limpar(context); null }
    } catch (_: Exception) {
      /* Backup restaurado sem a chave, payload truncado ou adulterado. */
      limpar(context)
      null
    }
  }

  fun garantirUsuario(context: Context, userId: String) {
    val anterior = ler(context)?.userId ?: return
    if (anterior != userId) limpar(context)
  }

  fun definirPrivacidade(context: Context, hidden: Boolean) {
    prefs(context).edit().putBoolean(CHAVE_PRIVACIDADE, hidden).apply()
  }

  fun privacidade(context: Context, snapshot: SnapshotWidgets?): Boolean {
    val preferencias = prefs(context)
    return if (preferencias.contains(CHAVE_PRIVACIDADE)) {
      preferencias.getBoolean(CHAVE_PRIVACIDADE, false)
    } else {
      snapshot?.privacyHidden ?: false
    }
  }

  fun limpar(context: Context) {
    prefs(context).edit().remove(CHAVE_IV).remove(CHAVE_PAYLOAD).apply()
  }

  private fun numero(objeto: JSONObject, nome: String): Double {
    val valor = objeto.optDouble(nome, Double.NaN)
    if (!valor.isFinite()) throw IllegalArgumentException(nome)
    return valor
  }

  private fun interpretar(json: String): SnapshotWidgets? {
    return try {
      val raiz = JSONObject(json)
      if (raiz.optInt("version") != 1) throw IllegalArgumentException("version")
      val userId = raiz.optString("userId")
      val updatedAt = raiz.optString("updatedAt")
      if (userId.isBlank() || updatedAt.isBlank()) throw IllegalArgumentException("identity")

      val livre = raiz.getJSONObject("safeToSpend")
      val compromisso = raiz.optJSONObject("nextCommitment")?.let {
        CompromissoWidget(
          id = it.getString("id"),
          description = it.optString("description", "Conta"),
          amount = numero(it, "amount"),
          dueDate = it.getString("dueDate"),
          overdue = it.optBoolean("overdue"),
          recurring = it.optBoolean("recurring"),
        )
      }
      val cofrinho = raiz.optJSONObject("goal")?.let {
        CofrinhoWidget(
          id = it.getString("id"),
          title = it.optString("title", "Cofrinho"),
          currentAmount = numero(it, "currentAmount"),
          targetAmount = numero(it, "targetAmount"),
          progress = it.optInt("progress").coerceIn(0, 100),
          completed = it.optBoolean("completed"),
        )
      }

      SnapshotWidgets(
        userId = userId,
        updatedAt = updatedAt,
        privacyHidden = raiz.optBoolean("privacyHidden"),
        safeToSpend = LivreWidget(
          livrePorDia = numero(livre, "livrePorDia"),
          livreTotal = numero(livre, "livreTotal"),
          diasRestantes = livre.optInt("diasRestantes", 1).coerceAtLeast(1),
          semSaldo = livre.optBoolean("semSaldo"),
        ),
        nextCommitment = compromisso,
        goal = cofrinho,
      )
    } catch (_: Exception) {
      null
    }
  }
}
