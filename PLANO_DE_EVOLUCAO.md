# 🚀 Plano de Engenharia e Evolução: Grana.

Este documento é o **plano mestre de implementação** para evoluir o **Grana.** para o próximo patamar de inteligência financeira, automação de dados e retenção de usuários. Está estruturado em **5 Épicos modulares**, prontos para serem executados em sessões sequenciais de desenvolvimento.

---

## 🏛️ Visão Geral da Arquitetura de Expansão

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                                 GRANA. CORE                                 │
├──────────────────────┬───────────────────────┬──────────────────────────────┤
│ 1. INTELIGÊNCIA      │ 2. ENTRADA ZERO-ATRITO│ 3. METAS & GAMIFICAÇÃO       │
│ • Safe-to-Spend/dia  │ • Leitor Push Bancário│ • Cofrinhos / Reserva        │
│ • Projeção Faturas   │ • Áudio WhatsApp (IA) │ • Level Up Infinito (XP)     │
│ • Evolução Arquétipo │ • QR Code NFC-e SEFAZ │ • Retrospectiva (Wrapped)    │
│                      │ • Widgets de Tela     │ • Relatório Executivo PDF    │
└──────────────────────┴───────────────────────┴──────────────────────────────┘
```

---

## 📦 ÉPICO 1: Metas, Cofrinhos & Level Up Infinito (Base de Dados)

### 1.1. Alterações no Banco de Dados (Supabase SQL)
Criar a tabela de metas/cofrinhos e a persistência de XP/Gamificação:

```sql
-- 1. Cofrinhos / Metas Financeiras
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  current_amount numeric(12,2) not null default 0 check (current_amount >= 0),
  color text not null default '#1fa98d',
  icon text not null default 'flag',
  deadline date,
  created_at timestamptz not null default now()
);

alter table goals enable row level security;
create policy "usuario acessa proprias metas" on goals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Suporte a Parcelamentos em Transações
alter table transactions add column if not exists installment_current int default 1;
alter table transactions add column if not exists installment_total int default 1;

-- 3. Perfil de Gamificação e XP Vitalício
create table if not exists user_gamification (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lifetime_xp integer not null default 0,
  streak_shields integer not null default 2,
  updated_at timestamptz not null default now()
);

alter table user_gamification enable row level security;
create policy "usuario acessa proprio xp" on user_gamification for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### 1.2. Módulos e Componentes a Criar:
- **`lib/goals.ts`**: Funções CRUD de metas e depósitos/resgates entre saldo e cofrinhos.
- **`lib/gamification-infinite.ts`**:
  - Fórmula: $\text{Level} = \lfloor(\text{XP} / 100)^{1 / 1.4}\rfloor + 1$.
  - Títulos e Elos: *Aprendiz*, *Construtor*, *Gestor*, *Estrategista*, *Mestre*, *Grão-Mestre*, *Lenda Financeira*.
- **`components/GoalsCarousel.tsx`**: Carrossel visual na Home exibindo progresso de cada cofrinho.
- **`components/GoalDepositModal.tsx`**: Modal rápido para guardar ou resgatar dinheiro do cofrinho.

---

## ⚡ ÉPICO 2: Inteligência e Projeções Preditivas

### 2.1. Funcionalidades
1. **Livre para Gastar (*Safe-to-Spend*)**:
   $$\text{Livre/dia} = \frac{\text{Saldo Atual} - \text{Contas Fixas Pendentes no Mês} - \text{Aportes em Metas}}{\text{Dias restantes até o dia 30/31}}$$
2. **Projeção de Comprometimento Futuro (Linha do Tempo)**:
   - Gráfico de barras verticais para os próximos 6 meses somando contas recorrentes + parcelas futuras de compras divididas no cartão.
3. **Evolução Contínua de Arquétipo**:
   - Comparação mensal automática da taxa de poupança e controle orçamentário, promovendo o usuário de *Resgate* $\to$ *Construtor* $\to$ *Otimizador* $\to$ *Estrategista*.

### 2.2. Arquivos:
- **`lib/projections.ts`**: Cálculos preditivos de queima de caixa (*burn rate*), safe-to-spend e parcelamentos futuros.
- **`components/SafeToSpendCard.tsx`**: Card minimalista na Home (*"Você tem R$ 48,00/dia livres até o fim do mês"*).
- **`components/FutureTimelineChart.tsx`**: Visualizador de compromissos futuros.

---

## 🎙️ ÉPICO 3: Entrada Ultrarrápida de Dados

### 3.1. Leitura Automática de Notificações de Bancos (Android)
- **Plugin Expo / Config Plugin**: Implementação de `NotificationListenerService` nativo em Android.
- **Lista de Bancos Monitorados**: Nubank, Inter, Itaú, Bradesco, Santander, C6, Mercado Pago, PicPay, Caixa, Banco do Brasil, BTG Pactual.
- **Integração com Heurística**: Extração automática de valores de Pix, Débito e Crédito para lançar em background.

