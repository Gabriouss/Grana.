import * as FileSystem from 'expo-file-system/legacy';
import { extrairTotalDaFoto, textoPorFileira, type TotalDaFoto } from './nota-foto-parser';

export type LeituraDaFoto =
  | { ok: true; texto: string; total: TotalDaFoto }
  | { ok: false; motivo: 'indisponivel' | 'falhou' };

/** `sem_foto`: a câmera não entregou a foto (erro no `takePictureAsync`). */
export type ResultadoDaFoto = LeituraDaFoto | { ok: false; motivo: 'sem_foto' };

/**
 * Quanto a pessoa espera, do toque no obturador até a confirmação, antes de a
 * tela desistir e pedir o valor à mão.
 *
 * É um prazo TOTAL. Até 26/09/2026 ele cobria só o `recognize`, e ficavam de
 * fora a foto, o carregamento do módulo e a exclusão da foto, que a tela
 * esperava antes de mostrar a confirmação. Medido no emulador, numa build de
 * debug: toque às 16:36:40, prazo armado só às 16:36:52 (foto e módulo), prazo
 * disparado às 16:37:12, confirmação entre 16:37:22 e 16:37:37 (exclusão da
 * foto com `import()` preguiçoso). Quase um minuto em "Lendo a nota...", com um
 * prazo de 20 s no código (achado N2 do Sentinel, reaberto na tarde de 26/09).
 *
 * O que foi medido do reconhecimento em si, no emulador x86 em debug: 19,5 s
 * na primeira leitura e 8,9 s na seguinte. O modelo latino vem dentro do APK
 * ("Selected local version of com.google.mlkit.dynamite.text.latin"), sem
 * download pelo Play Services. Aparelho real com build de release NÃO foi
 * medido.
 *
 * A chamada nativa não tem como ser cancelada: ela continua em segundo plano e
 * o resultado, se vier, é ignorado. O que o prazo garante é a tela seguir.
 */
export const PRAZO_LEITURA_MS = 20_000;

type Reconhecedor = typeof import('@react-native-ml-kit/text-recognition').default;
let carregando: Promise<Reconhecedor | null> | null = null;

/**
 * Carrega o módulo nativo, uma vez. A tela chama isto ao abrir a câmera, para o
 * carregamento não cair dentro do prazo da leitura: em desenvolvimento, o
 * `import()` busca um pacote no Metro e já levou vários segundos.
 *
 * O módulo é carregado sob demanda porque Expo Go, web e builds anteriores a
 * esta feature não o têm, e importá-lo no topo derrubaria a tela inteira por
 * uma ferramenta opcional. Nesses casos a leitura devolve `indisponivel`.
 */
export function prepararLeitura(): Promise<Reconhecedor | null> {
  carregando ??= import('@react-native-ml-kit/text-recognition')
    .then((m) => m.default)
    .catch((e) => {
      console.warn('[foto-nota] módulo de reconhecimento não carregou', e);
      carregando = null; // a próxima abertura tenta de novo
      return null;
    });
  return carregando;
}

/**
 * Lê o texto de uma foto no próprio aparelho (ML Kit) e acha o valor total.
 * Sem prazo próprio: quem chama é `fotografarELer`, que tem o prazo total.
 *
 * `falhou` é o erro de leitura em si (foto ilegível, memória): a tela mostra o
 * aviso de falha e o campo de valor vazio, para digitar à mão.
 */
export async function lerTotalDaFoto(uri: string): Promise<LeituraDaFoto> {
  const reconhecedor = await prepararLeitura();
  if (!reconhecedor) return { ok: false, motivo: 'indisponivel' };
  try {
    const resultado = await reconhecedor.recognize(uri);
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

/**
 * Apaga a foto do cache e confere que ela sumiu. Falha deixa log de erro, que
 * é o recibo possível para um arquivo do cache que a pessoa não vê (achado do
 * Watchtower: antes a exclusão corria solta e o erro era engolido).
 */
export async function apagarFoto(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    if ((await FileSystem.getInfoAsync(uri)).exists) {
      console.error('[foto-nota] a foto continuou no cache depois de apagada', uri);
    }
  } catch (e) {
    console.error('[foto-nota] falha ao apagar a foto do cache', e);
  }
}

/**
 * Apaga as fotos que sobraram na pasta de cache da câmera. Só a foto da nota
 * tira foto no Grana. (`takePictureAsync`), então tudo ali é dela.
 *
 * Todo caminho da leitura já apaga a própria foto (`fotografarELer`). O que
 * sobra é o app fechado à força no meio da leitura: a foto fica no cache
 * (3 fotos das 14h de 26/09 ficaram assim no emulador, com o código antigo).
 * A tela chama isto ao abrir a câmera, antes de tirar a próxima foto, e é por
 * isso que a Política de Privacidade pode dizer que o arquivo que sobrou é
 * apagado na próxima abertura.
 */
export async function limparFotosEsquecidas(): Promise<number> {
  const pasta = `${FileSystem.cacheDirectory}Camera/`;
  try {
    if (!(await FileSystem.getInfoAsync(pasta)).exists) return 0;
    const nomes = (await FileSystem.readDirectoryAsync(pasta)).filter((n) => /\.(jpe?g|png|heic)$/i.test(n));
    for (const nome of nomes) await apagarFoto(`${pasta}${nome}`);
    return nomes.length;
  } catch (e) {
    console.error('[foto-nota] não consegui limpar fotos esquecidas no cache', e);
    return 0;
  }
}

/**
 * Do toque até o resultado, dentro de `prazoMs`: tira a foto, lê e começa a
 * apagá-la. A foto é apagada assim que a leitura termina, e a exclusão NÃO
 * segura o resultado, porque a tela não depende dela. No estouro do prazo, a
 * foto que já existe é apagada ali mesmo: a leitura pendurada talvez nunca
 * termine, e sem isto a foto ficaria no cache (3 fotos das 14h de 26/09 ficaram
 * assim, com o código antigo). Foto que chega depois do prazo não é lida: é
 * apagada na hora.
 */
export async function fotografarELer(
  tirarFoto: () => Promise<{ uri: string }>,
  prazoMs: number = PRAZO_LEITURA_MS
): Promise<ResultadoDaFoto> {
  let encerrado = false;
  let fotoTirada: string | null = null;
  const trabalho = (async (): Promise<ResultadoDaFoto> => {
    let uri: string;
    try {
      uri = (await tirarFoto()).uri;
    } catch (e) {
      console.error('[foto-nota] falha ao fotografar', e);
      return { ok: false, motivo: 'sem_foto' };
    }
    if (encerrado) {
      void apagarFoto(uri);
      return { ok: false, motivo: 'falhou' };
    }
    fotoTirada = uri;
    try {
      return await lerTotalDaFoto(uri);
    } finally {
      void apagarFoto(uri);
    }
  })();

  let cortar: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<ResultadoDaFoto>((resolver) => {
    cortar = setTimeout(() => {
      encerrado = true;
      if (fotoTirada) void apagarFoto(fotoTirada);
      console.error(`[foto-nota] a foto e a leitura passaram de ${prazoMs / 1000} s`);
      resolver({ ok: false, motivo: 'falhou' });
    }, prazoMs);
  });
  try {
    return await Promise.race([trabalho, prazo]);
  } finally {
    clearTimeout(cortar);
  }
}
