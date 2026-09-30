# Matriz de plataformas do Grana. · Meridian · 30/09/2026 · v2, depois da rodada 1 com o Compass

**Fotografia:** `origin/main` = `4df1554`. Os commits depois da v1 (`3aad437`, `4df1554`) só mudaram o recibo de voz e a data do Colar; as linhas citadas abaixo foram reconferidas nesse commit. Quem usar esta matriz depois de novos commits confere de novo as linhas antes de citar.

**Método:** li o código. Não abri emulador, navegador nem iPhone.

## Duas perguntas separadas

- **Implementado:** o código põe a função naquela plataforma, sem trava contra ela. Isso prova que existe, não que funciona na mão da pessoa.
- **Validado:** existe registro de alguém usando a função naquela plataforma. Cito o registro quando há.

**Regra para o marketing:**
- **Produzir** criativo pode partir do que está implementado. Nada vai ao ar antes do dia D.
- **Publicar** uma promessa exige que ela esteja **validada** na plataforma do público. Sem validação, o item fica **pendente de QA**, e a peça que depende dele não sai.

Legenda: **I** implementado · **N** não implementado · **?** não confirmado no código · **V** validado (com registro) · **QA** pendente de QA.

## O que existe de validação hoje

- **Android:** houve varreduras no emulador em 18 e 19/09, e elas **não chegaram a 100%** (`context.md:798-801`). Depois houve conferências pontuais, como o Colar no emulador em 29/09 (`context.md:13025`). Não houve aparelho físico nem APK 1.10.5.
- **Navegador no computador:** só há validações pontuais. Um defeito do seletor de categoria foi reproduzido e corrigido no navegador em 02/09 (`context.md:5202-5206`). Nenhuma passada sistemática da área logada foi registrada.
- **Safari do iPhone:** não achei nenhum registro. O item "Safari/iOS e Firefox: nada testado" (`context.md:1722`) é da checklist **da landing**, não do produto: serve de indício, não de prova sobre a área logada.
- **Consequência:** hoje **nenhuma** função está validada nas três plataformas. A coluna "Promessa" abaixo diz o que falta para cada uma.

## Matriz

| Função | Android | Computador | iPhone (Safari) | Tela inicial / PWA | Promessa hoje | Prova no código |
|---|---|---|---|---|---|---|
| Como se instala | I: APK por download direto, sem Play Store | não se aplica | N: não há app de iPhone na distribuição documentada | ?: não achei manifesto nem service worker | Android: "baixe no site", nunca "na loja". iPhone e computador: "use pelo navegador" | `vercel.json:6-8` (APK nas Releases), `eas.json:12-15,24-27` (perfis só com APK Android), `app/baixar.tsx:73`; busca por `manifest`/`serviceWorker` sem resultado no app e em `public/` |
| Adicionar à tela inicial do iPhone | não se aplica | não se aplica | ?: há ícone e ajuste de área segura; o comportamento real não foi verificado | ? | Não prometer "instalar" nem "app" no iPhone. O comportamento depende de QA no Safari | `app/+html.tsx:23-30` (`viewport-fit=cover`, `apple-touch-icon`) |
| Entrar, cadastrar, recuperar senha | I | I | I · QA | ? | QA nas três | `lib/supabase.ts:80,150`; `lib/auth-context.tsx:218` (callback só no nativo) |
| Assinar (Cakto) | I | I | I · QA | ? | QA nas três (houve venda real em 13/09, segundo a memória do projeto, sem registro da plataforma; o fluxo no Safari nunca foi registrado) | `app/assinar.tsx:63,183` (`Linking.openURL`), flag `assinatura_checkout` |
| Saldo do mês, Livre para gastar, lançamentos, contas, crédito, metas, cofrinhos, gráficos | I · emulador parcial | I | I · QA | ? | Android: emulador parcial, falta aparelho. Web e iPhone: QA | telas em `app/(app)/`, sem `.web.tsx` e sem trava de plataforma; layout largo na web em `lib/breakpoints.ts:405` |
| Colar comprovante | I · V no emulador (29/09) | I | I · QA | ? | Android pronto depois do QA do APK; web e iPhone: QA | `app/(app)/index.tsx:1536` (só pela flag); `components/PasteReceiptModal.tsx` sem `Platform` |
| Importar extrato (CSV/OFX) | I | I, seletor de arquivo do navegador | I · QA (seletor de arquivo do iOS) | ? | QA nas três | `app/(app)/index.tsx:1549`; `lib/escolher-arquivo.ts:45` |
| Lançar por voz dentro do app | I | I · **falha relatada no Firefox** | I · QA | ? | **Não mostrar voz em peça para web ou iPhone.** Android: QA do APK | botão sem trava de plataforma (`app/(app)/index.tsx:1508`); pede `audio/webm` (`components/VoiceEntryButton.tsx:50`); o `expo-audio` omite o formato quando o navegador não o suporta e deixa o navegador escolher (`node_modules/expo-audio/build/AudioRecorder.web.js:155-168`); o envio usa sempre o nome `lancamento.webm` e o Blob real (`lib/voz.ts:105,108-116`); o servidor aceita webm e mp4 (`supabase/functions/processar-lancamento-voz/index.ts:45,50`). **O formato que o Safari grava e a causa da falha no Firefox não foram apurados** (`context.md:8775`) |
| Voz pelo widget e fila de voz sem rede | I | N | N | N | Só Android, depois do QA do APK | `lib/widget-voz-task.ts:592,704`; `app/_layout.tsx:236` |
| Reconhecimento de voz no próprio aparelho | I, Android 13 ou mais novo | N | N | N | Detalhe técnico, não vira promessa | `lib/voz-local.ts:31` |
| Widgets da tela inicial | I | N | N | N | Só Android, depois do QA do APK | `components/SincronizadorWidgetsHome.tsx:37` |
| Fotografar nota | I (flag ligada em produção em 28/09, `context.md:13089`) | N, botão escondido | N | N | Só Android, depois do QA dos 10 cupons | `app/(app)/index.tsx:1562` |
| Ler QR da NFC-e | N para o usuário: o leitor existe, mas só abre pelo atalho de teste `grana://scan-qr` | N | N | N | Não prometer | `app/(app)/index.tsx:515`; `lib/deep-links.ts:12`; `docs/mapa-do-app-para-agentes.md:53-55` |
| Lembretes e notificações | I, local; push pelo FCM nunca testado em aparelho | N | N | N | Só Android, depois do QA | `lib/notifications.ts:18`; `lib/push-notifications.ts:38,115`; `app/_layout.tsx:193` |
| Trava por biometria | I | N | N | N | Só Android | `lib/app-lock-context.tsx:57` |
| Bloqueio de print | I | N | N | N | Só Android | `lib/screen-capture-context.tsx:47` |
| Aviso de versão nova | I | não se aplica | não se aplica | não se aplica | Não é promessa | `components/UpdateBanner.tsx:23,27` |
| Valores ocultos | I | I, desfoque em CSS | I, **o mesmo caminho em CSS da web** · QA | ? | QA nas três | `lib/privacy-context.tsx:20,46`; `components/PrivacyValue.tsx:52` (CSS para `web`, que inclui o Safari, e para `android`; o outro caminho é o do iOS nativo, que não é distribuído) |
| Granabô (chat) | I | I | I · QA | ? | QA nas três | `app/(app)/_layout.tsx:505`; desfoque só na web em `components/Granachat.tsx:548` |
| Lançamento sem internet | I | ?: o armazenamento existe, mas o uso real não foi conferido | ? | ? | Só Android, depois do QA | `lib/offline-cache.ts` (`AsyncStorage`); retomada da fila de voz só no Android (`app/_layout.tsx:236`) |
| Exportar meus dados | I | I, baixa JSON | I · QA (download no iOS) | ? | QA | `lib/exportar-meus-dados.ts:131` |
| Relatório em PDF | I | I | I · QA | ? | QA | `lib/pdf-report.ts:28,50` |
| Convite para baixar o APK | não aparece | aparece uma vez | **pode aparecer** para quem usa iPhone | pode | Risco para o público do iPhone | `components/ConviteAppAndroid.tsx:39-44`: basta estar na web, ter a URL configurada (`lib/download-app.ts:9-11`) e não ter visto o convite. Não distingue iPhone. **Não foi reproduzido** |
| Tema e orientação | só escuro, só retrato | escuro | escuro | escuro | Nunca mostrar tema claro nem tela deitada | `app.json`; decisão do autor em 19/09 |

