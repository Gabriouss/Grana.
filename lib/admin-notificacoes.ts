// Núcleo puro do sino e dos estados de publicação do /admin web (M6, docs/admin/m6-prism).
// Sem rede e sem React: a tela lê de um dublê até a fundação remota existir (e3819d9).

export type FonteNotificacao = 'publicacoes' | 'criativos' | 'feedbacks' | 'sistema' | 'novidades';
export type ImportanciaNotificacao = 'agir' | 'informacao';

export type Notificacao = {
  id: string;
  fonte: FonteNotificacao;
  importancia: ImportanciaNotificacao;
  titulo: string;
  resumo: string;
  criadoEm: string; // ISO
  lida: boolean;
  resolvida?: boolean;
  acao?: string; // rótulo da ação específica; o destino vem do servidor
};

export type FiltroNotificacoes = {
  aba: 'nao-lidas' | 'todas';
  fonte: FonteNotificacao | 'todas';
  importancia: ImportanciaNotificacao | 'todas';
};

export const FONTES: { valor: FonteNotificacao | 'todas'; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas as fontes' },
  { valor: 'publicacoes', rotulo: 'Publicações' },
  { valor: 'criativos', rotulo: 'Criativos' },
  { valor: 'feedbacks', rotulo: 'Feedbacks' },
  { valor: 'sistema', rotulo: 'Sistema' },
  { valor: 'novidades', rotulo: 'Novidades' },
];

export const IMPORTANCIAS: { valor: ImportanciaNotificacao | 'todas'; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'agir', rotulo: 'Precisa agir' },
  { valor: 'informacao', rotulo: 'Informação' },
];

export const FILTRO_INICIAL: FiltroNotificacoes = { aba: 'nao-lidas', fonte: 'todas', importancia: 'todas' };

export const rotuloFonte = (fonte: FonteNotificacao) => FONTES.find((f) => f.valor === fonte)?.rotulo ?? 'Sistema';

export function contarNaoLidas(lista: readonly Notificacao[]): number {
  return lista.filter((n) => !n.lida).length;
}

// De 1 a 99 mostra o numeral; acima, 99+; zero não mostra selo.
export function rotuloContador(total: number | null): string | null {
  if (total === null || !Number.isFinite(total) || total <= 0) return null;
  return total > 99 ? '99+' : String(Math.floor(total));
}

// O nome acessível conserva o total completo e nunca vira "zero" quando o número é desconhecido.
export function nomeAcessivelSino(total: number | null): string {
  if (total === null) return 'Notificações indisponíveis';
  if (total <= 0) return 'Notificações, nenhuma não lida';
  return total === 1 ? 'Notificações, 1 não lida' : `Notificações, ${total} não lidas`;
}

export function textoNaoLidas(total: number): string {
  return total === 0 ? 'Nenhuma não lida' : total === 1 ? '1 não lida' : `${total} não lidas`;
}

export function filtrar(lista: readonly Notificacao[], filtro: FiltroNotificacoes): Notificacao[] {
  return lista.filter((n) =>
    (filtro.aba === 'todas' || !n.lida) &&
    (filtro.fonte === 'todas' || n.fonte === filtro.fonte) &&
    (filtro.importancia === 'todas' || n.importancia === filtro.importancia));
}

export function filtrosAtivos(filtro: FiltroNotificacoes): number {
  return (filtro.fonte !== 'todas' ? 1 : 0) + (filtro.importancia !== 'todas' ? 1 : 0);
}

const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// Ordem: mais recente primeiro. "Hoje" e "Anteriores" pelo dia local de quem lê.
export function agrupar(lista: readonly Notificacao[], agora: Date): { rotulo: 'Hoje' | 'Anteriores'; itens: Notificacao[] }[] {
  const corte = inicioDoDia(agora);
  const ordenada = [...lista].sort((a, b) => Date.parse(b.criadoEm) - Date.parse(a.criadoEm));
  const hoje = ordenada.filter((n) => Date.parse(n.criadoEm) >= corte);
  const antes = ordenada.filter((n) => Date.parse(n.criadoEm) < corte);
  return [
    ...(hoje.length ? [{ rotulo: 'Hoje' as const, itens: hoje }] : []),
    ...(antes.length ? [{ rotulo: 'Anteriores' as const, itens: antes }] : []),
  ];
}

// Ler não resolve: marcar como lida troca só `lida`.
export function marcarLida(lista: readonly Notificacao[], id: string): Notificacao[] {
  return lista.map((n) => (n.id === id ? { ...n, lida: true } : n));
}

// Opera sobre as que existem no instante da ação (todos os filtros). As que chegarem depois seguem não lidas.
export function marcarTodas(lista: readonly Notificacao[], instante: number): { lista: Notificacao[]; ids: string[] } {
  const ids: string[] = [];
  const nova = lista.map((n) => {
    if (n.lida || Date.parse(n.criadoEm) > instante) return n;
    ids.push(n.id);
    return { ...n, lida: true };
  });
  return { lista: nova, ids };
}

