import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Personalização do `<html>` raiz na web.
 *
 * Este arquivo é usado pelo export estático da web e fornece a base comum de
 * todas as rotas HTML. Metadados específicos de cada rota entram depois em
 * `scripts/inject-og-meta.js`, porque o mesmo documento raiz é compartilhado
 * pelo runtime e pelo crawler.
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
        {/* A landing sai desenhada no HTML do servidor (A3 da auditoria Leis de
            UI, 24/10/2026), na medida de um celular. Duas pessoas não podem
            ver esse HTML: quem já tem sessão neste navegador (veria a landing
            piscar antes da área logada) e quem abre numa tela larga (veria o
            layout de celular trocar pelo de computador). Para elas a raiz
            nasce escondida, e `RootNavigator` (app/_layout.tsx) a mostra
            quando a sessão resolve. O prazo de 10 s é a saída se o JavaScript
            nunca chegar. Só roda em `/`, e qualquer erro (armazenamento
            bloqueado) deixa a página como está.

            ATENÇÃO: a CSP do `vercel.json` libera este script pelo hash do
            conteúdo, nas duas entradas. Mudou um caractere, mude o hash; o
            `scripts/inject-og-meta.js` para o build e diz o hash novo. */}
        <script id="grana-espera" dangerouslySetInnerHTML={{ __html: SCRIPT_ESPERA }} />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}

const SCRIPT_ESPERA =
  "(function(){try{var p=location.pathname;if(p!=='/'&&p!=='/index')return;var e=innerWidth>=768;" +
  "if(!e){for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&/^sb-.+-auth-token$/.test(k)){e=true;break}}}" +
  "if(!e)return;var d=document.documentElement;d.setAttribute('data-grana-espera','');" +
  "setTimeout(function(){d.removeAttribute('data-grana-espera')},10000)}catch(_){}})();";

const CSS_GLOBAL = `
/* Ver SCRIPT_ESPERA: raiz escondida, no fundo da marca, até a sessão resolver. */
html[data-grana-espera] {
  background-color: #052229;
}
html[data-grana-espera] #root {
  visibility: hidden;
}
/* O mesmo papel do indicador que o RootNavigator mostrava antes: sem ele a
   tela larga ficava vazia até a sessão resolver (FCP de 1 s para 8 s em 4G
   lento). Imagem e não borda, para contar como primeira pintura. */
html[data-grana-espera]::after {
  content: "";
  position: fixed;
  top: 50%;
  left: 50%;
  width: 28px;
  height: 28px;
  margin: -14px 0 0 -14px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'%3E%3Ccircle cx='14' cy='14' r='11' fill='none' stroke='%23effffa' stroke-opacity='.25' stroke-width='3'/%3E%3Cpath d='M14 3a11 11 0 0 1 11 11' fill='none' stroke='%23effffa' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat center / contain;
  animation: grana-espera-giro 0.8s linear infinite;
}
@keyframes grana-espera-giro {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  html[data-grana-espera]::after { animation: none; }
}
html {
  -webkit-text-size-adjust: 100%;
  color-scheme: dark;
}
body {
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  /* Herdado: o texto corrido nao fecha a ultima linha com palavra sozinha.
     Titulos com \`textWrap: balance\` proprio continuam valendo. */
  text-wrap: pretty;
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
