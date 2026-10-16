import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as KeyboardEventReact } from 'react';
import {
  FILTRO_INICIAL, FONTES, IMPORTANCIAS, agrupar, contarNaoLidas, desfazerMarcacao, filtrar, filtrosAtivos,
  marcarIds, marcarLida, marcarTodas, nomeAcessivelSino, notificacoesDuble, rotuloContador, rotuloFonte, rotuloMarcarTodas,
  textoNaoLidas, totalConhecido, type FiltroNotificacoes, type LeituraCentral, type Notificacao,
} from '@/lib/admin-notificacoes';
import { Icone } from './PublicacoesEstados.web';
import './central-notificacoes.css';

type Props = {
  /** Leitura inicial. Sem fundação remota, o padrão é o dublê (marcado como dados de teste). */
  leituraInicial?: LeituraCentral;
  /** Grava a leitura no servidor. Rejeitar mantém lista e contador. */
  persistir?: (ids: string[], lida: boolean) => Promise<void>;
  /** Recarrega a lista. Rejeitar cai em cache antigo, nunca em zero. */
  recarregar?: () => Promise<Notificacao[]>;
};

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function quando(iso: string, agora: Date): string {
  const min = Math.max(0, Math.round((agora.getTime() - Date.parse(iso)) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

const FOCAVEIS = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]';
const PREFS_INICIAIS = [
  { id: 'publicacoes', rotulo: 'Publicações', painel: true },
  { id: 'criativos', rotulo: 'Criativos', painel: true },
  { id: 'feedbacks', rotulo: 'Feedbacks', painel: true },
  { id: 'sistema', rotulo: 'Sistema', painel: true },
  { id: 'novidades', rotulo: 'Novidades', painel: true },
];

export default function CentralNotificacoes({ leituraInicial, persistir, recarregar }: Props) {
  const [leitura, setLeitura] = useState<LeituraCentral>(() =>
    leituraInicial ?? { situacao: 'ok', lista: notificacoesDuble(new Date()), atualizadoEm: new Date().toISOString() });
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState<FiltroNotificacoes>(FILTRO_INICIAL);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [prefsAbertas, setPrefsAbertas] = useState(false);
  const [prefs, setPrefs] = useState(PREFS_INICIAIS);
  const [emailFalhas, setEmailFalhas] = useState(true);
  const [prefsEstado, setPrefsEstado] = useState<'' | 'salvando' | 'salvo' | 'falha'>('');
  const [desfazer, setDesfazer] = useState<string[] | null>(null);
  const [falha, setFalha] = useState('');
  const [aviso, setAviso] = useState('');
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const tituloPrefs = useRef<HTMLHeadingElement>(null);
  const prefsRef = useRef<HTMLDivElement>(null);
  const botaoPrefs = useRef<HTMLButtonElement>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agora = new Date();

  const lista = leitura.situacao === 'ok' ? leitura.lista : leitura.situacao === 'erro' ? leitura.ultima?.lista ?? null : null;
  const atualizadoEm = leitura.situacao === 'ok' ? leitura.atualizadoEm : leitura.situacao === 'erro' ? leitura.ultima?.atualizadoEm ?? null : null;
  const total = totalConhecido(leitura);
  const naoLidas = lista ? contarNaoLidas(lista) : 0;
  const visiveis = useMemo(() => (lista ? filtrar(lista, filtro) : []), [lista, filtro]);
  const grupos = useMemo(() => agrupar(visiveis, new Date()), [visiveis]);
  const totalTodas = lista?.length ?? 0;
  const ativos = filtrosAtivos(filtro);
  const contador = rotuloContador(total);

  const trocarLista = useCallback((f: (l: Notificacao[]) => Notificacao[]) => {
    setLeitura((atual) => {
      if (atual.situacao === 'ok') return { ...atual, lista: f(atual.lista) };
      if (atual.situacao === 'erro' && atual.ultima) return { ...atual, ultima: { ...atual.ultima, lista: f(atual.ultima.lista) } };
      return atual;
    });
  }, []);

  const fechar = useCallback(() => { setAberto(false); setPrefsAbertas(false); }, []);

  // Fundo inerte, foco inicial no título, Tab preso, Esc e Fechar devolvem o foco ao sino.
  useEffect(() => {
    if (!aberto) return;
    // Sem portal (o projeto não tem tipos de react-dom): o painel fica dentro do sino e o fundo inerte são
    // os irmãos de cada ancestral do painel até a raiz do /admin, inclusive o próprio botão do sino.
    const inertes: HTMLElement[] = [];
    for (let atual: HTMLElement | null = painel.current?.parentElement?.parentElement ?? null, vindo: HTMLElement | null = painel.current?.parentElement ?? null; atual && vindo; vindo = atual, atual = atual.parentElement) {
      for (const irmao of Array.from(atual.children) as HTMLElement[]) {
        if (irmao !== vindo && !irmao.hasAttribute('inert')) { irmao.setAttribute('inert', ''); inertes.push(irmao); }
      }
      if (atual.classList.contains('admin-visual')) break;
    }
    titulo.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); if (prefsAbertas) { setPrefsAbertas(false); } else { setAberto(false); } return; }
      if (e.key !== 'Tab') return;
      const contexto = prefsAbertas ? prefsRef.current : painel.current;
      const itens = contexto ? Array.from(contexto.querySelectorAll<HTMLElement>(FOCAVEIS)).filter((el) => el.offsetParent !== null || el === document.activeElement) : [];
      if (!itens.length) { e.preventDefault(); return; }
      const primeiro = itens[0], ultimo = itens[itens.length - 1];
      if (e.shiftKey && (document.activeElement === primeiro || !contexto?.contains(document.activeElement))) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && (document.activeElement === ultimo || !contexto?.contains(document.activeElement))) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      for (const el of inertes) el.removeAttribute('inert');
    };
  }, [aberto, prefsAbertas]);

  const primeiraAbertura = useRef(true);
  useEffect(() => {
    if (primeiraAbertura.current) { primeiraAbertura.current = false; return; }
    if (!aberto) botao.current?.focus();
  }, [aberto]);

  // Só reage a abrir/fechar as preferências: abrir a central não pode roubar o foco do título.
  const prefsAntes = useRef(false);
  useEffect(() => {
    if (prefsAntes.current === prefsAbertas) return;
    prefsAntes.current = prefsAbertas;
    if (prefsAbertas) tituloPrefs.current?.focus(); else botaoPrefs.current?.focus();
  }, [prefsAbertas]);

  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);

  async function gravar(ids: string[], lida: boolean) {
    if (persistir) await persistir(ids, lida);
  }

  async function marcarUma(id: string) {
    setFalha('');
    try {
      await gravar([id], true);
      trocarLista((l) => marcarLida(l, id));
    } catch {
      console.warn('[admin-notificacoes] marcar-lida-falhou');
      setFalha('Não foi possível marcar como lida. Tente de novo.');
    }
  }

  async function marcarTudo() {
    if (!lista) return;
    setFalha('');
    const { ids } = marcarTodas(lista, Date.now());
    if (!ids.length) return;
    try {
      await gravar(ids, true);
      // Aplica por id sobre a lista de agora: o que chegou durante a gravação continua não lido.
      trocarLista((l) => marcarIds(l, ids));
      setDesfazer(ids);
      setAviso(`${ids.length === 1 ? '1 notificação marcada' : `${ids.length} notificações marcadas`} como ${ids.length === 1 ? 'lida' : 'lidas'}.`);
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => { setDesfazer(null); setAviso(''); }, 8000);
    } catch {
      console.warn('[admin-notificacoes] marcar-todas-falhou');
      setFalha('Não foi possível marcar como lidas. Contador e lista não mudaram.');
    }
  }

  async function desfazerTudo() {
    const ids = desfazer;
    if (!ids) return;
    if (temporizador.current) clearTimeout(temporizador.current);
    setDesfazer(null); setAviso('');
    try {
      await gravar(ids, false);
      trocarLista((l) => desfazerMarcacao(l, ids));
    } catch {
      console.warn('[admin-notificacoes] desfazer-falhou');
      setFalha('Não foi possível desfazer. As notificações continuam lidas.');
    }
  }

  async function atualizar() {
    if (!recarregar) { setLeitura((a) => (a.situacao === 'erro' ? { situacao: 'ok', lista: notificacoesDuble(new Date()), atualizadoEm: new Date().toISOString() } : a)); return; }
    setLeitura({ situacao: 'carregando' });
    try {
      setLeitura({ situacao: 'ok', lista: await recarregar(), atualizadoEm: new Date().toISOString() });
    } catch {
      console.warn('[admin-notificacoes] atualizar-falhou');
      setLeitura({ situacao: 'erro', ultima: lista && atualizadoEm ? { lista, atualizadoEm } : undefined });
    }
  }

  function abrirAcao(n: Notificacao) {
    fechar();
    const alvo = n.fonte === 'feedbacks' ? 'admin-feedbacks-titulo' : n.fonte === 'publicacoes' || n.fonte === 'criativos' ? 'cn-publicacoes-titulo' : 'admin-titulo';
    // O foco vai ao título do destino, depois que a central devolve o fundo ao uso.
    setTimeout(() => {
      const el = document.getElementById(alvo) ?? document.getElementById('admin-titulo');
      if (el) { if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1'); el.focus(); el.scrollIntoView?.({ block: 'start' }); }
    }, 0);
  }

  function aoTeclarAba(e: KeyboardEventReact<HTMLButtonElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const proxima = filtro.aba === 'nao-lidas' ? 'todas' : 'nao-lidas';
    setFiltro({ ...filtro, aba: proxima });
    queueMicrotask(() => document.getElementById(`cn-aba-${proxima}`)?.focus());
  }

  async function salvarPref(id: string, painelAtivo: boolean) {
    const anterior = prefs;
    setPrefs((p) => p.map((x) => (x.id === id ? { ...x, painel: painelAtivo } : x)));
    setPrefsEstado('salvando');
    try {
      if (persistir) await persistir([`pref:${id}`], painelAtivo);
      setPrefsEstado('salvo');
    } catch { console.warn('[admin-notificacoes] preferencia-falhou'); setPrefs(anterior); setPrefsEstado('falha'); }
  }

  const rotuloSino = nomeAcessivelSino(total);
  const cabecalhoTotal = total === null ? 'Contagem indisponível' : textoNaoLidas(naoLidas);

  return (
    <div className="cn-sino">
      <button
        ref={botao} type="button" className={`cn-botao cn-botao-icone${total === null ? ' cn-sino-indisponivel' : ''}`}
        aria-label={rotuloSino} aria-haspopup="dialog" aria-expanded={aberto} onClick={() => setAberto(true)}
      >
        <Icone nome="sino" />
        {contador && <span className="cn-contador" aria-hidden="true">{contador}</span>}
        {total === null && <span className="cn-contador" aria-hidden="true">!</span>}
      </button>
      <span role="status" aria-live="polite" className="admin-visual__sr" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
        {aberto ? '' : total === null ? '' : textoNaoLidas(total)}
      </span>

      {aberto && (
        <div className={`cn-raiz${filtrosAbertos ? ' cn-filtros-abertos' : ''}`}>
          <div className="cn-cortina" onClick={fechar} aria-hidden="true" />
          <div ref={painel} className="cn-painel" role="dialog" aria-modal="true" aria-labelledby="cn-titulo" tabIndex={-1}>
            <header className="cn-cabecalho">
              <div>
                <h2 id="cn-titulo" ref={titulo} tabIndex={-1}>Notificações</h2>
                <p className="cn-apoio">{cabecalhoTotal} · dados de teste</p>
              </div>
              <button type="button" className="cn-botao cn-botao-icone" aria-label="Fechar notificações" onClick={fechar}>
                <Icone nome="fechar" />
              </button>
            </header>

            <div className="cn-rolagem">
              {leitura.situacao === 'carregando' && <p role="status" className="cn-bloco" style={{ marginTop: 16 }}>Carregando notificações…</p>}

              {leitura.situacao === 'erro' && (
                <div role="alert" className="cn-bloco cn-bloco-atencao" style={{ marginTop: 16 }}>
                  {atualizadoEm ? <>
                    <h3>Sem atualização desde {hhmm(atualizadoEm)}</h3>
                    <p className="cn-apoio">Mostrando a última lista salva. O contador mostra o último número conhecido.</p>
                  </> : <>
                    <h3>Não foi possível carregar as notificações.</h3>
                    <p className="cn-apoio">Tente de novo quando a conexão estiver disponível.</p>
                  </>}
                  <div className="cn-acoes"><button type="button" className="cn-botao cn-botao-primario" onClick={() => void atualizar()}>Tentar de novo</button></div>
                </div>
              )}

              {lista && (
                <>
                  <div role="tablist" aria-label="Filtro de notificações" className="cn-abas" style={{ marginTop: 8 }}>
                    <button id="cn-aba-nao-lidas" type="button" role="tab" className="cn-aba" aria-selected={filtro.aba === 'nao-lidas'} tabIndex={filtro.aba === 'nao-lidas' ? 0 : -1}
                      onKeyDown={aoTeclarAba} onClick={() => setFiltro({ ...filtro, aba: 'nao-lidas' })}>Não lidas ({naoLidas})</button>
                    <button id="cn-aba-todas" type="button" role="tab" className="cn-aba" aria-selected={filtro.aba === 'todas'} tabIndex={filtro.aba === 'todas' ? 0 : -1}
                      onKeyDown={aoTeclarAba} onClick={() => setFiltro({ ...filtro, aba: 'todas' })}>Todas ({totalTodas})</button>
                  </div>

                  <button type="button" className="cn-botao cn-filtros-alternar" aria-expanded={filtrosAbertos} aria-controls="cn-filtros" onClick={() => setFiltrosAbertos((v) => !v)}>
                    <span>Filtros</span><span>{ativos === 1 ? '1 ativo' : `${ativos} ativos`}</span>
                  </button>
                  <div id="cn-filtros" className="cn-filtros">
                    <label>Fonte
                      <select value={filtro.fonte} onChange={(e) => setFiltro({ ...filtro, fonte: e.currentTarget.value as FiltroNotificacoes['fonte'] })}>
                        {FONTES.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
                      </select>
                    </label>
                    <label>Importância
                      <select value={filtro.importancia} onChange={(e) => setFiltro({ ...filtro, importancia: e.currentTarget.value as FiltroNotificacoes['importancia'] })}>
                        {IMPORTANCIAS.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
                      </select>
                    </label>
                  </div>

                  {falha && <p role="alert" className="cn-bloco cn-bloco-atencao">{falha}</p>}

                  {grupos.length === 0 && (
                    <div className="cn-bloco" role="status">
                      {filtro.aba === 'nao-lidas' && ativos === 0
                        ? <><h3>Você está em dia.</h3><p className="cn-apoio">Nenhuma notificação não lida.</p></>
                        : <><h3>Nenhuma notificação com estes filtros.</h3>
                          <div className="cn-acoes"><button type="button" className="cn-botao" onClick={() => setFiltro(FILTRO_INICIAL)}>Limpar filtros</button></div></>}
                    </div>
                  )}

                  {grupos.map((g) => (
                    <section key={g.rotulo} aria-label={g.rotulo}>
                      <p className="cn-grupo">{g.rotulo}</p>
                      {g.itens.map((n) => (
                        <article key={n.id} className="cn-item">
                          <p className="cn-meta" style={{ marginTop: 0 }}>{rotuloFonte(n.fonte)} · {quando(n.criadoEm, agora)} · {n.importancia === 'agir' ? 'Precisa agir' : 'Informação'}{n.resolvida ? ' · Resolvida' : ''}</p>
                          <h3>{n.titulo}</h3>
                          <p>{n.resumo}</p>
                          {!n.lida && <p className="cn-nao-lida">Não lida</p>}
                          <div className="cn-acoes">
                            {n.acao && <button type="button" className="cn-botao cn-botao-primario" onClick={() => abrirAcao(n)}>{n.acao}</button>}
                            {!n.lida && <button type="button" className="cn-botao cn-botao-texto" onClick={() => void marcarUma(n.id)}>Marcar como lida</button>}
                          </div>
                        </article>
                      ))}
                    </section>
                  ))}
                </>
              )}
            </div>

            <footer className="cn-rodape">
              {lista && (
                <div className="cn-rodape-marcar">
                  {desfazer
                    ? <button type="button" className="cn-botao" onClick={() => void desfazerTudo()}>Desfazer</button>
                    : <button type="button" className="cn-botao" disabled={naoLidas === 0} onClick={() => void marcarTudo()}>{rotuloMarcarTodas(naoLidas)}</button>}
                  <p className="cn-apoio" aria-live="polite">{aviso || 'Inclui todos os filtros. Dados de teste, nada é enviado.'}</p>
                </div>
              )}
              <div className="cn-rodape-linha">
                <button ref={botaoPrefs} type="button" className="cn-botao" aria-haspopup="dialog" onClick={() => setPrefsAbertas(true)}>Preferências</button>
                <p className="cn-apoio">{atualizadoEm ? `Atualizado às ${hhmm(atualizadoEm)}` : 'Sem atualização'}</p>
              </div>
            </footer>

            {prefsAbertas && (
              <div className="cn-dialogo-pref">
                <div ref={prefsRef} role="dialog" aria-modal="true" aria-labelledby="cn-pref-titulo">
                  <h2 id="cn-pref-titulo" ref={tituloPrefs} tabIndex={-1} style={{ fontSize: 20 }}>Notificações por tipo</h2>
                  <p className="cn-apoio" style={{ margin: '8px 0 12px' }}>Desligar não apaga a ocorrência do painel nem resolve o incidente.</p>
                  {prefs.map((p) => (
                    <label key={p.id} className="cn-pref">
                      <span>{p.rotulo} no painel</span>
                      <input type="checkbox" checked={p.painel} onChange={(e) => void salvarPref(p.id, e.currentTarget.checked)} />
                    </label>
                  ))}
                  <label className="cn-pref">
                    <span>E-mail só para falhas importantes</span>
                    <input type="checkbox" checked={emailFalhas} onChange={(e) => { setEmailFalhas(e.currentTarget.checked); setPrefsEstado('salvo'); }} />
                  </label>
                  <p className="cn-apoio" role="status" style={{ margin: '12px 0' }}>
                    {prefsEstado === 'salvando' ? 'Salvando…' : prefsEstado === 'salvo' ? 'Preferências salvas (dados de teste).' : prefsEstado === 'falha' ? 'Não foi possível salvar. Tente de novo.' : ''}
                  </p>
                  <button type="button" className="cn-botao cn-botao-primario" onClick={() => setPrefsAbertas(false)}>Fechar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
