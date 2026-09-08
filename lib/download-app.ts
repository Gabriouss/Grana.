/**
 * Fonte única do endereço de distribuição direta do APK.
 *
 * O link do EAS é temporário e serve para uma build específica. A entrega
 * comercial precisa apontar para um endereço estável, configurado fora do
 * código, para que a página pública e a tela de ativação não dependam de uma
 * URL que pode expirar.
 */
export function obterUrlDownloadAndroid(): string | null {
  const valor = process.env.EXPO_PUBLIC_ANDROID_DOWNLOAD_URL?.trim();
  return valor && /^https:\/\//i.test(valor) ? valor : null;
}
