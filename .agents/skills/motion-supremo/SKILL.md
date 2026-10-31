---
name: motion-supremo
description: "Motion supremo. Skill unificada e definitiva de Motion Design, Animação de UI, Vídeo Programático, 3D e Interatividade do Grana. para Claude e Codex. Funde todas as regras, medidas e receitas de vídeo e UI do Grana. (Regra 9, Regra 23, Regra 24, Regra 26, Regra 29, lib/motion.ts, ajustes.md, guia-de-estilo-de-video.md, Receitas Granabô v3 e R3 v4/v5, efeitos DeqHiQlxxRY, Editonny/HyperFrames e awesome-opus5-5-videos) com todas as bibliotecas e coleções instaladas: Emil Kowalski (animate, review-animations, improve-animations, find-animation-opportunities, animation-vocabulary, web-animation-design), 12 Princípios da Disney (gsap-greensock, web-motion-design, scroll-animations), GSAP Oficial completo (gsap-core, gsap-timeline, gsap-scrolltrigger, gsap-plugins, gsap-utils, gsap-react, gsap-frameworks, gsap-performance, gsap-framer-scroll-animation), Framer Motion / Motion v12, Remotion oficial (remotion-best-practices, markup, render, captions, multimedia, maps, studio, interactivity, saas), Three.js / R3F / Shaders / WebGPU (13 módulos CloudAI-X/threejs-skills), Lottie / Skia Skottie (text-to-lottie), Wiggle Logo Animator (wiggle) e Rive (rive-skills + Luau scripting). Use sempre que o autor disser 'Motion supremo', 'meu editor de vídeo', ou pedir qualquer animação de UI, scroll, microinteração, transição, auditoria de motion, vídeo viral, Reels, cena em JavaScript/GSAP/HTML5, Remotion, Lottie, Rive, logo animado ou 3D/Three.js."
---

# Motion Supremo — Enciclopédia e Motor Unificado de Motion & Vídeo do Grana.

Esta skill unifica **todas** as skills de motion design, animação de interface, vídeo programático, 3D e animação vetorial do projeto **Grana.** em uma única fonte para **Claude** e **Codex**.

Se houver qualquer divergência entre uma referência externa e uma regra do `AGENTS.md` ou de `docs/marketing/ajustes.md`, **as regras do Grana. prevalecem sempre**.

---

## 0. Travas Inegociáveis do Grana. (Conferir Antes de Agir)

1. **Produção de criativo/vídeo só com pedido explícito nesta sessão (Regra 21):** a data no calendário sozinha nunca autoriza produzir peça estática ou em vídeo.
2. **Custo zero na ElevenLabs sem "sim" prévio do autor (Regra 24):** antes de gerar ou regerar qualquer narração, voz, áudio ou vídeo na ElevenLabs, calcule e apresente a estimativa em **créditos, US$ e R$** (informando a cotação usada) e aguarde o **"sim"** explícito do autor nesta sessão. Aprovação anterior não vale para nova geração nem para refação. Tudo o que sai localmente (`ffmpeg`, Editonny, HTML5/JS/GSAP, Web Audio, Python/PIL/OpenCV) tem prioridade e custo R$ 0,00.
3. **Fidelidade ao produto real (Regra 20 e Regra 23):** nunca prometa função que ainda não está na build pública aprovada em QA. Respeite a Regra 20 do Livre para gastar (`Livre = max(0, saldo de caixa do mês − aportes líquidos deste mês ainda guardados − crédito elegível ainda não pago) ÷ dias restantes`) e a distinção de cofrinhos (`"Já estava guardado"` vs `"Do dinheiro deste mês"`).
4. **Conferência de animação pelo movimento real (Regra 9):** animação nunca se confere olhando só o último quadro. Meça quadro a quadro (opacidade, `transform`, posição mínima e máxima ao longo do tempo) para provar que o valor realmente muda.
5. **Acessibilidade e `prefers-reduced-motion` (Regra 9):** toda animação de UI no app ou na web honra `prefers-reduced-motion: reduce` (e `prefers-reduced-transparency: reduce` em superfícies com blur). Sessão de acesso remoto do Windows liga `prefers-reduced-motion` sozinha — confira `matchMedia('(prefers-reduced-motion: reduce)').matches` antes de depurar "o motion parou".
6. **Zero palavra viúva (Regra 29):** nenhum título, legenda karaokê, card ou parágrafo termina com uma única palavra sozinha na última linha. Na web, combine `text-wrap: balance` (títulos de até 6 linhas) / `text-wrap: pretty` com `semViuva()` (`lib/sem-viuva.ts`). Em vídeo e estático, ajuste a quebra manualmente e confira nos quadros renderizados.
7. **Regras de escrita da marca:** proibido usar travessão (`—` ou `–`) em copy/roteiro/UI; proibido usar construções do tipo `"não é X, é Y"` / `"não se trata de X"`; proibido escrever aviso de `"dados de exemplo"` na arte, no vídeo ou na legenda (Regra 23); proibido repetir `"Grana."` várias vezes na mesma narração (use apenas 1 vez, no fechamento).

---

## 1. Vídeo Programático & Reels Virais do Grana. (JS / HTML5 / GSAP / Editonny)

### 1.1. Especificações Técnicas e Medidas Oficiais (Regra 23 + `guia-de-estilo-de-video.md` + `ajustes.md`)

