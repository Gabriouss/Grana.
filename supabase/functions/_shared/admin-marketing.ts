import type { OperacaoAdmin } from './admin-autorizacao.ts';
import { consultaComPrazo } from './admin-agregados.ts';

export type PedidoMarketing = {
  recurso: 'marketing-notificacoes' | 'marketing-ler' | 'marketing-resolver' | 'marketing-midia';
  midiaId?: string;
  ids?: string[];
  filtro?: 'todas' | 'nao-lidas' | 'criticas';
  antesDe?: { criadoEm: string; id: string };
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO = /^[a-z0-9-]{1,80}$/;
export function validarMarketing(v: unknown): PedidoMarketing {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('pedido-invalido');
  const p = v as Record<string, unknown>;
  if (p.recurso === 'marketing-midia') {
    if (Object.keys(p).length !== 2 || typeof p.midiaId !== 'string' || !UUID.test(p.midiaId)) throw new Error('pedido-invalido');
    return { recurso: p.recurso, midiaId: p.midiaId };
  }
  if (p.recurso === 'marketing-notificacoes') {
    if (Object.keys(p).some(k => !['recurso', 'filtro', 'antesDe'].includes(k))
      || (p.filtro !== undefined && !['todas', 'nao-lidas', 'criticas'].includes(p.filtro as string))
      ) throw new Error('pedido-invalido');
    let cursor: PedidoMarketing['antesDe'];
    if (p.antesDe !== undefined) {
      const c = p.antesDe as Record<string, unknown>;
      if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).length !== 2
        || typeof c.id !== 'string' || !UUID.test(c.id) || typeof c.criadoEm !== 'string'
        || !/^\d{4}-\d\d-\d\dT/.test(c.criadoEm) || !Number.isFinite(Date.parse(c.criadoEm))) throw new Error('pedido-invalido');
      cursor = { id: c.id, criadoEm: new Date(c.criadoEm).toISOString() };
    }
    return { recurso: p.recurso, filtro: (p.filtro ?? 'todas') as PedidoMarketing['filtro'],
      ...(cursor ? { antesDe: cursor } : {}) };
  }
  if (!['marketing-ler', 'marketing-resolver'].includes(p.recurso as string)
    || Object.keys(p).some(k => !['recurso', 'ids'].includes(k))
    || !Array.isArray(p.ids) || p.ids.length < 1 || p.ids.length > 50
    || p.ids.some(id => typeof id !== 'string' || !UUID.test(id))
    || new Set(p.ids).size !== p.ids.length) throw new Error('pedido-invalido');
  return { recurso: p.recurso as PedidoMarketing['recurso'], ids: p.ids as string[] };
}

function data(v: unknown, nullable = false): string | null {
  if (nullable && v === null) return null;
  if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) throw new Error('consulta');
  return new Date(v).toISOString();
}

