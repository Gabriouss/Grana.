# Handoff — terminar a reescrita da landing page do Grana.

**Para:** próxima sessão (Codex) · **De:** sessão Claude de 28/08/2026
**Estado:** implementação concluída em trabalho local, **nada commitado**.
`npx tsc --noEmit` limpo e `npm run test:parser` verde no momento da entrega.

Este documento é autossuficiente: traz o que já foi feito, o que falta, e
principalmente **os fatos do código que a copy não pode contrariar**. Leia a
seção "Armadilhas" antes de escrever qualquer texto.

A fonte da nova copy é `COPY_LANDING_GRANABO.md` (mesma pasta). Onde este
handoff diverge dela, este vale: ele já incorpora as correções de fato e as
decisões que o autor tomou depois.

---

## 1. Contexto comercial (mudou, e muda a página inteira)

- O produto será **pago desde o primeiro dia: R$ 9,99/mês**. **Não existe
  período de teste gratuito.** Toda copy de "grátis", "acesso antecipado" e
  "sem cadastrar cartão" foi removida e não deve voltar.
- **Não existe URL de checkout da Kiwify no código**, e `temAssinaturaAtiva()`
  (`lib/assinatura.ts:65`) não é chamada em tela nenhuma: **não há paywall**.
  Quem cria conta hoje tem acesso completo.
- Daí a decisão do autor: **preço visível somente na dobra de Preços;
  botões criam conta**. Fora da oferta, os CTAs não repetem valor nem Kiwify.
  **Nenhum botão pode prometer compra** enquanto não houver checkout.
- **Não escrever "cancele quando quiser"** nem condições de renovação: os
  termos da Kiwify ainda não foram confirmados pelo autor.

## 2. Arquitetura de dobras (alvo)

Cada dobra avança um argumento diferente. Os canais de lançamento são
explicados **uma vez cada** — a repetição era a principal queixa do autor na
revisão ao vivo.

| # | Dobra | Estado |
|---|---|---|
| 1 | Hero | **pronta** |
| 2 | Tentativas que ficam pelo caminho (dor) | **pronta** |
| 3 | Lançar é esforço quase zero | **pronta** |
| 4 | Granabô no WhatsApp | **pronta** |
| 5 | Construção do hábito (gamificação) | **pronta** |
| 6 | Livre para Gastar | **pronta** |
| 7 | Tudo que o Grana. faz | **pronta** |
| 8 | Segurança e controle + verificação da Meta | **pronta** |
| 9 | Assinatura | **pronta** |
| 10 | FAQ | **pronta** |
| 11 | CTA final | **pronta** |
| — | Rodapé em colunas + Instagram | **pronto** |

## 3. O que já está pronto

- **Hero colapsado** de 4 capítulos para uma cena só (`HeroStorytelling` em
  `app/index.tsx`). Os capítulos 2 e 3 repetiam WhatsApp e QR, que agora têm
  dobra própria. A revelação letra a letra do título foi preservada porque é a
  assinatura registrada no `DESIGN.md`.
- **Dobras 3 e 4 novas**, inseridas depois da dor.
- **Oferta paga** consistente em landing, FAQ, faixa de confiança,
  `PRODUCT.md` e `context.md`.
- **Correção de fato**: `lib/home-tour.ts` dizia que dava para mandar "foto da
  nota" pelo WhatsApp. O webhook responde que só entende texto ou áudio.
- **3 componentes novos** criados. Um em uso, dois **ainda não**:

| Componente | Uso |
|---|---|
| `components/ConversaGranabo.tsx` | já usado na dobra 4 |
| `components/CardLivreParaGastar.tsx` | **criado, não usado** → dobra 7 |
| `components/MiniMockBeneficio.tsx` | **criado, não usado** → dobra 8 |

## 4. O que falta, em ordem

### Dobra 5 — Construção do hábito (nova)

Onde hoje está o "Guia — 4 passos numerados". O autor quer isso com destaque:
é o que segura quem se sente indisciplinado controlando as próprias finanças.
Enquadramento aprovado por ele: **"apoiado em princípios de formação de
hábito", sem nomear estudo**. Não afirmar respaldo científico com fonte.

Existe de verdade e pode ser citado:

- **Sequência de dias** com lançamento (`lib/gamification.ts:66-120`) e o card
  "Ritmo da Semana".
- **12 conquistas**, nomes reais: Primeiro Registro, Ritmo Inicial, Semana
  Blindada, Hábito Inquebrável, Centurião Financeiro, Arquiteto de Gastos,
  Pontualidade Britânica, Guardião dos Vencimentos, Mês Verde, Primeira
  Fortaleza, Visão Completa, Mapeador 360° (`lib/gamification.ts:233-384`).
