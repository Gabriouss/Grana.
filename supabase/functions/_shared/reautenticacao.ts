/* Prova de login recente, presa à SESSÃO que pede a ação (V4-5, 16/10/2026).
 *
 * `user.last_sign_in_at` é do usuário, não da sessão: um login novo da vítima em
 * outro aparelho o atualiza, e um token antigo (roubado) da mesma conta passaria
 * a satisfazer a janela de reautenticação. O JWT carrega, em `amr`, o instante em
 * que ESTA sessão provou a identidade (`[{ method, timestamp }]`, em segundos), e
 * o refresh preserva esse valor. Por isso a janela é medida aqui.
 *
 * O token já deve ter sido validado por `auth.getUser(token)` antes: este módulo
 * só lê as claims, não confere assinatura. Sem `amr` legível a resposta é "não
 * recente" (falha fechada); o app reautentica com senha antes de chamar, então o
 * token dele sempre traz o instante novo.
 */
export const JANELA_REAUTENTICACAO_MS = 10 * 60 * 1000;
const TOLERANCIA_RELOGIO_MS = 30_000;

function claimsDoJwt(token: string): Record<string, unknown> | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes));
    return claims && typeof claims === 'object' ? claims : null;
  } catch {
    return null;
  }
}

/** Instante (ms) em que a sessão do token provou a identidade pela última vez, ou null. */
export function instanteDaProvaDaSessao(token: string): number | null {
  const amr = claimsDoJwt(token)?.amr;
  if (!Array.isArray(amr)) return null;
  let maisRecente: number | null = null;
  for (const entrada of amr) {
    const ts = (entrada as { timestamp?: unknown } | null)?.timestamp;
    if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) continue;
    const ms = ts * 1000;
    if (maisRecente === null || ms > maisRecente) maisRecente = ms;
  }
  return maisRecente;
}

export function sessaoReautenticouRecentemente(token: string, agora: number = Date.now()): boolean {
  const prova = instanteDaProvaDaSessao(token);
  if (prova === null) return false;
  if (prova > agora + TOLERANCIA_RELOGIO_MS) return false;
  return agora - prova <= JANELA_REAUTENTICACAO_MS;
}
