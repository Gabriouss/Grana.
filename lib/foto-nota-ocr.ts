import { extrairTotalDaFoto, type TotalDaFoto } from './nota-foto-parser';

export type LeituraDaFoto =
  | { ok: true; texto: string; total: TotalDaFoto }
  | { ok: false; motivo: 'indisponivel' | 'falhou' };

/**
 * Quanto a leitura pode levar antes de a tela desistir e pedir o valor à mão.
 *
 * Achado N2/C1-c do Sentinel (26/09/2026): no emulador, `recognize` ficou mais
 * de 10 minutos sem resolver nem rejeitar, com o Play Services tentando
 * entregar o módulo do ML Kit em laço, e a tela presa em "Lendo a nota...".
 * Uma leitura sadia leva de 1 a 3 s num aparelho comum; 20 s dá margem real a
 * aparelho lento e à primeira leitura, que ainda baixa o modelo, sem deixar a
 * pessoa olhando para um carregamento sem fim.
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
    const texto = resultado.blocks.flatMap((b) => b.lines.map((l) => l.text)).join('\n');
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
