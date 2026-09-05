// Módulo de dados do assistente Granabô.
//
// Duas operações: buscar histórico (assistant_messages) e enviar uma pergunta
// (chama a Edge Function `assistente-financeiro`). A tela de chat consome
// estas funções; nenhum outro arquivo do app precisa saber que por trás tem
// Groq, tool calling ou tabela nova.

import { supabase } from './supabase';

/* ── Tipos ────────────────────────────────────────────────────────────────── */

export type PapelMensagem = 'usuario' | 'assistente';

export type MensagemAssistente = {
  id: string;
  papel: PapelMensagem;
  texto: string;
  ferramenta_usada: string | null;
  criado_em: string;
};

/** Estado de uma mensagem enquanto está sendo enviada/recebida. */
export type MensagemLocal = {
  /** ID local temporário (gerado no cliente). */
  id: string;
  papel: PapelMensagem;
  texto: string;
  ferramenta_usada: string | null;
  criado_em: string;
  /** true enquanto a resposta do Granabô não chegou. */
  carregando?: boolean;
  /** Mensagem de erro se a chamada falhou. */
  erro?: string;
};

/* ── Buscar histórico ─────────────────────────────────────────────────────── */

/**
 * Busca as últimas mensagens do histórico do assistente. Ordena do mais
 * antigo para o mais recente (a FlatList invertida cuida de exibir na ordem
 * certa de chat). `limit` é 50 por padrão — suficiente para scroll sem ser
 * pesado.
 */
export async function fetchMensagens(limit = 50): Promise<MensagemAssistente[]> {
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('id, papel, texto, ferramenta_usada, criado_em')
    .order('criado_em', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[assistente] erro ao buscar mensagens:', error);
    return [];
  }

  // A query vem desc (mais recente primeiro) para o limit pegar as últimas.
  // Revertemos para asc para a exibição na tela.
  return (data ?? []).reverse() as MensagemAssistente[];
}

/* ── Enviar pergunta ──────────────────────────────────────────────────────── */

export type RespostaAssistente = {
  resposta: string;
  ferramenta: string | null;
};

/**
 * Envia a pergunta do usuário para a Edge Function e devolve a resposta.
 * Inclui as últimas mensagens como histórico para contexto da conversa.
 */
export async function enviarPergunta(
  mensagem: string,
  historico: { papel: string; texto: string }[] = []
): Promise<RespostaAssistente> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Usuário não autenticado');
  }

  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/assistente-financeiro`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mensagem, historico }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const mensagemErro =
      body?.mensagem ??
      (res.status === 429
        ? 'Muitas perguntas seguidas. Espera um minutinho.'
        : 'Não consegui pensar nisso agora. Tenta de novo.');
    throw new Error(mensagemErro);
  }

  const body = await res.json();
  return {
    resposta: body.resposta ?? 'Desculpa, não entendi.',
    ferramenta: body.ferramenta ?? null,
  };
}
