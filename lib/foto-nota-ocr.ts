import { extrairTotalDaFoto, type TotalDaFoto } from './nota-foto-parser';

export type LeituraDaFoto =
  | { ok: true; texto: string; total: TotalDaFoto }
  | { ok: false; motivo: 'indisponivel' | 'falhou' };

/**
 * Lê o texto de uma foto no próprio aparelho (ML Kit) e acha o valor total.
 *
 * O módulo nativo é carregado só na hora do uso. Expo Go, web e builds
 * anteriores a esta feature não o têm, e importá-lo no topo derrubaria a tela
 * inteira por uma ferramenta opcional. Nesses casos devolve `indisponivel`,
 * que a tela mostra como aviso, sem tentar de novo.
 *
 * `falhou` é o erro de leitura em si (foto ilegível, memória). Os dois viram
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
    const resultado = await reconhecedor.recognize(uri);
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
