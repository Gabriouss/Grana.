# Criativos web · RASCUNHO · Lumen (UI and Design) · 30/09/2026

**Pausa da regra 21 (`032d375`):** instruções de produção abaixo estão suspensas. Nenhuma produção antes de 03/10; só em 03/10 e 04/10, hora de Brasília, com pedido do autor naquela sessão. Fora desses dias, pausa até nova abertura pelo autor. Ver [README](../README-MATERIAL-FINAL.md).

**Estado: orientação de captura reconciliada, sem captura executada nesta tarefa.** Levantamento técnico original de Lumen em `9815df7`, matriz v2 do Meridian em `4df1554`, adendo do convite conferido em `b7774ea`. Texto comercial final e fila vigente: [COPYS-FINAIS.md](../../para-aprovacao/pecas/COPYS-FINAIS.md) e [README-MATERIAL-FINAL.md](../README-MATERIAL-FINAL.md). Duas frentes: navegador (computador e celular) e app Android. Implementado não equivale a validado; publicação exige QA por plataforma, dia D e aprovação comercial.

## 1. Como a versão web se apresenta hoje (conferido no código)

| Largura da janela | Classe (`lib/breakpoints.ts:38`) | Navegação | Onde acontece |
|---|---|---|---|
| < 768 px | `compacto` | Barra flutuante embaixo, uma coluna | Navegador no celular (Safari/iPhone e Chrome/Android, conforme largura) e janela estreita no computador |
| 768 a 1279 px | `medio` | Barra lateral (`SideNav`), duas colunas | Notebook pequeno, iPad |
| ≥ 1280 px | `amplo` | Barra lateral, até três colunas, conteúdo com teto de 1440 px (`LARGURA_MAXIMA_CONTEUDO`) | Notebook e monitor |

- Na web a barra lateral depende só da largura (`breakpoints.ts:405`). O iPhone sempre cai em `compacto`, então **no Safari do iPhone o layout é praticamente o do app Android**, sem o recurso nativo.
- `WebPhoneFrame.tsx` não emoldura mais nada: o app ocupa a janela inteira, com `100dvh`.
- Extratos e boletos usam `colunaLista` (900 px) e ficam centralizados numa tela larga. É uma coluna estreita de propósito, e o criativo deve mostrar isso sem parecer sobra.

**O que o código tira ou troca na web** (a matriz confirma o resto):
- **Fotografar nota** não aparece na web (`app/(app)/index.tsx:1562`). Nenhuma peça web mostra esse botão.
- Arrastar para reordenar widgets **só existe na web com duas ou mais colunas** (`WidgetGrid.tsx:58`), ou seja, no computador. Isso é um diferencial desktop.
- Categorias rápidas têm setas de rolagem só na web (`index.tsx:1206`). Os botões de ação da Início se organizam em outra grade na web (`index.tsx:1576`).
- O convite para baixar o app Android aparece uma vez por navegador (`ConviteAppAndroid.tsx`). Numa captura para o público iPhone ele **não pode aparecer**, porque convidaria a baixar um APK que o iPhone não instala.
- Widget da tela inicial, notificação push e barra com desfoque nativo são só Android. No navegador o desfoque vem do CSS (`_layout.tsx:125`).
- **Lançar por voz** aparece na web (não há trava de plataforma em `index.tsx:1508`, e `lib/voz.ts:105` grava `.webm` na web). **[matriz]** Falta confirmar o microfone no Safari do iPhone e no Chrome do computador antes de qualquer peça dizer "fale no navegador".
- Não existe manifesto de PWA. `app/+html.tsx:30` só tem `apple-touch-icon`. **[matriz]** Falta confirmar como fica "Adicionar à Tela de Início" no iPhone antes de ensinar isso num criativo.

## 2. O que já existe de captura, e o que está velho

| Arquivo | O que mostra | Estado |
|---|---|---|
| `public/telas/inicio-web.png` (1440×900) | Início desktop, dados de exemplo | **Desatualizado, não usar.** Mostra "Escanear nota", que a web não tem mais e que não existe mais no código, e "Lançamento por voz" (hoje "Lançar por voz"). Isso seria prometer algo que o produto não entrega. |
| `public/telas/multiplataforma.webp` | Notebook + celular Android | Herda a captura velha. Além disso o celular tem cara de Android, o que serve ao público 2 e **não serve** ao público iPhone. |
| `public/notebook/notebook.webp` | Notebook do herói da landing | Refazer junto, com `scripts/compor-mockup-multiplataforma.mjs --notebook`. |
| `design-system/marketing-mockups/notebook-vazio.png`, `celular-vazio.png` | Molduras aprovadas | O notebook serve. **Não há moldura de iPhone nem de Safari.** |

Também há marcas reais nos dados de exemplo ("Nubank Ultravioleta", "Itaú Personalité Black"). Pergunta para o Lynx/Watchtower: em anúncio pago, nome de banco pode ler como parceria ou endosso. Proposta: trocar por nomes genéricos ("Cartão roxo", "Cartão black") antes das capturas de anúncio.

## 3. Como capturar a versão web real

- Conta de teste com o interruptor **Perfil → Dados de exemplo** ligado. Dado 100% inventado, nenhum resto "AUDIT" (a checagem já existe em `scripts/capturar-campanha-web.cjs`). Login pela própria ferramenta, lendo `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` no processo. Nada de credencial em texto (regra 15/18).
- Saudação sem nome (o `clean()` do script já faz isso), sem selo "exemplo" e sem o convite do app Android.
- Tamanhos de janela: **1440×900** (notebook), **1280×800** (limite de `amplo`), **1024×768** (`medio`, duas colunas) e **393×852 / 430×932** (referências de largura de celular, `compacto`; conferir Safari/iPhone e Chrome/Android reais), com `deviceScaleFactor` 2 ou 3.
- A tela vem sempre de captura real. **Moldura** de navegador no computador ou celular pode ser desenhada à mão (SVG/CSS) ou vir de mockup licenciado. Nunca IA gerando a tela.
- Atenção ao `reduced-motion`: capturar com a preferência desligada para que os gráficos já estejam montados, e esperar `document.fonts.ready`.

**Captura de escrita:** Colar, Importar e Foto bloqueiam a gravação com Dados de exemplo ligado. Para uma tomada que mostre salvar/importar, usar conta de teste isolada com dados fictícios e o modo desligado, conforme README. Não editar o app nem simular sucesso. QA, captura e autorização operacional da escrita pertencem à produção posterior.

## 4. Fila vigente (14 peças web)

C01 a C07 têm captura no computador e no celular, com o mesmo texto; C05 usa o apoio específico de cada aparelho. O quadro de 20 peças e as prioridades estão no README. O arquivo COPYS-FINAIS fornece todo o texto comercial.

A lista antiga W1/I1/M1 e os três públicos foi superada pelo retorno do autor. Não há peça exclusiva de iPhone, estático, carrossel, voz web, instalação web ou moldura que sugira App Store nesta fila. Capturar o navegador real com endereço reconhecível e controles legíveis, sem inventar tela por IA.

## 5. Pendente de produção e QA

1. QA Q1 e Q2 por função e plataforma, inclusive CSV/OFX até persistência e confirmação legível.
2. Novas capturas das telas e gestos reais, com dados fictícios e nomes genéricos.
3. Composição e revisão visual das versões computador/celular; nenhuma peça foi renderizada aqui.
4. QA de oferta Q4 para C07, dia D e aprovação comercial antes de publicar.

Voz, foto, widgets e biometria ficam apenas no material Android, conforme a matriz e os portões. A matriz fonte permanece histórica; o adendo de `b7774ea` está no README.
