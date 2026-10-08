import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';

import { consultaComPrazo, consultarAgregados } from './admin-agregados.ts';
import { criarRateLimiter } from './seguranca.ts';

function idsAdminValidos(valor: string): boolean {
  const ids = valor.split(',').map((id) => id.trim());
  return ids.length > 0 && ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
}

// 'acesso' is the only resource open to a non-admin (answers admin:false); every other
// resource needs an allowlisted admin with aal2 and a verified TOTP.
export type RecursoAdmin = string;
export type AutorizacaoAdmin =
  | { ok: false; status: number; codigo: string }
  | { ok: true; admin: false; userId: string }
  | { ok: true; admin: true; userId: string; aal: 'aal1' | 'aal2'; totp: 'ausente' | 'verificado' };

// Decodificar NÃO valida um JWT. Só chamado DEPOIS de getUser validar o MESMO token.
function claimsValidados(token: string): { sub?: string; aal?: string } {
  const partes = token.split('.');
  if (partes.length !== 3) throw new Error('token');
  const base = partes[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base.padEnd(Math.ceil(base.length / 4) * 4, '=')));
}

export async function autorizarAdmin(
  req: Request,
  recurso: RecursoAdmin,
  cliente: SupabaseClient,
  adminUserIds: string,
): Promise<AutorizacaoAdmin> {
  const ids = adminUserIds.split(',').map((id) => id.trim()).filter(Boolean);
  // Configuração incompleta falha fechada inclusive no recurso de acesso.
  if (!idsAdminValidos(adminUserIds)) return { ok: false, status: 503, codigo: 'nao-configurado' };
  const token = req.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) return { ok: false, status: 401, codigo: 'nao-autenticado' };
  const { data, error } = await cliente.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, codigo: 'nao-autenticado' };
  let claims: { sub?: string; aal?: string };
  try { claims = claimsValidados(token); }
  catch { return { ok: false, status: 401, codigo: 'nao-autenticado' }; }
  if (claims.sub !== data.user.id || !['aal1', 'aal2'].includes(claims.aal ?? '')) {
    return { ok: false, status: 401, codigo: 'nao-autenticado' };
  }
  const admin = ids.includes(data.user.id);
  if (!admin) return recurso === 'acesso'
    ? { ok: true, admin: false, userId: data.user.id }
    : { ok: false, status: 403, codigo: 'nao-autorizado' };
  const totp = data.user.factors?.some((f) => f.factor_type === 'totp' && f.status === 'verified') ? 'verificado' : 'ausente';
  if (recurso !== 'acesso' && (claims.aal !== 'aal2' || totp !== 'verificado')) {
    return { ok: false, status: 403, codigo: 'mfa-necessario' };
  }
  return {
    ok: true, admin: true, userId: data.user.id, aal: claims.aal as 'aal1' | 'aal2',
    totp,
  };
}

const ORIGENS = new Set(['https://www.granaponto.com.br', 'https://granaponto.com.br']);
const MENSAGENS: Record<string, string> = {
  'origem-recusada': 'Origem não autorizada.', 'metodo-invalido': 'Use POST.',
  'corpo-grande': 'O pedido excede o limite.', 'pedido-invalido': 'Pedido inválido.',
  'nao-configurado': 'Painel indisponível nesta configuração.', 'nao-autenticado': 'Entre novamente para continuar.',
  'nao-autorizado': 'Esta conta não tem acesso ao painel.', 'mfa-necessario': 'Confirme seu código de autenticação.',
  'limite': 'Muitas consultas. Tente de novo em um minuto.', 'prazo': 'A consulta demorou. Tente de novo.',
  'indisponivel': 'Não foi possível consultar o painel. Tente de novo.',
};

export type DependenciasAdmin = {
  env: (nome: string) => string | undefined;
  cliente: (url: string, chave: string, signal: AbortSignal) => SupabaseClient;
  log: (linha: string) => void;
};

// What one admin Edge Function does after the shared gate (CORS, IP/user/admin limits,
// JWT, allowlist, aal2+TOTP, total deadline). `validar` throws 'pedido-invalido' on any
// shape it does not accept; `executar` only runs for an authorized admin, with the
// service_role client, and returns data that is already a closed DTO.
export type PedidoAdmin = { recurso: RecursoAdmin };
export type OperacaoAdmin<P extends PedidoAdmin> = {
  limiteCorpo: number;
  validar: (pedido: unknown) => P;
  executar: (cliente: SupabaseClient, pedido: P, contexto: { userId: string; agora: Date; signal: AbortSignal })
    => Promise<{ dados: unknown; falhas?: string[] }>;
};

