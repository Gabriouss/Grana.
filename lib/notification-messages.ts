import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  selecionarMensagem,
  type JanelaLembrete,
  type MensagemNotif,
} from './notification-catalog';

export { MENSAGENS, selecionarMensagem } from './notification-catalog';
export type { CategoriaMensagem, JanelaLembrete, MensagemNotif } from './notification-catalog';

const CHAVE_RECENTES = '@grana_recent_notifs';
export const MAX_MENSAGENS_RECENTES = 10;

async function obterRecentes(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(CHAVE_RECENTES);
    if (!raw) return [];
    const lista = JSON.parse(raw);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

async function registrarRecente(id: string, recentes: string[]): Promise<void> {
  const atualizada = [...recentes.filter((r) => r !== id), id].slice(-MAX_MENSAGENS_RECENTES);
  await AsyncStorage.setItem(CHAVE_RECENTES, JSON.stringify(atualizada));
}

/** Seleciona a copy do contexto e persiste o histórico do fallback local.
    `janela` (default `'noite'`) decide só o pool geral de fallback — ver
    `selecionarMensagem` em `./notification-catalog`. */
export async function obterProximaMensagem(contexto: {
  streak: number;
  diasInativo: number;
  diaSemana: number;
}, janela: JanelaLembrete = 'noite'): Promise<MensagemNotif> {
  const recentes = await obterRecentes();
  const escolhida = selecionarMensagem(contexto, recentes, Math.random, janela);
  await registrarRecente(escolhida.id, recentes);
  return escolhida;
}
