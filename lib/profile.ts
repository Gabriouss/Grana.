import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from './supabase';

/**
 * Nome de exibição e foto de perfil.
 *
 * ── Onde o nome mora ────────────────────────────────────────────────────────
 *
 * Em `user_metadata` do Supabase Auth, não numa tabela `profiles`. O metadata
 * já viaja junto com a sessão, então ler o nome não custa uma consulta a mais,
 * e o isolamento entre usuários é garantido pelo próprio Auth — sem tabela
 * nova, sem política de RLS para manter. Uma tabela só se justificaria se o
 * perfil precisasse ser lido por OUTROS usuários, o que não é o caso aqui.
 *
 * ── Onde a foto mora ────────────────────────────────────────────────────────
 *
 * No bucket `avatars` do Supabase Storage, no caminho `{user_id}/avatar.jpg`.
 * O user_id como primeira pasta é o que torna a policy de Storage possível:
 * ela compara `auth.uid()` com o primeiro segmento do caminho. Ver o SQL em
 * supabase/schema.sql.
 *
 * A imagem é reduzida para 512px e recomprimida antes de subir. Sem isso, uma
 * foto de câmera moderna sobe com 4 a 8 MB — o plano gratuito tem 1 GB de
 * Storage, que se esgotaria em ~150 usuários. A 512px o arquivo fica em torno
 * de 80 KB.
 */

const BUCKET = 'avatars';
const LADO_MAX = 512;

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * base64 → bytes, sem depender de `atob`.
 *
 * O Hermes expõe `atob` nas versões recentes, mas ele devolve uma string de
 * code units: converter para binário exige um segundo passo que já quebrou em
 * bytes acima de 0x7F. Como aqui o conteúdo é JPEG — binário puro, cheio
 * desses bytes —, decodificar direto para Uint8Array evita a classe inteira
 * de problema.
 */
function base64ParaBytes(b64: string): Uint8Array {
  /* O replace já remove o '=' do fim, então `limpo` é o comprimento SEM
     preenchimento — descontar o padding de novo aqui truncaria a saída.
     Cada 4 caracteres viram 3 bytes; a divisão inteira resolve o resto. */
  const limpo = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const total = Math.floor((limpo.length * 3) / 4);
  const bytes = new Uint8Array(Math.max(0, total));

  let acumulador = 0;
  let bitsAcumulados = 0;
  let escritos = 0;

  for (const caractere of limpo) {
    const valor = ALFABETO.indexOf(caractere);
    if (valor < 0) continue;
    acumulador = (acumulador << 6) | valor;
    bitsAcumulados += 6;
    if (bitsAcumulados >= 8) {
      bitsAcumulados -= 8;
      if (escritos < bytes.length) {
        bytes[escritos++] = (acumulador >> bitsAcumulados) & 0xff;
      }
    }
  }

  return bytes;
}

export const LIMITE_NOME = 60;

export type Perfil = {
  nome: string;
  /** URL pública da foto, ou null quando a pessoa nunca enviou uma. */
  fotoUrl: string | null;
  email: string;
};

export async function carregarPerfil(): Promise<Perfil | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const meta = data.user.user_metadata ?? {};
  return {
    nome: typeof meta.nome === 'string' ? meta.nome : '',
    fotoUrl: typeof meta.foto_url === 'string' ? meta.foto_url : null,
    email: data.user.email ?? '',
  };
}

export async function salvarNome(nome: string): Promise<{ ok: boolean; error?: string }> {
  const limpo = nome.trim().slice(0, LIMITE_NOME);
  const { error } = await supabase.auth.updateUser({ data: { nome: limpo } });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Sobe a foto escolhida e devolve a URL pública.
 *
 * `upsert: true` porque o caminho é fixo por usuário: trocar a foto substitui
 * a anterior em vez de acumular arquivos órfãos no bucket.
 */
export async function salvarFoto(uriLocal: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

    const reduzida = await ImageManipulator.manipulateAsync(
      uriLocal,
      [{ resize: { width: LADO_MAX } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    if (!reduzida.base64) return { ok: false, error: 'Não foi possível ler a imagem.' };

    /* Pedimos base64 ao manipulador e decodificamos aqui, em vez de fazer
       `fetch(file://...).arrayBuffer()`.

       Motivo: no React Native o fetch de uma URI local resolve, o Storage
       aceita o upload e retorna sucesso — mas o corpo chega VAZIO. O arquivo
       vai para o bucket com 0 byte, e o resultado visível é um avatar que
       carrega sem erro nenhum e aparece em branco. Falha silenciosa, que foi
       exatamente o que aconteceu aqui. */
    const bytes = base64ParaBytes(reduzida.base64);
    if (bytes.length === 0) return { ok: false, error: 'A imagem ficou vazia ao processar.' };

    const caminho = `${userId}/avatar.jpg`;
    const { error: upErro } = await supabase.storage.from(BUCKET).upload(caminho, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (upErro) return { ok: false, error: upErro.message };

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(caminho);

    /* O sufixo com timestamp existe para furar cache: o caminho é sempre o
       mesmo, então sem ele o app continuaria exibindo a foto antiga. */
    const url = `${pub.publicUrl}?v=${Date.now()}`;

    const { error: metaErro } = await supabase.auth.updateUser({ data: { foto_url: url } });
    if (metaErro) return { ok: false, error: metaErro.message };

    return { ok: true, url };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Não foi possível enviar a foto.' };
  }
}

export async function removerFoto(): Promise<{ ok: boolean; error?: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  await supabase.storage.from(BUCKET).remove([`${userId}/avatar.jpg`]);
  const { error } = await supabase.auth.updateUser({ data: { foto_url: null } });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Como chamar a pessoa. Usado no Perfil e, futuramente, nas mensagens de
 * lembrete de vencimento.
 *
 * Cai para o trecho antes do @ do e-mail quando não há nome — "Olá, joao" lê
 * muito melhor que "Olá, joao@gmail.com" numa notificação.
 */
export function nomeDeExibicao(perfil: Perfil | null): string {
  if (!perfil) return '';
  if (perfil.nome) return perfil.nome;
  return perfil.email.split('@')[0] ?? '';
}
