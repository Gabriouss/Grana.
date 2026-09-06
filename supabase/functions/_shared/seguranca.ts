// Helpers de segurança e resiliência de rede compartilhados entre Edge
// Functions — extraídos porque as quatro/três cópias eram byte-idênticas
// (timingSafeEqual, fetchComTimeout) e uma correção aplicada só num lado
// deixaria as outras cópias com o mesmo defeito.

/** Comparação resistente a timing attack, pra segredo/assinatura de webhook. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function fetchComTimeout(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Janela deslizante em memória — best-effort, não confiável entre isolates. */
export function criarRateLimiter(janelaMs: number, maxPorJanela: number) {
  const usoRecente = new Map<string, number[]>();
  return (userId: string): boolean => {
    const agora = Date.now();
    const anteriores = (usoRecente.get(userId) ?? []).filter((t) => agora - t < janelaMs);
    anteriores.push(agora);
    usoRecente.set(userId, anteriores);
    return anteriores.length > maxPorJanela;
  };
}
