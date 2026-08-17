import * as Crypto from 'expo-crypto';

/**
 * Checagem de senha vazada contra o HaveIBeenPwned.
 *
 * Por que isto existe em código: a proteção equivalente do Supabase só está no
 * Pro Plan, e o projeto fica no Free. A API de range do HaveIBeenPwned é
 * pública e gratuita — é a mesma que o Supabase consulta —, então dá para ter
 * a proteção sem trocar de plano.
 *
 * O que ela pega que a validação local não pega: a senha forte porém já
 * vazada em outro serviço. Esse é o caso do credential stuffing, em que o
 * atacante testa pares de e-mail e senha roubados de outro site. Comprimento
 * e mistura de caracteres não dizem nada sobre isso.
 *
 * ── k-anonymity: a senha nunca sai do aparelho ──────────────────────────────
 *
 * Calculamos o SHA-1 localmente e enviamos SÓ OS 5 PRIMEIROS caracteres do
 * hash. O servidor devolve todos os hashes que começam com esse prefixo —
 * centenas deles — e a comparação do sufixo acontece aqui. O HaveIBeenPwned
 * nunca vê a senha, nem o hash completo, nem consegue saber qual das centenas
 * de linhas era a nossa.
 *
 * SHA-1 aqui não é escolha de segurança: é o formato do banco de dados
 * público. Não estamos armazenando nada com ele — quem guarda a senha é o
 * Supabase Auth, com bcrypt.
 */

const API = 'https://api.pwnedpasswords.com/range/';

/* Se a API estiver fora do ar ou a rede cair, o cadastro precisa continuar
   funcionando. Bloquear alguém de criar conta porque um serviço de terceiro
   não respondeu troca um risco pequeno por uma falha total do fluxo. */
const TIMEOUT_MS = 4000;

export type PwnedResult =
  /** A senha aparece em vazamentos conhecidos, `vezes` diz em quantos registros. */
  | { status: 'vazada'; vezes: number }
  /** Consultamos e a senha não está na base. */
  | { status: 'limpa' }
  /** Não deu para consultar (rede, timeout, resposta inesperada). Segue o fluxo. */
  | { status: 'indisponivel' };

export async function checarSenhaVazada(senha: string): Promise<PwnedResult> {
  try {
    const hash = (
      await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, senha)
    ).toUpperCase();

    const prefixo = hash.slice(0, 5);
    const sufixo = hash.slice(5);

    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);

    let texto: string;
    try {
      const resposta = await fetch(API + prefixo, {
        signal: controle.signal,
        // Mistura hashes falsos na resposta, para que nem o tamanho do corpo
        // entregue informação a quem observa a rede.
        headers: { 'Add-Padding': 'true' },
      });
      if (!resposta.ok) return { status: 'indisponivel' };
      texto = await resposta.text();
    } finally {
      clearTimeout(timer);
    }

    for (const linha of texto.split('\n')) {
      const [sufixoRemoto, contagem] = linha.trim().split(':');
      if (sufixoRemoto !== sufixo) continue;
      const vezes = Number(contagem);
      // O padding vem com contagem 0: são preenchimento, não vazamento real.
      if (!Number.isFinite(vezes) || vezes <= 0) return { status: 'limpa' };
      return { status: 'vazada', vezes };
    }

    return { status: 'limpa' };
  } catch {
    // Inclui o abort do timeout. Falha aberta, de propósito.
    return { status: 'indisponivel' };
  }
}

/** Mensagem para a pessoa, quando a senha aparece em vazamentos. */
export function mensagemSenhaVazada(vezes: number): string {
  const contagem = vezes.toLocaleString('pt-BR');
  return (
    `Essa senha já apareceu em ${contagem} vazamento(s) de dados públicos. ` +
    'Ela pode ser forte, mas já está em listas usadas por atacantes — escolha outra.'
  );
}
