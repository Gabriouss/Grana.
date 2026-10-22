// Módulo de dados do assistente Granabô.
//
// Duas operações: buscar histórico (assistant_messages) e enviar uma pergunta
// (chama a Edge Function `assistente-financeiro`). A tela de chat consome
// estas funções; nenhum outro arquivo do app precisa saber que por trás tem
// Groq, tool calling ou tabela nova.

import { MODO_TESTE } from './modo-teste';
import { respostaDoTeste } from './assistente-teste';
import { supabase } from './supabase';

/* ── Prazo da conversa ────────────────────────────────────────────────────
   Decisão do autor em 15/10/2026: a conversa com o Granabô não fica para
   sempre na tela. Passadas 12 horas, a mensagem some do Granachat, porque
   saldo e "Livre para gastar" citados numa resposta antiga viram informação
   desatualizada. O autor citou de 5 a 12 horas e pode ajustar: é só mudar
   esta constante.

   É um corte do LADO DO APP. O banco guarda tudo como antes (decisão do autor:
   "banco fica como está, só o front limpo"); nada aqui apaga linha. O mesmo
   filtro vale para o que é exibido E para o histórico enviado ao Granabô, para
   a resposta nova não se apoiar em conversa que a pessoa já não vê. */
export const PRAZO_CONVERSA_MS = 12 * 60 * 60 * 1000;

/** Verdadeiro se a mensagem ainda está dentro do prazo de 12 h. Data ilegível
    conta como vencida: melhor sumir do que mostrar o que não se sabe datar. */
export function dentroDoPrazo(criadoEm: string, agora: number = Date.now()): boolean {
  const quando = Date.parse(criadoEm);
  return Number.isFinite(quando) && agora - quando <= PRAZO_CONVERSA_MS;
}

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
  /** A consulta passou do tempo normal, mas continua em andamento. */
  demorando?: boolean;
  /** Mensagem de erro se a chamada falhou. */
  erro?: string;
};

/* ── Buscar histórico ─────────────────────────────────────────────────────── */

/* O chat usa Text puro: a resposta do assistente traz **negrito** em markdown,
   que apareceria com os asteriscos literais. Tira pares fechados de ** e de *
   (negrito, itálico), títulos `#` e crases; item de lista (`*`, `-`, ou travessão
   que o modelo usa como marcador) vira "•". Um * solto
   ou de multiplicação ("R$ 20 * 2", "20*2 + 10*3") fica: o par só vale se
   nenhum asterisco encosta em letra ou número por fora. */
export function textoDoAssistente(texto: string): string {
  return texto
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<![\w*])\*(?![\s*])([^*\n]+?)(?<![\s*])\*(?!\w)/g, '$1')
    .replace(/^\s*[*\-—–]\s+/gm, '• ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/`+/g, '');
}

/**
 * Busca as últimas mensagens do histórico do assistente. Ordena do mais
 * antigo para o mais recente (a FlatList invertida cuida de exibir na ordem
 * certa de chat). `limit` é 50 por padrão — suficiente para scroll sem ser
 * pesado.
 *
 * Se a leitura falhar, LANÇA `historico_indisponivel`: devolver `[]` aqui faria
 * a tela de chat esvaziar a conversa que já mostra. Único chamador:
 * `components/Granachat.tsx`.
 */
export async function fetchMensagens(limit = 50): Promise<MensagemAssistente[]> {
  // Teste da landing: sem servidor, a conversa começa vazia (lib/assistente-teste.ts).
  if (MODO_TESTE) return [];
  /* `papel` é desempate obrigatório, não refinamento: até 07/09/2026 a Edge
     Function gravava pergunta e resposta numa única instrução, e `now()` no
     Postgres devolve o MESMO instante para a transação inteira — as duas
     linhas nasciam com `criado_em` idêntico ao microssegundo (medido: 100
     linhas para 50 instantes distintos). Ordenar só por `criado_em` com
     `limit` é não-determinístico quando há empate: a resposta aparecia acima
     da pergunta, e um par cortado na fronteira do limite voltava pela metade,
     ora um membro ora outro — as "mensagens que somem" relatadas pelo autor.
     Como 'assistente' < 'usuario', o desempate ascendente coloca a resposta
     antes na ordem decrescente e, depois do `reverse()`, a pergunta vem
     primeiro. Vale também para as linhas antigas, que continuam empatadas. */
  const agora = Date.now();
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('id, papel, texto, ferramenta_usada, criado_em')
    .gte('criado_em', new Date(agora - PRAZO_CONVERSA_MS).toISOString())
    .order('criado_em', { ascending: false })
    .order('papel', { ascending: true })
    .limit(limit);

  if (error) {
    /* Falha NÃO vira lista vazia: `[]` é "a conversa está vazia", e a tela
       trocaria o que já mostra por nada (V20, 16/10/2026). O erro sobe para
       quem chama decidir o que preservar. O log leva só código e mensagem do
       erro de transporte, nunca texto de conversa. */
    console.error('[assistente] erro ao buscar mensagens:', { codigo: error.code, mensagem: error.message });
    throw Object.assign(new Error('historico_indisponivel'), { cause: error });
  }

  // A query vem desc (mais recente primeiro) para o limit pegar as últimas.
  // Revertemos para asc para a exibição na tela.
  return ((data ?? []).reverse() as MensagemAssistente[])
    .filter((m) => dentroDoPrazo(m.criado_em, agora))
    .map((m) =>
    m.papel === 'assistente' ? { ...m, texto: textoDoAssistente(m.texto) } : m
  );
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
  historico: { papel: string; texto: string }[] = [],
  signal?: AbortSignal,
): Promise<RespostaAssistente> {
  if (MODO_TESTE) {
    await new Promise((r) => setTimeout(r, 600));
    return { resposta: respostaDoTeste(mensagem), ferramenta: null };
  }
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
    signal,
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
    resposta: textoDoAssistente(body.resposta ?? 'Desculpa, não entendi.'),
    ferramenta: body.ferramenta ?? null,
  };
}
