import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ErroAdmin, listarCorrecoesCriativos, pedirNovoAjusteCriativo, reciboLocal,
  type CorrecaoCriativo, type EstadoCorrecao,
} from '@/lib/admin-web';
import './correcoes-criativos.css';

// Correções de criativos (Entrega 3, 16/10/2026). Mostra a fila de ajustes que o painel local
// entrega ao agente, com o andamento de cada pedido, e deixa pedir OUTRO ajuste sobre uma
// versão corrigida. O aceite não acontece aqui: ele grava a evidência datada do autor no acervo
// versionado, que só o painel local alcança. A tela diz isso em vez de oferecer um botão que
// pareceria aceitar. A prévia das artes também não vem para o navegador ainda (a mídia remota
// não está ativa): a tela mostra as versões por identificador e avisa.

const LIMITE_TEXTO = 2000;
const ESTADOS: Record<EstadoCorrecao, { rotulo: string; proximo: string }> = {
  novo: { rotulo: 'Na fila', proximo: 'Aguardando o painel local entregar o pedido ao agente.' },
  'em-correcao': { rotulo: 'Em correção', proximo: 'O agente está corrigindo. Nada a fazer agora.' },
  'corrigido-aguardando-aceite': { rotulo: 'Pronto para sua revisão', proximo: 'Revise a versão corrigida e decida: pedir outro ajuste ou aceitar no painel local.' },
  aceito: { rotulo: 'Aceito', proximo: 'Versão aceita. A publicação continua sendo uma decisão à parte.' },
  'falha-de-envio': { rotulo: 'Falha ao entregar ao agente', proximo: 'Abra o painel local: ele mostra o motivo e permite tentar de novo.' },
  desatualizado: { rotulo: 'Desatualizado', proximo: 'A peça mudou depois do pedido. Abra a versão vigente e peça de novo, se ainda precisar.' },
  'aguardando-aprovacao-de-custo': { rotulo: 'Aguardando sua decisão de custo', proximo: 'Decida o custo na conversa com o Orquestrador. Nada é gasto sem o seu sim.' },
  'precisa-de-atencao': { rotulo: 'Precisa de atenção', proximo: 'Abra o painel local para reenviar ou encerrar o pedido.' },
  encerrado: { rotulo: 'Encerrado', proximo: 'Pedido encerrado por você.' },
  'recusado-pelo-autor': { rotulo: 'Recusado', proximo: 'Pedido recusado por você.' },
};

const curto = (sha: string | null) => (sha ? sha.slice(0, 7) : 'sem registro');
const nomeDaPeca = (c: CorrecaoCriativo) => c.caminho.split('/').pop()!.replace(/\*$/, '') || c.caminho;
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'sem data');
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

type Estado =
  | { fase: 'carregando' }
  | { fase: 'pronto'; itens: CorrecaoCriativo[]; lidoEm: string }
  | { fase: 'erro'; erro: ErroAdmin };

// Prontos para revisão primeiro; dentro de cada grupo, a ordem do servidor (mais novos antes).
export function ordenarCorrecoes(itens: CorrecaoCriativo[]): CorrecaoCriativo[] {
  const prontos = itens.filter((c) => c.estado === 'corrigido-aguardando-aceite');
  return [...prontos, ...itens.filter((c) => c.estado !== 'corrigido-aguardando-aceite')];
}

