import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { base64ParaBytes, decodificarOfx } from './ofx-parser';

/**
 * Abre o seletor do sistema e devolve o conteúdo do arquivo como texto.
 *
 * ── Por que ler BYTES e não string ──────────────────────────────────────────
 *
 * Extrato OFX brasileiro quase sempre vem em cp1252/ISO-8859-1. Pedir o
 * arquivo já como string UTF-8 transforma "Pão de Açúcar" em lixo antes de
 * qualquer chance de conserto, e nesse ponto a informação já se perdeu. Por
 * isso os dois caminhos abaixo entregam bytes e deixam `decodificarOfx`
 * escolher a codificação a partir do cabeçalho do próprio arquivo.
 *
 * CSV sofre do mesmo problema: exportação de banco em Excel costuma sair em
 * cp1252 também. Como a detecção olha o cabeçalho OFX e, na falta dele, testa
 * se os bytes são UTF-8 válido, ela serve para os dois formatos.
 *
 * ── Os dois caminhos ────────────────────────────────────────────────────────
 *
 * Na web o `expo-document-picker` devolve um `file://` que o `expo-file-system`
 * não consegue ler, então ali vale a API do próprio navegador: o objeto `File`
 * que o input entrega já dá `arrayBuffer()`. No nativo é o inverso: não existe
 * `<input type="file">`, e o caminho é o picker do sistema mais leitura em
 * base64.
 */

export type ArquivoEscolhido = {
  nome: string;
  texto: string;
};
type OpcoesExtrato = { limiteBytes?: number; limparCopia?: boolean };
export const LIMITE_BYTES_EXTRATO = 10_000_000;

function validarTamanho(tamanho: unknown, limite: number): asserts tamanho is number {
  if (typeof tamanho !== 'number' || !Number.isSafeInteger(tamanho) || tamanho < 0) {
    throw new Error('Não foi possível conferir o tamanho do extrato. Exporte o arquivo novamente.');
  }
  if (tamanho > limite) {
    throw new Error(`O extrato ultrapassa o limite de ${limite.toLocaleString('pt-BR')} bytes. Exporte um período menor; nenhum lançamento foi importado.`);
  }
}

/** Extensões aceitas, em minúsculas e com o ponto. */
const EXTENSOES = ['.ofx', '.csv', '.txt', '.qfx'];

function extensaoAceita(nome: string): boolean {
  const minusculo = nome.toLowerCase();
  return EXTENSOES.some((ext) => minusculo.endsWith(ext));
}

/** `null` quando a pessoa fecha o seletor sem escolher. */
export async function escolherArquivoDeExtrato(opcoes: OpcoesExtrato = {}): Promise<ArquivoEscolhido | null> {
  const limiteBytes = opcoes.limiteBytes ?? LIMITE_BYTES_EXTRATO;
  if (!Number.isSafeInteger(limiteBytes) || limiteBytes <= 0 || limiteBytes > LIMITE_BYTES_EXTRATO) {
    throw new Error('Limite de tamanho do extrato inválido.');
  }
  opcoes = { ...opcoes, limiteBytes, limparCopia: opcoes.limparCopia ?? true };
  if (Platform.OS === 'web') return escolherNaWeb(opcoes);
  return escolherNoNativo(opcoes);
}

