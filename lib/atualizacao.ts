import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/**
 * Aviso de atualização do APK.
 *
 * Como o Grana é distribuído fora da Play Store (build "internal" do EAS, um
 * link de APK direto), não existe nenhum mecanismo automático do sistema
 * avisando quem já instalou que uma versão nova saiu. Isto é o substituto:
 * uma linha só na tabela `app_release`, comparada com a versão do app.json
 * embutida na build instalada, e um aviso simples — nunca bloqueante —
 * quando há algo mais novo.
 *
 * A linha é escrita sozinha pela Edge Function eas-build-webhook sempre que
 * um build termina (ver supabase/functions/eas-build-webhook/index.ts) — não
 * precisa mais editar isto à mão a cada release.
 */

const CHAVE_DISPENSADA = 'grana_versao_dispensada';
const CHAVE_NOVIDADES_VISTAS = 'grana_novidades_versao_vista';

export type InfoAtualizacao = { versao: string; apkUrl: string; notas: string | null };
export type Novidades = { versao: string; itens: string[] };

function versaoAtual(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

type LinhaAppRelease = { version: string; apk_url: string; notes: string | null; apk_expires_at: string | null };

/** Única leitura da linha singleton `app_release`, compartilhada pelo aviso
    de atualização disponível e pelo pop-up de novidades — as duas checagens
    rodam juntas ao entrar na área logada, e ler a tabela duas vezes só
    duplicaria a ida à rede sem motivo. */
async function buscarAppRelease(): Promise<LinhaAppRelease | null> {
  const { data, error } = await supabase
    .from('app_release')
    .select('version, apk_url, notes, apk_expires_at')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/** Compara "1.2.3" com "1.10.0" numericamente, não como texto — string
    compararia "10" < "2". Retorna positivo se `a` for mais nova que `b`. */
function compararVersoes(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Retorna a atualização pendente, ou null quando não há nada novo, ou quando
 * a pessoa já dispensou o aviso desta mesma versão. Pensado pra ser chamado
 * uma vez, ao entrar na área logada — nunca antes do login, e nunca de forma
 * que impeça o uso do app enquanto a checagem não responde.
 */
export async function verificarAtualizacao(): Promise<InfoAtualizacao | null> {
  const data = await buscarAppRelease();
  if (!data) return null;
  if (compararVersoes(data.version, versaoAtual()) <= 0) return null;

  // Links de artefato do EAS expiram — melhor não anunciar uma versão nova
  // cujo download já morreu do que mandar a pessoa pra um 404.
  if (data.apk_expires_at && new Date(data.apk_expires_at).getTime() <= Date.now()) return null;

  const dispensada = await AsyncStorage.getItem(CHAVE_DISPENSADA);
  if (dispensada === data.version) return null;

  return { versao: data.version, apkUrl: data.apk_url, notas: data.notes };
}

/** Marca esta versão como dispensada — o aviso só volta quando sair uma versão mais nova ainda. */
export async function dispensarAtualizacao(versao: string): Promise<void> {
  await AsyncStorage.setItem(CHAVE_DISPENSADA, versao);
}

/**
 * Pop-up de novidades: "o que mudou" na versão que a pessoa acabou de
 * instalar. Diferente do aviso acima — este não fala de uma versão futura
 * pra baixar, fala da versão que já está rodando agora.
 *
 * `eas-build-webhook` copia a mensagem do build (git commit message, ou
 * `--message` quando informada na hora do `eas build`) direto pra
 * `app_release.notes`, uma linha por bullet. Sem isso, o pop-up não aparece
 * — nunca inventa novidade a partir de nada.
 */
export async function verificarNovidades(): Promise<Novidades | null> {
  const instalada = versaoAtual();
  const vista = await AsyncStorage.getItem(CHAVE_NOVIDADES_VISTAS);

  // Primeira abertura do app neste aparelho (instalação nova, não
  // atualização) — não existe "novidade" de uma versão anterior que a
  // pessoa nunca rodou. Só grava a baseline local e sai calada.
  if (vista === null) {
    await AsyncStorage.setItem(CHAVE_NOVIDADES_VISTAS, instalada);
    return null;
  }
  if (vista === instalada) return null;

  const data = await buscarAppRelease();
  const itens = data?.notes
    ?.split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean);

  // As notas publicadas só descrevem com certeza a versão que elas
  // acompanham — se `app_release` já avançou pra uma versão mais nova ainda
  // (build seguinte publicado antes da pessoa abrir o app), não dá pra saber
  // o que mudou especificamente até a versão instalada. Marca como vista
  // pra não ficar tentando de novo a cada abertura, e segue muda.
  if (!data || data.version !== instalada || !itens?.length) {
    await AsyncStorage.setItem(CHAVE_NOVIDADES_VISTAS, instalada);
    return null;
  }

  return { versao: instalada, itens };
}

/** Marca as novidades desta versão como vistas — chamado ao fechar o pop-up. */
export async function marcarNovidadesVistas(versao: string): Promise<void> {
  await AsyncStorage.setItem(CHAVE_NOVIDADES_VISTAS, versao);
}