function ItemCorrecao({ c, aberto, abrir, children }: { c: CorrecaoCriativo; aberto: boolean; abrir: () => void; children?: ReactNode }) {
  const e = ESTADOS[c.estado];
  const pronto = c.estado === 'corrigido-aguardando-aceite';
  return (
    <li className="admin-correcoes__item">
      <article aria-label={`${nomeDaPeca(c)}, ${e.rotulo}`}>
        <header className="admin-correcoes__topo">
          <h3 className="admin-correcoes__peca">{nomeDaPeca(c)}</h3>
          <span className={`admin-correcoes__estado admin-correcoes__estado-${c.estado}`}>{e.rotulo}</span>
          <span className="admin-correcoes__quando">Pedido de <time dateTime={c.criadoEm ?? undefined}>{quando(c.criadoEm)}</time></span>
        </header>
        <p className="admin-correcoes__proximo">{e.proximo}</p>
        {pronto && (
          <div className="admin-correcoes__comparacao" role="group" aria-label="Comparação entre a versão pedida e a corrigida">
            <div>
              <h4>Antes (versão pedida)</h4>
              <p className="admin-correcoes__sha">{curto(c.versaoAlvo)}</p>
            </div>
            <div>
              <h4>Depois (versão corrigida)</h4>
              <p className="admin-correcoes__sha">{curto(c.versaoCorrigida)}</p>
              <p className="admin-correcoes__commit">Commit {curto(c.commit)}</p>
            </div>
            <p className="admin-correcoes__previa">A prévia das artes ainda não abre aqui: a mídia remota não está ativa. Veja as duas versões no painel local, que mostra a imagem e o aceite.</p>
          </div>
        )}
        <p className="admin-correcoes__rodape">
          Peça {c.pecaId.slice(0, 8)}
          {c.estado === 'aceito' && c.aceiteEm ? <> · Aceito em <time dateTime={c.aceiteEm}>{quando(c.aceiteEm)}</time></> : null}
          {c.tentativas > 0 ? ` · ${c.tentativas} ${c.tentativas === 1 ? 'tentativa' : 'tentativas'} de entrega` : ''}
        </p>
        {pronto && (
          <div className="admin-correcoes__acoes">
            <button type="button" id={`admin-corr-pedir-${c.id}`} className="admin-visual__botao admin-visual__botao-secundario"
              aria-expanded={aberto} aria-controls={`admin-corr-form-${c.id}`} onClick={abrir}>
              {aberto ? 'Fechar' : 'Pedir outro ajuste'}
            </button>
            <p className="admin-correcoes__aceite">Para aceitar, use o painel local: ele guarda a evidência datada do aceite. O aceite vale só para a versão {curto(c.versaoCorrigida)}.</p>
          </div>
        )}
        {aberto && children}
      </article>
    </li>
  );
}