export function desfazerMarcacao(lista: readonly Notificacao[], ids: readonly string[]): Notificacao[] {
  const alvo = new Set(ids);
  return lista.map((n) => (alvo.has(n.id) ? { ...n, lida: false } : n));
}

export function rotuloMarcarTodas(naoLidas: number): string {
  return naoLidas === 1 ? 'Marcar 1 como lida' : `Marcar ${naoLidas} como lidas`;
}

// Estado do que a central sabe. Falha nunca vira zero e nunca apaga a lista conhecida.
export type LeituraCentral =
  | { situacao: 'carregando' }
  | { situacao: 'ok'; lista: Notificacao[]; atualizadoEm: string }
  | { situacao: 'erro'; ultima?: { lista: Notificacao[]; atualizadoEm: string } };

export function totalConhecido(leitura: LeituraCentral): number | null {
  if (leitura.situacao === 'ok') return contarNaoLidas(leitura.lista);
  if (leitura.situacao === 'erro' && leitura.ultima) return contarNaoLidas(leitura.ultima.lista);
  return null;
}

// ---------- Estados de publicação (por destino) ----------

export type EstadoPublicacao =
  | 'planejado' | 'programado' | 'agendado-meta' | 'preparando' | 'publicado'
  | 'cancelamento-pendente' | 'cancelado' | 'falhou' | 'precisa-conferir';

export type IconePublicacao =
  | 'calendario' | 'relogio' | 'relogio-ok' | 'progresso' | 'ok' | 'relogio-alerta' | 'cancelar' | 'alerta' | 'pergunta';

export type SeloPublicacao = {
  estado: EstadoPublicacao | 'indisponivel';
  rotulo: string;
  icone: IconePublicacao;
  classe: 'ausente' | 'neutro' | 'menta' | 'ok' | 'alerta' | 'erro';
  significado: string;
  proximoPasso: string;
};

const SELOS: Record<EstadoPublicacao, SeloPublicacao> = {
  planejado: { estado: 'planejado', rotulo: 'Planejado', icone: 'calendario', classe: 'ausente', significado: 'Intenção e data no calendário, sem autorização de execução.', proximoPasso: 'Conferir e programar' },
  programado: { estado: 'programado', rotulo: 'Programado no painel', icone: 'relogio', classe: 'neutro', significado: 'Autorizado, com execução remota persistida. Não comprova agendamento nativo.', proximoPasso: 'Ver programação' },
  'agendado-meta': { estado: 'agendado-meta', rotulo: 'Agendado na Meta', icone: 'relogio-ok', classe: 'menta', significado: 'ID remoto e consulta que confirma destino e horário.', proximoPasso: 'Ver comprovante' },
  preparando: { estado: 'preparando', rotulo: 'Preparando', icone: 'progresso', classe: 'neutro', significado: 'Mídia ou envio em preparação, sem confirmação de publicação.', proximoPasso: 'Ver andamento' },
  publicado: { estado: 'publicado', rotulo: 'Publicado', icone: 'ok', classe: 'ok', significado: 'Publicação confirmada no destino, com recibo e horário.', proximoPasso: 'Ver comprovante' },
  'cancelamento-pendente': { estado: 'cancelamento-pendente', rotulo: 'Cancelamento pendente', icone: 'relogio-alerta', classe: 'alerta', significado: 'Cancelamento pedido, ainda sem confirmação remota. O agendamento ainda pode executar.', proximoPasso: 'Conferir cancelamento' },
  cancelado: { estado: 'cancelado', rotulo: 'Cancelado', icone: 'cancelar', classe: 'neutro', significado: 'Cancelamento confirmado, ou impedimento confirmado antes de qualquer envio.', proximoPasso: 'Ver comprovante' },
  falhou: { estado: 'falhou', rotulo: 'Falhou', icone: 'alerta', classe: 'erro', significado: 'Falha definitiva conhecida desta tentativa, com causa tratada.', proximoPasso: 'Ver falha' },
  'precisa-conferir': { estado: 'precisa-conferir', rotulo: 'Precisa conferir', icone: 'pergunta', classe: 'alerta', significado: 'Resultado desconhecido ou evidência insuficiente. Repetir o envio fica bloqueado.', proximoPasso: 'Conferir resultado' },
};

const SELO_INDISPONIVEL: SeloPublicacao = {
  estado: 'indisponivel', rotulo: 'Estado indisponível', icone: 'pergunta', classe: 'alerta',
  significado: 'O estado deste destino não foi reconhecido.', proximoPasso: 'Conferir atualização',
};

export const ESTADOS_PUBLICACAO = Object.keys(SELOS) as EstadoPublicacao[];

export type DestinoPublicacao = {
  destino: string; // "Facebook", "Instagram"
  estado: string; // vem do servidor; pode ser desconhecido
  confirmadoEm?: string | null; // ISO, horário do recibo
  consultadoEm?: string | null; // ISO, última consulta remota
  idRemoto?: string | null; // id/recibo remoto, nunca exibido cru
  urlPublicacao?: string | null; // só https válida
  ensaio?: boolean; // ensaio/local nunca recebe estado remoto
};

