import { acaoParaParams, parseDeepLink, registrarUrlRoteada } from '@/lib/deep-links';

/** Normalize widget actions before Expo Router attempts to resolve a page. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const acao = parseDeepLink(path);
    if (!acao) return path;
    /* Avisa que o roteador deu conta desta URL, para a rede de segurança da
       área logada não abrir o mesmo formulário de novo — ver
       `acaoInicialPendente` em lib/deep-links.ts. */
    registrarUrlRoteada(path);
    if (acao.tipo === 'add-credit') return '/(app)/credito?novaCompra=1';
    if (acao.tipo === 'add-bill') return '/(app)/contas?novaConta=1';
    if (acao.tipo === 'bills') return '/(app)/contas';
    return `/(app)/?${new URLSearchParams(acaoParaParams(acao)).toString()}`;
  } catch {
    return '/';
  }
}