export default function CorrecoesCriativos() {
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [erroPedido, setErroPedido] = useState<ErroAdmin | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<{ id: string; em: string } | null>(null);
  const versao = useRef(0);
  const focoNoGatilho = useRef<string | null>(null);

  const falha = (error: unknown) => {
    const recibo = error instanceof ErroAdmin ? error : reciboLocal('rede', 'Não foi possível ler as correções. Tente de novo.');
    // Só código e referência: nunca o texto de um pedido.
    console.warn('[admin-correcoes]', recibo.codigo, recibo.ocorrencia);
    return recibo;
  };

  async function carregar() {
    const atual = ++versao.current;
    setEstado({ fase: 'carregando' });
    try {
      const r = await listarCorrecoesCriativos();
      if (atual !== versao.current) return;
      setEstado({ fase: 'pronto', itens: ordenarCorrecoes(r.dados.pedidos), lidoEm: r.geradoEm });
    } catch (error) {
      if (atual !== versao.current) return;
      setEstado({ fase: 'erro', erro: falha(error) });
    }
  }

  useEffect(() => {
    void carregar();
    return () => { versao.current++; };
    // Primeira leitura só ao montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ao fechar o formulário, o foco volta ao botão que o abriu.
  useEffect(() => {
    if (focoNoGatilho.current && typeof document !== 'undefined') {
      document.getElementById(`admin-corr-pedir-${focoNoGatilho.current}`)?.focus();
      focoNoGatilho.current = null;
    }
  });

  function fechar(id: string) {
    setEditando(null); setTexto(''); setAviso(null); setErroPedido(null);
    focoNoGatilho.current = id;
  }

  function alternar(c: CorrecaoCriativo) {
    if (editando === c.id) { fechar(c.id); return; }
    setEditando(c.id); setTexto(''); setAviso(null); setErroPedido(null); setEnviado(null);
  }

  async function enviar(evento: FormEvent<HTMLFormElement>, c: CorrecaoCriativo) {
    evento.preventDefault();
    if (enviando) return;
    const limpo = texto.trim();
    if (!limpo) { setAviso('Escreva o que precisa mudar.'); return; }
    if ([...limpo].length > LIMITE_TEXTO) { setAviso(`O pedido aceita até ${LIMITE_TEXTO} caracteres.`); return; }
    // O alvo é a versão que o administrador está vendo, não a vigente de agora: se a peça mudou,
    // o painel local marca o pedido como desatualizado em vez de aplicá-lo à arte errada.
    if (!c.versaoCorrigida) { setAviso('Esta correção não tem versão corrigida registrada.'); return; }
    setEnviando(true); setErroPedido(null); setAviso(null);
    try {
      const r = await pedirNovoAjusteCriativo({ pecaId: c.pecaId, caminho: c.caminho, versaoAlvo: c.versaoCorrigida, texto: limpo });
      setEnviado({ id: c.id, em: r.geradoEm });
      fechar(c.id);
      void carregar();
    } catch (error) {
      // Falha permanente aparece com recibo; o texto digitado fica no formulário.
      setErroPedido(falha(error));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="admin-correcoes" aria-labelledby="admin-correcoes-titulo">
      <header className="admin-correcoes__cabecalho">
        <h2 id="admin-correcoes-titulo">Correções de criativos</h2>
        <p>Os pedidos de ajuste que você abriu e o andamento de cada um. O aceite e a prévia das artes ficam no painel local; aqui você acompanha e pode pedir outro ajuste.</p>
      </header>

      <div className="admin-correcoes__resultado" aria-busy={estado.fase === 'carregando'}>
        {estado.fase === 'carregando' && <p role="status" className="admin-correcoes__estado-lista">Lendo as correções…</p>}

        {estado.fase === 'erro' && (
          <div role="alert" className="admin-visual__recibo">
            <h3>Não foi possível ler as correções</h3>
            <p>{estado.erro.message}</p>
            <p className="admin-visual__referencia">Às {hora(estado.erro.hora)} · Referência {estado.erro.ocorrencia}</p>
            <button type="button" className="admin-visual__botao admin-visual__botao-primario" onClick={() => void carregar()}>Tentar de novo</button>
          </div>
        )}

        {estado.fase === 'pronto' && (
          <>
            <p role="status" className="admin-correcoes__estado-lista">
              {estado.itens.length === 0
                ? 'Você ainda não abriu nenhum pedido de ajuste.'
                : `${estado.itens.length} ${estado.itens.length === 1 ? 'pedido' : 'pedidos'}, ${estado.itens.filter((c) => c.estado === 'corrigido-aguardando-aceite').length} pronto(s) para sua revisão`}
              {' · '}Lido às <time dateTime={estado.lidoEm}>{hora(estado.lidoEm)}</time>
            </p>
            {enviado && <p role="status" className="admin-correcoes__salvo">Pedido enviado às <time dateTime={enviado.em}>{hora(enviado.em)}</time>. Ele entra na fila e o painel local entrega ao agente.</p>}
            {estado.itens.length > 0 && (
              <ol className="admin-correcoes__lista">
                {estado.itens.map((c) => (
                  <ItemCorrecao key={c.id} c={c} aberto={editando === c.id} abrir={() => alternar(c)}>
                    <form id={`admin-corr-form-${c.id}`} className="admin-correcoes__form" onSubmit={(e) => void enviar(e, c)} noValidate aria-label="Pedir outro ajuste">
                      <div className="admin-feedbacks__campo">
                        <label htmlFor="admin-corr-texto">O que precisa mudar na versão {curto(c.versaoCorrigida)}</label>
                        <textarea id="admin-corr-texto" rows={4} value={texto} aria-describedby="admin-corr-dica"
                          onChange={(e) => { setTexto(e.currentTarget.value); setAviso(null); }} />
                        <p id="admin-corr-dica" className="admin-correcoes__dica">Até {LIMITE_TEXTO} caracteres. O novo pedido continua a mesma cadeia desta peça. Não cole dado pessoal nem financeiro.</p>
                      </div>
                      {aviso && <p role="alert" className="admin-feedbacks__aviso">{aviso}</p>}
                      {erroPedido && (
                        <div role="alert" className="admin-visual__recibo">
                          <h3>Não foi possível enviar o pedido</h3>
                          <p>{erroPedido.message}</p>
                          <p className="admin-visual__referencia">Às {hora(erroPedido.hora)} · Referência {erroPedido.ocorrencia}. Nada foi gravado.</p>
                        </div>
                      )}
                      <div className="admin-feedbacks__acoes">
                        <button type="submit" className="admin-visual__botao admin-visual__botao-primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar pedido'}</button>
                        <button type="button" className="admin-visual__botao admin-visual__botao-secundario" disabled={enviando} onClick={() => fechar(c.id)}>Cancelar</button>
                      </div>
                    </form>
                  </ItemCorrecao>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </section>
  );
}
