import { useEffect, useRef } from 'react';
import { View } from 'react-native';

// Mesma grade nas 4 seções que a usam (FAQ, Reconhece isso, Inteligência
// financeira, Preços) — uma versão anterior variava o desenho por seção
// (pontos, diagonal, grade fina...), revertida a pedido do autor.
const IMAGEM_BASE =
  'linear-gradient(rgba(175,255,227,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(175,255,227,0.1) 1px, transparent 1px)';
// MESMO desenho, só que mais forte (0.5 de alfa) — é essa cópia que o brilho
// do cursor revela através da máscara circular, criando o efeito de "acender"
// a textura por baixo do mouse.
const IMAGEM_BRILHO =
  'linear-gradient(rgba(175,255,227,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(175,255,227,0.5) 1px, transparent 1px)';
const TAMANHO = '32px 32px';
// Máscara elíptica fixa que concentra a grade toda longe das bordas da
// seção — `farthest-side`, não um raio em %, bate exatamente nas bordas
// REAIS da caixa, independente da proporção largura/altura dela.
const MASCARA_CENTRO = 'radial-gradient(ellipse farthest-side at 50% 50%, black 0%, transparent 65%)';
// Mesma ideia, ao contrário: os dois primeiros stops (`transparent`) fazem
// um círculo apagado no meio; o terceiro (`black`) acende a grade só de 75%
// pra fora — pras seções de fundo mais claro (`Dobra levantada`), onde a
// grade densa no centro (atrás do texto/cards) pesaria demais; nas bordas
// ela só emoldura.
const MASCARA_BORDA = 'radial-gradient(ellipse farthest-side at 50% 50%, transparent 0%, transparent 35%, black 75%)';

/**
 * Textura quadriculada de fundo, presente atrás de 6 seções — com um brilho
 * que acende a grade embaixo do cursor, só na web (a página inteira só
 * renderiza lá).
 *
 * `invertida` (prop) troca qual máscara usar: a padrão (`MASCARA_CENTRO`)
 * concentra a grade no meio da seção e apaga nas bordas — usada nas seções
 * de fundo escuro (FAQ, Reconhece isso, Inteligência financeira, Preços). A
 * invertida (`MASCARA_BORDA`) faz o oposto — grade só nas bordas, círculo
 * apagado no centro — usada nas seções de fundo mais claro (`Dobra
 * levantada`: Como entra o lançamento, Segurança), onde grade densa atrás
 * do texto/cards centrais pesaria demais.
 *
 * **Como o brilho funciona.** Duas cópias do MESMO desenho de grade
 * empilhadas: uma bem apagada, sempre visível; outra bem mais forte, com
 * opacidade 0 e uma segunda máscara — um círculo pequeno que segue o mouse
 * via variáveis CSS (`--mx`/`--my`) — por cima. Onde as duas máscaras se
 * cruzam (a elipse da seção inteira E o círculo do cursor) é onde a cópia
 * forte aparece; fora disso ela fica escondida por uma das duas. O
 * resultado: a MESMA grade parece "acender" perto do cursor, não uma luz
 * solta por cima dela.
 *
 * **Por que `ref` + `addEventListener`, não estado do React.** `mousemove`
 * dispara dezenas de vezes por segundo — passar por `useState` recriaria a
 * árvore inteira a cada evento. Em vez disso, as coordenadas vão direto pro
 * DOM via `style.setProperty`, agrupadas num `requestAnimationFrame` (no
 * máximo uma escrita por frame, não uma por evento) — o mesmo motivo por
 * que `TrustMarquee`/`GlowOrb` já evitam `setState` a cada frame nesta
 * página. Sem contador de resize/estado nenhum: só CSS reagindo a duas
 * variáveis.
 */
