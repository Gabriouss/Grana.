import type { OperacaoAdmin } from './admin-autorizacao.ts';
import { consultaComPrazo } from './admin-agregados.ts';
import { lerCorpoLimitado } from './request-body.ts';
import { semanaAnalitica } from '../../../lib/admin-analytics.ts';

type PedidoMeta = { recurso: 'meta-leitura'; incluirHoje?: boolean };
type Linha = Record<string, unknown>;
type Paginas = { linhas: Linha[]; paginas: number; completo: boolean };
const FUSO = 'America/Sao_Paulo';
const DIA = 86400000;
const CACHE_MS = 15 * 60000;
const CONFIG = ['META_READ_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_GRAPH_API_VERSION'] as const;
const validar = (p: unknown): PedidoMeta => {
  const v = p as Record<string, unknown> | null;
  if (!v || typeof v !== 'object' || Array.isArray(v) || v.recurso !== 'meta-leitura'
    || Object.keys(v).some(k => !['recurso', 'incluirHoje'].includes(k))
    || (v.incluirHoje !== undefined && typeof v.incluirHoje !== 'boolean')) throw new Error('pedido-invalido');
  return { recurso: 'meta-leitura', incluirHoje: v.incluirHoje === true };
};

export type JanelaMeta='30dias'|'semana-anterior'|'semana-atual';
export function periodosMeta(agora: Date,janela:JanelaMeta='30dias') {
  const hoje = new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO, year: 'numeric', month:'2-digit', day:'2-digit' }).format(agora);
  const base = Date.parse(hoje+'T00:00:00Z');
  const dia = (n: number) => new Date(base+n*DIA).toISOString().slice(0,10);
  if(janela!=='30dias'){
    const week=semanaAnalitica(agora,janela==='semana-atual');
    const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:FUSO,year:'numeric',month:'2-digit',day:'2-digit'});
    const inicio=fmt.format(new Date(week.startInclusive)),fim=fmt.format(new Date(week.endExclusive));
    const deslocar=(d:string,n:number)=>new Date(Date.parse(d+'T00:00:00Z')+n*DIA).toISOString().slice(0,10);
    return {fuso:FUSO,atual:{desde:inicio,ateExclusivo:fim,ateInclusivo:deslocar(fim,-1),parcial:janela==='semana-atual'},
      anterior:{desde:deslocar(inicio,-7),ateExclusivo:inicio,ateInclusivo:deslocar(inicio,-1),parcial:false},
      hoje:{desde:hoje,ateExclusivo:dia(1),ateInclusivo:hoje,parcial:true}};
  }
  return { fuso: FUSO,
    atual: { desde: dia(-30), ateExclusivo: hoje, ateInclusivo: dia(-1), parcial: false },
    anterior: { desde: dia(-60), ateExclusivo: dia(-30), ateInclusivo: dia(-31), parcial: false },
    hoje: { desde: hoje, ateExclusivo: dia(1), ateInclusivo: hoje, parcial: true } };
}

class FalhaMeta extends Error {
  constructor(readonly codigo: string) { super(codigo); }
}
function inteiro(v: unknown): number {
  if (typeof v !== 'string' || !/^\d{1,15}$/.test(v) || !Number.isSafeInteger(Number(v))) throw new FalhaMeta('resposta-invalida');
  return Number(v);
}
// Dinheiro em centavos, sem soma de ponto flutuante nem moeda misturada.
function centavos(v: unknown): number {
  if (typeof v !== 'string' || !/^\d{1,12}(?:\.\d{1,2})?$/.test(v)) throw new FalhaMeta('resposta-invalida');
  const [reais, cents=''] = v.split('.');
  const n = Number(reais)*100+Number(cents.padEnd(2,'0'));
  if (!Number.isSafeInteger(n)) throw new FalhaMeta('resposta-invalida');
  return n;
}

