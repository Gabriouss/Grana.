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

/** Extensões aceitas, em minúsculas e com o ponto. */
const EXTENSOES = ['.ofx', '.csv', '.txt', '.qfx'];

function extensaoAceita(nome: string): boolean {
  const minusculo = nome.toLowerCase();
  return EXTENSOES.some((ext) => minusculo.endsWith(ext));
}

/** `null` quando a pessoa fecha o seletor sem escolher. */
export async function escolherArquivoDeExtrato(): Promise<ArquivoEscolhido | null> {
  if (Platform.OS === 'web') return escolherNaWeb();
  return escolherNoNativo();
}

function escolherNaWeb(): Promise<ArquivoEscolhido | null> {
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
        const bytes = new Uint8Array(await arquivo.arrayBuffer());
        terminar({ nome: arquivo.name, texto: decodificarOfx(bytes) });
      } catch (e) {
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

async function escolherNoNativo(): Promise<ArquivoEscolhido | null> {
  /* Tipo curinga em vez de lista de MIME: o Android reporta OFX ora como
     `application/octet-stream`, ora como `application/x-ofx`, ora sem tipo
     nenhum, e filtrar por MIME deixava o arquivo cinza e inselecionável no
     seletor. O filtro real acontece na extensão, logo abaixo. */
  const resultado = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (resultado.canceled) return null;

  const arquivo = resultado.assets?.[0];
  if (!arquivo) return null;

  if (!extensaoAceita(arquivo.name)) {
    throw new Error(`"${arquivo.name}" não parece um extrato. Escolha um arquivo .ofx ou .csv.`);
  }

  const base64 = await FileSystem.readAsStringAsync(arquivo.uri, { encoding: 'base64' });
  return { nome: arquivo.name, texto: decodificarOfx(base64ParaBytes(base64)) };
}
