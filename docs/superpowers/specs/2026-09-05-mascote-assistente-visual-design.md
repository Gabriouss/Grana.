# Mascote do assistente de IA — direção visual

**Data:** 05/09/2026

**Estado:** planejamento aprovado, aguardando geração de referências

## Objetivo

Definir a direção visual de um mascote 3D para o assistente de IA do
Grana. (ver `docs/assistente-ia/2026-09-05-plano-assistente-zero-custo.md`).
O mascote é o rosto do assistente dentro do produto — aparece no botão
de acesso ao chat e dentro da própria conversa.

## Estado atual: não existe nenhum personagem

"Granabô" hoje é só um nome e uma copy — o assistente do Grana. no
WhatsApp (`COPY_LANDING_GRANABO.md`). Não existe nenhum personagem
ilustrado por trás desse nome: o "avatar" usado na conversa mockada da
landing page (`components/ConversaGranabo.tsx`) é literalmente o círculo
com o símbolo G. da marca, reaproveitado como se fosse uma foto de
contato — não uma ilustração de personagem.

## Direção definida pelo autor

**Um robozinho humanoide, design totalmente novo, sem relação direta
com o símbolo G.** O autor descartou explicitamente a rota de fazer o
próprio símbolo da marca ganhar volume/virar o mascote — o personagem
tem identidade própria, independente do logotipo.