- **Score Grana 0–1000** em 4 fatores, com 5 Faixas (`lib/gamification.ts:125-228`).
- **Elos**: Aprendiz, Construtor, Gestor, Estrategista, Mestre, Grão-Mestre,
  Lenda Financeira (`lib/gamification-infinite.ts:12-20`).
- **Lembrete diário** no horário escolhido (19:00 / 20:30 / 21:30), com 48
  mensagens que variam por sequência e inatividade
  (`lib/notification-messages.ts`).
- **Retrospectiva mensal** automática do mês fechado (`lib/monthly-wrapped.ts`).

Visual: `public/telas/conquistas-web.png` já existe.

### Dobra 6 — Fale o gasto (voz)

Reescrever a atual "Como entra o lançamento" para tratar só da **voz no app**:
a pessoa fala, o reconhecimento roda no próprio aparelho, e o lançamento abre
na confirmação com o eco "Ouvi: ...". O QR entra como linha de apoio, sem
imagem própria nem peso de manchete.

### Dobra 7 — Livre para Gastar

O texto já foi corrigido e está fiel à fórmula real. **Falta trocar o
visual**: hoje mostra a linha do tempo de compromissos, que não é o que o
texto descreve. Trocar por `<CardLivreParaGastar />`.

### Dobra 8 — Tudo que o Grana. faz (nova)

O autor pediu: **todos os benefícios explicados e exibidos**. Substitui a
grade de 6 recursos. Seis grupos:

- **Lançar**: voz, Granabô, QR, colar comprovante Pix, importar CSV (até 500
  por vez), manual com parcelas, fila offline.
- **Cartão**: limite e fatura por cartão, parcelamento que vira N lançamentos
  reais, pagar fatura saindo da carteira escolhida, alerta ao cruzar
  50/70/90/100% do limite, lembrete de vencimento.
- **Contas e boletos**: recorrência mensal, pagar em um toque criando a saída,
  próxima ocorrência gerada sozinha, lembretes em 4 etapas.
- **Ver o mês**: fluxo financeiro (Mês/7 dias/Ano), gastos por categoria,
  comprometimento futuro de 6 meses, tela de Gráficos com período
  personalizado, relatório em PDF.
- **Organizar**: carteiras, cofrinhos com prazo, orçamentos por categoria com
  4 templates, categorias próprias com 30 cores.
- **Do seu jeito**: Home personalizável (10 blocos, por conta e não por
  aparelho), atalhos `grana://`, modo de exemplo com dados fictícios.

**Cada card leva um mini-mock no topo, não um ícone.** Usar
`<MiniMockBeneficio variante="..." />`, que já tem as 6 variantes prontas:
`lancar`, `cartao`, `boletos`, `mes`, `organizar`, `personalizar`. Foi a
técnica mais forte da página do concorrente que o autor mandou de referência,
e é o que ele quer dizer com benefícios "exibidos": o benefício aparece
funcionando, em vez de descrito.

Enquadramento aprovado: posicionar contra planilha e app comum. **Sem** usar a
construção "não é X, é Y" (ver Regras de estilo) — a linha do concorrente
("Não somos mais uma planilha bonita. Somos uma plataforma...") é exatamente o
padrão proibido.

Manter a estética do Grana.: `paperRaised` + borda `rule`, não o card branco
do concorrente.

### Dobra 9 — Segurança + verificação da Meta

**Decisão explícita do autor:** a verificação da Meta fica **nesta dobra**, e
não em dobra própria. Duas metades, com fronteira explícita no texto:

1. **Com quem você está falando** — empresa verificada pela Meta, canal
   oficial do WhatsApp Business, número vinculado por código de 6 dígitos
   válido por 15 minutos (`lib/data.ts:691`,
   `supabase/functions/whatsapp-webhook/index.ts:977`).
2. **O que acontece com seus dados** — sem conectar banco, só você acessa,
   dados não vendidos, modo privacidade, biometria no app móvel, editar
   lançamentos e excluir conta e dados quando quiser.

**A fronteira entre as duas metades é obrigatória.** Sem uma frase dizendo que
a verificação cobre identidade da empresa e do canal, a dobra faz parecer que
a Meta certifica a segurança do produto, o que é falso.

Dois fatos técnicos verdadeiros reforçam a metade 1 sem inflar: a chamada
recebida da Meta é validada por assinatura HMAC `X-Hub-Signature-256` com
comparação em tempo constante (`whatsapp-webhook/index.ts:791-838`), e o texto
transcrito do áudio nunca é gravado em log (`:947-952`).

### Dobra 12 — CTA final

