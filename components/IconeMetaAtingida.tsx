import { createElement, useId } from 'react';
import { View } from 'react-native';

/**
 * Ícone-sticker "Meta atingida" (troféu com faíscas), flutuando sozinho —
 * sem o texto de estado vazio que o acompanhava na peça original (Claude
 * Design, projeto "Ícone animado estilo sticker"). Puramente decorativo na
 * landing page, por isso `aria-hidden` no wrapper inteiro; não é a mesma
 * peça usada dentro do app (lá ele carrega o texto "Nenhuma meta concluída
 * ainda").
 *
 * Markup embutido via `dangerouslySetInnerHTML`, não recriado em
 * `react-native-svg` + `Animated`: a peça já veio pronta (path exato do
 * troféu, 3 faíscas com atraso escalonado, glow pulsante) com classes CSS
 * que se referenciam entre si (`.sparkle.s2`/`.sparkle.s3` herdam de
 * `.sparkle`) — reconstruir isso path a path por cima de `react-native-svg`
 * arriscava divergir de pixel do original sem ganhar nada. Cores literais
 * (não tokens do tema): `#0b2d35`/`#a9f8c8` são exatamente
 * `theme.paperRaised`/`brand.dot`, mas embutidas aqui porque fazem parte do
 * SVG de origem, não de um componente RN que já importa o tema.
 *
 * `@keyframes`/classes com sufixo único (`useId()`) — mesma razão de
 * `TrustMarquee`/`NotebookAnimado`: evita colisão se este componente
 * aparecer mais de uma vez na mesma página. `prefers-reduced-motion` via
 * media query DE VERDADE no CSS embutido (não o padrão
 * `AccessibilityInfo` + JS do resto do app) — mais simples aqui porque o
 * componente não tem nenhum outro estado React, só marcação estática.
 */
export default function IconeMetaAtingida() {
  const idBruto = useId();
  const sufixo = idBruto.replace(/[^a-zA-Z0-9]/g, '');

  const html = `
    <style>
      .meta-icon-wrap-${sufixo}{position:relative;width:180px;height:180px;display:flex;align-items:center;justify-content:center}
      .meta-icon-wrap-${sufixo}::before{content:'';position:absolute;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,rgba(169,248,200,0.16),transparent 70%);animation:meta-pulse-glow-${sufixo} 3.2s ease-in-out infinite}
      .meta-sticker-${sufixo}{position:relative;animation:meta-float-${sufixo} 3.2s ease-in-out infinite;filter:drop-shadow(0 10px 18px rgba(0,0,0,0.35))}
      .meta-sparkle-${sufixo}{transform-origin:center;animation:meta-twinkle-${sufixo} 3.2s ease-in-out infinite}
      .meta-sparkle-${sufixo}.s2{animation-delay:.5s}
      .meta-sparkle-${sufixo}.s3{animation-delay:1s}
      @keyframes meta-float-${sufixo}{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
      @keyframes meta-pulse-glow-${sufixo}{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.08)}}
      @keyframes meta-twinkle-${sufixo}{0%,40%,100%{opacity:.3;transform:scale(.7)}20%{opacity:1;transform:scale(1.15)}}
      @media (prefers-reduced-motion: reduce) {
        .meta-icon-wrap-${sufixo}::before, .meta-sticker-${sufixo}, .meta-sparkle-${sufixo} { animation: none; }
      }
    </style>
    <div class="meta-icon-wrap-${sufixo}">
      <svg class="meta-sticker-${sufixo}" width="120" height="120" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="52" fill="#0b2d35" stroke="#a9f8c8" stroke-width="4"/>
        <path d="M42 34H78V52C78 62 70 70 60 70C50 70 42 62 42 52V34Z" fill="#a9f8c8" stroke="#a9f8c8" stroke-width="4" stroke-linejoin="round"/>
        <path d="M42 38H32C32 46 36 52 42 52" stroke="#a9f8c8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M78 38H88C88 46 84 52 78 52" stroke="#a9f8c8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M60 70V80" stroke="#a9f8c8" stroke-width="4" stroke-linecap="round"/>
        <path d="M50 80H70V86C70 88 68.5 90 66.5 90H53.5C51.5 90 50 88 50 86V80Z" fill="#a9f8c8" stroke="#a9f8c8" stroke-width="4" stroke-linejoin="round"/>
        <path d="M44 90H76" stroke="#a9f8c8" stroke-width="4" stroke-linecap="round"/>
        <path class="meta-sparkle-${sufixo} s1" d="M60 42L62 47L67 49L62 51L60 56L58 51L53 49L58 47Z" fill="#052229"/>
      </svg>
      <svg class="meta-sparkle-${sufixo} s2" width="10" height="10" viewBox="0 0 10 10" style="position:absolute;top:22px;left:20px" fill="#a9f8c8"><path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z"/></svg>
      <svg class="meta-sparkle-${sufixo} s3" width="8" height="8" viewBox="0 0 10 10" style="position:absolute;bottom:28px;right:18px" fill="#a9f8c8"><path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z"/></svg>
    </div>
  `;

  return (
    <View aria-hidden style={{ pointerEvents: 'none' }}>
      {createElement('div', { dangerouslySetInnerHTML: { __html: html } })}
    </View>
  );
}
