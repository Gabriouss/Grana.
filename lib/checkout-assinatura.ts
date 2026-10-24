import { checkoutComEmail } from './checkout';

const compra = process.env.EXPO_PUBLIC_CHECKOUT_URL;
export const destinoCompra = compra?.startsWith('https://') ? compra : 'https://granaponto.com.br/#precos';
const gerenciamento = process.env.EXPO_PUBLIC_BILLING_URL;
export const destinoGerenciamento = gerenciamento?.startsWith('https://') ? gerenciamento : null;
export const destinoSuporte = 'mailto:suporte@granaponto.com.br?subject=Ajuda%20com%20a%20cobran%C3%A7a%20do%20Grana.';

/** Mesmos destinos da tela de assinatura: atraso atualiza cobrança, não abre uma nova compra. */
export function linkRenovacaoAssinatura(email: string | null, cobrancaPendente: boolean) {
  if (cobrancaPendente) return destinoGerenciamento
    ? { url: destinoGerenciamento, rotulo: 'Atualizar cobrança' }
    : { url: destinoSuporte, rotulo: 'Falar com o suporte' };
  return { url: checkoutComEmail(destinoCompra, email), rotulo: 'Renovar' };
}