export const operacaoConsulta: OperacaoAdmin<PedidoAdmin> = {
  limiteCorpo: 1024,
  validar: (pedido) => {
    const p = pedido as Record<string, unknown> | null;
    if (!p || Array.isArray(p) || typeof p !== 'object'
      || Object.keys(p).length !== 1 || !['acesso', 'visao-geral'].includes(p.recurso as string)) {
      throw new Error('pedido-invalido');
    }
    return { recurso: p.recurso as string };
  },
  executar: (cliente, _pedido, { agora, signal }) => consultarAgregados(cliente, agora, signal),
};

async function lerPedido<P extends PedidoAdmin>(req: Request, signal: AbortSignal, operacao: OperacaoAdmin<P>): Promise<P> {
  const limite = operacao.limiteCorpo;
  const tamanho = Number(req.headers.get('Content-Length'));
  if (tamanho > limite) throw new Error('corpo-grande');
  if (!req.body) throw new Error('pedido-invalido');
  const reader = req.body.getReader();
  let texto = '';
  let bytes = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    // Ler em pedaços limita memória mesmo sem Content-Length; prazo inclui upload.
    await consultaComPrazo(async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > limite) throw new Error('corpo-grande');
        texto += decoder.decode(value, { stream: true });
      }
      texto += decoder.decode();
    }, signal, 5_000);
    let pedido: unknown;
    try { pedido = JSON.parse(texto); } catch { throw new Error('pedido-invalido'); }
    try { return operacao.validar(pedido); } catch { throw new Error('pedido-invalido'); }
  } finally {
    // Não esperar cancel(), que também pode pendurar num cliente desconectado.
    void reader.cancel().catch(() => {});
  }
}

// Admission queue never retains denied attempts; unlike an unbounded timestamp array.
function admissaoLimitada(maximo: number, janela = 60_000) {
  let recentes: number[] = [];
  return () => {
    const agora = Date.now(); recentes = recentes.filter((t) => agora - t < janela);
    if (recentes.length >= maximo) return true;
    recentes.push(agora); return false;
  };
}
// Client address is an extra throttle, NOT an authentication boundary.
// Gateway verified in production on 08/10/2026 (sonda-xff): the client-sent X-Forwarded-For
// is discarded and rewritten; entry 0 equals cf-connecting-ip (the real client) and the LAST
// entry is a proxy shared by everyone, so keying on it put all callers in one bucket and
// anyone could lock /admin out with 429. A forged CF-Connecting-IP is refused by Cloudflare.
function normalizarIp(valor: string | null | undefined): string | null {
  const ip = valor?.trim() ?? '';
  if (!ip || ip.length > 64) return null;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every((v) => Number(v) <= 255)) return ip.split('.').map(Number).join('.');
  if (ip.includes(':')) {
    try { return new URL(`http://[${ip}]/`).hostname.toLowerCase(); } catch { return null; }
  }
  return null;
}
function chaveIp(req: Request): string {
  const cf = normalizarIp(req.headers.get('cf-connecting-ip'));
  if (cf) return cf;
  const xff = req.headers.get('x-forwarded-for');
  if (!xff || xff.length > 256) return 'sem-ip';
  return normalizarIp(xff.split(',')[0]) ?? 'sem-ip';
}

