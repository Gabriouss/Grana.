import { useEffect, useRef, useState, type PointerEvent } from 'react';
import Granabo3D from './Granabo3D';
import { theme } from '@/lib/theme';

type Ponto = { x: number; y: number };
type Retangulo = { left: number; top: number; right: number; bottom: number };
const TAMANHO = 74;
const MARGEM = 12;
const LIMIAR = 6;
const CHAVE = 'grana.granabo.posicao.v1';

/** Desvia de alvos MEDIDOS, inclusive quando a navegação muda de formato. */
export function limitarPosicao(ponto: Ponto, largura: number, altura: number, obstaculos: Retangulo[]): Ponto {
  const maxX = Math.max(0, largura - TAMANHO - MARGEM);
  const maxY = Math.max(0, altura - TAMANHO - MARGEM);
  const limitar = ({ x, y }: Ponto) => ({
    x: Math.max(Math.min(MARGEM, maxX), Math.min(x, maxX)),
    y: Math.max(Math.min(MARGEM, maxY), Math.min(y, maxY)),
  });
  const origem = limitar(ponto);
  const livres = (p: Ponto) => obstaculos.every(r =>
    p.x + TAMANHO + MARGEM <= r.left || p.x >= r.right + MARGEM ||
    p.y + TAMANHO + MARGEM <= r.top || p.y >= r.bottom + MARGEM);
  if (livres(origem)) return origem;
  const xs = [origem.x, MARGEM, maxX, ...obstaculos.flatMap(r => [r.left - TAMANHO - MARGEM, r.right + MARGEM])];
  const ys = [origem.y, MARGEM, maxY, ...obstaculos.flatMap(r => [r.top - TAMANHO - MARGEM, r.bottom + MARGEM])];
  const candidatos = xs.flatMap(x => ys.map(y => limitar({ x, y }))).filter(livres);
  candidatos.sort((a, b) => Math.hypot(a.x - origem.x, a.y - origem.y) - Math.hypot(b.x - origem.x, b.y - origem.y));
  return candidatos[0] ?? origem;
}

export default function GranaboFlutuante({ ativo, onPress }: { ativo: boolean; onPress: () => void }) {
  const [posicao, setPosicao] = useState<Ponto | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const atual = useRef<Ponto>({ x: 0, y: 0 });
  const gesto = useRef<{ id: number; inicio: Ponto; origem: Ponto; moveu: boolean } | null>(null);
  const suprimirClique = useRef(false);

  function posicionar(ponto: Ponto) {
    const obstaculos = Array.from(document.querySelectorAll('[aria-label="Novo lançamento"], [role="tab"]'))
      .map(el => el.getBoundingClientRect())
      .filter(r => r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight);
    const proxima = limitarPosicao(ponto, window.innerWidth, window.innerHeight, obstaculos);
    atual.current = proxima;
    setPosicao(anterior => anterior?.x === proxima.x && anterior?.y === proxima.y ? anterior : proxima);
    return proxima;
  }

  useEffect(() => {
    let inicial = { x: window.innerWidth - TAMANHO - MARGEM, y: window.innerHeight - TAMANHO - MARGEM };
    try {
      const salva = JSON.parse(window.localStorage.getItem(CHAVE) ?? 'null');
      if (salva && Number.isFinite(salva.x) && Number.isFinite(salva.y)) inicial = salva;
    } catch (erro) {
      console.warn('[Granabô] Posição salva indisponível; usando canto padrão.', erro instanceof Error ? erro.name : 'storage');
    }
    posicionar(inicial);
    let quadro = 0;
    const atualizar = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => posicionar(atual.current));
    };
    window.addEventListener('resize', atualizar);
    window.addEventListener('scroll', atualizar, true);
    const observer = new MutationObserver(atualizar);
    observer.observe(document.body, { childList: true, subtree: true });
    const resizeObserver = new ResizeObserver(atualizar);
    resizeObserver.observe(document.body);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener('resize', atualizar);
      window.removeEventListener('scroll', atualizar, true);
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  function mover(event: PointerEvent<HTMLButtonElement>) {
    const inicio = gesto.current;
    if (!inicio || inicio.id !== event.pointerId) return;
    const dx = event.clientX - inicio.inicio.x;
    const dy = event.clientY - inicio.inicio.y;
    if (!inicio.moveu && Math.hypot(dx, dy) < LIMIAR) return;
    inicio.moveu = true;
    suprimirClique.current = true;
    setArrastando(true);
    posicionar({ x: inicio.origem.x + dx, y: inicio.origem.y + dy });
  }

  function terminar(event: PointerEvent<HTMLButtonElement>, cancelado = false) {
    const inicio = gesto.current;
    if (!inicio || inicio.id !== event.pointerId) return;
    suprimirClique.current = inicio.moveu || cancelado;
    if (inicio.moveu) {
      try {
        window.localStorage.setItem(CHAVE, JSON.stringify(atual.current));
      } catch (erro) {
        console.warn('[Granabô] Não foi possível lembrar a posição.', erro instanceof Error ? erro.name : 'storage');
      }
    }
    gesto.current = null;
    setArrastando(false);
  }

  return (
    <button
      type="button"
      aria-label="Abrir Granabô"
      aria-expanded={ativo}
      title="Abrir Granabô · arraste para mover"
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        suprimirClique.current = false;
        gesto.current = { id: event.pointerId, inicio: { x: event.clientX, y: event.clientY }, origem: atual.current, moveu: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={mover}
      onPointerUp={event => terminar(event)}
      onPointerCancel={event => terminar(event, true)}
      onLostPointerCapture={event => terminar(event, true)}
      onClick={event => {
        // detail=0 é a ativação por teclado/tecnologia assistiva, sem gesto.
        if (event.detail === 0 || !suprimirClique.current) onPress();
      }}
      style={{
        position: 'fixed', left: posicao?.x ?? 0, top: posicao?.y ?? 0,
        visibility: posicao ? 'visible' : 'hidden', width: TAMANHO, height: TAMANHO,
        zIndex: 30, padding: 0, border: 0, borderRadius: '50%', background: 'transparent',
        color: theme.accent2, cursor: arrastando ? 'grabbing' : 'grab', touchAction: 'none',
        userSelect: 'none', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span aria-hidden="true" style={{ display: 'flex', pointerEvents: 'none' }}>
        {/* O próprio mascote já respeita prefers-reduced-motion. O arrasto é direto, sem animação. */}
        <Granabo3D tamanho={TAMANHO} variante="botao" estado={ativo ? 'feliz' : 'repouso'} />
      </span>
    </button>
  );
}
