---
name: economia-de-tokens
description: Planeja uma atividade gastando o mínimo de tokens. Escolhe quantos agentes entram, qual modelo e qual esforço cada um usa pelo tipo de tarefa, e configura os terminais do Maestri sozinho. Rode SEMPRE ao iniciar uma atividade (regra 28 do AGENTS.md), ao distribuir trabalho entre agentes e quando o autor disser que está gastando muito ou que não vê progresso.
---

# Economia de tokens

Regra 28 do `AGENTS.md`. Pedido do autor em 14/10/2026: "A gente tá torrando muito token e eu não to vendo o progresso
acontecer no painel". O que mais gastou naquela rodada não foi o código, foi a cerimônia: nove revisores, relatórios
longos, recibos de recibos, orquestrador conferindo terminais em laço e agentes relendo arquivos enormes.

## 1. Antes de começar: o plano mínimo (30 segundos, no próprio raciocínio)

1. **Qual é a entrega que o autor vai VER?** Tela mudada, commit, arquivo pronto. Toda tarefa do plano precisa levar a
   ela. O que não leva (contagem, conferência de conferência, relatório de estado) sai do plano ou vai para o fim.
2. **Quantos agentes, no mínimo?** Um dono por entrega no caminho crítico. Revisor entra **uma vez, no fim, sobre o delta**,
   não a cada passo. Dois agentes nunca fazem ou revisam a mesma coisa. Os demais ficam parados, sem mensagem.
3. **Qual modelo para cada um** (tabela abaixo), e configurar antes de mandar a tarefa (seção 3).

## 2. Modelo e esforço pelo TIPO de atividade, não pelo cargo

| Atividade | Claude | Codex |
|---|---|---|
| Mecânica: rodar roteiro/gate pronto, tirar print, medir com script existente, copiar, `git` de rotina, registrar fatos já dados | **Haiku 5.5** | Sol 6.1 low/medium |
| Execução com especificação clara: corrigir código ou CSS, passada de design, documentação com julgamento, plano de produto | **Sonnet 5.5, medium** | Sol 6.1 medium |
| Julgamento difícil: orquestrar vários agentes, auditoria final, segurança, causa raiz de bug que resistiu, dinheiro, fatura, voz, migration, Edge Function | **Opus 5.5, medium** | Luna 6 (o esforço que o autor fixou) |

- `high` só depois que `medium` falhou no mesmo problema. Nada de Fable. O fast do Codex fica desligado (14/10).
- O cargo dá o padrão (memória `modelos-permitidos-nos-agentes`), a atividade decide. O Vigil rodando gate pronto vai em
  Haiku; o Vigil julgando acabamento visual sobe para Sonnet. Terminado, volta ao padrão do cargo.
- Pedido explícito do autor sobre o modelo de um terminal vale acima desta tabela.

## 3. Configurar o terminal (sozinho, sem perguntar)

```
maestri check "<agente>"                       # leia o modelo no cabeçalho ANTES de trocar
maestri ask "<agente>" --raw "/model haiku"    # ou sonnet / opus
maestri ask "<agente>" --raw $'\r'
maestri ask "<agente>" --raw "/effort medium"  # quando mudar o esforço
maestri ask "<agente>" --raw $'\r'
maestri check "<agente>"                       # confira "Set model to ..."
```

- `/model` grava o padrão global de sessões novas. Depois de trocar, um terminal que reiniciar pode subir no último modelo
  escolhido: confira o cabeçalho de quem reiniciar.
- Codex: `/model` + escolha da lista, como na memória `modelos-permitidos-nos-agentes`; só com o Codex sem limite.
- Diga ao autor, numa linha, quais trocas fez.

## 4. Hábitos que cortam gasto

- **Ordem em arquivo, mensagem curta:** a ordem vai num `.md` da pasta da rodada; a mensagem só aponta o caminho.
- **Resposta curta ao orquestrador:** uma linha com etapa, hash e arquivo. Relatório longo só no fim, se o autor pedir.
- **Sem laço de conferência:** o orquestrador não fica rodando `maestri check` em todos os terminais. Espera o aviso;
  confere um terminal só quando o aviso atrasar muito além do esperado.
- **Ler pouco:** `grep`, `head`, `tail` e intervalo de linhas em vez de arquivo inteiro; não reler o que já leu na sessão.
  Arquivos de revisão longos: ler só a última seção.
- **Sem recibo de recibo:** um recibo por etapa (log + exit). Manifesto e hash só no freeze final.
- **Sem subagente** salvo pedido do autor; cada um começa do zero e relê tudo.
- **Conversa longa:** `/compact` no agente que vai continuar; agente que terminou fica parado.
- **Progresso visível primeiro:** quando houver tela, o dono corrige e mostra (portal recarregado, commit) antes de
  qualquer pacote de prova.

## 5. Conferência no fim da atividade

Em uma linha ao autor: quantos agentes trabalharam, em que modelos, e o que foi entregue. Se a atividade gastou muito
sem entrega visível, diga onde foi o gasto e o que cortar na próxima.
