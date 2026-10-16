import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react';
import {
  ErroAdmin, listarFeedbacksAdmin, reciboLocal,
  type FeedbackAdmin, type FiltrosFeedbacks, type TipoFeedback,
} from '@/lib/admin-web';

// Leitura dos feedbacks do app (B3b, 15/10/2026). Só leitura: nada aqui muda status nem
// apaga. A superfície final da gestão ainda é decisão do autor; esta seção vive dentro do
// /admin web e não depende de nada além dele.

// Mesmas palavras do FeedbackModal do app, para o admin ler o que a pessoa escolheu.
const TIPOS: { valor: TipoFeedback; rotulo: string }[] = [
  { valor: 'suggestion', rotulo: 'Sugestão' },
  { valor: 'bug', rotulo: 'Problema' },
  { valor: 'praise', rotulo: 'Elogio' },
  { valor: 'other', rotulo: 'Outro' },
];
const ROTULO_TIPO = Object.fromEntries(TIPOS.map((t) => [t.valor, t.rotulo])) as Record<TipoFeedback, string>;
const ROTULO_STATUS = { pending: 'Pendente', reviewed: 'Revisado', resolved: 'Resolvido' } as const;

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

function ItemFeedback({ f, ancora }: { f: FeedbackAdmin; ancora?: Ref<HTMLLIElement> }) {
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
          <span>{ROTULO_STATUS[f.status]}</span>
          {f.usoPublicoAutorizado && <span className="admin-feedbacks__publico">Autorizou uso público</span>}
        </footer>
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
  });

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
        <p>O que as pessoas mandaram pelo app, dos mais novos para os mais antigos. Só leitura.</p>
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
                {estado.itens.map((f, i) => <ItemFeedback key={f.id} f={f} ancora={i === focarApos.current ? primeiroNovo : undefined} />)}
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