export default function GradeInterativa({ invertida }: { invertida?: boolean }) {
  const mascaraCentro = invertida ? MASCARA_BORDA : MASCARA_CENTRO;
  const containerRef = useRef<View>(null);
  const brilhoRef = useRef<View>(null);
  const posPendente = useRef<{ x: number; y: number } | null>(null);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current as unknown as HTMLElement | null;
    const brilho = brilhoRef.current as unknown as HTMLElement | null;
    // O próprio container tem `pointerEvents:'none'` (de propósito — não
    // pode bloquear clique no conteúdo real por cima dele), o que também
    // impede ELE MESMO de ser alvo de `mousemove` — o navegador nunca o
    // escolhe como alvo do evento, então um listener nele nunca dispara.
    // O PAI (`palcoComCamada` em app/index.tsx) não tem essa restrição e
    // cobre exatamente a mesma área (o container é `inset:0` dele) — os
    // eventos de mouse sobre QUALQUER coisa lá dentro (fundo, botão, card)
    // borbulham até ele normalmente, `pointer-events:none` só afeta se o
    // PRÓPRIO elemento pode ser alvo, não se eventos atravessam ele como
    // ancestral.
    const pai = container?.parentElement ?? null;
    if (!container || !brilho || !pai) return;

    let cachedRect: DOMRect | null = null;
    let dentro = false;
    let ultimoPonteiro: { clientX: number; clientY: number } | null = null;

    function agendarAplicacao() {
      if (rafId.current === null) rafId.current = requestAnimationFrame(aplicar);
    }

    function atualizarRect() {
      if (!container || !dentro) return;
      cachedRect = container.getBoundingClientRect();
      if (ultimoPonteiro) {
        posPendente.current = {
          x: ultimoPonteiro.clientX - cachedRect.left,
          y: ultimoPonteiro.clientY - cachedRect.top,
        };
        agendarAplicacao();
      }
    }

    function entrar() {
      dentro = true;
      atualizarRect();
      if (brilho) brilho.style.opacity = '1';
    }

    function aplicar() {
      if (!brilho || !posPendente.current) return;
      brilho.style.setProperty('--mx', `${posPendente.current.x}px`);
      brilho.style.setProperty('--my', `${posPendente.current.y}px`);
      rafId.current = null;
    }

    function mover(e: MouseEvent) {
      if (!cachedRect) atualizarRect();
      if (!cachedRect) return;
      ultimoPonteiro = { clientX: e.clientX, clientY: e.clientY };
      posPendente.current = { x: e.clientX - cachedRect.left, y: e.clientY - cachedRect.top };
      agendarAplicacao();
    }

    function sair() {
      dentro = false;
      cachedRect = null;
      ultimoPonteiro = null;
      if (brilho) brilho.style.opacity = '0';
    }

    // O scroll real desta página acontece numa div interna (o `ScrollView`
    // do react-native-web renderiza como `overflow` numa div, não como
    // rolagem da `window` — mesmo fato documentado em `context.md`), então
    // um listener de `scroll` em `window` nunca dispara aqui. Sem ele, o
    // retângulo cacheado do container ficava desatualizado assim que a
    // seção se movia sob um cursor parado, dessincronizando o brilho da
    // posição real do mouse. A correção: subir a árvore de `pai` até achar
    // o ancestral que realmente rola, e escutar o scroll NELE.
    function encontrarAncestralRolavel(no: HTMLElement | null): HTMLElement | Window {
      let atual = no;
      while (atual) {
        const estilo = getComputedStyle(atual);
        const rola = estilo.overflowY === 'auto' || estilo.overflowY === 'scroll';
        if (rola && atual.scrollHeight > atual.clientHeight) return atual;
        atual = atual.parentElement;
      }
      return window;
    }
    const ancestralRolavel = encontrarAncestralRolavel(pai);

    pai.addEventListener('mouseenter', entrar);
    pai.addEventListener('mousemove', mover);
    pai.addEventListener('mouseleave', sair);
    window.addEventListener('resize', atualizarRect, { passive: true });
    ancestralRolavel.addEventListener('scroll', atualizarRect, { passive: true });

    return () => {
      pai.removeEventListener('mouseenter', entrar);
      pai.removeEventListener('mousemove', mover);
      pai.removeEventListener('mouseleave', sair);
      window.removeEventListener('resize', atualizarRect);
      ancestralRolavel.removeEventListener('scroll', atualizarRect);
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, []);

  return (
    <View ref={containerRef} style={[estiloAbsoluto, { pointerEvents: 'none' }]} >
      <View
        style={[
          estiloAbsoluto,
          {
            ...({
              backgroundImage: IMAGEM_BASE,
              backgroundSize: TAMANHO,
              maskImage: mascaraCentro,
              WebkitMaskImage: mascaraCentro,
            } as any),
          },
        ]}
      />
      <View
        ref={brilhoRef}
        style={[
          estiloAbsoluto,
          {
            ...({
              backgroundImage: IMAGEM_BRILHO,
              backgroundSize: TAMANHO,
              opacity: 0,
              transitionProperty: 'opacity',
              transitionDuration: '220ms',
              // A composição de duas máscaras (a elipse da seção + o círculo
              // do cursor) só é possível porque é uma ÚNICA regra
              // `mask-image` com dois valores separados por vírgula e
              // `mask-composite: intersect` — CSS não deixa aplicar duas
              // props `maskImage` separadas no mesmo elemento.
              maskImage: `${mascaraCentro}, radial-gradient(circle 180px at var(--mx, 50%) var(--my, 50%), black 0%, transparent 100%)`,
              WebkitMaskImage: `${mascaraCentro}, radial-gradient(circle 180px at var(--mx, 50%) var(--my, 50%), black 0%, transparent 100%)`,
              maskComposite: 'intersect',
              WebkitMaskComposite: 'source-in',
            } as any),
          },
        ]}
      />
    </View>
  );
}

const estiloAbsoluto = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
