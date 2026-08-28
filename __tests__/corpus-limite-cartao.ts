/* Notificação de %-do-limite do cartão — a parte pura (cálculo de % e
 * decisão de qual degrau notificar), sem depender de Supabase. A parte que
 * PRECISA de banco (checarLimiteCartao em si) é testada manualmente no app
 * real, per o plano desta rodada — expo-notifications local não roda em
 * Node nem no navegador.
 *
 * Roda: npx tsx __tests__/corpus-limite-cartao.ts
 */
import { calcularPctCartao, proximoDegrauCruzado } from '../lib/creditLimitAlert';

let falhas = 0;
let total = 0;
function checar<T>(rotulo: string, obtido: T, esperado: T) {
  total++;
  if (obtido !== esperado) {
    falhas++;
    console.log(`FALHA  [${rotulo}] = ${obtido} (esperado ${esperado})`);
  }
}

/* ---------- calcularPctCartao ---------- */

checar('50% do limite', calcularPctCartao([{ amount: 500 }], { limit_amount: 1000 }), 0.5);
checar('mais de 100% (não trava)', calcularPctCartao([{ amount: 1300 }], { limit_amount: 1000 }), 1.3);
checar('soma várias transações', calcularPctCartao([{ amount: 300 }, { amount: 200 }], { limit_amount: 1000 }), 0.5);
checar('sem transações', calcularPctCartao([], { limit_amount: 1000 }), 0);
checar('limite zerado não divide por zero', calcularPctCartao([{ amount: 100 }], { limit_amount: 0 }), 0);

/* ---------- proximoDegrauCruzado ---------- */

// Nunca notificado (0), cruzando cada degrau pela primeira vez.
checar('cruza 50% pela primeira vez', proximoDegrauCruzado(0.5, 0), 50);
checar('cruza 70% pela primeira vez', proximoDegrauCruzado(0.7, 0), 70);
checar('cruza 90% pela primeira vez', proximoDegrauCruzado(0.9, 0), 90);
checar('cruza 100% pela primeira vez', proximoDegrauCruzado(1.0, 0), 100);
checar('passa de 100% (130%) vira degrau 100', proximoDegrauCruzado(1.3, 0), 100);

// Pulo de degrau: um lançamento grande de uma vez pula direto de 0% pra
// 95% — tem que notificar o MAIOR degrau novo (90), não travar em 50.
checar('pulo de degrau notifica o mais alto', proximoDegrauCruzado(0.95, 0), 90);

// Já notificado — degrau repetido ou menor não dispara de novo.
checar('já notificado 50%, gasto continua em 55% — não notifica de novo', proximoDegrauCruzado(0.55, 50), null);
checar('já notificado 70%, cai pra 60% (estorno) — não notifica', proximoDegrauCruzado(0.6, 70), null);

// Já notificado 50%, cruza 70% depois — notifica só o degrau novo.
checar('já notificado 50%, cruza 70% depois', proximoDegrauCruzado(0.72, 50), 70);

// Abaixo do primeiro degrau — nada a notificar.
checar('abaixo de 50%, nada a notificar', proximoDegrauCruzado(0.3, 0), null);

console.log(`\n${total - falhas}/${total} checagens de limite de cartão passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
