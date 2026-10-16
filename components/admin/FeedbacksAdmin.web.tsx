import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react';
import {
  ErroAdmin, atualizarGestaoFeedback, listarFeedbacksAdmin, reciboLocal,
  type EstadoGestao, type FeedbackAdmin, type FiltrosFeedbacks, type GestaoFeedback, type MudancaGestao,
  type PrioridadeGestao, type TipoFeedback,
} from '@/lib/admin-web';
import './feedbacks-gestao.css';

// Leitura (B3b, 15/10/2026) e gestão (Entrega 3, 16/10/2026) dos feedbacks do app. A gestão
// grava só a triagem, em tabela separada: o texto, a nota e o consentimento de uso público
// nunca são alterados daqui. A superfície final ainda é decisão do autor; esta seção vive
// dentro do /admin web e não depende de nada além dele.

// Mesmas palavras do FeedbackModal do app, para o admin ler o que a pessoa escolheu.
const TIPOS: { valor: TipoFeedback; rotulo: string }[] = [
  { valor: 'suggestion', rotulo: 'Sugestão' },
  { valor: 'bug', rotulo: 'Problema' },
  { valor: 'praise', rotulo: 'Elogio' },
  { valor: 'other', rotulo: 'Outro' },
];
const ROTULO_TIPO = Object.fromEntries(TIPOS.map((t) => [t.valor, t.rotulo])) as Record<TipoFeedback, string>;
const ROTULO_STATUS = { pending: 'Pendente', reviewed: 'Revisado', resolved: 'Resolvido' } as const;

const ESTADOS: { valor: EstadoGestao; rotulo: string }[] = [
  { valor: 'novo', rotulo: 'Novo' },
  { valor: 'em_analise', rotulo: 'Em análise' },
  { valor: 'planejado', rotulo: 'Planejado' },
  { valor: 'em_execucao', rotulo: 'Em execução' },
  { valor: 'resolvido', rotulo: 'Resolvido' },
  { valor: 'arquivado', rotulo: 'Arquivado' },
];
const ROTULO_ESTADO = Object.fromEntries(ESTADOS.map((e) => [e.valor, e.rotulo])) as Record<EstadoGestao, string>;
const PRIORIDADES: { valor: PrioridadeGestao; rotulo: string }[] = [
  { valor: 'alta', rotulo: 'Alta' },
  { valor: 'media', rotulo: 'Média' },
  { valor: 'baixa', rotulo: 'Baixa' },
];
const ROTULO_PRIORIDADE = Object.fromEntries(PRIORIDADES.map((p) => [p.valor, p.rotulo])) as Record<PrioridadeGestao, string>;
const ETIQUETA = /^[0-9A-Za-zÀ-ÿ][0-9A-Za-zÀ-ÿ -]{0,29}$/;

type FormGestao = { estado: EstadoGestao; prioridade: string; responsavel: string; etiquetas: string; versao: string; evidencia: string };
const formDe = (g: GestaoFeedback): FormGestao => ({
  estado: g.estado, prioridade: g.prioridade ?? '', responsavel: g.responsavel ?? '', etiquetas: g.etiquetas.join(', '),
  versao: g.versaoResolucao ?? '', evidencia: g.evidencia ?? '',
});

