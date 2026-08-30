import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Personalização do `<html>` raiz na web — expo-router usa este arquivo
 * como está, no lugar do documento padrão que ele geraria sozinho. Existia
 * zero customização até agora: nenhum CSS global de legibilidade de fonte,
 * e o favicon era só o PNG estático do `app.json`. Ver public/favicon.svg —
 * o símbolo oficial "G." com o gradiente contínuo e o ponto em menta.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#052229" />
        <meta name="color-scheme" content="dark" />

        <link rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg?v=grana-gradiente-20260830" />
        {/* Fallback pros poucos navegadores sem suporte a favicon em SVG. */}
        <link rel="icon" type="image/png" sizes="512x512" href="/favicon.png?v=grana-gradiente-20260830" />
        <link rel="apple-touch-icon" href="/favicon.png?v=grana-gradiente-20260830" />

        {/*
          `-webkit-font-smoothing`/`text-rendering`: legibilidade da Neue
          Machina em telas de alta densidade — sem isso o navegador usa o
          engrossamento padrão do subpixel rendering, que na Light (o peso
          mais usado da marca) lê mais grosso e borrado do que o desenho da
          fonte pretende.
          `-webkit-text-size-adjust`: sem isso, girar um iPhone pra paisagem
          pode inflar o tamanho do texto sozinho — o navegador tenta
          "ajudar" a legibilidade e read desconfigura a escala que a página
          já define.
        */}
        <style dangerouslySetInnerHTML={{ __html: CSS_GLOBAL }} />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}

const CSS_GLOBAL = `
html {
  -webkit-text-size-adjust: 100%;
  color-scheme: dark;
}
body {
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
`;
