import type { ReactNode, ReactPortal } from 'react';
import MolduraNavegador from '@/components/MolduraNavegador';
import { useReducedMotion } from '@/lib/motion';
import type { PropsPainelWebAmpliado } from './PainelWebAmpliado';

// O projeto não tem @types/react-dom; o react-dom vem com o react-native-web.
const { createPortal } = require('react-dom') as { createPortal: (filho: ReactNode, alvo: Element) => ReactPortal };

/* O painel web ampliado a 70% da largura da tela (autor, 21/10/2026: "para que o
   usuário consiga visualizar a home na web melhor"). Vai num portal fixo no `body`
   porque a dobra tem ancestrais com `overflow: hidden`, que cortariam um `scale` no
   lugar. Sem estado de transição: entra por keyframe e sai de uma vez, para nunca
   ficar presa no meio do caminho. */
const FRACAO_TELA = 0.7;
// Altura da MolduraNavegador por largura: tela 1440x900 (0,625) + barra (0,055).
const ALTURA_POR_LARGURA = 0.68;

let estiloInjetado = false;
function injetarEstilo() {
  if (estiloInjetado) return;
  estiloInjetado = true;
  const tag = document.createElement('style');
  tag.textContent = `
    @keyframes painelWebAmpliar { from { opacity: 0; transform: scale(0.82); } to { opacity: 1; transform: scale(1); } }
    @keyframes painelWebVeu { from { opacity: 0; } to { opacity: 1; } }
  `;
  document.head.appendChild(tag);
}

export default function PainelWebAmpliado({ src, legenda, aberta, aoSair, camadaRef }: PropsPainelWebAmpliado) {
  const reduzirMovimento = useReducedMotion();
  if (!aberta || typeof document === 'undefined') return null;
  injetarEstilo();
  const vw = window.innerWidth, vh = window.innerHeight;
  // 70% da largura, sem passar de 90% da altura em tela larga e baixa.
  const largura = Math.round(Math.min(vw * FRACAO_TELA, (vh * 0.9) / ALTURA_POR_LARGURA));
  const animar = (nome: string) => (reduzirMovimento ? {} : { animation: `${nome} 280ms cubic-bezier(0.22, 1, 0.36, 1) both` });

  return createPortal(
    <>
      <div
        aria-hidden
        style={{ position: 'fixed', inset: 0, zIndex: 999, pointerEvents: 'none', background: 'rgba(1, 12, 16, 0.62)', ...animar('painelWebVeu') }}
      />
      <div
        ref={(no) => { camadaRef.current = no; }}
        data-testid="painel-web-ampliado"
        onMouseLeave={aoSair}
        style={{
          position: 'fixed', zIndex: 1000, width: largura,
          left: Math.round((vw - largura) / 2), top: Math.round((vh - largura * ALTURA_POR_LARGURA) / 2),
          ...animar('painelWebAmpliar'),
        }}
      >
        <MolduraNavegador src={src} legenda={legenda} largura={largura} />
      </div>
    </>,
    document.body,
  );
}
