import { createElement, useEffect, useId, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

type Props = {
  variante?: 'caixa' | 'fundo';
};

/**
 * Alternativa ao `NotebookVideo`: a MESMA imagem do notebook (um frame do
 * vídeo 0825.mp4, exportado em altíssima qualidade — sem a perda de detalhe
 * que qualquer recodificação de vídeo, por melhor que seja, ainda impõe),
 * parada, com um "flutuar" bem sutil simulado em CSS puro (zoom + deslocar
 * levíssimos, tipo Ken Burns) em vez do movimento real do notebook 3D.
 *
 * Existe só pra comparação lado a lado com `NotebookVideo` — qual das duas
 * abordagens (vídeo real vs. imagem parada com movimento fingido) fica
 * melhor na prática. Ganha nitidez garantida (uma imagem não tem artefato de
 * compressão temporal); perde o movimento de verdade do notebook.
 *
 * `ease-in-out` porque é movimento CONTÍNUO de algo já na tela (não
 * entrada/saída) — mesma regra que rege o resto do motion da página.
 * `alternate` + duração longa (16s) pra ficar ambiente, não perceptível como
 * "piscando"; para de vez com `prefers-reduced-motion`.
 */
export default function NotebookFloatEstatico({ variante = 'caixa' }: Props) {
  const [reduzirMovimento, setReduzirMovimento] = useState(false);
  const idBruto = useId();
  const nomeKeyframe = `notebookFloat_${idBruto.replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    let ativo = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => ativo && setReduzirMovimento(v))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (reduzirMovimento) return;
    const tag = document.createElement('style');
    tag.textContent = `@keyframes ${nomeKeyframe} { 0% { transform: scale(1) translate3d(0,0,0); } 50% { transform: scale(1.025) translate3d(-6px,-4px,0); } 100% { transform: scale(1) translate3d(0,0,0); } }`;
    document.head.appendChild(tag);
    return () => {
      document.head.removeChild(tag);
    };
  }, [nomeKeyframe, reduzirMovimento]);

  const estiloBase =
    variante === 'fundo'
      ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
      : { width: '100%', height: 'auto', display: 'block' };

  const estilo = reduzirMovimento
    ? estiloBase
    : {
        ...estiloBase,
        animationName: nomeKeyframe,
        animationDuration: '16s',
        animationTimingFunction: 'ease-in-out',
        animationIterationCount: 'infinite',
      };

  return createElement('img', {
    src: '/videos/notebook-estatico.webp',
    alt: '',
    'aria-hidden': true,
    style: estilo,
  });
}
