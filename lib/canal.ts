/**
 * Canal de distribuição da build.
 *
 * `EXPO_PUBLIC_CANAL=play` marca a build da Google Play (perfil `play` do
 * eas.json). Ausente, ou com qualquer outro valor, o app se comporta como
 * sempre: distribuição por APK, assinatura pela Cakto. Fonte única: nenhum
 * outro arquivo deve ler a variável direto.
 *
 * Na Play não existem checkout externo, renovação externa, aviso de
 * atualização por APK nem página de download do APK.
 */
export function ehCanalPlay(): boolean {
  return process.env.EXPO_PUBLIC_CANAL?.trim().toLowerCase() === 'play';
}
