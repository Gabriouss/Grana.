import type { ReactElement } from 'react';
import {
  AVISO_DUBLE, ESTADOS_PUBLICACAO, destinosDuble, podeRepetirEnvio, resumoDestinos, seloDoDestino, urlSegura,
  type DestinoPublicacao, type IconePublicacao, type SeloPublicacao,
} from '@/lib/admin-notificacoes';
import './central-notificacoes.css';

const TRACOS: Record<IconePublicacao | 'sino' | 'fechar', ReactElement> = {
  sino: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
  fechar: <path d="m6 6 12 12M18 6 6 18" />,
  calendario: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h3" /></>,
  relogio: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  'relogio-ok': <><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 1.5M15 17l2.2 2.2L22 14" /></>,
  progresso: <><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /><path d="M12 8v4l2.5 1.5" /></>,
  ok: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
  'relogio-alerta': <><circle cx="10" cy="11" r="7" /><path d="M10 7v4l2.5 1.5M19 8v5M19 17h.01" /></>,
  cancelar: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>,
  alerta: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
  pergunta: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 4.6 1.4c-.8 1.1-2.2 1.4-2.2 3M12 17h.01" /></>,
};

export function Icone({ nome, pequeno = false }: { nome: IconePublicacao | 'sino' | 'fechar'; pequeno?: boolean }) {
  return <svg className={`cn-icone${pequeno ? ' cn-icone-pequeno' : ''}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{TRACOS[nome]}</svg>;
}

export function SeloEstado({ selo }: { selo: SeloPublicacao }) {
  return <span className={`cn-selo cn-selo-${selo.classe}`}><Icone nome={selo.icone} pequeno />{selo.rotulo}</span>;
}

const hhmm = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null);

function Destino({ d }: { d: DestinoPublicacao }) {
  const selo = seloDoDestino(d);
  const url = urlSegura(d.urlPublicacao);
  const confirmado = hhmm(d.confirmadoEm);
  const consulta = hhmm(d.consultadoEm);
  return (
    <section className="cn-destino" aria-label={`${d.destino}: ${selo.rotulo}`}>
      <div className="cn-destino-topo"><h4>{d.destino}</h4><SeloEstado selo={selo} /></div>
      {confirmado && <p>Confirmado às {confirmado}</p>}
      {!confirmado && selo.estado === 'precisa-conferir' && <p>Resultado ainda não confirmado.</p>}
      {consulta && <p>Última consulta às {consulta}</p>}
      <p>{selo.significado}</p>
      <div className="cn-acoes">
        {/* Ações ligam quando a fundação remota existir; hoje só o dublê, então ficam visíveis e desativadas. */}
        <button type="button" className="cn-botao" aria-disabled="true" disabled>{selo.proximoPasso}</button>
        {url && <a className="cn-botao" href={url} target="_blank" rel="noopener noreferrer">Abrir publicação</a>}
      </div>
      {!podeRepetirEnvio(d) && <p>Repetir o envio fica bloqueado para este destino.</p>}
    </section>
  );
}

export default function PublicacoesEstados() {
  const agora = new Date();
  const destinos = destinosDuble(agora);
  const resumo = resumoDestinos(destinos);
  const conferir = destinos.some((d) => seloDoDestino(d).estado === 'precisa-conferir');
  const data = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 3, 18, 0);
  return (
    <section className="cn-publicacoes" aria-labelledby="cn-publicacoes-titulo">
      <h2 id="cn-publicacoes-titulo" tabIndex={-1}>Publicações</h2>
      <p className="cn-apoio">{AVISO_DUBLE} Cada destino tem o próprio estado e o próprio recibo.</p>
      <article className="cn-cartao">
        <p className="cn-apoio">PUBLICAÇÃO · REEL</p>
        <h3>Organizar as contas do mês</h3>
        <p className="cn-apoio">Versão 7 · {data.toLocaleDateString('pt-BR')} às {data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · Brasília (UTC-03)</p>
        {conferir && (
          <div role="note" className="cn-bloco cn-bloco-atencao">
            <h3>Um destino precisa conferir</h3>
            <p className="cn-apoio">Confira o resultado antes de repetir o envio.</p>
          </div>
        )}
        <div className="cn-destinos">{destinos.map((d) => <Destino key={d.destino} d={d} />)}</div>
        <p className="cn-apoio" style={{ marginTop: 16 }}>{resumo.texto}</p>
      </article>

      <h3 style={{ marginTop: 28, fontSize: 18 }}>Estados de publicação</h3>
      <ul className="cn-legenda">
        {ESTADOS_PUBLICACAO.map((e) => {
          const selo = seloDoDestino({ destino: '', estado: e, idRemoto: 'x', confirmadoEm: 'x', consultadoEm: 'x' });
          return <li key={e}><SeloEstado selo={selo} /><span className="cn-texto">{selo.significado}</span></li>;
        })}
      </ul>
    </section>
  );
}