| Parâmetro | Padrão Oficial Medido do Grana. |
|---|---|
| **Formato de saída** | Vertical **9:16 (`1080×1920`)**, **30 fps** constantes, H.264 (`yuv420p`), áudio AAC **48 kHz** estéreo. Clipes gerados por IA saem nativamente em 9:16 a 720p (`720×1280`) com upscale `lanczos` para `1080×1920` (nunca gerar em 16:9 para recortar). |
| **Fundo oficial** | Gradiente linear vertical `#021319` (topo) → `#021721` (meio) com **brilho radial na base** centrado em `x = 540, y ≈ 1700–1850`, pico `#0B4A5A`, cantos inferiores `#06323A`. **Zero grão** e zero enfeite genérico flutuando no fundo. |
| **Tipografia de vídeo** | `Neue Machina Light` (peso 300) no texto base (`#EFFFFE`) e **`Neue Machina Regular` (peso 400)** nas palavras de destaque em menta (`#ADFBE3`, decisão do autor em 08/10/2026). Nunca misture fontes no mesmo H1. |
| **Gancho de abertura (Ato 1)** | Corpo `82,5 px` a `88 px`, entrelinha `103 px` a `106 px`, tracking `+0,05 em`, alinhado em `x = 84` (ou centralizado conforme arquétipo), entrando palavra por palavra no instante exato da fala (`133 ms` de passo ou cravado no `inicio_real`, `267 ms` de duração do 10% ao 90%, subindo `19 px` em `ease-out`), com palavra-chave em menta `#ADFBE3` e sublinhado animado. |
| **Legenda karaokê / Título de cena** | Corpo `59 px` a `62 px`, centralizado em **`y ≈ 290`** com pelo menos **`90 px` de folga** até o topo do celular (nunca grudado no celular nem no topo do quadro). Grupos curtos de 2 a 3 palavras; a palavra falada acende em menta `#ADFBE3` no instante exato (`inicio_real`). A frase anterior precisa sair completamente (`fade` mínimo de `0,15 s` a `0,33 s`) antes da primeira palavra da frase seguinte entrar. |
| **Celular 3D realista** | Sempre mockup fotográfico realista com print/vídeo real encaixado por homografia nos cantos arredondados (proibido celular chapado ou CSS 3D falso). Sobe de baixo com perspectiva 3D (`transformPerspective: 2400`, `back.out`, overshoot de `~55–60 px` antes de assentar), halo menta ao assentar e flutuação suave. **Exceção exclusiva dos Reels (19/10/2026):** no Reels, quando o foco é a tela, o celular fica grande, baixo e **pode sangrar pela borda inferior**. Em capas, posts, carrosséis e Stories parados, o aparelho fica **100% inteiro com margem segura**. |
| **Gravação de tela dentro do celular** | Taxa normalizada com `fps=60` antes de qualquer `trim` (evita encurtar trechos parados de VFR). Suba a gravação **`~70–72 px`** dentro da máscara da tela para esconder a barra de status do Android e o cronômetro vermelho do gravador. |
| **Zoom e recortes `POPS`** | **Proibido dar zoom dentro da tela do celular.** O zoom (`+7%` a `+10%`) é sempre no **aparelho inteiro**. Para destacar um card/item, faça o **recorte real da gravação saltar para fora da tela (`POP`)**: `scale: 1.10`, `y: -26`, `ease: "back.out(1.7)"` em `0,30 s`, escurecendo o restante da tela, e voltando pelo mesmo caminho. **Regra de ouro (24/10/2026):** enquanto o recorte salta ou a narração explica um ponto, **nada mais na tela de fundo pode se mover** (congele o quadro de fundo se houver carrossel/lista mexendo fora do assunto). |
| **Trocas de tela e ritmo** | Troca fluida junto com a frase da função seguinte (pausa máxima de `0,3 s` entre funções): `cross-dissolve` de `0,25 s` dentro da moldura ou tranco de escala + **clarão menta de `0,20 s`**. Digitação acelerada `6× a 7×` e espera do "pensando" cortada para `0,3 s`. |
| **Fecho / End-Card (Ato 4)** | Primeiro o celular e o título saem (`fade out 0,40 s`); depois entra o CTA tipográfico com botão `"Saiba mais"` em menta `#ADFBE3` (dois pulsos de anel + seta) e a materialização do **logotipo oficial em gradiente** (`design-system/marca/logotipo-gradiente.svg`, `600 px` de largura, `expo.out` com redução de blur). |
| **Engenharia de Áudio** | Narração gerada inteira numa única chamada no `eleven_v4` (com marcações sutis como `[warmly]`, `[sighs]`, `[pause]`, nunca esticada com `atempo`/`rubberband` e nunca emendada com `<break>`). Voz normalizada a **`-14 LUFS`** (`loudnorm` em 2 passadas). Trilha musical **exclusiva por Reel** (nunca repetir a cama de outro vídeo), a `-24 LUFS` com `sidechaincompress` (abaixa quando a voz fala). Efeitos locais: `whoosh` nas entradas do celular, `tic` em cada recorte `POP` e `plim` quando o lançamento/botão assenta. |

### 1.2. Arquitetura Determinística de Vídeo em JavaScript (`window.renderAt(t)`)

Todo vídeo em código (Editonny / HyperFrames / Puppeteer / Playwright frame-by-frame) deve ser uma **função pura do tempo `t` (em segundos)**:

```javascript
// Padrão obrigatório para cena determinística HTML5 + GSAP (1080x1920, 30 fps)
gsap.ticker.remove(gsap.updateRoot); // Desliga relógio em tempo real se necessário
const tl = gsap.timeline({ paused: true });

// 1. Construa toda a timeline referenciando tempos absolutos em segundos:
tl.to("#abertura-palavra-1", { opacity: 1, y: 0, duration: 0.267, ease: "power2.out" }, 0.20);

// 2. Exponha renderAt(t) para captura quadro a quadro e inspeção via ?t=4.33:
window.renderAt = function(t) {
  tl.seek(t, false);
  // Sincronize vídeos <video data-media-start="..."> se houver:
  document.querySelectorAll("video[data-start]").forEach((v) => {
    const start = parseFloat(v.dataset.start || "0");
    const mediaStart = parseFloat(v.dataset.mediaStart || "0");
    if (t >= start) v.currentTime = mediaStart + (t - start);
  });
};
```

