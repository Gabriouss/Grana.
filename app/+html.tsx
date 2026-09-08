import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Personalização do `<html>` raiz na web.
 *
 * ATENÇÃO — este arquivo está INERTE hoje. Verificado em 08/09/2026 com
 * `expo export`: o `index.html` publicado é, byte a byte, o template padrão da
 * Expo (`@expo/cli/static/template/index.html`). Uma `<meta>` marcadora
 * inserida aqui nunca apareceu no export, mesmo após limpar `.expo`,
 * `node_modules/.cache` e exportar com `--clear`.
 *
 * O motivo: o expo-router só usa `+html.tsx` quando `web.output` é `"static"`
 * (ou `"server"`). O `app.json` não define essa chave, então vale o padrão
 * `"single"` (SPA) e a Expo serve o template dela.
 *
 * O que dependia daqui foi movido para `instalarDocumentoWeb()`
 * (`lib/foco-web.ts`), que injeta em runtime — mesmo caminho que o anel de
 * foco já usava. Os favicons continuam funcionando porque o `<Head>` do
 * `app/_layout.tsx` também os declara.
 *
 * Mantido no repositório porque volta a valer sozinho no dia em que alguém
 * ligar `web.output: "static"` (o que traria SEO de renderização estática
 * junto). Não acrescente aqui nada de que a página dependa hoje.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* `viewport-fit=cover` é o que faz `env(safe-area-inset-*)` devolver
            valor real no Safari do iOS. Sem ele o navegador reporta 0, o
            SafeAreaProvider mede zero, e no app instalado como PWA o cabeçalho
            encosta no recorte — justamente onde o inset existiria para evitar
            isso. Não muda nada em navegador de desktop. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
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
        {/* O `id` não é decoração: sem ele este bloco NÃO chegava ao HTML
            exportado — conferido em dois `expo export` seguidos, com o
            `<style id="expo-reset">` do mesmo arquivo saindo normalmente. O
            React 19 trata `<style>` como recurso içável e descarta o anônimo;
            o componente da própria Expo (`ScrollViewStyleReset`) usa a mesma
            técnica de `dangerouslySetInnerHTML` e sobrevive justamente por
            declarar `id`. Efeito prático de quando faltava: a Neue Machina
            Light saía engrossada pelo subpixel rendering em produção, que é
            exatamente o que este CSS existe para evitar. */}
        <style id="grana-global" dangerouslySetInnerHTML={{ __html: CSS_GLOBAL }} />

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
/* Campo autopreenchido pelo navegador vinha com fundo amarelo-claro e texto
   quase preto no meio da UI petróleo — o Chrome pinta por cima do background
   declarado e ignora \`color\`. O truque do inset shadow é a única forma de
   sobrescrever esse fundo, e o \`-webkit-text-fill-color\` é o que alcança o
   texto. A transição longa existe porque o Chrome reaplica o próprio estilo
   por alguns instantes depois do preenchimento.
   Atinge login, cadastro, nova senha e a troca de e-mail no Perfil, que são
   exatamente as telas onde o navegador oferece autopreenchimento. */
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
input:-webkit-autofill:active {
  -webkit-box-shadow: 0 0 0 1000px #0b2d35 inset !important;
  -webkit-text-fill-color: #effffa !important;
  caret-color: #effffa;
  transition: background-color 100000s ease-in-out 0s;
}
`;