// Factory local ao isolate: cache curto e uma coleta em voo por configuração/período.
// Não grava tokens, métricas ou payloads no banco; nenhum scheduler é criado.
export function criarOperacaoMeta(
  env: (nome: string) => string | undefined,
  rede: typeof fetch = fetch,
  janela:JanelaMeta='30dias',
): OperacaoAdmin<PedidoMeta> {
  let cache: { chave: string; token: string; ate: number; dados: unknown } | null = null;
  let voo: { chave: string; token: string; promessa: Promise<unknown> } | null = null;
  return { limiteCorpo: 256, validar, executar: async (_cliente, pedido, { agora, signal }) => {
    const periodos = periodosMeta(agora,janela);
    const faltantes = CONFIG.filter(k => !env(k)?.trim());
    const base = { periodos, cakto: { estado:'indisponivel', motivo:'cobertura-nao-comprovada',
      novasAssinaturas:null, receitaConfirmadaCentavos:null, reembolsosCentavos:null },
      medicaoPropria: { estado:'nao-configurado', coberturaAtribuicao:null } };
    if (faltantes.length) return { dados: { ...base, meta: { estado:'nao-configurado', rotulo:'Não configurado',
      faltantes, atualizadoEm:null, campanhas:null, investimentoCentavos:null } } };
    const token = env(CONFIG[0])!.trim(), conta = env(CONFIG[1])!.trim(), versao = env(CONFIG[2])!.trim();
    if (!/^\d{1,40}$/.test(conta) || !/^v\d{2}\.0$/.test(versao)) return { dados: { ...base,
      meta: { estado:'indisponivel', motivo:'configuracao-invalida', investimentoCentavos:null, campanhas:null } } };
    const chave = JSON.stringify([conta,versao,janela,periodos.atual.desde,pedido.incluirHoje]);
    if (cache?.chave === chave && cache.token === token && cache.ate > agora.getTime()) return { dados:cache.dados };
    if (voo?.chave === chave && voo.token === token) {
      const existente = voo.promessa;
      return { dados:await consultaComPrazo(() => existente,signal,9000) };
    }
    const coletar = async (total: AbortSignal) => {
      let chamadas = 0;
      const get = async (endpoint: 'insights' | 'campaigns' | '', params: Record<string,string>): Promise<Linha> => {
        if (++chamadas > 10) throw new FalhaMeta('limite-de-consulta');
        const url = new URL(`https://graph.facebook.com/${versao}/act_${conta}${endpoint ? '/'+endpoint : ''}`);
        for (const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
        return await consultaComPrazo(async s => {
          const r = await rede(url, { method:'GET', redirect:'error', headers:{ Authorization:'Bearer '+token }, signal:s });
          if (!r.ok && r.status !== 400) {
            void r.body?.cancel().catch(() => {});
            throw new FalhaMeta(r.status === 401 ? 'credencial-recusada' : r.status === 403 ? 'permissao-recusada'
              : r.status === 429 ? 'limite-meta' : 'provedor-indisponivel');
          }
          const corpo = await lerCorpoLimitado(new Request(url,{ method:'POST', body:r.body,
            // O adaptador de Response limita o corpo de rede antes do JSON.
            headers:r.headers, duplex:'half' } as RequestInit), 256*1024, 7000);
          if (!corpo.ok) throw new FalhaMeta('resposta-limitada');
          let value: unknown;
          try { value = JSON.parse(new TextDecoder().decode(corpo.bytes)); } catch { throw new FalhaMeta('resposta-invalida'); }
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FalhaMeta('resposta-invalida');
          if (!r.ok || 'error' in value) {
            const code = (value as {error?:{code?:unknown}}).error?.code;
            throw new FalhaMeta(code === 190 ? 'credencial-recusada' : [10,200].includes(code as number) ? 'permissao-recusada'
              : [4,17,32,613].includes(code as number) ? 'limite-meta' : 'provedor-recusou');
          }
          return value as Linha;
        },total,8000);
      };
      const paginar = async (endpoint: 'insights' | 'campaigns', params: Record<string,string>): Promise<Paginas> => {
        const linhas: Linha[] = [], cursores = new Set<string>();
        for (let pagina=1;pagina<=3;pagina++) {
          const r = await get(endpoint,params);
          if (!Array.isArray(r.data) || r.data.length>100 || r.data.some(x => !x || typeof x !== 'object' || Array.isArray(x))) throw new FalhaMeta('resposta-invalida');
          linhas.push(...r.data as Linha[]);
          const paging = r.paging as { next?:unknown; cursors?:{after?:unknown} } | undefined;
          if (!paging?.next) return { linhas,paginas:pagina,completo:true };
          // Nunca segue paging.next, que pode carregar token ou trocar o host.
          const after = paging.cursors?.after;
          if (typeof after !== 'string' || !/^[A-Za-z0-9_+=\/-]{1,512}$/.test(after) || cursores.has(after)) throw new FalhaMeta('paginacao-invalida');
          cursores.add(after); params = { ...params,after };
        }
        return { linhas,paginas:3,completo:false };
      };
      const falha = (e: unknown) => e instanceof FalhaMeta ? e.codigo : total.aborted ? 'prazo' : 'consulta-indisponivel';
      try {
        const contaMeta = await get('',{ fields:'id,currency,timezone_name' });
        if (contaMeta.currency !== 'BRL' || contaMeta.timezone_name !== FUSO) return { ...base,meta:{ estado:'parcial',
          motivo:'moeda-ou-fuso-divergente', atualizadoEm:agora.toISOString(), investimentoCentavos:null, campanhas:null,
          moeda: typeof contaMeta.currency === 'string' && /^[A-Z]{3}$/.test(contaMeta.currency) ? contaMeta.currency : null,
          fuso: typeof contaMeta.timezone_name === 'string' && /^[A-Za-z_/+-]{1,80}$/.test(contaMeta.timezone_name) ? contaMeta.timezone_name : null } };
        const consultarPeriodo = async (intervalo: typeof periodos.atual | typeof periodos.hoje) => {
          try {
            const r = await paginar('insights',{ fields:'campaign_id,date_start,date_stop,spend,impressions,clicks,account_currency',
              level:'campaign', time_increment:'1', limit:'100', time_range:JSON.stringify({since:intervalo.desde,until:intervalo.ateInclusivo}) });
            let gasto=0, impressoes=0, cliques=0;
            const vistos = new Set<string>();
            for (const x of r.linhas) {
              if (typeof x.campaign_id !== 'string' || !/^\d{1,40}$/.test(x.campaign_id)
                || typeof x.date_start !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(x.date_start)
                || x.date_stop !== x.date_start || x.date_start<intervalo.desde || x.date_start>intervalo.ateInclusivo
                || x.account_currency !== 'BRL') throw new FalhaMeta('resposta-invalida');
              const key = x.campaign_id+':'+x.date_start;
              if (vistos.has(key)) throw new FalhaMeta('linha-duplicada');
              vistos.add(key); gasto+=centavos(x.spend); impressoes+=inteiro(x.impressions); cliques+=inteiro(x.clicks);
            }
            if (![gasto,impressoes,cliques].every(Number.isSafeInteger)) throw new FalhaMeta('resposta-invalida');
            return { intervalo, estado:r.completo?'completo':'parcial', paginas:r.paginas, linhas:r.linhas.length,
              investimentoCentavos:r.completo?gasto:null, impressoes:r.completo?impressoes:null, cliques:r.completo?cliques:null };
          } catch(e) { return { intervalo,estado:'indisponivel',motivo:falha(e),investimentoCentavos:null,impressoes:null,cliques:null }; }
        };
        const atual = await consultarPeriodo(periodos.atual), anterior = await consultarPeriodo(periodos.anterior);
        const hoje = pedido.incluirHoje ? await consultarPeriodo(periodos.hoje) : null;
        let campanhas: unknown = null;
        try {
          const r = await paginar('campaigns',{ fields:'id,name,status,effective_status',limit:'100' });
          const ids = new Set<string>();
          const itens = r.linhas.map(x => {
            if (typeof x.id !== 'string' || !/^\d{1,40}$/.test(x.id) || ids.has(x.id)
              || typeof x.name !== 'string' || x.name.length>300 || typeof x.status !== 'string'
              || !/^[A-Z_]{1,40}$/.test(x.status) || typeof x.effective_status !== 'string' || !/^[A-Z_]{1,40}$/.test(x.effective_status)) throw new FalhaMeta('resposta-invalida');
            ids.add(x.id); return {id:x.id,nome:x.name,status:x.status,statusEfetivo:x.effective_status};
          });
          campanhas = {estado:r.completo?'completo':'parcial',paginas:r.paginas,itens};
        } catch(e) { campanhas = {estado:'indisponivel',motivo:falha(e),itens:null}; }
        const comparavel = atual.estado==='completo' && anterior.estado==='completo';
        const investimentoCentavos = atual.investimentoCentavos;
        const variacaoPercentual = comparavel && anterior.investimentoCentavos!>0
          ? ((investimentoCentavos!-anterior.investimentoCentavos!)/anterior.investimentoCentavos!)*100 : null;
        return { ...base, meta:{ estado:comparavel?'completo':'parcial', conta,moeda:'BRL',fuso:FUSO,
          atualizadoEm:agora.toISOString(), investimentoCentavos,atual,anterior,hoje,campanhas,variacaoPercentual } };
      } catch(e) { return { ...base, meta:{ estado:'indisponivel',motivo:falha(e),atualizadoEm:null,investimentoCentavos:null,campanhas:null } }; }
    };
    // Prazo único cobre todas as páginas e a leitura dos corpos.
    const promessa = consultaComPrazo(s => coletar(s),signal,9000);
    voo = {chave,token,promessa};
    try {
      const dados = await promessa;
      cache = { chave,token,ate:agora.getTime()+CACHE_MS,dados };
      return {dados};
    } finally { if (voo?.promessa===promessa) voo=null; }
  } };
}