**Armadilhas técnicas conhecidas (Receita R3 v4/v5 — `ajustes.md` linha 87):**
1. **`fromTo` tardio na timeline:** por padrão, `from()` e `fromTo()` têm `immediateRender: true`, aplicando o estado inicial no quadro `0`! Se um elemento já foi animado antes na timeline, passe **`immediateRender: false`** no segundo `fromTo()`, ou o estado inicial do segundo sobrescreverá o quadro `0`.
2. **IDs duplicados:** nunca repita o mesmo `id` entre um bloco de gancho e um token da legenda karaokê.
3. **Sincronia pós-pausa (`inicio_real`):** o alinhamento da transcrição costuma esticar o timestamp de início de uma palavra para cobrir o silêncio anterior. Meça os silêncios reais do áudio (`>= 0,15 s`) e crave o `inicio_real` no fim do silêncio, nunca antes.
4. **Vídeo com `data-start` no HyperFrames:** toda tag `<video>` com `data-start` exige atributo `id` único, e os recortes `POP` sincronizados usam `data-media-start`.

### 1.3. Biblioteca dos 12 Efeitos Medidos (`referencias/efeitos-DeqHiQlxxRY.md`)

1. **`E02` Lista-fantasma progressiva:** números da lista visíveis desde o quadro 0 a `40%` de opacidade; cada item (`número + rótulo`) acende para `100%` em 3 quadros (`100 ms`, `ease: "none"`) exatamente na palavra falada.
2. **`E04` Pop-in com ultrapassagem (`scale pop`):** `gsap.from(el, { scale: 0.15, duration: 0.3, ease: "back.out(1.7)" })` — pico em `108%` no 4º–5º quadro e assenta em `100%` aos `0,30 s`. Padrão para recortes que saltam da tela.
3. **`E05` Queda escalonada com giro (`stagger drop`):** `gsap.from(".card", { y: -300, rotation: -8, duration: 0.35, ease: "back.out(1.4)", stagger: 0.1 })` — cartões de fatura/parcelas caindo em cascata no Ato 2 (com sombra da marca, nunca sombra dura preta).
4. **`E06` Placa de aeroporto (`split-flap`):** células sorteando caracteres a `15 trocas/s` (a cada `66 ms`) e travando da esquerda para a direita com `50 ms` de defasagem (`tTrava = t0 + 0.55 + i * 0.05`), revelando valores reais em `R$`.
5. **`E07` / `E08` Traço que se desenha + leque radial (`line draw-on`):** SVG com `stroke-dasharray` / `stroke-dashoffset` em etapas encadeadas de 4 quadros (`0,13 s` cada, total `~0,7 s`) para gráficos, anéis de meta ou o `G` do logotipo.
6. **`E09` Letreiro corrido + cortina dura (`marquee + hard wipe`):** alternativa ao clarão menta (só usar se aprovado pelo autor).
7. **Proibidos no Grana.:** `E01` (cartão chapado sobre apresentador), `E03` (corte seco de `1 s` por função — rápido demais para explicar funcionalidade) e `E12` (quadro preto inicial de gravação — sempre cortar a partir do primeiro quadro com luminância válida).

### 1.3.1. Presets dos Reels v3 (aprovados pelo autor em 25/10/2026)

Antes de editar qualquer Reels em código, leia `referencias/grana/presets-reels-v3.md`. Ele traz o pipeline de 60 fps com motion blur, o celular realista com lateral 3D, as telas do app em HTML com dados reais, os estilos de legenda (`slam`, `flip`, `rise`, `vira`, `freio`, `estica`), o tema claro medido do criativo do autor e as assinaturas (elevador, órbita, freada, chicote, túnel, placa de aeroporto e mural em blocos). O código pronto está em `referencias/grana/presets-reels-v3/serie/` e `.../fatura/`. Regra da série: mesma identidade, mas cada vídeo com sua própria combinação de assinatura, legenda, botão e tema. Quando esse preset contrariar a tabela 1.1 (celular fotográfico, 30 fps, logotipo em gradiente no tema claro), vale o preset, por decisão do autor na rodada de 25/10/2026.

### 1.4. Comandos do Motor Local Editonny (`C:\Users\user\.local\share\editonny`)

```bash
python3 "C:/Users/user/.local/share/editonny/scripts/editonny.py" doctor
python3 "C:/Users/user/.local/share/editonny/scripts/editonny.py" helper transcribe <video.mp4> --edit-dir <pasta>/edit
python3 "C:/Users/user/.local/share/editonny/scripts/editonny.py" new <pasta>/projeto --edit <pasta>/edit
python3 "C:/Users/user/.local/share/editonny/scripts/editonny.py" catalog "<busca>"
python3 "C:/Users/user/.local/share/editonny/scripts/editonny.py" scene --project <pasta>/projeto --use <cena> --start <s> --end <s>
python3 "C:/Users/user/.local/share/editonny/engine/helpers/quality_gate.py" <video-final.mp4>
```

---

## 2. Motion de Interface (UI / Web / App React Native), Filosofia Emil Kowalski & Tokens do Grana.

### 2.1. Os 7 Passos de Decisão Antes de Animar (`animate` + `review-animations`)

Execute sempre nesta ordem:

