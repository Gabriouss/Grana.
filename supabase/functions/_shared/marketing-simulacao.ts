// Executor E5 sem rede. Adaptador fechado de simulação; nenhum token ou fetch.
export type Rede = 'facebook' | 'instagram';
export type Manifesto = { legendaSha256: string; capaSha256: string | null;
  midias: { sha256: string; tipo: 'imagem' | 'video' }[] };
export type Peca = { pecaId: string; versao: string; manifesto: Manifesto; aprovado: boolean };
export type Alvo = { pecaId: string; rede: Rede; conta: string; formato: 'feed' | 'reels' | 'stories';
  horario: string; estrategia: 'nativo-meta' | 'executor-remoto' };
export type Estado = 'planejado' | 'programado-no-painel' | 'agendado-na-meta' | 'preparando' |
  'publicado' | 'cancelamento-pendente' | 'cancelado' | 'falhou' | 'precisa-conferir';
export type AcaoAdaptador = 'agendar' | 'publicar' | 'preparar' | 'consultar-preparo' | 'cancelar' | 'reconciliar';
export type Cenario = 'sucesso' | 'falha' | 'incerto' | 'processando' | 'pronto' | 'horario-divergente' | 'nao-encontrado' | 'interromper';
export type Job = {
  modo: 'simulacao'; chave: string; alvo: Alvo; peca: Peca; adminId: string; confirmadoEm: string;
  estado: Estado; motivo: string | null; remotoId: string | null; containerId: string | null; pronto: boolean;
  lease: { id: string; expiraEm: string } | null;
  intentos: { id: string; acao: AcaoAdaptador; estado: 'iniciado' | 'confirmado' | 'falhou' | 'incerto'; remotoId: string | null }[];
};
export type Registro = { revisao: number; dados: Job };
export type Pausas = { global: boolean; facebook: boolean; instagram: boolean };
export type StoreSimulacao = {
  peca: (id: string) => Promise<Peca | null>;
  ler: (chave: string) => Promise<Registro | null>;
  cas: (chave: string, revisao: number, dados: Job) => Promise<number | null>;
  pausas: () => Promise<Pausas>;
  pausar: (rede: 'global' | Rede, pausa: boolean) => Promise<void>;
};
export type AdaptadorSimulado = (acao: AcaoAdaptador, job: Job) => Promise<{
  estado: 'confirmado' | 'falhou' | 'incerto' | 'processando' | 'pronto'; remotoId?: string; horario?: string;
  efeito?: 'publicado' | 'agendado' | 'cancelado' | 'preparado';
}>;
const HASH = /^[0-9a-f]{64}$/;
const clonar = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export function validarPeca(p: Peca): void {
  if (Object.keys(p).some(k=>!['pecaId','versao','manifesto','aprovado'].includes(k))
    || !/^[0-9a-f]{16}$/.test(p.pecaId) || !/^[0-9a-f]{40}$/.test(p.versao)
    || typeof p.aprovado !== 'boolean' || !p.manifesto || !HASH.test(p.manifesto.legendaSha256)
    || Object.keys(p.manifesto).some(k=>!['legendaSha256','capaSha256','midias'].includes(k))
    || (p.manifesto.capaSha256 !== null && !HASH.test(p.manifesto.capaSha256))
    || !Array.isArray(p.manifesto.midias) || p.manifesto.midias.length < 1 || p.manifesto.midias.length > 10
    || p.manifesto.midias.some(x => Object.keys(x).some(k=>!['sha256','tipo'].includes(k))
      || !HASH.test(x.sha256) || !['imagem','video'].includes(x.tipo))) throw new Error('catalogo-invalido');
}
export async function identidadeSimulacao(peca: Peca, alvo: Alvo): Promise<string> {
  // Contrato fechado, ordem de mídias preservada. Toda mudança muda a prova.
  const m = peca.manifesto;
  const bytes = new TextEncoder().encode(JSON.stringify([peca.pecaId,peca.versao,m.legendaSha256,m.capaSha256,
    m.midias.map(x => [x.sha256,x.tipo]),alvo.rede,alvo.conta,alvo.formato,alvo.horario,alvo.estrategia,'simulacao']));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}