Hoje é só título e botão. O autor achou pobre demais para fechar quem leu a
página inteira. Precisa de argumento, prova visual (composição com o
lançamento organizado e o Livre para Gastar), preço, e três reforços de
confiança: sem conectar banco, Granabô no WhatsApp, celular e computador.

### Rodapé em colunas + Instagram

- **Instagram**: `https://www.instagram.com/granaponto/` — no **rodapé e no
  cabeçalho**, ícone circular, nova aba, com `accessibilityLabel`. Usar
  `Ionicons` `logo-instagram`: a CSP do `vercel.json` restringe `img-src` ao
  próprio domínio e ao Supabase, então ícone de CDN externo seria bloqueado.
- **Rodapé em colunas**, só com destinos que existem:
  - **Produto** — Como funciona (`#produto`), Granabô (`#granabo`, âncora já
    criada), Preços (`#precos`), Perguntas frequentes (criar a âncora).
  - **Conta** — Criar conta (`/sign-up`), Entrar (`/sign-in`).
  - **Transparência** — `/termos`, `/privacidade`, `/exclusao-de-dados`.
- **Não criar** colunas Blog, Carreiras, Sobre, Contato, Status ou
  comparativos "Grana vs X": nenhuma dessas páginas existe, e a referência que
  o autor mandou tinha todas elas.
- **E-mail continua fora** do rodapé: é a página que mais recebe clique frio
  de anúncio, e o contato exigido pela LGPD já está na Política de
  Privacidade.

## 5. Armadilhas — fatos do código que a copy NÃO pode contrariar

Verificados um a um no código. Errar aqui transforma comportamento normal do
produto em promessa quebrada.

1. **QR Code não traz o valor na maioria das compras.** Ele só vem no QR em
   nota emitida em contingência; na emissão online o QR carrega só a chave de
   44 dígitos e **o app pede o valor** (`lib/nfce-parser.ts:4-25,47`). Nunca
   escrever "sem precisar digitar". Foi por isso que o autor decidiu **dar
   menos protagonismo ao QR**: ele saiu do hero e não tem dobra própria.
2. **XP não vem de registrar gasto.** As três únicas fontes são cofrinhos:
   criar (+25), guardar (1 XP a cada R$ 10, piso 5, teto 200) e bater meta
   (+150) — `lib/goals.ts:7-11,40,71-76`. Não prometer "ganhe pontos
   registrando".
3. **Conquistas não são persistidas.** Não existe tabela de badges; as de
   sequência e o "Mês Verde" **voltam a bloquear** quando a condição deixa de
   valer. Não prometer "conquistas para sempre".
4. **Não existe escudo/proteção de sequência.** `streak_shields` está no
   schema marcado como "reservado para uso futuro"
   (`supabase/schema.sql:469-474`), sem nenhuma lógica. Não citar.
5. **Não existe celebração ao desbloquear conquista.** Nada dispara no
   unlock: nem toast, nem push, nem confete. A pessoa descobre entrando na
   aba Desafios.
6. **A fatura do cartão não respeita o ciclo de fechamento.** É a soma das
   transações de crédito do mês-calendário (`app/(app)/credito.tsx:218-225`);
   `closing_day` só decide em que mês cai o vencimento.
7. **Voz não funciona em qualquer navegador.** Só Chrome, Edge e Safari, e não
   funciona no Expo Go (`components/VoiceEntryButton.tsx:20,29-31,101-104`).
8. **WhatsApp não aceita imagem.** Só texto e áudio
   (`whatsapp-webhook/index.ts:2140`).
9. **Notificações não existem na web** (`lib/notifications.ts:14`); bloqueio
   de print é **só Android**; biometria só em aparelho com biometria
   cadastrada.
10. **Sem prova social.** Não existem depoimentos, número de usuários nem
    estatística com fonte verificável. **Não inventar**, mesmo que o
    concorrente use (ele usa: "500 mil brasileiros", "78% dos brasileiros",
    sete depoimentos nominais, tudo sem fonte).

## 6. Regras de estilo (permanentes, não desta rodada)

- **Sem travessão** na copy. Exceção: o título de marca em
  `landing-meta.json`, que já é o padrão vigente.
- **Sem construção "não é X, é Y"** e variantes ("o problema não é X, é Y").
  Afirmar direto.
- **Sem absolutos**: "sozinho", "na hora", "cada real", "zero esforço",
  "nunca erra". O autor mesmo formulou a saída para um deles: **"esforço
  quase zero"**.
- Sempre **"sugere uma categoria"** e **"você só ajusta se precisar"**.
- Sempre condicionar o Livre para Gastar ao que a pessoa registra.
- **Neue Machina é a única fonte** do produto, Light e Regular, sem
  `fontWeight`. Não existe itálico nem serifa: destaque tipográfico se faz com
  **cor** (`theme.accent2` / `styles.destaqueInline`), nunca sintetizando
  estilo. Uma rodada anterior trocou a fonte inteira do app pela do sistema e
  precisou ser revertida.