1. **Deve animar? (Frequência × Propósito):**
   - Ação disparada pelo teclado ou usada **100+ vezes por dia** → **NÃO ANIME** (0 linhas de código).
   - Dezenas de vezes por dia → motion mínimo e sub-200ms.
   - Uso ocasional → transição padrão orientadora (continuidade espacial, feedback de estado).
   - Primeira vez / raro / marketing → pode ter encantamento e coreografia.
2. **Qual é o propósito nomeado?** Continuidade espacial, indicação de estado, feedback físico de toque/clique, explicação visual ou prevenção de corte brusco. *"Fica bonito"* em componente frequente é reprovado.
3. **Qual ferramenta?**
   - **CSS Transitions / `@starting-style`** para mudanças de estado simples e elementos disparados rapidamente (toasts, toggles, hovers) — porque `transition` redireciona do valor atual ao ser interrompida, enquanto `@keyframes` reinicia do zero.
   - **GSAP** para timelines multi-etapas, `ScrollTrigger`, SVG morph/draw, controle de playback (`seek`/`pause`/`reverse`) e cenas de vídeo.
   - **Framer Motion (`motion/react`) / Springs** para gestos interrompíveis que carregam velocidade (`drag`, `swipe-to-dismiss`, `layoutId`).
   - **React Native `Animated` / Reanimated + `lib/motion.ts`** dentro do app Grana.
4. **Quais propriedades? (Regra GPU-Only):**
   - Anime **exclusivamente `transform` e `opacity`** (`clip-path` é a 4ª propriedade sancionada para revelações; `height` só em acordeões onde não há equivalente).
   - **Proibido** animar `width`, `height`, `top`, `left`, `margin`, `padding` ou `transition: all`.
   - **Nunca anime a partir de `scale(0)`:** nada no mundo físico surge do zero absoluto. Comece de `scale(0.92–0.97)` + `opacity: 0`.
   - **`transform-origin` consciente do gatilho:** popovers, dropdowns, menus e tooltips crescem a partir do botão que os abriu (`var(--transform-origin)`), nunca do centro (modais centralizados são isentos).
   - **No Framer Motion sob carga:** prefira `animate={{ transform: "translateX(100px)" }}` em vez dos atalhos `x`/`y`/`scale`, que não são acelerados por hardware da mesma forma.
5. **Qual curva e duração?** (Tabela na seção 2.2 abaixo — **UI sempre abaixo de 300ms**; **proibido `ease-in` em UI**).
6. **Como interrompe e como sai?**
   - Saia pelo mesmo caminho que entrou (toast que sobe por baixo sai por baixo; saída ~20% mais rápida que a entrada).
   - Tempo assimétrico onde o usuário decide: lento na fase deliberada (`hold-to-confirm`: `2s linear`), imediato na resposta do sistema (`release`: `200ms ease-out`).
7. **Acessibilidade e ponteiro:**
   - Sempre inclua `@media (prefers-reduced-motion: reduce)` (mantendo `opacity`/cor e removendo deslocamentos/escalas) e proteja efeitos de `:hover` com `@media (hover: hover) and (pointer: fine)` para evitar falso hover no toque mobile.

### 2.2. Tokens Oficiais do Grana. (`lib/motion.ts`) e Curvas `cubic-bezier`

Antes de digitar uma curva nova no repositório, use os tokens existentes em `lib/motion.ts`:

```typescript
// Tokens da Landing e Componentes Web (lib/motion.ts):
export const EASE_REVEAL      = 'cubic-bezier(0.16, 1, 0.3, 1)';    // Fade + subida ao entrar na tela (RevealOnScroll, FaqItem)
export const EASE_LOOP        = 'cubic-bezier(0.42, 0, 0.58, 1)';   // Ida-e-volta contínua (MolduraCelular, NotebookAnimado)
export const EASE_BOUNCE_HINT = 'cubic-bezier(0.45, 0, 0.2, 1)';    // Pulsos do indicador de scroll
export const EASE_ROLL        = 'cubic-bezier(0.65, 0, 0.35, 1)';   // Rótulo rolante do botão CTA
export const EASE_SNAP        = 'cubic-bezier(0.2, 0.9, 0.2, 1.15)';// Preenchimento com leve overshoot no hover do CTA

// Par Web + React Native (Easing.bezier) do App Autenticado:
export const UI_OUT           = [0.23, 1, 0.32, 1] as const;        // quint.out forte — janelas, toasts e folhas pousam suavemente

// Hooks obrigatórios de acessibilidade e entrada (lib/motion.ts):
// - useReducedMotion()                -> lê AccessibilityInfo.isReduceMotionEnabled()
// - useEntradaNaTela(rootMargin)      -> nasce visível no SSR/HTML estático e só arma a animação após confirmação do IntersectionObserver
// - usePrefersReducedTransparency()   -> desliga backdropFilter quando o usuário pede menos transparência
```

**Tabela completa de curvas `cubic-bezier` (Emil Kowalski — do mais suave ao mais dramático):**

| Família | Quando usar | Curvas (`cubic-bezier`) |
|---|---|---|
| **`ease-out`** | **Padrão de UI:** entradas, saídas, modais, dropdowns, resposta imediata ao usuário | `quad`: `(0.25, 0.46, 0.45, 0.94)` · `cubic`: `(0.215, 0.61, 0.355, 1)` · `quart`: `(0.165, 0.84, 0.44, 1)` · **`quint` (`UI_OUT`)**: `(0.23, 1, 0.32, 1)` · **`expo` (`EASE_REVEAL`)**: `(0.16, 1, 0.3, 1)` / `(0.19, 1, 0.22, 1)` · `circ`: `(0.075, 0.82, 0.165, 1)` |
| **`ease-in-out`** | Elemento **já visível na tela** movendo de A para B ou mudando de forma (morph/layout) | `quad`: `(0.455, 0.03, 0.515, 0.955)` · `cubic`: `(0.645, 0.045, 0.355, 1)` · **`quart`**: `(0.77, 0, 0.175, 1)` · `quint`: `(0.86, 0, 0.07, 1)` · `expo`: `(1, 0, 0, 1)` |
| **`ease-drawer`** | Folhas e gavetas estilo iOS / Ionic | `cubic-bezier(0.32, 0.72, 0, 1)` |
| **Springs** | Gestos, drag, elementos vivos e interrompíveis | `{ type: "spring", duration: 0.5, bounce: 0.2 }` (Apple) ou `{ type: "spring", mass: 1, stiffness: 100, damping: 10 }` |