// Estado reconhecido, e com a evidência que o estado promete. Sem evidência não promove:
// "Agendado na Meta" e "Publicado" sem recibo viram "Precisa conferir"; ensaio nunca é remoto.
export function seloDoDestino(d: DestinoPublicacao): SeloPublicacao {
  const estado = d.estado as EstadoPublicacao;
  if (!(estado in SELOS)) return SELO_INDISPONIVEL;
  if (estado === 'agendado-meta' || estado === 'publicado') {
    const evidencia = Boolean(d.idRemoto) && Boolean(estado === 'publicado' ? d.confirmadoEm : d.consultadoEm);
    if (d.ensaio || !evidencia) return SELOS['precisa-conferir'];
  }
  return SELOS[estado];
}

// Repetir o envio só quando nada remoto pode já ter acontecido ou estar em curso.
export function podeRepetirEnvio(d: DestinoPublicacao): boolean {
  const e = seloDoDestino(d).estado;
  return e === 'planejado' || e === 'falhou' || e === 'cancelado';
}

export function urlSegura(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}

// "1 de 2 destinos publicado; 1 precisa conferir". Execução parcial nunca vira selo global Publicado.
export function resumoDestinos(destinos: readonly DestinoPublicacao[]): { texto: string; todosPublicados: boolean } {
  const selos = destinos.map(seloDoDestino);
  const total = selos.length;
  const publicados = selos.filter((s) => s.estado === 'publicado').length;
  const conferir = selos.filter((s) => s.estado === 'precisa-conferir' || s.estado === 'indisponivel').length;
  const falhos = selos.filter((s) => s.estado === 'falhou').length;
  const pendentes = selos.filter((s) => s.estado === 'cancelamento-pendente').length;
  const nome = (n: number, um: string, varios: string) => (n === 1 ? um : varios);
  if (total === 0) return { texto: 'Sem destinos', todosPublicados: false };
  const partes = [`${publicados} de ${total} ${total === 1 ? 'destino' : 'destinos'} ${publicados === 1 ? 'publicado' : 'publicados'}`];
  if (conferir) partes.push(`${conferir} ${nome(conferir, 'precisa conferir', 'precisam conferir')}`);
  if (falhos) partes.push(`${falhos} ${nome(falhos, 'falhou', 'falharam')}`);
  if (pendentes) partes.push(`${pendentes} ${nome(pendentes, 'cancelamento pendente', 'cancelamentos pendentes')}`);
  return { texto: partes.join('; '), todosPublicados: total > 0 && publicados === total };
}

// ---------- Dublê (dados de teste) até a fundação remota existir ----------

export const AVISO_DUBLE = 'Dados de teste. Nada aqui foi enviado ou lido de um serviço real.';

export function notificacoesDuble(agora: Date): Notificacao[] {
  const min = (m: number) => new Date(agora.getTime() - m * 60_000).toISOString();
  const ontem = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1, 15, 0).toISOString();
  return [
    { id: 'd1', fonte: 'publicacoes', importancia: 'agir', titulo: 'Confira o resultado no Instagram', resumo: 'A Meta não confirmou o resultado. Confira antes de repetir o envio.', criadoEm: min(4), lida: false, acao: 'Conferir resultado' },
    { id: 'd2', fonte: 'criativos', importancia: 'agir', titulo: 'Criativo pronto para sua revisão', resumo: 'Reel, versão 7. Confira as alterações e compare com a versão anterior.', criadoEm: min(18), lida: false, acao: 'Revisar criativo' },
    { id: 'd3', fonte: 'feedbacks', importancia: 'informacao', titulo: 'Novo feedback', resumo: 'Um novo relato aguarda sua análise.', criadoEm: min(32), lida: false, acao: 'Abrir feedbacks' },
    { id: 'd4', fonte: 'sistema', importancia: 'informacao', titulo: 'Falha de entrega resolvida', resumo: 'O envio que falhou foi reconciliado.', criadoEm: ontem, lida: true, resolvida: true },
  ];
}

export function destinosDuble(agora: Date): DestinoPublicacao[] {
  const min = (m: number) => new Date(agora.getTime() - m * 60_000).toISOString();
  return [
    { destino: 'Facebook', estado: 'publicado', confirmadoEm: min(5), consultadoEm: min(5), idRemoto: 'duble-fb', urlPublicacao: null },
    { destino: 'Instagram', estado: 'precisa-conferir', consultadoEm: min(4) },
  ];
}

// Aplica a leitura por id sobre a lista ATUAL: o que chegou durante a gravação continua não lido.
export function marcarIds(lista: readonly Notificacao[], ids: readonly string[]): Notificacao[] {
  const alvo = new Set(ids);
  return lista.map((n) => (alvo.has(n.id) ? { ...n, lida: true } : n));
}
