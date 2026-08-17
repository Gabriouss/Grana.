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

export type InfoAtualizacao = { versao: string; apkUrl: string; notas: string | null };

function versaoAtual(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
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
  const { data, error } = await supabase
    .from('app_release')
    .select('version, apk_url, notes, apk_expires_at')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return null;
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