- Linguagem próxima do leitor, segunda pessoa, sem jargão de fintech.

## 7. Verificação antes de entregar

1. `npx tsc --noEmit` limpo.
2. `npm run test:parser` verde.
3. Servidor local (`npx expo start --web`) e inspeção **em 390×844 e
   1440×1000**, dobra por dobra: sem rolagem horizontal, sem texto cortado,
   CTA e microcopy visíveis juntos, preço sem quebrar em duas linhas (já
   aconteceu uma vez).
4. Clicar em cada link do rodapé e no Instagram: nenhum destino morto,
   âncoras rolando para a dobra certa.
5. Buscas de regressão em `app/index.tsx`:
   - `grep -c "grátis\|gratuito\|acesso antecipado\|19,99\|30 segundos"` → **0**
   - travessão em copy → só o título de marca
6. Conferir cada afirmação nova contra a seção "Armadilhas".
7. **Não commitar nem publicar sem o autor revisar ao vivo.** Ele pediu
   explicitamente que este trabalho fique em localhost.

## 8. Pendências que dependem do autor

1. **Selo da Meta** — para desenhar o selo na dobra 9, é preciso saber o que o
   perfil do Granabô exibe hoje na conversa. Sem confirmação, afirmar em texto
   e não representar selo. **Não usar o lockup "Meta Business Partner"** (é
   outro programa, com critérios próprios) nem reproduzir o logotipo da Meta.
   A referência que o autor mandou também dizia "conversas seguras do início
   ao fim", que seria falso: a mensagem chega legível ao servidor, que lê o
   texto e manda o áudio para transcrição.
2. **Kiwify** — URL do checkout, condições de renovação e cancelamento.
3. **Capturas** — só existem 4 telas em `public/telas/`: `inicio-web`,
   `inicio-mobile`, `graficos-web`, `conquistas-web`. Lançamentos, Crédito,
   Contas, cofrinhos e pareamento não têm captura; ou se produz, ou se
   reconstrói como mock a partir dos componentes reais, que é o caminho que a
   landing já usa.

## 9. Continuidade concluída em 28/08/2026

- Implementadas as dobras de formação de hábito, voz no app, Livre para
  Gastar, benefícios e segurança/identidade do canal.
- CTA final reconstruído com conversa do Granabô, provocação e fatos
  objetivos; rodapé recebeu navegação completa e Instagram.
- Criados mocks locais, com dados fictícios, para voz e seis benefícios; o
  mock de Livre para Gastar passou a reproduzir a estrutura do produto real.
- Corrigido overflow dos mocks no layout compacto e validado o fluxo em
  390×844 e 1440×1000, sem rolagem horizontal causada pelo conteúdo.
- `npx tsc --noEmit` e `npm run test:parser` passaram. Auditoria axe-core:
  zero violações; contraste ficou como revisão manual por causa das camadas
  translúcidas do layout.
- Todos os alvos internos existem. O Instagram permanece somente no rodapé,
  aponta para `@granaponto` e abre em nova aba com `noopener noreferrer`.
- Busca de regressão por promessas/preços antigos retornou zero ocorrências.
- Nada foi commitado nem publicado. A revisão do autor em localhost continua
  sendo o próximo gate.

## 10. Ajustes de copy após revisão ao vivo

- Hero passou a prometer a visualização do mês; a linha que enumerava
  WhatsApp e voz foi removida.
- A dobra de facilidade usa "Você fala e o Grana. organiza".
- A dobra exclusiva de voz foi removida, assim como o componente visual que
  existia apenas para ela. Voz continua aparecendo como recurso do produto.
- Livre para Gastar deixou de usar quebras manuais no título e no parágrafo.
- Benefícios agora falam em saúde financeira. A ressalva negativa sobre a
  verificação da Meta foi retirada.
- A oferta abre com "Controle financeiro por menos de R$ 0,33 por dia", mas
  mantém R$ 9,99/mês no card. Valor e Kiwify aparecem somente nessa dobra.
- O CTA final ganhou uma pergunta provocativa e deixou de repetir preço e o
  card Livre para Gastar. A conversa do Granabô também foi removida dali.
- O cabeçalho agora tem botões para Como funciona, Granabô, Hábitos,
  Benefícios, Segurança, Preços e Dúvidas. Os atalhos usam pills com borda;
  Entrar tem preenchimento verde e seta. No celular, os atalhos rolam na
  horizontal sob a marca e o botão Entrar.
