import { extrairTotalDaFoto, textoPorFileira, type TotalDaFoto } from './nota-foto-parser';

export type LeituraDaFoto =
  | { ok: true; texto: string; total: TotalDaFoto }
  | { ok: false; motivo: 'indisponivel' | 'falhou' };

/**
 * Quanto a leitura pode levar antes de a tela desistir e pedir o valor à mão.
 *
 * Achado N2/C1-c do Sentinel (26/09/2026): no emulador, a tela ficou mais de
 * 10 minutos presa em "Lendo a nota...". A causa daquele travamento não foi
 * reproduzida. O que foi medido depois, no mesmo dia, com o módulo compilado
 * numa build de debug local: o modelo latino vem DENTRO do APK (o log diz
 * "Selected local version of com.google.mlkit.dynamite.text.latin"), sem
 * download pelo Play Services, e as linhas "ziparchive: Unable to open
 * ...MlkitOcrCommon" são do processo do Play Services procurando módulos
 * opcionais, não do app. No emulador x86, em debug, a primeira leitura levou
 * 19,5 s e a seguinte 8,9 s. Aparelho real com build de release deve ser bem
 * mais rápido, mas isso NÃO foi medido. O prazo é a garantia de a pessoa não
 * ficar olhando para um carregamento sem fim.
 *
 * A chamada nativa não tem como ser cancelada: ela continua em segundo plano e
 * o resultado, se vier, é ignorado. O que o prazo garante é a tela seguir.
 */
export const PRAZO_LEITURA_MS = 20_000;

/**
 * Lê o texto de uma foto no próprio aparelho (ML Kit) e acha o valor total.
 *
 * O módulo nativo é carregado só na hora do uso. Expo Go, web e builds
 * anteriores a esta feature não o têm, e importá-lo no topo derrubaria a tela
 * inteira por uma ferramenta opcional. Nesses casos devolve `indisponivel`,
 * que a tela mostra como aviso, sem tentar de novo.
 *
 * `falhou` é o erro de leitura em si (foto ilegível, memória) ou a leitura que
 * passou de `PRAZO_LEITURA_MS`: a tela mostra o aviso de falha e o campo de
 * valor vazio, para digitar à mão. Os dois viram
 * recibo visível na tela; nenhum é engolido em silêncio.
 */
export async function lerTotalDaFoto(uri: string): Promise<LeituraDaFoto> {
  let reconhecedor: typeof import('@react-native-ml-kit/text-recognition').default;
  try {
    reconhecedor = (await import('@react-native-ml-kit/text-recognition')).default;
  } catch (e) {
    console.warn('[foto-nota] módulo de reconhecimento não carregou', e);
    return { ok: false, motivo: 'indisponivel' };
  }

  try {
    let cortar: ReturnType<typeof setTimeout> | undefined;
    const prazo = new Promise<never>((_, rejeitar) => {
      cortar = setTimeout(() => rejeitar(new Error(`leitura da foto passou de ${PRAZO_LEITURA_MS / 1000} s`)), PRAZO_LEITURA_MS);
    });
    const resultado = await Promise.race([reconhecedor.recognize(uri), prazo]).finally(() => clearTimeout(cortar));
    const texto = textoPorFileira(resultado.blocks.flatMap((b) => b.lines));
    return { ok: true, texto, total: extrairTotalDaFoto(texto) };
  } catch (e: any) {
    if (String(e?.message).includes("doesn't seem to be linked")) {
      console.warn('[foto-nota] módulo nativo ausente nesta build');
      return { ok: false, motivo: 'indisponivel' };
    }
    console.error('[foto-nota] falha ao reconhecer o texto', e);
    return { ok: false, motivo: 'falhou' };
  }
}
