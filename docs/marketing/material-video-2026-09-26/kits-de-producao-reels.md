# Kits de produção — Reels liberados para produzir já (25/09/2026)

Personagem, cena, voz e texto na tela para cada Reel que `ordem-de-producao.md`
liberou para produção imediata (Estilo A, ElevenLabs). Nenhuma geração
começa sem estimativa de custo real (rascunho 360p) e aprovação peça por
peça do autor — isto é o prompt pronto para quando ele aprovar, não um
pedido de geração.

## Personagem B (nova, para o arco de reconhecimento e ativação)

Distinta da Carla (padeiro/R2/R4, abaixo). Cobre R1, R3, R6, R10, R11 e R12,
que juntas formam o arco "reconhece a dor → usa o produto → começa" e citam o
mesmo tipo de apartamento pequeno em mais de um prompt (R11, R12).

- **Aparência:** brasileiro(a) por volta dos trinta anos, tez morena média,
  cabelo curto e natural, sem maquiagem de still de banco nem sorriso de
  banco de imagens. Roupa fixa: camiseta azul-petróleo escura simples, calça
  jeans escura.
- **Cenário fixo:** apartamento pequeno, mobília simples, sem luxo nem
  bagunça — mesma paleta petróleo/menta do restante da campanha.
- **Continuidade (regras já aprendidas com a Carla):** o mesmo objeto na
  mesma mão a cena toda; a tela do celular nunca de frente para a câmera;
  ninguém atravessa objeto físico; cena com defeito é gerada de novo, nunca
  corrigida na montagem; mesmo modelo/cor de celular em todas as cenas desta
  persona.
- **Antes de gerar a primeira cena:** produzir uma imagem de referência da
  Personagem B e ligá-la a todo nó de vídeo desta persona, do mesmo jeito que
  a Carla foi fixada.

## Carla (já existente, Reels do padeiro) — R2 e R4

Ficha completa no guia do vault "Estilos de Vídeo — Guia de Referência":
mulher brasileira no fim dos vinte anos, cabelo cacheado em rabo de cavalo
alto, argolas douradas, camiseta mostarda, jeans claro. R2 e R4 reaproveitam a
mesma persona e o mesmo tipo de cena (fala perto do celular) do Reels
aprovado, então usam a MESMA imagem de referência, não uma nova.

## R1 — "Onde foi parar?"

- **Personagem:** B.
- **Cena:** prompt já existe em FUNIL 17.2 (R1), adaptar com a aparência da
  Personagem B.
- **Voz:** nenhuma. Cena muda, sem locução — o gancho é texto na tela.
- **Texto na tela:** "Você olha o saldo e pensa: onde foi parar?" (aplicado na
  edição, junto com a tela real de saldo — essa parte espera D).

## R3 — "Não depender da memória"

- **Personagem:** B, mesma roupa e continuidade do R1.
- **Cena:** prompt já existe em FUNIL 17.2 (R3).
- **Voz:** nenhuma na cena de IA. A AÇÃO mostrada é gravar uma nota de voz,
  mas a fala em si não precisa ser ouvida (a tela real de confirmação entra
  na edição, sem depender de build). Se o autor preferir ouvir a fala,
  proponho a mesma locução do R2 ("Gastei trinta e dois reais e oitenta no
  mercado") para reforço, mas não é obrigatório.
- **Texto na tela:** "Se anotar depende de lembrar, você perde o momento."

## R6 — "Fotografe a nota" (só a cena; a tela final espera D)

- **Personagem:** B.
- **Cena:** prompt já existe em FUNIL 17.2 (R6) — pessoa fotografando um
  recibo, sem UI nenhuma visível. Pode gerar já.
- **Voz:** nenhuma.
- **Texto na tela:** "Fotografe a nota. O Grana. lê o valor." A captura real
  do fluxo (foto + leitura) só entra depois de D.

## R10 — "Um dia comum" (só as 3 cenas; a montagem final espera D)

- **Personagem:** B, mesma pessoa nos 3 clipes (exigência do próprio prompt).
- **Cena:** os 3 clipes já existem em FUNIL 17.2 (R10).
- **Voz:** o clipe 1 (grava uma nota de voz) pode usar a mesma locução do R2
  ("Gastei trinta e dois reais e oitenta no mercado") ou uma nova frase
  curta — decisão de produção, não bloqueia a geração da cena.
- **Texto na tela:** nenhum por clipe; a legenda entra como cena de apoio na
  montagem final, junto com as 3 telas reais (voz, Pix, e o "resumo do mês",
  que depende de D).

## R11 — "Começar sem saber tudo"

- **Personagem:** B.
- **Cena:** prompt já existe em FUNIL 17.2 (R11).
- **Voz:** nenhuma.
- **Texto na tela:** o roteiro atual não define uma frase própria para R11
  (a tabela da fila usa o gancho "Você não precisa saber tudo sobre finanças
  para começar." como título; não há uma segunda linha definida). Uso o
  próprio gancho como texto único, curto, no rodapé — a confirmar com o
  autor se quiser algo mais.

## R12 — "O próximo gasto pode ser o começo" (fecho)

- **Personagem:** B, mesmo apartamento de R11 (continuidade de cenário).
- **Cena:** prompt já existe em FUNIL 17.2 (R12).
- **Voz:** nenhuma.
- **Texto na tela:** "Seu próximo gasto pode ser o começo." + CTA "Comece pelo
  próximo gasto" no fecho.
- **Tela real inserida:** recomendo usar a lista de Lançamentos (não a
  Início), porque essa tela não muda com a regra 20 — sem ressalva de build.

## R2 — "Gastei trinta e dois reais no mercado" (já detalhado no FUNIL)

- **Personagem:** Carla.
- **Cena:** prompt já existe em FUNIL 17.2 (R2).
- **Voz:** "Gastei trinta e dois reais e oitenta no mercado." — `eleven_multilingual_v2`,
  mesma voz e configuração da Carla no Reels do padeiro (comparar 2-3
  variações de estabilidade/estilo antes de aprovar, prioridade do autor).
- **Texto na tela:** nenhum adicional; a locução e a tela real do lançamento
  carregam a peça.

## R4 — "Fala. O Grana. organiza."

- **Personagem:** Carla.
- **Cena:** prompt já existe em FUNIL 17.2 (R4).
- **Voz:** frase curta e natural, por exemplo "Comprei pão e leite, uns quinze
  reais." — a confirmar com o autor; o roteiro original não fixa uma frase
  exata para R4, só a estrutura (voz + tela real + frase de fecho).
- **Texto na tela:** "Fala. O Grana. organiza." no fecho.

## O que ficou sem verificação

- Não gerei nenhuma imagem de referência da Personagem B nem comparei vozes
  para R3/R4/R10 — são propostas de texto, a decidir/aprovar antes de gastar
  crédito.
- R11 e R4 não tinham frase de texto/locução fixada nos roteiros originais;
  as que proponho aqui são minha sugestão, não uma frase já aprovada pelo
  autor.