## Riscos para o marketing

1. **O convite do APK pode aparecer no iPhone** (`ConviteAppAndroid.tsx:39-44`). Fica elegível pelo código, sem reprodução. Se aparecer, contradiz a mensagem ao público 3. É achado de produto a encaminhar a Anvil e Lumen; até a correção e o QA, nenhum criativo para iPhone mostra essa tela.
2. **Voz na web:** implementada, com falha relatada no Firefox, formato real no Safari desconhecido e causa não apurada. Nenhuma peça para computador ou iPhone mostra voz.
3. **Instalação no iPhone:** não há manifesto nem service worker no código. O que o Safari faz ao adicionar à tela inicial depende de QA. Até lá, nenhuma peça fala em "instalar" ou "app" no iPhone.
4. **Área logada no Safari sem nenhum registro de uso.** Antes de qualquer tráfego para o público 3, é preciso uma passada num iPhone real.

## QA mínimo para liberar as promessas (dono: Vigil ou Sentinel; o iPhone real é do autor)

1. **Chrome no computador:** entrar, lançamento manual, Colar, Importar extrato, Granabô, valores ocultos, exportar dados e ida à assinatura sem pagar. Voz registrada à parte, só como diagnóstico.
2. **Safari no iPhone:** os mesmos itens, mais adicionar à tela inicial (como abre e se a sessão continua) e se o convite do APK aparece.
3. **APK 1.10.5:** o roteiro `E:/Grana-temporarios/2026-09-29-pre-build/roteiro-qa-aparelho-1.10.5.md` já cobre o Android.

Cada item que passar vira V na célula. Só então entra na lista de promessas do `plano-3-publicos.md` do Flare.

## Rodada 1 com o Compass (registro do debate)

Aceitei os seis pontos. Cada um foi conferido no trecho citado:

- **(1)** Ausência de trava prova implementação, não uso. Por isso a matriz separa implementado de validado.
- **(6)** A v1 misturava ✅ e ❓ no Safari e prometia as mesmas funções. O `context.md:1722` é da landing.
- **(2)** A v1 dava como certo que o Safari cai em mp4. O `expo-audio` só omite o formato não suportado.
- **(3)** "Abre como aba" era suposição.
- **(4)** A falta de perfil iOS sozinha não prova que não há app. A conclusão agora é a distribuição documentada.
- **(5)** O convite "pode aparecer", mas não foi reproduzido.

Correção extra do Compass, que procede: o iPhone usa o CSS da web em `PrivacyValue.tsx:52`. A fotografia foi atualizada para `4df1554`.