Isso significa que a regra de marca "o símbolo sempre inclui o ponto,
nunca aparece sozinho" **não se aplica ao mascote** — ela continua
valendo apenas para usos do logotipo em si (ícone do app, marca
d'água, cabeçalhos). O que o mascote herda da marca é **paleta e tom**,
não forma.

## O que o mascote herda da marca (não-negociável)

Do `DESIGN.md` ("Creative North Star: The Confessional Ledger"):

- **Paleta**: petróleo profundo (`#052229`), menta (`#aeffe3` /
  `instrument-mint`), ciano (`#00a6ca` / `calm-cyan`), verde claro
  (`#74e291` / `clear-green`). **Vermelho não existe no vocabulário da
  marca** — nenhuma peça do mascote, em nenhum estado, usa vermelho ou
  qualquer cor de alarme.
- **Tom**: o produto nunca julga o usuário por gastar dinheiro —
  "saída" usa a mesma família cromática de "entrada", sem tom de erro.
  O mascote precisa expressar isso: nunca uma cara de reprovação, nunca
  urgência fabricada, nunca "comemoração exagerada" tipo confete —
  o sistema de design já rejeita esse registro em qualquer lugar do
  produto.
- **Tipografia**: Neue Machina é a única fonte do produto. Qualquer
  texto, balão de fala ou legenda perto do mascote usa Neue Machina —
  nunca a fonte do sistema, nunca outra família.
- **Superfícies**: chapadas por padrão, sombra reservada só pra sinalizar
  algo genuinamente flutuando. Um mascote "3D" pode ter volume e luz
  próprios, mas não deve introduzir um vocabulário de sombra/profundidade
  diferente do resto do produto ao ser colocado numa tela.

## Direções de robozinho propostas (para escolha do autor)

Três direções, todas dentro da paleta acima, todas humanoides (cabeça +
corpo/tronco reconhecível, sem tentar ser realista):

### Direção A — "Boia-lanterna"

Corpo arredondado, quase esférico, como uma boia ou lanterna de mergulho
— reforça a metáfora de água calma do produto sem copiar o símbolo G.
"Rosto" é uma tela/visor onde o brilho menta forma expressões simples
(dois traços, uma curva) em vez de olhos desenhados literalmente.
Braços curtos e arredondados, sem mãos articuladas — silhueta simples,
fácil de reconhecer pequeno (ícone de 24-48px).

### Direção B — "Instrumento de mergulho"

Inspirado em equipamento antigo de mergulho/instrumento náutico (o
"instrumento" que dá nome a `instrument-mint`) — corpo cilíndrico com
um "visor" circular central maior (tipo escotilha), como se o rosto
fosse literalmente um mostrador analógico. Mais rígido/geométrico que a
Direção A, remete a precisão e confiança sem ser frio (as cores quentes
da paleta — menta, verde-claro — evitam o efeito "robô industrial").

### Direção C — "Companheiro minimalista"

O mais próximo de um "robozinho de desenho animado" convencional:
proporções fofas (cabeça grande, corpo pequeno), mas sem enfeites nem
acessórios — silhueta limpa, uma única cor de corpo (petróleo ou
raised-tide) com o brilho menta concentrado só no rosto/peito como um
"núcleo" que pulsa. É a direção mais fácil de animar com poucos
elementos, mas a que menos se diferencia visualmente de mascotes de
outros produtos financeiros.

**Recomendação**: Direção A ou B — ambas amarram o personagem a algo
específico do mundo visual do Grana. (água, instrumento náutico) em vez
de um "robozinho genérico" que serviria pra qualquer marca. C fica como
opção de reserva se A/B se mostrarem difíceis de produzir bem.

## Estados que o mascote precisa comunicar sem texto

Um assistente precisa expressar estado sem depender só de uma legenda:

| Estado | Quando aparece | Direção de expressão |
|---|---|---|
| Repouso | tela fechada / botão flutuante parado | brilho do "rosto" estável, baixa intensidade |
| Ouvindo | usuário gravando pergunta por voz | brilho pulsa em ritmo com o áudio (ou pulso simples se não for viável medir amplitude) |
| Pensando | aguardando resposta da ferramenta/LLM | brilho em rotação lenta ou "respiração" (fade in/out), nunca um spinner genérico de sistema |
| Respondendo | mensagem chegando | brilho mais intenso, breve, sincronizado com o texto aparecendo |
| Não entendi | pergunta fora do que as ferramentas cobrem | **mesmo tom calmo das outras** — um leve dimming ou uma inclinação sutil de "cabeça", nunca uma cara de erro, nunca vermelho |

## Caminho de produção a custo zero

Três abordagens avaliadas:

### 1. Ilustração 2.5D estática por estado — recomendado para v1

Um conjunto pequeno de imagens (PNG com sombra e gradiente suaves
simulando volume, sem ser 3D renderizado de verdade) — uma por estado
da tabela acima. Produzível com as ferramentas de geração de imagem já
disponíveis nesta sessão, sem nenhuma dependência nova no app (é só
`Image` de sempre). Menor custo de engenharia, menor peso de bundle,
zero risco de performance em aparelho fraco.

### 2. 3D leve via Spline (free tier)

Ferramenta web gratuita de 3D que exporta cenas leves para embutir em
app/web. Produz um resultado "3D de verdade" (rotação, luz real) mas
introduz uma dependência de runtime nova no projeto Expo/React Native e
peso adicional de bundle. Guardar como evolução caso o v1 (opção 1)
valide que o personagem funciona e vale investir em mais fidelidade.

### 3. Motor 3D completo (three.js / react-three-fiber + glTF)

Tecnicamente gratuito (bibliotecas open-source), mas o custo real não é
dinheiro — é engenharia: peso de bundle, complexidade de manter em
Expo/React Native, risco de performance em aparelhos de entrada. **Não
recomendado agora.**

## Próximo passo concreto

Gerar as primeiras imagens de referência para as Direções A e B (uma
pose de repouso cada), usando prompts como:

> "Mascote robô fofo minimalista, corpo esférico tipo boia de mergulho,
> paleta petróleo profundo (#052229) e menta (#aeffe3), rosto como um
> visor circular com duas curvas de luz menta formando uma expressão
> calma, sem olhos realistas, sem boca, fundo transparente, estilo
> ilustração 2.5D com sombra suave, sem elementos vermelhos."

> "Mascote robô tipo instrumento náutico antigo, corpo cilíndrico
> petróleo profundo com detalhes em ciano (#00a6ca), visor circular
> central grande em vidro menta translúcido, sem braços articulados,
> silhueta simples, fundo transparente, ilustração 2.5D com sombra
> suave, sem elementos vermelhos."

## Critérios de aprovação

- Respeita a paleta do Grana. (petróleo, menta, ciano, verde-claro) sem
  nenhum vermelho ou cor de alarme?
- O tom é calmo em todos os estados, inclusive "não entendi" — nunca uma
  expressão de erro, confusão exagerada ou deboche?
- Funciona legível em tamanho pequeno (botão flutuante de ~48px) e em
  tamanho grande (dentro da tela do chat)?
- Funciona tanto no fundo escuro padrão do app quanto num fundo claro
  (necessário caso apareça em material de loja/marketing)?
- A silhueta é reconhecível sem cor (só contorno), garantindo que o
  personagem não dependa só da paleta pra ser identificável?