**Orçamento de Duração em UI:**
- Feedback de pressão de botão (`:active`): **`100–160 ms`** (`scale(0.96–0.98)`)
- Tooltips e popovers pequenos: **`125–200 ms`**
- Dropdowns e selects: **`150–250 ms`**
- Modais, folhas (`sheets`) e gavetas (`drawers`): **`200–300 ms`** (máximo `500 ms` em gavetas de tela inteira)
- Stagger entre itens de uma lista: **`30–80 ms`** por item (nunca deixe todos entrarem juntos nem demorar mais de `500 ms` no total)

### 2.3. Os 12 Princípios da Disney Aplicados a Web & Código (`gsap-greensock` + `web-motion-design`)

1. **Squash & Stretch:** compressão sutil no clique (`scale(0.96, 1.02)`) ou deformação elástica mantendo volume constante.
2. **Anticipation:** leve movimento contrário (`2–5%` ou `4–8 px`) antes do disparo principal (ex.: card encolhe `0.97` por `100 ms` antes de saltar).
3. **Staging:** dirigir o olhar — escurecer o fundo (`opacity: 0.4–0.6`, `blur(3px)`) enquanto o recorte `POP` ou modal ganha foco.
4. **Straight Ahead vs Pose to Pose:** keyframes explícitos para coreografias fixas; física/springs/funções `renderAt(t)` para movimento contínuo.
5. **Follow Through & Overlapping Action:** filhos terminam o movimento ligeiramente depois do contêiner pai (`"-=0.4"` na timeline GSAP).
6. **Slow In & Slow Out:** aceleração e desaceleração naturais (`power2.inOut`, `cubic-bezier`); nunca usar `linear` em transições de interface.
7. **Arc:** trajetórias curvas (`MotionPathPlugin` ou combinação de `x` e `y` com easings diferentes) em vez de linhas retas mecânicas.
8. **Secondary Action:** ação de suporte que reforça a principal (ícone gira `15°` ou pulso de anel expande enquanto o botão `"Saiba mais"` assenta).
9. **Timing:** a velocidade comunica peso e urgência (`150 ms` = leve e imediato; `600 ms` = amplo e editorial).
10. **Exaggeration:** `back.out(1.7)` em recortes de vídeo (`scale: 1.08–1.10`) e shakes de erro (`10–16 px`, não `2 px`).
11. **Solid Drawing:** perspectiva 3D coerente (`transformPerspective: 1000–2400`) e `transform-origin` consistente.
12. **Appeal:** 60 fps cravados na UI (30/60 fps no vídeo), harmonia entre elementos pareados (modal + backdrop com a mesma duração e curva).

### 2.4. Formato Obrigatório de Auditoria/Revisão de Motion (`review-animations`)

Ao auditar ou revisar código de animação, entregue sempre:
1. **Tabela única `| Before | After | Why |`** (uma linha por problema encontrado, citando `arquivo:linha`).
2. **Veredito estruturado por severidade:** (1) Regressões que quebram a sensação, (2) Simplificações/remoções necessárias, (3) Performance/GPU, (4) Interrompibilidade e tempo, (5) Origem e fisicalidade, (6) Acessibilidade (`prefers-reduced-motion` e hover gating), fechando com **Approve** ou **Block**.

---

## 3. GSAP Completo (Oficial `greensock/gsap-skills` + `gsap-framer-scroll-animation`)

### 3.1. Core, Propriedades e Boas Práticas (`gsap-core` + `gsap-performance`)
- **Métodos base:** `gsap.to()`, `gsap.from()`, `gsap.fromTo()`, `gsap.set()`.
- **Aliases de Transform (sempre preferir sobre string CSS `transform` no GSAP):**
  - `x`, `y`, `z` (px), `xPercent`, `yPercent` (% do próprio elemento — ideal para responsivo e SVG), `scale`, `scaleX`, `scaleY`, `rotation`, `rotationX`, `rotationY`, `skewX`, `skewY`, `transformOrigin`, `svgOrigin` (coordenada global do `<svg>`).
  - Rotação direcional: `"360_cw"`, `"-170_short"`, `"+=45_ccw"`.
- **`autoAlpha`:** prefira `autoAlpha` sobre `opacity` quando o elemento zerado deve receber `visibility: hidden` e parar de interceptar cliques.
- **Conflito de tweens:** use `overwrite: "auto"` em interações dinâmicas; em múltiplos `from()`/`fromTo()` no mesmo alvo em timeline, use `immediateRender: false` nos seguintes.
- **Limpeza:** `clearProps: "all"` (ou `"transform,opacity"`) ao final quando o layout CSS precisar reassumir.
- **Alta frequência (mouse/scroll customizado):** nunca crie `gsap.to()` novo a cada `mousemove`; use **`gsap.quickTo(el, "x", { duration: 0.3, ease: "power3" })`** ou `gsap.quickSetter(el, "x", "px")`.

