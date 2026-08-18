/**
 * Atalhos por deep link — Épico 5.1 do PLANO_DE_EVOLUCAO.md.
 *
 * O app responde a dois schemes: `granaapp://` (o original, usado pelos links
 * de confirmação de e-mail do Supabase — ver lib/auth-context.tsx) e
 * `grana://` (curto, para o usuário digitar em Atalhos do iOS e no Android).
 * Ambos aceitam as mesmas ações; manter os dois evita quebrar links de
 * autenticação já enviados por e-mail.
 *
 * Ações:
 *   grana://add-tx?amount=50,00&desc=Almoco&type=out&category=Alimentacao
 *   grana://scan-qr
 *   grana://safe-to-spend
 *
 * Este módulo só INTERPRETA a URL. Quem navega é app/(app)/_layout.tsx, e quem
 * executa a ação é a Home — separado assim porque o parser é lógica pura e
 * pode ser testado sem montar a árvore de navegação.
 */

export type AcaoDeepLink =
  | { tipo: 'add-tx'; amount: string | null; desc: string | null; txType: 'in' | 'out'; category: string | null }
  | { tipo: 'scan-qr' }
  | { tipo: 'safe-to-spend' };

/** Aceita 'in'/'out' em qualquer caixa; qualquer outra coisa vira 'out' (o caso de longe mais comum). */
function normalizarTipo(bruto: string | null): 'in' | 'out' {
  return bruto?.trim().toLowerCase() === 'in' ? 'in' : 'out';
}

/**
 * Interpreta uma URL recebida por deep link. Devolve null quando a URL não é
 * uma ação conhecida — inclusive para os links de autenticação do Supabase,
 * que chegam pelo mesmo canal e são tratados em outro lugar.
 */
export function parseDeepLink(url: string): AcaoDeepLink | null {
  if (!url) return null;

  // O host de `grana://add-tx?x=1` é "add-tx"; em `granaapp:///add-tx` ele vem
  // no path. Normalizar os dois evita depender de qual forma o SO entregou.
  const semScheme = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const [caminhoBruto, queryBruta = ''] = semScheme.split('?');
  const acao = caminhoBruto.replace(/^\/+|\/+$/g, '').toLowerCase();

  const params = new URLSearchParams(queryBruta);
  const ler = (chave: string) => {
    const v = params.get(chave);
    return v && v.trim() ? v.trim() : null;
  };

  switch (acao) {
    case 'add-tx':
      return {
        tipo: 'add-tx',
        amount: ler('amount'),
        desc: ler('desc'),
        txType: normalizarTipo(ler('type')),
        category: ler('category'),
      };
    case 'scan-qr':
      return { tipo: 'scan-qr' };
    case 'safe-to-spend':
      return { tipo: 'safe-to-spend' };
    default:
      return null;
  }
}

/** Converte a ação em query params para a rota da Home, que é quem executa. */
export function acaoParaParams(acao: AcaoDeepLink): Record<string, string> {
  if (acao.tipo === 'add-tx') {
    const p: Record<string, string> = { acao: 'add-tx', type: acao.txType };
    if (acao.amount) p.amount = acao.amount;
    if (acao.desc) p.desc = acao.desc;
    if (acao.category) p.category = acao.category;
    return p;
  }
  return { acao: acao.tipo };
}
