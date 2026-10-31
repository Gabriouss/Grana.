/**
 * Apps lidos desde o início. Parte da lista antiga de bancos
 * (`git show 2c2860ed^:lib/types.ts`), mais as carteiras. Cada pacote foi
 * conferido na Play Store em 30/10/2026. `com.itau.personnalite`, que estava na
 * lista antiga, responde 404 e ficou de fora. Estar aqui não quer dizer que o
 * texto daquele banco foi testado com aviso real.
 */
export type ClasseDoApp = 'banco' | 'carteira';

export type AppDoCatalogo = { pacote: string; nome: string; banco: string; classe: ClasseDoApp };

export const APPS_INICIAIS: AppDoCatalogo[] = [
  { pacote: 'com.nu.production', nome: 'Nubank', banco: 'nubank', classe: 'banco' },
  { pacote: 'com.itau', nome: 'Itaú', banco: 'itau', classe: 'banco' },
  { pacote: 'br.com.intermedium', nome: 'Inter', banco: 'inter', classe: 'banco' },
  { pacote: 'com.bradesco', nome: 'Bradesco', banco: 'bradesco', classe: 'banco' },
  { pacote: 'com.santander.app', nome: 'Santander', banco: 'santander', classe: 'banco' },
  { pacote: 'com.c6bank.app', nome: 'C6 Bank', banco: 'c6', classe: 'banco' },
  { pacote: 'com.mercadopago.wallet', nome: 'Mercado Pago', banco: 'mercadopago', classe: 'banco' },
  { pacote: 'br.com.gabba.Caixa', nome: 'Caixa', banco: 'caixa', classe: 'banco' },
  { pacote: 'br.com.bb.android', nome: 'Banco do Brasil', banco: 'bb', classe: 'banco' },
  { pacote: 'com.btg.pactual.banking', nome: 'BTG Pactual', banco: 'btg', classe: 'banco' },
  { pacote: 'com.google.android.apps.walletnfcrel', nome: 'Google Wallet', banco: 'outro', classe: 'carteira' },
  { pacote: 'com.samsung.android.spay', nome: 'Samsung Wallet', banco: 'outro', classe: 'carteira' },
];

export const PACOTES_INICIAIS = APPS_INICIAIS.map((a) => a.pacote);

/** App ligado à mão pela pessoa conta como banco. */
export function classeDoApp(pacote: string): ClasseDoApp {
  return APPS_INICIAIS.find((a) => a.pacote === pacote)?.classe ?? 'banco';
}

export function nomeDoApp(pacote: string, nomeDoSistema?: string | null): string {
  return APPS_INICIAIS.find((a) => a.pacote === pacote)?.nome ?? nomeDoSistema ?? pacote;
}