### 3.2. Áudio no Webhook do WhatsApp (Whisper AI)
- **Atualização na Edge Function `supabase/functions/whatsapp-webhook`**:
  - Quando a mensagem recebida for do tipo `audio` (formato `.ogg`/`.mp3`), a Edge Function baixa o áudio criptografado da API do WhatsApp.
  - Envia para a API do OpenAI Whisper (ou Groq Whisper) para transcrição rápida.
  - Passa o texto transcrito pelo parser de [heuristics.ts](file:///c:/Users/user/Desktop/Aplicativo%20Financeiro/grana-app/lib/heuristics.ts) e insere o gasto na conta do usuário vinculado.

### 3.3. Leitor de QR Code de Nota Fiscal (NFC-e)
- **Biblioteca**: `expo-camera` / `expo-barcode-scanner`.
- **Funcionamento**: Ao escanear o QR Code de uma nota fiscal de supermercado/farmácia, o app extrai a URL pública da SEFAZ, lê a chave de acesso e preenche automaticamente valor total, data e categoria.
- **Componente**: **`components/QrScannerModal.tsx`**.

---

## 📊 ÉPICO 4: Relatórios e Retrospectiva (Wrapped Mensal)

### 4.1. Retrospectiva do Mês (*Monthly Wrapped*)
- Modal em formato de *Stories / Carrossel animado* exibido no dia 1º de cada mês:
  - Slide 1: Superávit/Déficit consolidado do mês.
  - Slide 2: Sua maior despesa pontual.
  - Slide 3: Categoria campeã de gastos.
  - Slide 4: XP acumulado e conquistas desbloqueadas no mês.
- **Componente**: **`components/MonthlyWrappedModal.tsx`**.

### 4.2. Exportação de Relatório Executivo em PDF
- **Biblioteca**: `expo-print` + `expo-sharing`.
- **Design**: Layout executivo minimalista em PDF na paleta de cores do Grana., contendo resumo do fluxo de caixa, divisão percentual por categoria, lista de boletos quitados e demonstrativo de lançamentos.
- **Módulo**: **`lib/pdf-report.ts`**.

---

## 📱 ÉPICO 5: Widgets de Tela Inicial & Atalhos iOS

### 5.1. Widgets iOS & Android (Via Expo Config Plugins)
- Widget pequeno: Exibe Saldo Atual + *Safe-to-Spend* diário.
- Widget médio: Saldo + Gráfico de linha dos últimos 7 dias + Botão de atalho rápido (+).

### 5.2. Automação Apple Pay / Shortcuts (iOS)
- Criação de URL Scheme / Deep Link: `grana://add-tx?amount=XX&desc=YY&type=out`.
- Guia passo a passo em tela para o usuário criar o atalho nativo no app Atalhos do iPhone em 2 minutos.

---

## 🚀 Roteiro de Prompts para Executar no Claude Code

### Passo 1: Executar Épico 1 (Metas & Level Up Infinito)
```markdown
Por favor, implemente o Épico 1 do PLANO_DE_EVOLUCAO.md no Grana.:
1. Adicione os tipos de Goals e UserGamification em `lib/types.ts`.
2. Crie `lib/gamification-infinite.ts` com fórmula de XP vitalício e elos de prestígio.
3. Crie `lib/goals.ts` com funções CRUD de metas e depósitos/resgates.
4. Crie `components/GoalsCarousel.tsx` e `components/GoalDepositModal.tsx`.
5. Integre na Home (`app/(app)/index.tsx`).
6. Valide a tipagem com TypeScript (`node node_modules/typescript/bin/tsc --noEmit`).
```

### Passo 2: Executar Épico 2 (Inteligência & Safe-to-Spend)
```markdown
Por favor, implemente o Épico 2 do PLANO_DE_EVOLUCAO.md no Grana.:
1. Crie `lib/projections.ts` com os cálculos de "Livre para Gastar/dia" e comprometimento de parcelas futuras.
2. Crie o componente `components/SafeToSpendCard.tsx` e integre no topo da Home.
3. Crie `components/FutureTimelineChart.tsx` para visão de faturas dos próximos 6 meses.
4. Valide a tipagem com TypeScript.
```

### Passo 3: Executar Épico 3 (Entrada Ultrarrápida & Áudio WhatsApp)
```markdown
Por favor, implemente o Épico 3 do PLANO_DE_EVOLUCAO.md:
1. Atualize a Edge Function `supabase/functions/whatsapp-webhook` para processar áudios via Whisper AI.
2. Crie o componente de Leitura de QR Code NFC-e `components/QrScannerModal.tsx`.
3. Configure o listener nativo de notificações bancárias para Android.
```

### Passo 4: Executar Épico 4 (Wrapped Mensal & Relatório PDF)
```markdown
Por favor, implemente o Épico 4 do PLANO_DE_EVOLUCAO.md:
1. Crie `components/MonthlyWrappedModal.tsx` com a retrospectiva animada do mês.
2. Crie `lib/pdf-report.ts` usando `expo-print` para gerar o relatório financeiro executivo em PDF com o design do Grana.
```