export function criarHandlerAdmin<P extends PedidoAdmin = PedidoAdmin>(
  deps: DependenciasAdmin,
  operacao: OperacaoAdmin<P> = operacaoConsulta as unknown as OperacaoAdmin<P>,
) {
  const usuarios = new Map<string, { expira: number; limitar: () => boolean }>();
  const porUsuario = (id: string) => {
    const agora = Date.now();
    for (const [chave, item] of usuarios) if (item.expira <= agora) usuarios.delete(chave);
    let item = usuarios.get(id);
    if (!item) { item = { expira: agora + 60_000, limitar: admissaoLimitada(30) }; usuarios.set(id, item); }
    item.expira = agora + 60_000;
    return item.limitar();
  };
  const global = criarRateLimiter(60_000, 120);
  const admissaoAdmin = admissaoLimitada(120);
  const overflow = admissaoLimitada(60);
  const ips = new Map<string, { expira: number; limitar: () => boolean }>();
  return async (req: Request): Promise<Response> => {
    const inicio = Date.now();
    const ocorrencia = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
    let recurso: RecursoAdmin | 'nenhum' = 'nenhum';
    let autorizacao = 'nao-verificada';
    let status = 500;
    let falhas: string[] = [];
    const total = new AbortController();
    const timer = setTimeout(() => total.abort(), 12_000);
    const origem = req.headers.get('Origin');
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' });
    if (origem && ORIGENS.has(origem)) headers.set('Access-Control-Allow-Origin', origem);
    const responder = (codigoStatus: number, dado: unknown) => {
      status = codigoStatus;
      return new Response(JSON.stringify(dado), { status, headers });
    };
    const erro = (codigoStatus: number, codigo: string) => responder(codigoStatus, {
      ok: false, erro: { codigo, mensagem: MENSAGENS[codigo] }, ocorrencia,
    });
    try {
      if (origem !== null && !ORIGENS.has(origem)) return erro(403, 'origem-recusada');
      if (req.method === 'OPTIONS') {
        if (!origem) return erro(403, 'origem-recusada');
        headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info');
        status = 204;
        return new Response(null, { status, headers });
      }
      if (req.method !== 'POST') return erro(405, 'metodo-invalido');
      const ip = chaveIp(req);
      const agora = Date.now();
      for (const [chave, item] of ips) if (item.expira <= agora) ips.delete(chave);
      let item = ips.get(ip);
      if (!item && ips.size < 256) { item = { expira: agora + 60_000, limitar: admissaoLimitada(60) }; ips.set(ip, item); }
      if (item) item.expira = agora + 60_000;
      if ((item?.limitar ?? overflow)()) { headers.set('Retry-After', '60'); return erro(429, 'limite'); }
      let pedido: P;
      try { pedido = await lerPedido(req, total.signal, operacao); recurso = pedido.recurso; }
      catch (e) {
        const codigo = e instanceof Error ? e.message : '';
        return codigo === 'corpo-grande' ? erro(413, codigo)
          : codigo === 'prazo' ? erro(504, codigo) : erro(400, 'pedido-invalido');
      }
      const url = deps.env('SUPABASE_URL');
      const anon = deps.env('SUPABASE_ANON_KEY');
      const service = deps.env('SUPABASE_SERVICE_ROLE_KEY');
      const ids = deps.env('ADMIN_USER_IDS') ?? '';
      if (!url || !anon || !service || !idsAdminValidos(ids)) {
        autorizacao = 'nao-configurado';
        return erro(503, 'nao-configurado');
      }
      const acesso = await consultaComPrazo((signal) => autorizarAdmin(
        req, recurso as RecursoAdmin, deps.cliente(url, anon, signal), ids,
      ), total.signal);
      if (!acesso.ok) { autorizacao = acesso.codigo; return erro(acesso.status, acesso.codigo); }
      // O acesso também é limitado: TOTP não é condição para consumir auth sem limite.
      const excedeuUsuario = porUsuario(acesso.userId);
      if (excedeuUsuario) {
        headers.set('Retry-After', '60');
        return erro(429, 'limite');
      }
      if (!acesso.admin) {
        autorizacao = 'nao-admin';
        return responder(200, { ok: true, contrato: 1, geradoEm: new Date().toISOString(), dados: { admin: false } });
      }
      autorizacao = 'admin';
      // Only authenticated allowlisted requests consume the admin's budget.
      if (admissaoAdmin() || global('total')) { headers.set('Retry-After', '60'); return erro(429, 'limite'); }
      if (recurso === 'acesso') return responder(200, {
        ok: true, contrato: 1, geradoEm: new Date().toISOString(),
        dados: { admin: true, aal: acesso.aal, totp: acesso.totp },
      });
      // O cliente privilegiado só nasce DEPOIS de autorização e limite aprovados.
      const resultado = await operacao.executar(deps.cliente(url, service, total.signal), pedido,
        { userId: acesso.userId, agora: new Date(), signal: total.signal });
      falhas = resultado.falhas ?? [];
      return responder(200, { ok: true, contrato: 1, geradoEm: new Date().toISOString(), dados: resultado.dados });
    } catch (e) {
      const prazo = total.signal.aborted || (e instanceof Error && e.message === 'prazo');
      autorizacao = autorizacao === 'nao-verificada' ? (prazo ? 'prazo' : 'indisponivel') : autorizacao;
      return erro(prazo ? 504 : 503, prazo ? 'prazo' : 'indisponivel');
    } finally {
      clearTimeout(timer);
      // Lista fechada de campos, nunca o erro bruto. Falhas de bloco são recibo operacional.
      deps.log(JSON.stringify({ hora: new Date().toISOString(), ocorrencia, recurso, status,
        duracaoMs: Date.now() - inicio, autorizacao, blocosIndisponiveis: falhas }));
    }
  };
}