function escolherNaWeb(opcoes: OpcoesExtrato): Promise<ArquivoEscolhido | null> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ofx,.qfx,.csv,.txt,text/csv,text/plain,application/x-ofx';
    input.style.display = 'none';

    /* `cancel` não é suportado em todo navegador; sem ele o Promise ficaria
       pendurado para sempre quando a pessoa fecha o seletor. O `focus` da
       janela é o sinal de fallback: se voltou o foco e nada chegou, desistiu. */
    let resolvido = false;
    const terminar = (valor: ArquivoEscolhido | null) => {
      if (resolvido) return;
      resolvido = true;
      input.remove();
      window.removeEventListener('focus', aoVoltarFoco);
      resolve(valor);
    };
    const aoVoltarFoco = () => setTimeout(() => terminar(null), 500);

    input.addEventListener('change', async () => {
      const arquivo = input.files?.[0];
      if (!arquivo) {
        terminar(null);
        return;
      }
      try {
        if (!extensaoAceita(arquivo.name)) throw new Error('Escolha um arquivo OFX ou CSV.');
        validarTamanho(arquivo.size, opcoes.limiteBytes!);
        const bytes = new Uint8Array(await arquivo.arrayBuffer());
        validarTamanho(bytes.byteLength, opcoes.limiteBytes!);
        if (bytes.byteLength !== arquivo.size) throw new Error('O extrato está incompleto ou mudou durante a leitura. Exporte e escolha o arquivo novamente.');
        terminar({ nome: arquivo.name, texto: decodificarOfx(bytes) });
      } catch (e) {
        resolvido = true;
        input.remove();
        window.removeEventListener('focus', aoVoltarFoco);
        reject(e);
      }
    });

    document.body.appendChild(input);
    window.addEventListener('focus', aoVoltarFoco);
    input.click();
  });
}

async function escolherNoNativo(opcoes: OpcoesExtrato): Promise<ArquivoEscolhido | null> {
  /* Tipo curinga em vez de lista de MIME: o Android reporta OFX ora como
     `application/octet-stream`, ora como `application/x-ofx`, ora sem tipo
     nenhum, e filtrar por MIME deixava o arquivo cinza e inselecionável no
     seletor. O filtro real acontece na extensão, logo abaixo. */
  const resultado = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (resultado.canceled) return null;

  const arquivo = resultado.assets?.[0];
  if (!arquivo) return null;

  // Só o URI devolvido pelo picker nesta chamada, dentro do cache e sem travessia.
  const cache = FileSystem.cacheDirectory;
  let copiaPropria = false;
  try {
    const uri = decodeURIComponent(arquivo.uri);
    const pasta = cache && decodeURIComponent(cache).replace(/\/?$/, '/');
    copiaPropria = !!pasta && uri.startsWith(pasta) && uri.length > pasta.length &&
      !uri.split('/').some((parte) => parte === '..' || parte === '.') && !/[?#]/.test(uri);
  } catch { /* URI inválido não autoriza remoção. */ }
  if (opcoes.limparCopia && !copiaPropria) throw new Error('Não foi possível preparar uma cópia local segura do extrato.');
  try {
    if (!extensaoAceita(arquivo.name)) throw new Error('Escolha um arquivo OFX ou CSV. Para PDF ou Excel, exporte o extrato em CSV no banco.');
    if (arquivo.size !== undefined) validarTamanho(arquivo.size, opcoes.limiteBytes!);
    const info = await FileSystem.getInfoAsync(arquivo.uri);
    if (!info.exists || info.isDirectory || !('size' in info)) throw new Error('Não foi possível conferir o arquivo do extrato. Exporte o arquivo novamente.');
    validarTamanho(info.size, opcoes.limiteBytes!);
    const base64 = await FileSystem.readAsStringAsync(arquivo.uri, {
      encoding: 'base64', position: 0, length: opcoes.limiteBytes! + 1,
    });
    // Confere também o corpo devolvido pelo provedor antes de alocar os bytes.
    const tamanhoLido = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    validarTamanho(tamanhoLido, opcoes.limiteBytes!);
    if (tamanhoLido !== info.size) throw new Error('O extrato está incompleto ou mudou durante a leitura. Exporte e escolha o arquivo novamente.');
    return { nome: arquivo.name, texto: decodificarOfx(base64ParaBytes(base64)) };
  } finally {
    if (opcoes.limparCopia && copiaPropria) {
      try { await FileSystem.deleteAsync(arquivo.uri, { idempotent: true }); }
      catch { console.warn('[extrato] cópia temporária não removida'); throw new Error('Não foi possível limpar a cópia temporária do extrato. Tente novamente.'); }
    }
  }
}