// Só o que mudou vai ao servidor. Texto livre vazio vira null (limpa o campo). A validação é do
// navegador por cortesia; o servidor e o banco conferem tudo de novo.
export function mudancaDoForm(f: FormGestao, original: GestaoFeedback): MudancaGestao | string {
  const m: MudancaGestao = {};
  const prioridade = (f.prioridade || null) as PrioridadeGestao | null;
  const responsavel = f.responsavel.trim() || null;
  const evidencia = f.evidencia.trim() || null;
  const versao = f.versao.trim() || null;
  if (responsavel && responsavel.length > 80) return 'O responsável aceita até 80 caracteres.';
  if (evidencia && evidencia.length > 500) return 'A evidência aceita até 500 caracteres.';
  if (versao && !VERSAO.test(versao)) return 'Use só números, letras, ponto, hífen ou mais na versão, como 1.11.0.';
  const nomes = f.etiquetas.split(',').map((e) => e.trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (nomes.length > 8) return 'Use no máximo 8 etiquetas.';
  for (const n of nomes) if (!ETIQUETA.test(n)) return 'Etiqueta aceita só letras, números, espaço e hífen, até 30 caracteres. Não escreva dado pessoal.';
  const etiquetas = [...new Set(nomes.map((n) => n.toLowerCase()))];
  if (f.estado === 'resolvido') {
    if (!evidencia) return 'Para marcar como Resolvido, informe a evidência da resolução.';
    if (!versao) return 'Para marcar como Resolvido, informe a versão da resolução.';
  }
  if (f.estado !== original.estado) m.estado = f.estado;
  if (prioridade !== original.prioridade) m.prioridade = prioridade;
  if (responsavel !== original.responsavel) m.responsavel = responsavel;
  if (evidencia !== original.evidencia) m.evidencia = evidencia;
  if (versao !== original.versaoResolucao) m.versaoResolucao = versao;
  if (etiquetas.join('|') !== original.etiquetas.join('|')) m.etiquetas = etiquetas;
  if (Object.keys(m).length === 0) return 'Nenhuma alteração para salvar.';
  return m;
}

type Rascunho = { tipo: string; nota: string; versao: string; desde: string; ate: string };
const VAZIO: Rascunho = { tipo: '', nota: '', versao: '', desde: '', ate: '' };
const VERSAO = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

// O campo de data entrega o dia local; o servidor compara instantes. O dia inteiro vai
// da meia-noite às 23:59:59.999 no fuso de quem lê.
function inicioDoDia(dia: string) { return new Date(`${dia}T00:00:00`).toISOString(); }
function fimDoDia(dia: string) { return new Date(`${dia}T23:59:59.999`).toISOString(); }

export function filtrosDoRascunho(r: Rascunho): FiltrosFeedbacks | string {
  const f: FiltrosFeedbacks = {};
  if (r.tipo) f.tipo = r.tipo as TipoFeedback;
  if (r.nota) f.nota = Number(r.nota);
  const versao = r.versao.trim();
  if (versao) {
    if (!VERSAO.test(versao)) return 'Use só números, letras, ponto, hífen ou mais na versão, como 1.10.5.';
    f.versao = versao;
  }
  if (r.desde && !DIA.test(r.desde)) return 'Confira a data inicial.';
  if (r.ate && !DIA.test(r.ate)) return 'Confira a data final.';
  if (r.desde && r.ate && r.desde > r.ate) return 'A data inicial precisa vir antes da final.';
  if (r.desde) f.desde = inicioDoDia(r.desde);
  if (r.ate) f.ate = fimDoDia(r.ate);
  return f;
}

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function Nota({ nota }: { nota: number | null }) {
  if (nota === null) return <span className="admin-feedbacks__nota admin-feedbacks__nota-vazia">Sem nota</span>;
  return (
    <span className="admin-feedbacks__nota">
      <span aria-hidden="true">{'★'.repeat(nota)}<span className="admin-feedbacks__estrela-apagada">{'★'.repeat(5 - nota)}</span></span>
      <span className="admin-feedbacks__so-leitor">{nota} de 5 estrelas</span>
    </span>
  );
}

type PropsGestao = {
  f: FeedbackAdmin; form: FormGestao; salvando: boolean; aviso: string | null; erro: ErroAdmin | null; confirmando: boolean;
  mudar: (campo: keyof FormGestao) => (evento: { currentTarget: { value: string } }) => void;
  enviar: (evento: FormEvent<HTMLFormElement>) => void; cancelar: () => void;
};

function FormularioGestao({ f, form, salvando, aviso, erro, confirmando, mudar, enviar, cancelar }: PropsGestao) {
  const arquivando = form.estado === 'arquivado' && f.gestao.estado !== 'arquivado';
  return (
    <form id={`admin-fb-gestao-${f.id}`} className="admin-feedbacks__gestao-form" onSubmit={enviar} noValidate aria-label="Gestão deste feedback">
      <div className="admin-feedbacks__campo">
        <label htmlFor="admin-fbg-estado">Andamento</label>
        <select id="admin-fbg-estado" value={form.estado} onChange={mudar('estado')}>
          {ESTADOS.map((e) => <option key={e.valor} value={e.valor}>{e.rotulo}</option>)}
        </select>
      </div>
      <div className="admin-feedbacks__campo">
        <label htmlFor="admin-fbg-prioridade">Prioridade</label>
        <select id="admin-fbg-prioridade" value={form.prioridade} onChange={mudar('prioridade')}>
          <option value="">Sem prioridade</option>
          {PRIORIDADES.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
        </select>
      </div>
      <div className="admin-feedbacks__campo">
        <label htmlFor="admin-fbg-responsavel">Responsável</label>
        <input id="admin-fbg-responsavel" type="text" autoComplete="off" maxLength={80} value={form.responsavel} onChange={mudar('responsavel')} />
      </div>
      <div className="admin-feedbacks__campo">
        <label htmlFor="admin-fbg-etiquetas">Etiquetas (até 8, separadas por vírgula)</label>
        <input id="admin-fbg-etiquetas" type="text" autoComplete="off" spellCheck={false} value={form.etiquetas} onChange={mudar('etiquetas')} />
      </div>
      <div className="admin-feedbacks__campo">
        <label htmlFor="admin-fbg-versao">Versão da resolução</label>
        <input id="admin-fbg-versao" type="text" inputMode="decimal" autoComplete="off" spellCheck={false} maxLength={40}
          placeholder="1.11.0" value={form.versao} onChange={mudar('versao')} />
      </div>
      <div className="admin-feedbacks__campo admin-feedbacks__campo-largo">
        <label htmlFor="admin-fbg-evidencia">Evidência da resolução</label>
        <textarea id="admin-fbg-evidencia" rows={3} maxLength={500} value={form.evidencia} onChange={mudar('evidencia')}
          aria-describedby="admin-fbg-dica" />
        <p id="admin-fbg-dica" className="admin-feedbacks__dica">Obrigatória ao marcar como Resolvido. Não cole dado pessoal nem o texto do feedback aqui: este campo, o responsável e as etiquetas são notas internas.</p>
      </div>
      {aviso && <p role="alert" className="admin-feedbacks__aviso admin-feedbacks__campo-largo">{aviso}</p>}
      {erro && (
        <div role="alert" className="admin-visual__recibo admin-feedbacks__campo-largo">
          <h3>Não foi possível salvar a gestão</h3>
          <p>{erro.message}</p>
          <p className="admin-visual__referencia">Às {hora(erro.hora)} · Referência {erro.ocorrencia}. Nada foi gravado.</p>
        </div>
      )}
      {confirmando && arquivando && !aviso && (
        <p role="status" className="admin-feedbacks__confirmar admin-feedbacks__campo-largo">Arquivar tira este feedback da triagem ativa. Confirme para gravar.</p>
      )}
      <div className="admin-feedbacks__acoes admin-feedbacks__campo-largo">
        <button type="submit" className="admin-visual__botao admin-visual__botao-primario" disabled={salvando}>
          {salvando ? 'Salvando…' : confirmando && arquivando ? 'Confirmar arquivamento' : 'Salvar gestão'}
        </button>
        <button type="button" className="admin-visual__botao admin-visual__botao-secundario" disabled={salvando} onClick={cancelar}>Cancelar</button>
      </div>
    </form>
  );
}

function ResumoGestao({ g }: { g: GestaoFeedback }) {
  return (
    <div className="admin-feedbacks__gestao-resumo">
      <span className={`admin-feedbacks__estado-gestao admin-feedbacks__estado-gestao-${g.estado}`}>Andamento: {ROTULO_ESTADO[g.estado]}</span>
      {g.prioridade && <span>Prioridade {ROTULO_PRIORIDADE[g.prioridade].toLowerCase()}</span>}
      {g.responsavel && <span>Responsável: {g.responsavel}</span>}
      {g.etiquetas.length > 0 && <span>Etiquetas: {g.etiquetas.join(', ')}</span>}
      {g.versaoResolucao && <span>Versão da resolução {g.versaoResolucao}</span>}
      {g.evidencia && <span className="admin-feedbacks__evidencia">Evidência: {g.evidencia}</span>}
    </div>
  );
}

type PropsItem = {
  f: FeedbackAdmin; ancora?: Ref<HTMLLIElement>; aberto: boolean; salvo: string | null; abrir: () => void; gestao: PropsGestao | null;
};

function ItemFeedback({ f, ancora, aberto, salvo, abrir, gestao }: PropsItem) {
  const meta = [f.versaoApp ? `Versão ${f.versaoApp}` : 'Versão não informada', f.plataforma ?? null, f.temConta ? 'Com conta' : 'Sem conta']
    .filter(Boolean).join(' · ');
  return (
    <li className="admin-feedbacks__item" ref={ancora} tabIndex={ancora ? -1 : undefined}>
      <article aria-label={`${ROTULO_TIPO[f.tipo]} de ${quando(f.criadoEm)}`}>
        <header className="admin-feedbacks__item-topo">
          <span className={`admin-feedbacks__tipo admin-feedbacks__tipo-${f.tipo}`}>{ROTULO_TIPO[f.tipo]}</span>
          <Nota nota={f.nota} />
          <time className="admin-feedbacks__quando" dateTime={f.criadoEm}>{quando(f.criadoEm)}</time>
        </header>
        <p className="admin-feedbacks__mensagem">{f.mensagem}</p>
        <footer className="admin-feedbacks__item-rodape">
          <span>{meta}</span>
          <span>Status no app: {ROTULO_STATUS[f.status]}</span>
          {f.usoPublicoAutorizado && <span className="admin-feedbacks__publico">Autorizou uso público</span>}
        </footer>
        <ResumoGestao g={f.gestao} />
        <div className="admin-feedbacks__gestao-barra">
          <button type="button" id={`admin-fb-gerir-${f.id}`} className="admin-visual__botao admin-visual__botao-secundario"
            aria-expanded={aberto} aria-controls={`admin-fb-gestao-${f.id}`} onClick={abrir}>
            {aberto ? 'Fechar gestão' : 'Gerir'}
          </button>
          {salvo && <p role="status" className="admin-feedbacks__salvo">Gestão salva às <time dateTime={salvo}>{hora(salvo)}</time>.</p>}
        </div>
        {aberto && gestao && <FormularioGestao {...gestao} />}
      </article>
    </li>
  );
}

type Estado =
  | { fase: 'carregando' }
  | { fase: 'pronto'; itens: FeedbackAdmin[]; haMais: boolean; lidoEm: string; mais: 'parado' | 'carregando' }
  | { fase: 'erro'; erro: ErroAdmin };

export default function FeedbacksAdmin() {
  const [rascunho, setRascunho] = useState<Rascunho>(VAZIO);
  const [aplicados, setAplicados] = useState<FiltrosFeedbacks>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });
  const [erroMais, setErroMais] = useState<ErroAdmin | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [formG, setFormG] = useState<FormGestao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [avisoG, setAvisoG] = useState<string | null>(null);
  const [erroG, setErroG] = useState<ErroAdmin | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [salvo, setSalvo] = useState<{ id: string; em: string } | null>(null);
  const focoNoGatilho = useRef<string | null>(null);
  const versao = useRef(0);
  const primeiroNovo = useRef<HTMLLIElement | null>(null);
  const focarApos = useRef<number | null>(null);

  const falha = (error: unknown) => {
    const recibo = error instanceof ErroAdmin ? error : reciboLocal('rede', 'Não foi possível ler os feedbacks. Tente de novo.');
    // Só código e referência, nunca o texto de um feedback.
    console.warn('[admin-feedbacks]', recibo.codigo, recibo.ocorrencia);
    return recibo;
  };

  async function carregar(filtros: FiltrosFeedbacks) {
    const atual = ++versao.current;
    setEstado({ fase: 'carregando' }); setErroMais(null);
    try {
      const r = await listarFeedbacksAdmin(filtros);
      if (atual !== versao.current) return;
      setEstado({ fase: 'pronto', itens: r.dados.feedbacks, haMais: r.dados.haMais, lidoEm: r.geradoEm, mais: 'parado' });
    } catch (error) {
      if (atual !== versao.current) return;
      setEstado({ fase: 'erro', erro: falha(error) });
    }
  }

  async function carregarMais() {
    if (estado.fase !== 'pronto' || estado.mais === 'carregando' || !estado.haMais) return;
    const atual = versao.current;
    const anteriores = estado.itens;
    const cursor = anteriores[anteriores.length - 1]?.criadoEm;
    setEstado({ ...estado, mais: 'carregando' }); setErroMais(null);
    try {
      const r = await listarFeedbacksAdmin(aplicados, cursor);
      if (atual !== versao.current) return;
      const vistos = new Set(anteriores.map((f) => f.id));
      const novos = r.dados.feedbacks.filter((f) => !vistos.has(f.id));
      focarApos.current = novos.length ? anteriores.length : null;
      setEstado({ fase: 'pronto', itens: [...anteriores, ...novos], haMais: r.dados.haMais, lidoEm: r.geradoEm, mais: 'parado' });
    } catch (error) {
      if (atual !== versao.current) return;
      setErroMais(falha(error));
      setEstado({ ...estado, itens: anteriores, mais: 'parado' });
    }
  }

  useEffect(() => {
    void carregar({});
    return () => { versao.current++; };
    // Primeira leitura só ao montar; depois, só pelos filtros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ao carregar mais pelo teclado, o foco vai ao primeiro item novo em vez de ficar no
  // botão que pode sumir quando a lista acaba.
  useEffect(() => {
    if (focarApos.current !== null && primeiroNovo.current) { primeiroNovo.current.focus(); focarApos.current = null; }
    // Ao fechar a gestão, o foco volta ao botão que a abriu.
    if (focoNoGatilho.current && typeof document !== 'undefined') {
      document.getElementById(`admin-fb-gerir-${focoNoGatilho.current}`)?.focus();
      focoNoGatilho.current = null;
    }
  });

  function fecharGestao(id: string) {
    setEditando(null); setFormG(null); setAvisoG(null); setErroG(null); setConfirmando(false);
    focoNoGatilho.current = id;
  }

  function alternarGestao(f: FeedbackAdmin) {
    if (editando === f.id) { fecharGestao(f.id); return; }
    setEditando(f.id); setFormG(formDe(f.gestao)); setAvisoG(null); setErroG(null); setConfirmando(false); setSalvo(null);
  }

  const mudarG = (campo: keyof FormGestao) => (evento: { currentTarget: { value: string } }) => {
    const valor = evento.currentTarget.value;
    setFormG((atual) => (atual ? { ...atual, [campo]: valor } : atual));
    setAvisoG(null); setConfirmando(false);
  };

  async function salvarGestao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (estado.fase !== 'pronto' || !editando || !formG || salvando) return;
    const id = editando;
    const item = estado.itens.find((i) => i.id === id);
    if (!item) return;
    const mudanca = mudancaDoForm(formG, item.gestao);
    if (typeof mudanca === 'string') { setAvisoG(mudanca); return; }
    // Arquivar é a ação que tira o item da triagem: pede um segundo toque.
    if (mudanca.estado === 'arquivado' && !confirmando) { setConfirmando(true); return; }
    setSalvando(true); setErroG(null); setAvisoG(null);
    try {
      const r = await atualizarGestaoFeedback(id, mudanca);
      setEstado((atual) => atual.fase === 'pronto'
        ? { ...atual, itens: atual.itens.map((i) => (i.id === id ? { ...i, gestao: r.dados.gestao } : i)) }
        : atual);
      setSalvo({ id, em: r.geradoEm });
      fecharGestao(id);
    } catch (error) {
      // Falha permanente aparece com recibo; o formulário continua aberto com o que foi digitado.
      setErroG(falha(error));
    } finally {
      setSalvando(false);
    }
  }

  function aplicar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const filtros = filtrosDoRascunho(rascunho);
    if (typeof filtros === 'string') { setAviso(filtros); return; }
    setAviso(null); setAplicados(filtros); void carregar(filtros);
  }

  function limpar() {
    setRascunho(VAZIO); setAviso(null); setAplicados({}); void carregar({});
  }

  const mudar = (campo: keyof Rascunho) => (evento: { currentTarget: { value: string } }) => {
    const valor = evento.currentTarget.value;
    setRascunho((r) => ({ ...r, [campo]: valor }));
  };
  const temFiltro = Object.keys(aplicados).length > 0;
  const ocupado = estado.fase === 'carregando';

  return (
    <section className="admin-feedbacks" aria-labelledby="admin-feedbacks-titulo">
      <header className="admin-feedbacks__cabecalho">
        <h2 id="admin-feedbacks-titulo">Feedbacks do app</h2>
        <p>O que as pessoas mandaram pelo app, dos mais novos para os mais antigos. O texto é só leitura; você registra a triagem em cada item.</p>
      </header>

      <form className="admin-feedbacks__filtros" onSubmit={aplicar} aria-describedby={aviso ? 'admin-feedbacks-aviso' : undefined} noValidate>
        <div className="admin-feedbacks__campo">
          <label htmlFor="admin-fb-tipo">Tipo</label>
          <select id="admin-fb-tipo" value={rascunho.tipo} onChange={mudar('tipo')}>
            <option value="">Todos</option>
            {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
          </select>
        </div>
        <div className="admin-feedbacks__campo">
          <label htmlFor="admin-fb-nota">Nota</label>
          <select id="admin-fb-nota" value={rascunho.nota} onChange={mudar('nota')}>
            <option value="">Todas</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={String(n)}>{n} {n === 1 ? 'estrela' : 'estrelas'}</option>)}
          </select>
        </div>
        <div className="admin-feedbacks__campo">
          <label htmlFor="admin-fb-versao">Versão do app</label>
          <input id="admin-fb-versao" type="text" inputMode="decimal" autoComplete="off" spellCheck={false} maxLength={40}
            placeholder="1.10.5" value={rascunho.versao} onChange={mudar('versao')} />
        </div>
        <div className="admin-feedbacks__campo">
          <label htmlFor="admin-fb-desde">De</label>
          <input id="admin-fb-desde" type="date" value={rascunho.desde} max={rascunho.ate || undefined} onChange={mudar('desde')} />
        </div>
        <div className="admin-feedbacks__campo">
          <label htmlFor="admin-fb-ate">Até</label>
          <input id="admin-fb-ate" type="date" value={rascunho.ate} min={rascunho.desde || undefined} onChange={mudar('ate')} />
        </div>
        <div className="admin-feedbacks__acoes">
          <button type="submit" className="admin-visual__botao admin-visual__botao-primario" disabled={ocupado}>Filtrar</button>
          <button type="button" className="admin-visual__botao admin-visual__botao-secundario" disabled={ocupado} onClick={limpar}>Limpar</button>
        </div>
        {aviso && <p id="admin-feedbacks-aviso" role="alert" className="admin-feedbacks__aviso">{aviso}</p>}
      </form>

      <div className="admin-feedbacks__resultado" aria-busy={ocupado}>
        {estado.fase === 'carregando' && <p role="status" className="admin-feedbacks__estado">Lendo os feedbacks…</p>}

        {estado.fase === 'erro' && (
          <div role="alert" className="admin-visual__recibo">
            <h3>Não foi possível ler os feedbacks</h3>
            <p>{estado.erro.message}</p>
            <p className="admin-visual__referencia">Às {hora(estado.erro.hora)} · Referência {estado.erro.ocorrencia}</p>
            <button type="button" className="admin-visual__botao admin-visual__botao-primario" onClick={() => void carregar(aplicados)}>Tentar de novo</button>
          </div>
        )}

        {estado.fase === 'pronto' && (
          <>
            <p role="status" className="admin-feedbacks__estado">
              {estado.itens.length === 0
                ? temFiltro ? 'Nenhum feedback com esses filtros.' : 'Ainda não chegou nenhum feedback.'
                : `${estado.itens.length.toLocaleString('pt-BR')} ${estado.itens.length === 1 ? 'feedback' : 'feedbacks'}${estado.haMais ? ' nesta lista, e há mais' : ''}`}
              {' · '}Lido às <time dateTime={estado.lidoEm}>{hora(estado.lidoEm)}</time>
            </p>
            {estado.itens.length > 0 && (
              <ol className="admin-feedbacks__lista">
                {estado.itens.map((f, i) => (
                  <ItemFeedback key={f.id} f={f} ancora={i === focarApos.current ? primeiroNovo : undefined}
                    aberto={editando === f.id} salvo={salvo?.id === f.id ? salvo.em : null} abrir={() => alternarGestao(f)}
                    gestao={editando === f.id && formG
                      ? { f, form: formG, salvando, aviso: avisoG, erro: erroG, confirmando, mudar: mudarG, enviar: (e) => void salvarGestao(e), cancelar: () => fecharGestao(f.id) }
                      : null} />
                ))}
              </ol>
            )}
            {erroMais && (
              <div role="alert" className="admin-visual__recibo">
                <h3>Não foi possível carregar mais</h3>
                <p>{erroMais.message}</p>
                <p className="admin-visual__referencia">Às {hora(erroMais.hora)} · Referência {erroMais.ocorrencia}</p>
              </div>
            )}
            {estado.haMais && (
              <button type="button" className="admin-visual__botao admin-visual__botao-secundario admin-feedbacks__mais"
                disabled={estado.mais === 'carregando'} onClick={() => void carregarMais()}>
                {estado.mais === 'carregando' ? 'Carregando…' : erroMais ? 'Tentar carregar mais' : 'Carregar mais 50'}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