### 3.2. Timelines e Parâmetro de Posição (`gsap-timeline`)
```javascript
const tl = gsap.timeline({ defaults: { duration: 0.5, ease: "power2.out" } });
tl.from(".hero-title", { autoAlpha: 0, y: 30 })
  .from(".hero-sub",   { autoAlpha: 0, y: 20 }, "-=0.25") // 0.25s antes do anterior acabar
  .from(".hero-cta",   { scale: 0.95, autoAlpha: 0 }, "<0.1") // 0.1s após o INÍCIO do anterior
  .addLabel("settled")
  .to(".badge",        { rotation: 10 }, "settled+=0.2");
```
- Notações de posição: `1.5` (tempo absoluto), `"+=0.2"` / `"-=0.2"` (relativo ao fim da timeline), `"<"` (início do tween anterior), `">"` (fim do tween anterior), `"<25%"` (25% da duração do tween anterior).

### 3.3. ScrollTrigger e Scroll Animations (`gsap-scrolltrigger` + `scroll-animations`)
- Sempre registre antes de usar: `gsap.registerPlugin(ScrollTrigger);`
- **Em `scrub: true` (ou `scrub: 1`), use sempre `ease: "none"`** no tween para não distorcer a relação com a barra de rolagem.
- **Armadilha de Scroll na Web do Grana. (Regra 9):** CSS `animation-timeline: view()` resolve contra o ancestral com `overflow` mais próximo; em dobras com `overflow: hidden` que não rolam, a animação nasce terminada. No Grana., prefira `useEntradaNaTela` (`lib/motion.ts`) ou `ScrollTrigger` apontando para o `scroller` correto.
- **Responsivo e Acessibilidade com `gsap.matchMedia()`:**
```javascript
const mm = gsap.matchMedia();
mm.add({
  isDesktop: "(min-width: 768px)",
  reduceMotion: "(prefers-reduced-motion: reduce)"
}, (context) => {
  const { isDesktop, reduceMotion } = context.conditions;
  if (reduceMotion) {
    gsap.set(".card", { autoAlpha: 1, y: 0 });
    return;
  }
  gsap.from(".card", {
    autoAlpha: 0,
    y: isDesktop ? 40 : 20,
    stagger: 0.08,
    scrollTrigger: { trigger: ".grid", start: "top 85%" }
  });
});
```

### 3.4. React (`useGSAP`) e Plugins Oficiais (`gsap-react` + `gsap-plugins` + `gsap-utils`)
- **Em React / Next.js / Expo Web:** use **sempre** `useGSAP(() => { ... }, { scope: containerRef, dependencies: [...] })` de `@gsap/react` (nunca `useEffect` puro). Para handlers de clique/hover dentro do `useGSAP`, envolva com `contextSafe((e) => { gsap.to(...); })`.
- **Plugins principais (`gsap.registerPlugin(...)`):**
  - **`Flip`:** transições de layout impecáveis em 3 passos: `const state = Flip.getState(targets)` → mude o DOM/classes → `Flip.from(state, { duration: 0.4, ease: "power2.inOut", absolute: true })`.
  - **`SplitText`:** quebra texto em `chars`, `words`, `lines` (com `mask: "lines"` para revelação limpa) e reverte automaticamente no `useGSAP`.
  - **`DrawSVGPlugin` / `MorphSVGPlugin` / `MotionPathPlugin`:** desenho de traços, metamorfose entre `<path>` quaisquer e movimento em curva.
  - **`Draggable` + `InertiaPlugin` / `Observer`:** arrasto físico com limites (`bounds`), snap e detecção unificada de wheel/touch/pointer.
- **Utilitários (`gsap.utils`):** `clamp(min, max, val)`, `mapRange(inMin, inMax, outMin, outMax, val)`, `interpolate(start, end, progress)`, `snap(increment, val)`, `wrap(min, max, idx)`, `toArray(selector)`, `pipe(fn1, fn2)`.

---

## 4. Framer Motion / Motion v12 (`motion/react`)

- **Instalação e import moderno:** `import { motion, AnimatePresence, useScroll, useTransform, useSpring } from "motion/react";` (ou `"framer-motion"`). Em Next.js App Router, inclua `'use client'` no topo.
- **Saída animada (`AnimatePresence`):** elementos removidos do React precisam estar dentro de `<AnimatePresence mode="wait">` (ou `"popLayout"`) com prop `exit={{ opacity: 0, transform: "scale(0.96)" }}` e `key` estável.
- **Scroll-linked declarativo:**
```tsx
const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
const smoothProgress = useSpring(scrollYProgress, { stiffness: 120, damping: 20, restDelta: 0.001 });
const y = useTransform(smoothProgress, [0, 1], [60, -60]);
return <motion.div ref={ref} style={{ y }} />;
```
- **Shared Layout (`layout` / `layoutId`):** use `layoutId="tab-indicator"` para pílulas de aba deslizantes e `layout="position"` em textos dentro de containers que mudam de proporção para evitar distorção de fonte.

---

## 5. Remotion — Vídeo Programático em React (`remotion-dev/skills`)

Quando o projeto/pedido usar **Remotion** (composições em React com `<Composition>`, `<Sequence>`, `useCurrentFrame`):
- **Regra de ouro do Remotion:** toda animação depende **exclusivamente** de `const frame = useCurrentFrame()` e `const { fps, durationInFrames, width, height } = useVideoConfig()`. **Proibido** usar CSS transitions, CSS `@keyframes` ou `setTimeout` dentro de componentes Remotion (causam flickering no render paralelo).
- **Interpolação e Mola:**
```tsx
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const CenaGrana: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrada = spring({ frame, fps, config: { damping: 14, stiffness: 120, mass: 0.8 } });
  const opacidade = interpolate(frame, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const translateY = interpolate(entrada, [0, 1], [40, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#021319" }}>
      <Sequence from={0} durationInFrames={90}>
        <div style={{ opacity: opacidade, transform: `translateY(${translateY}px)` }}>...</div>
      </Sequence>
    </AbsoluteFill>
  );
};
```
- **Mídia e Legendas:** use `<OffthreadVideo>` (de `"remotion"`) para reprodução frame-accurate sem engasgo, `staticFile("arquivo.mp4")` para assets em `public/`, e `@remotion/captions` (`createTikTokStyleCaptions`) para legendas sincronizadas palavra a palavra.
- **Fluxo de trabalho:** abra o preview interativo com `npx remotion studio` (ou `--no-open`) e só rode `npx remotion render <CompId> out/video.mp4` quando a exportação final for solicitada.