export const operacaoMarketing: OperacaoAdmin<PedidoMarketing> = {
  limiteCorpo: 4096,
  validar: validarMarketing,
  executar: async (cliente, pedido, { userId, agora, signal }) => {
    const iso = agora.toISOString();
    if (pedido.recurso === 'marketing-midia') {
      const r = await consultaComPrazo(s => cliente.from('admin_marketing_midias')
        .select('objeto,removido_em').eq('id', pedido.midiaId!).is('removido_em', null).abortSignal(s).maybeSingle(), signal);
      if (r.error || !r.data || typeof r.data.objeto !== 'string' || r.data.objeto.length > 400
        || /(^\/|:\/\/|\.\.)/.test(r.data.objeto)) throw new Error('consulta');
      const objeto = r.data.objeto;
      const link = await consultaComPrazo(() => cliente.storage.from('marketing-remoto').createSignedUrl(objeto, 300), signal);
      if (link.error || !link.data?.signedUrl) throw new Error('consulta');
      return { dados: { url: link.data.signedUrl, expiraEm: new Date(agora.getTime()+300000).toISOString() } };
    }
    if (pedido.recurso !== 'marketing-notificacoes') {
      const coluna = pedido.recurso === 'marketing-ler' ? 'lida_em' : 'resolvida_em';
      const r = await consultaComPrazo(s => cliente.from('admin_marketing_notificacoes')
        .update({ [coluna]: iso }).eq('destinatario_id', userId).in('id', pedido.ids!)
        .is(coluna, null).gt('expira_em', iso).select('id').abortSignal(s), signal);
      if (r.error || !Array.isArray(r.data) || r.data.some(x => typeof x.id !== 'string' || !UUID.test(x.id))) throw new Error('consulta');
      return { dados: { atualizados: r.data.length } };
    }
    const contador = await consultaComPrazo(s => cliente.from('admin_marketing_notificacoes')
      .select('id', { count: 'exact', head: true }).eq('destinatario_id', userId)
      .is('lida_em', null).gt('expira_em', iso).abortSignal(s), signal);
    if (contador.error || !Number.isSafeInteger(contador.count) || contador.count! < 0) throw new Error('consulta');
    const r = await consultaComPrazo(s => {
      let q = cliente.from('admin_marketing_notificacoes')
        .select('id,codigo,importancia,agendamento_id,lida_em,resolvida_em,criado_em')
        .eq('destinatario_id', userId).gt('expira_em', iso);
      if (pedido.filtro === 'nao-lidas') q = q.is('lida_em', null);
      if (pedido.filtro === 'criticas') q = q.eq('importancia', 'critica');
      if (pedido.antesDe) q = q.or(`criado_em.lt.${pedido.antesDe.criadoEm},and(criado_em.eq.${pedido.antesDe.criadoEm},id.lt.${pedido.antesDe.id})`);
      return q.order('criado_em', { ascending: false }).order('id', { ascending: false }).limit(51).abortSignal(s);
    }, signal);
    if (r.error || !Array.isArray(r.data) || r.data.length > 51) throw new Error('consulta');
    const notificacoes = r.data.slice(0, 50).map(x => {
      if (typeof x.id !== 'string' || !UUID.test(x.id) || typeof x.codigo !== 'string' || !CODIGO.test(x.codigo)
        || !['informacao', 'atencao', 'critica'].includes(x.importancia)
        || (x.agendamento_id !== null && !UUID.test(x.agendamento_id))) throw new Error('consulta');
      return { id: x.id, codigo: x.codigo, importancia: x.importancia, agendamentoId: x.agendamento_id,
        criadoEm: data(x.criado_em), lidaEm: data(x.lida_em, true), resolvidaEm: data(x.resolvida_em, true) };
    });
    return { dados: { notificacoes, naoLidas: contador.count,
      proximaPagina: r.data.length > 50 ? { criadoEm: notificacoes[49].criadoEm, id: notificacoes[49].id } : null } };
  },
};

// Evidência operacional só vale por um dia. Ausência não libera carga nova.
// Não habilita controles, executor, e-mail ou publicação.
export function bloqueiosCapacidade(v: {
  medidoEm?: string; carencia?: boolean; bancoBytes?: number; storageBytes?: number;
  egressBytes?: number; egressCacheBytes?: number; invocacoes?: number;
  cronLimpo?: boolean; projecao90DiasSegura?: boolean;
}, agora: Date): string[] {
  const bloqueios: string[] = [];
  const idade = agora.getTime() - Date.parse(v.medidoEm ?? '');
  if (!Number.isFinite(idade) || idade < 0 || idade > 86400000) bloqueios.push('uso-nao-medido');
  if (v.carencia !== false) bloqueios.push('carencia-nao-descartada');
  for (const [campo, teto] of [['bancoBytes', 350000000], ['storageBytes', 700000000],
    ['egressBytes', 3500000000], ['egressCacheBytes', 3500000000], ['invocacoes', 350000]] as const) {
    const n = v[campo];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n >= teto) bloqueios.push(campo);
  }
  if (v.cronLimpo !== true) bloqueios.push('cron-sem-limpeza');
  if (v.projecao90DiasSegura !== true) bloqueios.push('projecao-sem-margem');
  return bloqueios;
}
