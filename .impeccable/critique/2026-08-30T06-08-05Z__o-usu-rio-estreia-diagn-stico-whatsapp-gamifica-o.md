---
timestamp: 2026-08-30T06-08-05Z
slug: o-usu-rio-estreia-diagn-stico-whatsapp-gamifica-o
---
⚠️ DEGRADED: single-context (a sessão proíbe abrir subagentes sem pedido explícito do autor; A e B rodaram no mesmo contexto)

## Nota de saúde de design — 18/40

| # | Heurística | Nota | Achado principal |
|---|---|---|---|
| 1 | Visibilidade do status | 1 | A sequência e o ritmo da semana exibem valores ERRADOS das 21h à meia-noite |
| 2 | Correspondência com o mundo real | 2 | "Ofensiva", "elo", "Grão-Mestre"; a sequência conta o dia do GASTO, não o do registro |
| 3 | Controle e liberdade | 3 | Diagnóstico pulável, lembrete desligável e com horário à escolha |
| 4 | Consistência e padrões | 1 | Duas escadas de progressão paralelas com cinco títulos idênticos |
| 5 | Prevenção de erro | 2 | Definir orçamento e estourar custa 120 pontos; escudo de sequência não existe |
| 6 | Reconhecer em vez de lembrar | 2 | Critérios das medalhas visíveis; a relação Score/nível/elo/medalha, nunca |
| 7 | Flexibilidade e eficiência | 3 | Voz, WhatsApp e QR como atalhos reais |
| 8 | Estética e minimalismo | 2 | A camada de gamificação contradiz o próprio DESIGN.md |
| 9 | Recuperação de erro | 1 | Sequência quebrada não tem caminho de volta |
| 10 | Ajuda e documentação | 1 | Nada explica o que é o Score nem por que ele caiu |

Carga cognitiva: 5 de 8 falhas (crítica).

## Achados prioritários

P0 — A sequência zera todas as noites, das 21h à meia-noite (lib/gamification.ts:88 e :106).
`todayISO()` é local, o laço usa `toISOString()` (UTC). Em UTC−3, a partir das 21h a data UTC já é a de amanhã, o laço procura um dia que não existe e sai na primeira volta. Medido: quem registrou 10 dias seguidos vê 0. O Score cai de 1000 para 800 e o elo desce de Mestre do Patrimônio para Estrategista. As quatro medalhas de sequência travam juntas. Volta ao normal à meia-noite. Dois dos três horários de lembrete (20:30 e 21:30) caem dentro da janela quebrada.

P0 — A sequência mede a coisa errada.
Ela conta `occurred_on`, o dia em que o dinheiro foi gasto, não o dia em que a pessoa registrou. Quem não gastou no domingo perde a sequência mesmo tendo aberto o app; num app de finanças, punir quem não gastou é inverter o objetivo. Uma importação de OFX inflaciona a sequência sem nenhum hábito criado. O campo `created_at` já existe e mede o que o número promete.

P1 — Cinco das doze medalhas podem ser retiradas.
São booleanos derivados, não eventos guardados. "Hábito Inquebrável" (30 dias) some no primeiro dia perdido. "Mês Verde" some quando a pessoa registra um gasto. E não existe momento de entrega: nenhum aviso, brinde ou notificação quando algo é desbloqueado.

P1 — Duas escadas de progressão com o mesmo vocabulário.
Score Grana (0–1000, recalculado) dá Aprendiz Financeiro / Construtor de Hábitos / Gestor Eficiente / Estrategista / Mestre do Patrimônio. XP vitalício dá Aprendiz / Construtor / Gestor / Estrategista / Mestre / Grão-Mestre / Lenda. Cinco palavras coincidem e as duas se movem sozinhas.

P1 — O XP ignora o laço central do produto.
Só cofrinho concede XP. Registrar lançamento dá zero. Sair do primeiro elo exige R$ 6.960 guardados; "Lenda Financeira" exige R$ 206.300. Quem registra todo dia e não usa cofrinho fica Aprendiz nível 1 para sempre.

P1 — O Score julga o resultado financeiro, não o uso do app.
Metade dos 1000 pontos vem de superávit e orçamento. Mês apertado derruba a nota de quem mais precisa do app. DESIGN.md diz "o Grana. escuta sem julgar" e "gastar não é um erro a ser sinalizado".

P2 — As mensagens de reativação não conseguem ser entregues.
Oito mensagens de "saudade" para quem sumiu, mas o lembrete é agendado com gatilho de data única e só reagendado quando a Início ganha foco. Quem parou de abrir o app recebe um aviso e depois silêncio.

P2 — O primeiro contato é um formulário de 7 etapas.
O produto se vende como "registrar leva segundos" e a estreia pede cinco perguntas antes de qualquer valor entregue.

## O que está bom

O cartão de vínculo do WhatsApp é a peça mais bem pensada do app: antecipa cada dúvida antes dela aparecer, trata a espera como espera POR VOCÊ e não como carregamento, oferece caminho manual com código e número copiáveis, e a tela muda sozinha ao voltar.

O catálogo de 49 mensagens de lembrete tem tom, variedade e anti-repetição.

O diagnóstico da estreia coleta bem e alimenta sugestão real depois.

## Detector

1 achado consultivo: `#fff` em PareamentoWhatsapp.tsx:154, que é o texto sobre o verde do WhatsApp. Falso positivo.