---

## 6. Three.js, React Three Fiber (R3F), Shaders & WebGPU (`CloudAI-X/threejs-skills`)

Para cenas 3D (ex.: Granabô 3D na web, dispositivos 3D, partículas, shaders GLSL/TSL):
1. **Three.js Moderno (`r160+` / `r186+`):**
   - Sempre gerencie `colorSpace`: `renderer.outputColorSpace = THREE.SRGBColorSpace;` e em texturas de cor `texture.colorSpace = THREE.SRGBColorSpace;` (mapas de normal/roughness/metalness ficam em `NoColorSpace` linear).
   - Limite o `pixelRatio` para proteger GPUs mobile: `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));`.
   - Use `THREE.Timer` (ou `clock.getDelta()` limitado a `Math.min(delta, 0.1)`) para animações independentes de frame rate.
2. **Modelos GLTF e Animação Esquelética (`threejs-loaders` + `threejs-animation`):**
   - Use `GLTFLoader` + `DRACOLoader` (e `KTX2Loader` para texturas comprimidas na GPU).
   - Controle clipes com `const mixer = new THREE.AnimationMixer(model)`, `action.reset().fadeIn(0.25).play()`, `action.crossFadeTo(nextAction, 0.3, true)` e atualize `mixer.update(delta)` a cada quadro.
3. **React Three Fiber (`@react-three/fiber` + `@react-three/drei`):**
   - **Nunca chame `setState` dentro de `useFrame`!** Mutacione a ref diretamente:
     ```tsx
     useFrame((state, delta) => {
       if (!meshRef.current) return;
       meshRef.current.rotation.y = THREE.MathUtils.damp(meshRef.current.rotation.y, targetY, 6, delta);
     });
     ```
   - Use helpers do `drei`: `<Environment>`, `<Float>`, `<ContactShadows>`, `<OrbitControls>`, `useGLTF.preload('/modelo.glb')`, `<Instance>`/`<Instances>`.
4. **Shaders (GLSL / TSL WebGPU) & Pós-Processamento:**
   - Em shaders customizados (`ShaderMaterial`), passe `uTime` e `uResolution` via `uniforms` e use `smoothstep`, `mix` e SDFs para bordas suaves e brilhos.
   - Em `EffectComposer` (`UnrealBloomPass` / `pmndrs/postprocessing`), use bloom seletivo (`luminanceThreshold: 0.85–1.0`) para fazer apenas acentos em menta (`#ADFBE3` com valores HDR `> 1.0` e `toneMapped={false}`) brilharem.
5. **Memória e Limpeza Obrigatória (`dispose`):** ao desmontar cena 3D, percorra `scene.traverse` chamando `geometry.dispose()`, `material.dispose()` e `texture.dispose()`, além de `renderer.dispose()`.

---

## 7. Animação Vetorial e Interativa: Lottie / Skottie (`text-to-lottie`), Wiggle (`wiggle`) e Rive (`rive`)

### 7.1. Lottie / Bodymovin JSON & Skia Skottie (`text-to-lottie`)
- **Estrutura obrigatória do `lottie.json`:** chaves raiz `v` (`"5.7.4"`), `fr` (fps, ex.: `30` ou `60`), `ip` (`0`), `op` (quadro final exclusivo), `w`, `h`, `nm`, `assets`, `layers`.
- **Regras de acabamento (`design-taste` + `motion-taste`):**
  - *Premium significa subtrair, não empilhar:* orçamento de molduras/bordas desnecessárias é `0` por padrão; separe elementos com espaço negativo, alinhamento, escala e tempo antes de criar caixas.
  - Nunca use easing linear uniforme em todas as camadas: dê a curva mais expressiva ao elemento focal (`i: { x: [0.16], y: [1] }, o: { x: [0.3], y: [0] }`) e escalone os secundários.
  - Valide sempre o JSON (`JSON.parse`) e confira o quadro `0`, o meio e `op - 1`.

### 7.2. Animação de Logotipos e SVGs com Wiggle (`wiggle`)
- Quando a entrada for um logotipo estático (SVG/PNG, como `design-system/marca/logotipo-gradiente.svg`):
  1. Defina a metáfora de movimento da marca (no Grana.: *precisão tranquila + clareza financeira*, revelação suave com pulso menta, nunca confete ou urgência fabricada).
  2. Em SVG multi-elemento (ícone `G` + letras `Grana` + ponto `.`), separe os grupos para animar com stagger ou materialização (`expo.out`).
  3. Durante o desenvolvimento de Lottie com imagem raster, use `"e": 0` (referência externa) para evitar estouro de memória no Cairo, e valide o loop perfeito (`quadro inicial == quadro final`) com os scripts de `referencias/wiggle/scripts/`.

