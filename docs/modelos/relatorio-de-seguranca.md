# Relatório de revisão de segurança: {{escopo}}

Relatório de trabalho. Redija sem credencial, sem dado pessoal e sem endereço interno (regra 15). Quando precisar falar de uma credencial, cite só o NOME da variável e onde ela mora, nunca o valor e nunca um pedido para ler o `.env`. Apague os campos que não usar antes de entregar.

## Escopo

- Data e quem revisou:
- Modo: base do repositório inteiro ou diff:
- Origem da mudança: hash do commit (ou da faixa `base..head`) e, se a árvore estava suja, quais arquivos modificados e não rastreados entraram:
- Premissas de autorização e o que ficou de fora:
- Ativos, pontos de entrada, papéis e fronteiras de confiança:
- Premissas de produção que precisam de confirmação (regra 11: o servidor pode diferir do repositório):

## Cobertura e evidência

- Caminhos lidos e caminhos excluídos, com o motivo:
- Skills, ferramentas e versões realmente usadas:
- O que não estava disponível:
- Comandos e testes rodados, com o resultado, separando estático, com dublê e de ponta a ponta:
- `node scripts/varrer-segredos.cjs` rodado? Resultado:

## Achados

Repita o bloco por achado comprovado ou por hipótese claramente marcada. Sem achados, diga que nenhum foi comprovado neste escopo.

### {{ID}}: {{título}}

- Gravidade e justificativa do impacto:
- Confiança: alta, média ou baixa. Situação: confirmado ou precisa de validação
- Origem: introduzido, regredido, já existia, indeterminado ou não se aplica (com o hash)
- Local: `arquivo:linha`
- Evidência redigida e caminho da entrada até a operação:
- Pré-requisitos (controle do atacante, privilégios):
- Impacto concreto e quem ou o que é afetado:
- Contraprova considerada; resultado da reprodução ou prova que falta:
- Correção proposta, a menor possível:
- Próxima validação:

## O que NÃO foi verificado

Lista acionável, no espírito da regra 9, em vez de ressalva vaga:

- [ ] Hipótese e a evidência que a confirmaria:
- [ ] Endurecimento sugerido, separado de vulnerabilidade:
- [ ] Lacunas de cobertura e quem as fecha:
- [ ] Servidor conferido contra o repositório (funções, migrations, colunas)? Se não, dizer:

Esta revisão não prova que o projeto está seguro nem certifica conformidade. Achados e confiança valem só para o escopo e a evidência registrados. Nenhuma correção foi aplicada por ela.

---
Adaptado de `templates/security-review.md.template` do vibe-coding-toolkit (soumatheusgomes), licença MIT.
