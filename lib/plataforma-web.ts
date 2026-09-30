/**
 * Em que aparelho está o navegador que abriu a versão web.
 *
 * Existe por causa do convite para baixar o APK (`components/ConviteAppAndroid.tsx`):
 * ele testava só `Platform.OS === 'web'` e aparecia também no Safari do iPhone,
 * onde não há aplicativo (achado do Flare, 30/09/2026).
 *
 * O iPadOS 13+ se apresenta como Mac ("Macintosh" no userAgent). O que o
 * denuncia é a tela sensível ao toque: Mac de verdade tem `maxTouchPoints` 0.
 */
export type PlataformaWeb = 'android' | 'ios' | 'computador';

export function plataformaDoNavegador(userAgent: string, maxTouchPoints = 0): PlataformaWeb {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  return 'computador';
}

/**
 * O convite leva direto ao arquivo `.apk`, que só instala em Android. No
 * iPhone e no iPad não há aplicativo; no computador o botão baixaria um
 * arquivo que não abre ali, e `/baixar` não tem QR Code para levar ao celular.
 */
export function deveConvidarParaAppAndroid(plataforma: PlataformaWeb): boolean {
  return plataforma === 'android';
}