### 7.3. Rive — State Machines, Data Binding e Luau Scripting (`rive`)
- **Integração React / Web (`@rive-app/react-canvas`):**
```tsx
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";

export function MascoteInterativo() {
  const { rive, RiveComponent } = useRive({
    src: "/animacoes/granabo.riv",
    stateMachines: "MainStateMachine",
    autoplay: true,
  });
  const falandoInput = useStateMachineInput(rive, "MainStateMachine", "isSpeaking");
  return <RiveComponent onClick={() => falandoInput && (falandoInput.value = !falandoInput.value)} />;
}
```
- **Protocolos de Scripting Luau no Rive Editor:**
  - `Node` (`init`, `advance(seconds)`, `update`, `draw(renderer)`) para desenho procedural com `Path` e `Paint`.
  - `Layout` (`measure()`, `resize(size)`) para componentes responsivos dentro do Artboard.
  - `Converter` (`convert`, `reverseConvert`) para transformar dados de View Models (Data Binding).
  - `PathEffect` para deformar traços vetoriais em tempo real.

---

## 8. Roteador de Referências Completas (`referencias/`)

Esta `SKILL.md` contém todas as regras de decisão, medidas do Grana. e padrões principais. Quando precisar de receitas específicas, tabelas completas de API ou scripts utilitários, consulte apenas o arquivo correspondente dentro de `referencias/` nesta mesma pasta:

| Domínio / Tarefa | Caminho em `referencias/` | O que contém |
|---|---|---|
| **Regras, Medidas e Efeitos de Vídeo do Grana.** | `referencias/grana/efeitos-DeqHiQlxxRY.md`<br>`referencias/grana/meu-editor-de-video.md`<br>`referencias/grana/presets-reels-v3.md` (+ código em `presets-reels-v3/`) | Catálogo detalhado `E01`–`E12` medido quadro a quadro + fluxo completo de produção de Reels do Grana. |
| **Emil Kowalski — Receitas e Padrões de UI Motion** | `referencias/emil/RECIPES.md`<br>`referencias/emil/STANDARDS.md`<br>`referencias/emil/AUDIT.md`<br>`referencias/emil/emil-design-eng.md`<br>`referencias/emil/web-animation-references.md` | Receitas prontas (modal, drawer, toast, dropdown, tooltip, hold-to-confirm, tab indicator, accordion, drag-to-dismiss) e tabelas de auditoria. |
| **GSAP Oficial Completo (8 módulos GreenSock)** | `referencias/gsap/gsap-core.md`<br>`referencias/gsap/gsap-timeline.md`<br>`referencias/gsap/gsap-scrolltrigger.md`<br>`referencias/gsap/gsap-plugins.md`<br>`referencias/gsap/gsap-utils.md`<br>`referencias/gsap/gsap-react.md`<br>`referencias/gsap/gsap-frameworks.md`<br>`referencias/gsap/gsap-performance.md` | Documentação oficial completa do GSAP, todos os plugins (`Flip`, `SplitText`, `MorphSVG`, `Draggable`, `ScrollSmoother`), hooks React e otimização. |
| **ScrollTrigger & Framer Motion (Receitas Completas)** | `referencias/scroll-framer/gsap-scroll-recipes.md`<br>`referencias/scroll-framer/framer-motion-recipes.md` | 10 receitas completas de ScrollTrigger (pinning, horizontal scroll, Lenis) e 8 receitas de Framer Motion v12 (`useScroll`, `useTransform`, variants). |
| **Remotion Oficial Completo** | `referencias/remotion/remotion-markup.md`<br>`referencias/remotion/remotion-render.md`<br>`referencias/remotion/remotion-captions.md`<br>`referencias/remotion/remotion-multimedia.md`<br>`referencias/remotion/remotion-maps.md`<br>`referencias/remotion/remotion-interactivity.md`<br>`referencias/remotion/remotion-saas.md`<br>`referencias/remotion/rules/` | Guias completos de composição React, áudio/vídeo, legendas TikTok/Reels, mapas 3D, renderização CLI/SSR e regras granulares do Remotion. |
| **Three.js, R3F, Shaders & WebGPU (13 módulos)** | `referencias/threejs/threejs-fundamentals.md`<br>`referencias/threejs/threejs-animation.md`<br>`referencias/threejs/threejs-react-three-fiber.md`<br>`referencias/threejs/threejs-shaders.md`<br>`referencias/threejs/threejs-postprocessing.md`<br>`referencias/threejs/threejs-materials.md`<br>`referencias/threejs/threejs-lighting.md`<br>`referencias/threejs/threejs-geometry.md`<br>`referencias/threejs/threejs-textures.md`<br>`referencias/threejs/threejs-loaders.md`<br>`referencias/threejs/threejs-interaction.md`<br>`referencias/threejs/threejs-performance.md`<br>`referencias/threejs/threejs-asset-pipeline.md` | Os 13 manuais completos de Three.js moderno (`r160+`), React Three Fiber, GLSL/TSL WebGPU, PBR, pós-processamento e pipeline de assets GLTF/Draco/KTX2. |
| **Lottie / Skia Skottie (`text-to-lottie`)** | `referencias/lottie/` (`player-contract.md`, `lottie-spec-map.md`, `motion-taste.md`, `design-taste.md`, `svg-compatibility.md`, `recipe-*.md`) | Todas as 22 referências e receitas da Diffusion Studio para autoria de Lottie JSON renderizável no Skia Skottie. |
| **Wiggle Logo Animator (`wiggle`)** | `referencias/wiggle/` (`SKILL-original.md`, `references/`, `scripts/`, `templates/`) | Scripts Python de extração de SVG, validação de Lottie, validação de loop perfeito e renderização GIF/MP4 para logos. |
| **Rive (`rive-skills`)** | `referencias/rive/` (`SKILL-original.md`, `references/`) | Referência completa da API Luau do Rive, State Machines, Data Binding, protocolos `Node`/`Layout`/`Converter`/`PathEffect` e runtimes React/Web. |