export async function previaSimulada(store: StoreSimulacao, alvo: Alvo, agora: Date) {
  const peca = await store.peca(alvo.pecaId);
  if (!peca) return { modo:'simulacao' as const, estado:'nao-configurado', motivo:'catalogo-nao-configurado' };
  validarPeca(peca);
  if (!peca.aprovado) return { modo:'simulacao' as const, estado:'bloqueado', motivo:'peca-sem-aceite' };
  const midias=peca.manifesto.midias;
  if ((alvo.formato==='reels' && (midias.length!==1||midias[0].tipo!=='video'))
    || (alvo.formato==='stories' && midias.length!==1)
    || (alvo.formato==='feed' && midias.length>1 && midias.some(m=>m.tipo!=='imagem'))) {
    return {modo:'simulacao' as const,estado:'bloqueado',motivo:'formato-nao-simulado'};
  }
  if (Date.parse(alvo.horario) <= agora.getTime()) return {modo:'simulacao' as const,estado:'bloqueado',motivo:'horario-nao-futuro'};
  return {modo:'simulacao' as const,estado:'planejado',alvo,peca,chave:await identidadeSimulacao(peca,alvo),
    aviso:'Simulação. Não agenda nem publica na Meta.'};
}

export async function confirmarSimulacao(store: StoreSimulacao, alvo: Alvo, chave: string, adminId: string, agora: Date) {
  const previa = await previaSimulada(store,alvo,agora);
  if (!previa.chave || previa.chave !== chave || !previa.peca) return {modo:'simulacao',estado:'bloqueado',motivo:'previa-ou-versao-mudou'};
  const job: Job = { modo:'simulacao',chave,alvo:clonar(alvo),peca:clonar(previa.peca),adminId,
    confirmadoEm:agora.toISOString(),estado:'programado-no-painel',motivo:null,remotoId:null,containerId:null,pronto:false,lease:null,intentos:[] };
  await store.cas(chave,-1,job);
  const salvo = await store.ler(chave);
  if (!salvo) throw new Error('persistencia');
  return salvo.dados;
}

export function criarAdaptadorSimulado(cenario: Cenario, chamadas: AcaoAdaptador[] = []): AdaptadorSimulado {
  return async (acao,job) => {
    chamadas.push(acao);
    if (cenario === 'incerto') throw new Error('resposta-simulada-perdida');
    if (cenario === 'falha') return {estado:'falhou'};
    if (cenario === 'nao-encontrado') return {estado:'incerto'};
    const remotoId = job.remotoId ?? job.containerId ?? 'sim-'+job.chave.slice(0,24);
    if (cenario === 'processando') return {estado:'processando',remotoId};
    if (cenario === 'pronto') return {estado:'pronto',remotoId};
    const anterior = job.intentos.slice(0,-1).findLast(x=>x.acao!=='reconciliar')?.acao;
    const efeito = acao==='reconciliar' ? anterior==='agendar'?'agendado':anterior==='publicar'?'publicado'
      :anterior==='cancelar'?'cancelado':anterior==='preparar'||anterior==='consultar-preparo'?'preparado':undefined : undefined;
    return {estado:'confirmado',remotoId,horario:cenario === 'horario-divergente'
      ? new Date(Date.parse(job.alvo.horario)+60000).toISOString() : job.alvo.horario,efeito};
  };
}

