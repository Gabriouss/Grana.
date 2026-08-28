# Impeccable Audit — Grana.

Reauditoria: 27 de agosto de 2026
Escopo: estado combinado atual do aplicativo Expo/React Native
Plataformas: iOS, Android e web (`adaptive`)
Modo: **Operate**

## Veredito

**Conforme por fonte.** Os 2 achados P1 e os 5 achados P2 da auditoria anterior foram corrigidos. Não restam P0, P1 ou P2 abertos no repositório.

## Audit Health Score

| Dimensão | Antes | Agora | Evidência principal |
|---|---:|---:|---|
| Acessibilidade | 3/4 | **4/4** | Fonte do sistema no conteúdo operacional, papéis semânticos, piso tipográfico, Dynamic Type/sp, alvos 44/48 e Reduce Motion centralizado. |
| Performance | 2/4 | **4/4** | Faturas consultadas por mês, contexto recorrente limitado, lista vertical virtualizada e agregados históricos de Desafios no Postgres. |
| Aparência e temas | 3/4 | **4/4** | `expo-system-ui` instalado/configurado, fundo raiz escuro e StatusBar coerente. |
| Conformidade de plataforma | 2/4 | **4/4** | Native Tabs no iOS/Android, sidebar adaptável no iPad, Navigation Bar/ripple Material no Android e Switch nativo. |
| Adaptatividade | 3/4 | **4/4** | Classes de janela nativas/web, rotação/multiwindow, documentação e código sincronizados. |
| **Total** | **13/20** | **20/20 — Excellent** | **+7 pontos; nenhum achado de prioridade aberto.** |

## Achados anteriores — resolução

### P1 — Navegação e controles globais customizados

**Resolvido.** `app/(app)/_layout.tsx` usa Native Tabs do Expo Router no iOS/Android; a barra de vidro e o SideNav ficaram exclusivos da web. iOS recebe material/sidebar adaptável, Android recebe indicador, ripple, histórico de Back e insets do sistema. `ToggleSwitch` delega ao `Switch` nativo no mobile; segmentados e sheets têm métricas/tratamento por plataforma.

### P1 — Tipografia fixa e fonte de marca em toda a interface

**Resolvido.** `lib/theme.ts` separa Neue Machina (marca/headlines) da família do sistema (corpo, dados, campos e controles), define papéis semânticos e bases próprias de iOS/Android/web. O scaling do React Native continua habilitado. `DESIGN.md`, `PRODUCT.md`, `context.md` e o sidecar do Impeccable documentam a nova regra.

### P2 — Coleções crescentes e agregações históricas no cliente

**Resolvido.** Crédito consulta apenas o mês selecionado e o mês corrente, limita o contexto de recorrência a 24 meses e renderiza lançamentos numa `FlatList` vertical com janela e linha memoizada. Desafios baixa 45 dias para streak/score e usa `get_gamification_summary()` para totais cumulativos protegidos por `auth.uid()`; existe fallback temporário para bancos ainda não migrados.

### P2 — Reduce Motion incompleto nos modais

**Resolvido.** `components/AppModal.tsx` converte qualquer transição solicitada em `none` quando a preferência do sistema está ativa; todos os modais com `slide` fixo foram migrados. Os modais que já tratavam a preferência diretamente permanecem conformes.

### P2 — Tema escuro sem integração Android

**Resolvido.** `expo-system-ui@57.0.3` está instalado, registrado como config plugin, com `backgroundColor` petróleo no app config e no root view.

### P2 — Alvos compactos

**Resolvido.** Steppers, CTA de Crédito, setas de carrossel/reordenação, botão de voltar do onboarding, scanner e seletor de cores usam o token `touchTarget` (44 pt iOS/web, 48 dp Android). Círculos menores remanescentes são indicadores decorativos internos a linhas tocáveis.

### P2 — Divergência entre código e documentação adaptativa

**Resolvido.** `lib/breakpoints.ts`, `DESIGN.md`, `PRODUCT.md`, `context.md`, `.impeccable/design.json` e comentários dos componentes descrevem a mesma arquitetura adaptativa e nativa.

## Verificações executadas

- `npx tsc --noEmit`: **passou**.
- `npx expo config --type public`: **passou**; SDK 57, orientação livre, tema escuro, Predictive Back e plugin `expo-system-ui` confirmados.
- `npx expo export --platform web`: **passou**; 1.241 módulos empacotados.
- Detector Impeccable, escopo `type` no app logado: **0 achados**.
- Detector Impeccable, escopo `layout` no app logado/componentes/lib: **0 achados**.
- QA visual autenticado em `1440×1000` e `390×844`: **passou**; a faixa de ações inteligentes foi ajustada para uma grade responsiva sem corte de rótulos e com alvos mínimos de toque.
- Corpus de parsers: **todos passaram**, incluindo 250.200 casos gerados, 34.093 verificações de WhatsApp e os corpora novos de categorias, consulta e limite de cartão.
- `git diff --check`: **passou** (somente avisos de conversão LF/CRLF do Git no Windows).
- `.impeccable/design.json`: **JSON válido**.

## Limites de validação

Não há simulador iOS, emulador/ADB Android ou hardware conectado nesta máquina; portanto, a conformidade nativa foi verificada por fonte, tipos, configuração e bundle. A validação visual final em iPhone, iPad, telefone e tablet Android continua sendo um gate de release, não um defeito de código identificado.

## Implantação remota

**Concluída em 27 de agosto de 2026.** `get_gamification_summary()` foi aplicado ao projeto remoto configurado no Grana. e confirmado no catálogo e na especificação OpenAPI. A função está como `security invoker`, `stable`, com `search_path` vazio, sem execução por `anon` e liberada somente para `authenticated` e `service_role`.
