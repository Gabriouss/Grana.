# Passagem de tarefa inacabada

Use só para trabalho que ficou pela metade e precisa de outra sessão. Serve ao `retomada-PH.md` (regra 27) e às ordens `00-PASSAGEM-*` da pasta da rodada. Este modelo não substitui o `context.md` (regra 6) nem a nota de sessão do vault (regra 12): decisão duradoura mora lá, e plano ou tarefa que já tem registro se reaproveita em vez de abrir uma fonte concorrente.

- Objetivo e critério de aceite: [resultado pedido e como se vê que acabou]
- Estado conferido: [data, hash de partida, mudanças locais; nunca presuma árvore limpa]
- Feito: [o que mudou e em quais arquivos]
- Evidência: [comandos reais, resultado e quando rodaram; separe o que falhou do que não foi rodado]
- Falta: [a menor próxima ação, dependências e riscos conhecidos]
- Bloqueio: [causa, o que depende dele e a condição para retomar]
- Recursos abertos: [processos, portas, pastas de build, emulador, bancos descartáveis; limpeza pendente]
- O que pode ter mudado: [fontes e premissas a rever, como o `origin/main`, o servidor e a outra máquina]

Antes de retomar, confira arquivos, estado do git (`git fetch`, regra 1), testes e recursos vivos. Isto é contexto, não prova de que o teste ainda passa. Não coloque segredo, carga privada nem log inteiro.

---
Adaptado de `templates/task-handoff.md.template` do vibe-coding-toolkit (soumatheusgomes), licença MIT.
