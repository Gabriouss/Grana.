import type { ReactNode, ReactPortal } from 'react';
import MolduraNavegador from '@/components/MolduraNavegador';
import { useReducedMotion } from '@/lib/motion';
import { fonts, theme } from '@/lib/theme';
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

export default function PainelWebAmpliado({ src, legenda, aberta, aoSair, camadaRef, modo = 'ponteiro' }: PropsPainelWebAmpliado) {
  const reduzirMovimento = useReducedMotion();
  if (!aberta || typeof document === 'undefined') return null;
  injetarEstilo();
  const vw = window.innerWidth, vh = window.innerHeight;
  if (modo === 'detalhe') return detalhe({ src, legenda, aoSair, camadaRef, vw, reduzirMovimento });
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

/* Captura em tamanho real (1440x900) numa camada da própria página, para arrastar
   no celular. Substitui o link que abria o PNG em outra aba: a landing não tira
   ninguém da página, exceto para o checkout (auditoria Leis de UI, 24/10/2026). */
const LARGURA_CAPTURA = 1440;

function detalhe({ src, legenda, aoSair, camadaRef, vw, reduzirMovimento }: {
  src: string; legenda: string; aoSair: () => void; camadaRef: { current: HTMLDivElement | null }; vw: number; reduzirMovimento: boolean;
}) {
  // No computador cabe inteira com folga; no celular fica no tamanho real e rola nos dois eixos.
  const largura = vw >= 900 ? Math.min(LARGURA_CAPTURA, vw - 64) : LARGURA_CAPTURA;
  const fonte = fonts.regular;
  return createPortal(
    <div
      ref={(no) => { camadaRef.current = no; }}
      role="dialog"
      aria-modal="true"
      aria-label={legenda}
      data-testid="painel-web-detalhe"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, overflow: 'auto', overscrollBehavior: 'contain',
        background: 'rgba(1, 12, 16, 0.94)', ...(reduzirMovimento ? {} : { animation: 'painelWebVeu 200ms ease-out both' }),
      }}
    >
      <div style={{ padding: vw >= 900 ? 32 : '72px 16px 56px', width: 'max-content', margin: '0 auto' }}>
        <img src={src} alt={legenda} width={1440} height={900} style={{ display: 'block', width: largura, height: 'auto', borderRadius: 12 }} />
      </div>
      <button
        type="button"
        autoFocus
        onClick={aoSair}
        style={{
          position: 'fixed', top: 16, right: 16, minWidth: 44, height: 44, padding: '0 16px', borderRadius: 22,
          border: `1px solid ${theme.ruleStrong}`, background: theme.paperRaised, color: theme.ink, fontFamily: fonte, fontSize: 14, cursor: 'pointer',
        }}
      >
        Fechar
      </button>
      {vw < 900 ? (
        <p style={{
          position: 'fixed', left: '50%', bottom: 16, transform: 'translateX(-50%)', margin: 0, padding: '8px 14px', whiteSpace: 'nowrap',
          borderRadius: 999, border: `1px solid ${theme.ruleStrong}`, background: theme.paperRaised, color: theme.inkSoft, fontFamily: fonte, fontSize: 13, pointerEvents: 'none',
        }}>
          Arraste para ver o painel inteiro
        </p>
      ) : null}
    </div>,
    document.body,
  );
}