// Ler/confirmar/cancelar e avançar uma etapa são chamadas separadas. Estado é
// durável no Supabase; processo/M1 não é fonte de verdade. Isto não é scheduler.
export async function executarSimulacao(store: StoreSimulacao, chave: string,
  comando: 'executar' | 'cancelar' | 'reconciliar', adaptador: AdaptadorSimulado, agora: Date,
  interromper = false): Promise<Job | null> {
  const registro = await store.ler(chave);
  if (!registro) return null;
  const job = clonar(registro.dados);
  const salvar = async () => {
    await store.cas(chave,registro.revisao,job);
    return (await store.ler(chave))?.dados ?? null;
  };
  if (job.modo !== 'simulacao' || job.chave !== chave) throw new Error('estado-invalido');
  if (['publicado','cancelado','falhou'].includes(job.estado)) return job;
  if (job.lease) {
    if (Date.parse(job.lease.expiraEm)>agora.getTime()) return job;
    job.estado='precisa-conferir';job.motivo='lease-vencida';job.lease=null;
    const ultimo = job.intentos.at(-1); if (ultimo?.estado==='iniciado') ultimo.estado='incerto';
    return await salvar();
  }
  const pausas = await store.pausas();
  const vigente = await store.peca(job.alvo.pecaId);
  if (vigente) validarPeca(vigente);
  const mudou = !vigente || !vigente.aprovado || await identidadeSimulacao(vigente,job.alvo)!==job.chave;
  const pausado = pausas.global || pausas[job.alvo.rede];
  const remoto = job.remotoId !== null || job.containerId !== null;
  if ((mudou || pausado || comando==='cancelar') && !['precisa-conferir','cancelamento-pendente'].includes(job.estado)) {
    if (remoto) { job.estado='cancelamento-pendente';job.motivo=mudou?'conteudo-alterado':pausado?'pausado':'cancelamento-solicitado'; }
    else if (comando==='cancelar') {job.estado='cancelado';job.motivo='cancelamento-confirmado';return await salvar();}
    else if (mudou) {job.estado='precisa-conferir';job.motivo='conteudo-alterado';return await salvar();}
    else {job.motivo='pausado';return await salvar();}
  }
  if (job.estado==='precisa-conferir' && comando!=='reconciliar') return job;
  if (comando==='reconciliar' && job.estado!=='precisa-conferir' && job.estado!=='cancelamento-pendente') return job;
  if (comando==='reconciliar' && !job.intentos.some(x=>x.estado==='incerto')) return job;
  if (job.estado==='agendado-na-meta') return job;
  const atraso = agora.getTime()-Date.parse(job.alvo.horario);
  if (comando==='executar' && job.estado!=='cancelamento-pendente') {
    if (pausado || mudou) return await salvar();
    if (atraso>15*60000) {job.estado='precisa-conferir';job.motivo='horario-vencido';return await salvar();}
    if (job.alvo.estrategia==='executor-remoto' && atraso<0) return job;
  }
  if (job.intentos.length>=10) {job.estado='precisa-conferir';job.motivo='limite-de-tentativas';return await salvar();}
  const acao: AcaoAdaptador = comando==='reconciliar'?'reconciliar':job.estado==='cancelamento-pendente'?'cancelar'
    :job.alvo.estrategia==='nativo-meta'?'agendar':job.containerId&&!job.pronto?'consultar-preparo'
    :job.peca.manifesto.midias.some(m=>m.tipo==='video')&&!job.containerId?'preparar':'publicar';
  const lease = {id:crypto.randomUUID(),expiraEm:new Date(agora.getTime()+120000).toISOString()};
  const intento = {id:lease.id,acao,estado:'iniciado' as 'iniciado'|'confirmado'|'falhou'|'incerto',remotoId:null as string|null};
  job.lease=lease;job.intentos.push(intento);
  if (acao!=='cancelar' && acao!=='reconciliar') job.estado='preparando';
  const revisao = await store.cas(chave,registro.revisao,job);
  if (revisao===null) return (await store.ler(chave))?.dados??null;
  if (interromper) return job;
  if (acao!=='cancelar' && acao!=='reconciliar') {
    // Pausa/versão podem mudar enquanto a reserva chega ao banco. Conferir
    // de novo antes de sequer chamar o adaptador, sem reaproveitar a leitura.
    const controleFinal=await store.pausas(),pecaFinal=await store.peca(job.alvo.pecaId);
    if (pecaFinal) validarPeca(pecaFinal);
    const mudouFinal=!pecaFinal||!pecaFinal.aprovado||await identidadeSimulacao(pecaFinal,job.alvo)!==chave;
    if (controleFinal.global||controleFinal[job.alvo.rede]||mudouFinal) {
      job.lease=null;intento.estado='falhou';job.motivo=mudouFinal?'conteudo-alterado':'pausado';
      job.estado=remoto?'cancelamento-pendente':mudouFinal?'precisa-conferir':'programado-no-painel';
      await store.cas(chave,revisao,job);
      return (await store.ler(chave))?.dados??null;
    }
  }
  let resposta: Awaited<ReturnType<AdaptadorSimulado>>;
  try {resposta=await adaptador(acao,clonar(job));} catch {resposta={estado:'incerto'};}
  const id = resposta.remotoId;
  const idValido = typeof id==='string' && /^sim-[a-zA-Z0-9-]{1,100}$/.test(id);
  job.lease=null;
  intento.estado=resposta.estado==='falhou'?'falhou':resposta.estado==='incerto'?'incerto':'confirmado';
  intento.remotoId=idValido?id:null;
  if (resposta.estado==='incerto' || (resposta.estado!=='falhou' && !idValido)) {
    job.estado='precisa-conferir';job.motivo='resultado-incerto';intento.estado='incerto';
  } else if (resposta.estado==='falhou') {
    job.estado=acao==='cancelar'?'cancelamento-pendente':acao==='reconciliar'?'precisa-conferir':'falhou';
    job.motivo=acao==='reconciliar'?'reconciliacao-falhou':'falha-simulada';
  } else if (acao==='cancelar') {
    if (resposta.estado==='confirmado') {job.estado='cancelado';job.motivo=null;}
    else {job.estado='cancelamento-pendente';job.motivo='cancelamento-nao-confirmado';}
  } else if (acao==='preparar' || acao==='consultar-preparo') {
    job.containerId=id!;job.pronto=resposta.estado==='pronto'||resposta.estado==='confirmado';
    job.estado=job.pronto?'programado-no-painel':'preparando';job.motivo=null;
  } else if (acao==='agendar') {
    if (resposta.estado==='confirmado' && resposta.horario===job.alvo.horario) {
      job.remotoId=id!;job.estado=mudou||pausado?'cancelamento-pendente':'agendado-na-meta';
      job.motivo=mudou?'conteudo-alterado':pausado?'pausado':null;
    } else {job.estado='precisa-conferir';job.motivo='horario-remoto-nao-confirmado';intento.estado='incerto';}
  } else if (acao==='reconciliar') {
    if (resposta.estado!=='confirmado') {job.estado='precisa-conferir';job.motivo='reconciliacao-inconclusiva';}
    else if (resposta.efeito==='agendado' && resposta.horario===job.alvo.horario) {
      job.remotoId=id!;job.estado=mudou||pausado?'cancelamento-pendente':'agendado-na-meta';
      job.motivo=mudou?'conteudo-alterado':pausado?'pausado':null;
    } else if (resposta.efeito==='publicado') {job.remotoId=id!;job.estado='publicado';job.motivo=null;}
    else if (resposta.efeito==='cancelado') {job.estado='cancelado';job.motivo=null;}
    else if (resposta.efeito==='preparado') {job.containerId=id!;job.pronto=true;job.estado='programado-no-painel';job.motivo=null;}
    else {job.estado='precisa-conferir';job.motivo='reconciliacao-inconclusiva';intento.estado='incerto';}
  } else if (resposta.estado==='confirmado') {
    job.remotoId=id!;job.estado='publicado';job.motivo=null;
  } else {job.estado='precisa-conferir';job.motivo='resultado-nao-confirmado';intento.estado='incerto';}
  await store.cas(chave,revisao,job);
  return (await store.ler(chave))?.dados??null;
}
