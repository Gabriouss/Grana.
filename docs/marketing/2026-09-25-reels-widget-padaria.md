# Reels: "o pão lançado pelo widget"

Roteiro e prompts para gerar na ElevenLabs. Estrutura decidida pelo autor em 25/09/2026, em duas mensagens:

> A moça faz o pagamento, depois dá as costas, pega o celular do bolso, faz o
> lançamento pela voz, bota o celular de volta no bolso e segue a vida feliz.
> Depois vem a narração: gastos pequenos não precisam ser difíceis.

> Adicione no início do vídeo a voz do padeiro falando "aqui está, seu
> pãozinho quentinho" após o pagamento. Depois disso ela pega o pão, agradece e
> se vira. Antes de ir embora ela faz o lançamento, o celular faz um som de
> resposta positiva (o famoso "plim" agudo), ela sorri, vai embora, a tela muda
> gradualmente para o logotipo do Grana. com a narração.

> O padeiro não vai aparecer na cena, apenas as suas mãos por trás de um
> balcão, onde ele colhe o pagamento e entrega o pão para a moça. O balcão
> estará entre os dois personagens.

> Consistências de cena precisam ser mantidas. No vídeo anterior, a moça pegou
> o pão, mas saiu do estabelecimento sem segurar nada. Quando a cena troca para
> ela fazendo o lançamento por áudio e indo embora, não mostre o outro braço
> dela, que está segurando o pão: deixe a captura focada no rosto dela e no
> celular próximo à boca. Quando terminar o lançamento ela vai sorrir, guardar
> o celular e continuar saindo da padaria.

A demonstração da tela do app fica para **outro criativo** (ver o fim deste documento). Neste, a própria ação dela, lançando por voz sem abrir o app, é a demonstração.

- **Formato:** Reels 9:16, 720×1280 ou maior.
- **Duração:** cerca de 26 s.
- **Origem:** tudo gerado na ElevenLabs, menos a logo do fechamento, que é a real.

## Regras que este criativo segue (`PRODUCT.md`)

- **Personagem fictícia.** A moça demonstra o uso e nunca se apresenta como cliente nem dá depoimento de resultado (CDC/CONAR). Do padeiro só aparecem as mãos e se ouve a voz. Sem rosto nem voz do autor.
- **Tela do app é sempre captura real, nunca desenhada pela IA.** Por isso, em toda cena, a tela do celular fica virada para longe da câmera.
- **Verdade do produto.** O vídeo só mostra o que o app faz. Ver a seção do "plim", abaixo.
- **Copy:** sem travessão, sem "não é X, é Y", sem nomear o "apagão financeiro".
- **Preço:** só "menos de R$ 0,37 por dia".
- **Só Android.** O widget existe só no Android, e a narração promete "sem abrir o aplicativo". Segmente o anúncio para Android.

## O "plim"

**O celular toca um som quando o widget lança**, e o "plim" do vídeo representa esse som. Conferido lendo o código em 25/09/2026, sem teste no aparelho:
- o recibo do widget é publicado sem canal (`trigger: null`, em `lib/widget-voz-notificacoes.ts`);
- por isso ele cai no canal genérico do `expo-notifications`, que toca o som padrão de notificação do aparelho.

Duas consequências:
- **O som real é o do aparelho da pessoa,** e não um "plim" próprio do Grana. O vídeo mostra um som de notificação agudo e curto, que é o que a maioria dos celulares toca.
- **Ele não toca com o celular no silencioso.** Nada no vídeo deve sugerir o contrário.

## As falas

| Quem | Fala | Duração estimada |
|---|---|---|
| Padeiro (fora de quadro, só a voz) | "Aqui está, seu pãozinho quentinho." | ≈ 2 s |
| Ela | "Obrigada!" | < 1 s |
| Ela, no celular | **"Pão na padaria, três e cinquenta e sete, no débito."** | ≈ 3 s |

A frase do celular foi conferida no código em 25/09/2026. É uma frase que o app entende de verdade: o widget salva sozinho como **"Pão na padaria · R$ 3,57 · Alimentação · Débito"**, sem abrir o app. Formas parecidas falham:

| Frase | O que o app faz |
|---|---|
| "Pão, 3,57, no débito" | "pão" sozinho não é reconhecido como Alimentação. O widget para e pergunta "Qual categoria?". |
| "Pão, três e cinquenta e sete, alimentação, no débito" | Salva, mas a descrição fica "Pão alimentação". |
| **"Pão na padaria, três e cinquenta e sete, no débito"** | **Salva direto, com descrição e categoria certas.** |

**"Sem abrir o aplicativo" é verdade.** O widget grava, transcreve e lança com o app fechado (`lib/widget-voz-task.ts`), e o recibo chega como notificação, com o botão "Desfazer".

## Personagem (mesma descrição em todos os prompts)

**Carla, a moça (nome interno, nunca aparece no vídeo).**

> A fictional Brazilian woman in her late twenties, warm light-brown skin, dark curly shoulder-length hair tied in a loose high ponytail, small gold hoop earrings, mustard-yellow cotton t-shirt, light-wash jeans, a small crossbody bag, a phone in a plain black case in her back pocket.

**O padeiro nunca aparece.** Só as mãos dele, por trás do balcão, e a voz fora de quadro. Mãos de homem maduro, manga curta azul-clara e avental branco no limite do quadro, para as mãos não mudarem entre os momentos da cena 1.

Para a aparência dela não mudar entre as cenas, gere primeiro a imagem de referência (cena 0). Depois ligue essa imagem como referência (`images`) em todos os nós de vídeo.

## Continuidade entre as cenas

Cada cena é gerada separadamente, e o modelo não lembra o que aconteceu na anterior. No primeiro teste, ela pegou o pão e saiu de mãos vazias. Estas regras valem para todos os prompts e para a conferência antes de publicar:

1. **O pão fica sempre na mão ESQUERDA.** Ela o pega com a esquerda na cena 1 e não troca de mão.
2. **O celular fica na mão DIREITA** e sai e volta pelo bolso de trás DIREITO.
3. **Depois da cena 1, o braço esquerdo nunca entra no quadro.** As cenas 2 e 3 são fechadas no rosto: da altura do peito para cima, com o braço e a mão esquerdos fora do quadro. Assim não há como ela aparecer sem o pão.
4. **O que se repete em todas as cenas:** a roupa (camiseta mostarda, rabo de cavalo alto, argolas douradas), a luz da manhã e a padaria. É por isso que a imagem da cena 0 entra como referência em todos os nós.
5. **O sentido do movimento é o mesmo:** do balcão para a porta. Se na cena 1 ela vira para a direita do quadro, nas cenas 2 e 3 ela segue para a direita.
6. **Se um corte ainda assim mostrar mãos vazias, braço trocado ou roupa diferente, a cena é gerada de novo.** Não se corrige na montagem.

## Estrutura

| # | Tempo | Cena | Som |
|---|---|---|---|
| 0 | — | Imagem de referência da moça | — |
| 1 | 0–8 s | O balcão entre os dois. Ela paga no débito na maquininha que as mãos do padeiro seguram. As mãos entregam o saquinho de pão, e a voz dele, fora de quadro, diz: "Aqui está, seu pãozinho quentinho." Ela pega o pão, agradece e se vira. | Voz do padeiro (fora de quadro), "Obrigada!" dela, ambiente de padaria |
| 2 | 8–16 s | **Close no rosto e no celular** (o braço com o pão fica fora do quadro). Antes de sair, ela leva o celular à boca, toca no widget e fala a frase. O celular faz o "plim", ela sorri e baixa o celular para guardar. | A voz dela, o "plim", ambiente |
| 3 | 16–22 s | **Ainda do peito para cima**, a câmera acompanha ela continuando a sair da padaria, feliz. Nos últimos ~2 s, a imagem se dissolve aos poucos no fechamento. | Rua + **narração** |
| 4 | 22–26 s | Fechamento com a logo real | Fim da narração |

## Narração

Entra DEPOIS da fala dela, nunca por cima de nenhuma fala. Começa quando ela sai para a rua e acompanha a passagem para o logotipo.

> **"Gastos pequenos não precisam ser difíceis. Pagou, falou, lançou. Rápido, fácil e sem abrir o aplicativo."**

- **Duração estimada:** ≈ 6,7 s, pela velocidade da voz "Beatriz - Warm and Natural" medida em 25/09/2026 (186 caracteres em 11,9 s).
- **Versão curta** (≈ 5,6 s): *"Gastos pequenos não precisam ser difíceis. Pagou, falou, lançou. Sem abrir o aplicativo."*
- **Como gerar:** voz "Beatriz - Warm and Natural" (pt-BR, feminina, acolhedora), modelo `eleven_multilingual_v2`.

## Prompts

Todos os vídeos usam **Gemini Omni 1.1 Flash**, com `aspect_ratio` **9:16**, `resolution` **720p** (ou 1080p), `duration_secs` indicado em cada cena e a imagem da cena 0 ligada em `images`. Escrever "vertical" no prompt não basta: a proporção é o parâmetro do nó, e o padrão dele é 16:9. Os prompts ficam em inglês, que é como o modelo segue melhor. As falas ficam em português, entre aspas.

### Cena 0: imagem de referência

- **Modelo:** `gemini-3-pro-image` (segura a mesma personagem entre as cenas).
- **Proporção:** 9:16.

> Full-body and close-up character reference sheet of the same person, plain light-grey studio background, soft even daylight. A fictional Brazilian woman in her late twenties, warm light-brown skin, dark curly shoulder-length hair tied in a loose high ponytail, small gold hoop earrings, mustard-yellow cotton t-shirt, light-wash jeans, a small crossbody bag, a phone in a plain black case in her back pocket. Friendly relaxed expression, natural skin texture, realistic photography.

### Cena 1: paga, recebe o pão, agradece e se vira (8 s)

- **Duração:** `duration_secs` 8.
- **Referência:** a moça.
- **Enquadramento:** a câmera fica do lado dela do balcão, levemente de lado. O balcão atravessa o quadro entre os dois. Do padeiro, só entram as mãos e os antebraços, por cima do balcão. Rosto e corpo dele ficam sempre fora do quadro.

> Medium close shot on the woman from the reference image, one continuous shot, natural smartphone camera look, static camera on the customer's side of a wooden bakery counter in a small, cozy São Paulo bakery, warm morning sunlight. She stands at the left of the frame; the countertop fills the right side of the frame. The right edge of the frame cuts off everything behind the counter at chest height of the baker: the baker's head, face, shoulders and body are never in frame at any moment; only a man's hands and forearms reach in from the right edge, over the countertop, with light-blue short sleeves. His hands hold out a small card machine; she taps a debit card on it. His hands then slide a small paper bag of warm bread rolls across the counter to her, while his friendly voice, off-screen, says in Brazilian Portuguese: "Aqui está, seu pãozinho quentinho." She takes the bag with her LEFT hand, holds it against her body, smiles and says: "Obrigada!", then turns to her right and starts walking toward the door, out of the right side of the frame, still holding the bag in her left hand. Her lips match her words. Ambient bakery sounds: soft chatter, a coffee machine, paper bag rustle. No music, no on-screen text, no readable signs. Grounded, realistic, warm tones.

### Cena 2: lança por voz antes de sair (8 s)

- **Duração:** `duration_secs` 8.
- **Referência:** moça.
- **Enquadramento:** close, do peito para cima, no rosto dela e no celular perto da boca. O braço e a mão esquerdos, que seguram o pão, ficam **fora do quadro o tempo todo** (regras de continuidade 1 e 3).
- **Som do "plim":** NÃO peça ao modelo de vídeo, porque ele inventa um som qualquer, em qualquer momento. O "plim" entra na montagem como faixa separada, no instante exato (ver "Montagem").

> Close-up from the chest up, one continuous shot, natural smartphone camera look, framed on her face and the phone. Near the open door of a small São Paulo bakery, warm morning light from the doorway. The woman from the reference image has paused before stepping outside. Only her right hand is visible: it raises her phone to near her mouth, the screen facing away from the camera, and she taps it once with her thumb. She says clearly, in a relaxed natural Brazilian Portuguese voice: "Pão na padaria, três e cinquenta e sete, no débito." Her lips match the words. A second later she glances at the phone, the screen still facing away from the camera, breaks into a small satisfied smile, and lowers the phone out of the bottom of the frame to put it away. Her left arm and left hand stay completely out of frame for the whole shot. Ambient bakery sounds, low. No music, no on-screen text. Realistic, warm.

**Plano B, se a voz ou a boca saírem ruins:**
1. Gere a mesma cena sem fala ("she speaks a short phrase to the phone").
2. Gere a frase na voz **"Jully - Calm & Young"** (pt-BR, feminina, jovem), com o modelo `eleven_multilingual_v2`.
3. Sincronize a boca com um nó `sync-lipsync-v3`: o vídeo da cena entra como vídeo e a frase como áudio.

Na cena 1, a voz do padeiro vem de fora do quadro e não precisa de sincronia de boca. Se a gerada sair ruim, gere a fala numa voz masculina madura e calorosa da ElevenLabs e ponha por cima, na montagem. Não use voz clonada de pessoa real.

### Som do "plim"

- **Como gerar:** nó `sfx`, modelo `eleven_text_to_sound_v2`, cerca de 1 s.

> A single short, bright, high-pitched positive notification chime from a smartphone, clean and pleasant, "plim", no reverb, no melody.

### Cena 3: continua saindo da padaria, feliz (6 s)

- **Duração:** `duration_secs` 6.
- **Referência:** moça.
- **Enquadramento:** dos ombros para cima, a câmera acompanhando de frente, com a alça da bolsa aparecendo. Braços e mãos **fora do quadro** (regra de continuidade 3). O celular já foi guardado no fim da cena 2 e não aparece mais.

> Tracking close-up from the shoulders up, one continuous shot, natural smartphone camera look, camera moving backward in front of her at face height. The woman from the reference image, wearing the same mustard-yellow t-shirt, gold hoop earrings and the beige crossbody bag strap clearly visible across her chest, walks out of a small São Paulo bakery onto a sunny sidewalk with a relaxed, happy smile, warm morning sunlight on her face, the street softly out of focus behind her. The frame is tight on her face, neck, shoulders and the bag strap: her arms, elbows and hands never enter the frame. No readable signs, no letters, no on-screen text anywhere in the background. Ambient street sounds: distant traffic, birds. No music, no dialogue. Realistic, warm tones.

### Cena 4: fechamento (4 s)

- **Imagem:** a logo e a fonte são as reais. Não peça logo à IA, porque ela inventa uma marca parecida. Use `assets/icon.png` e o logotipo do site sobre o fundo petróleo `#052229`.
- **Texto na tela:** "Grana." / "Fala o gasto. Pronto." / "Menos de R$ 0,37 por dia".
- **Som:** o fim da narração.

## Geração de 25/09/2026: o que aconteceu

Flow na ElevenLabs: "Grana. - Reels widget padaria (25/09)". Os prompts desta página já são as versões que funcionaram.

- **Primeira rodada das cenas 1 e 3 reprovada na conferência quadro a quadro:**
  - na cena 1, o rosto do padeiro apareceu, apesar de "the baker is never shown". O que resolveu foi descrever o ENQUADRAMENTO ("the right edge of the frame cuts off everything behind the counter"), e não só a ausência;
  - na cena 3, a bolsa transversal sumiu e os braços apareceram soltos. O que resolveu foi fechar dos ombros para cima e pedir a alça "clearly visible".
- **A cena 2 saiu certa na primeira.**
- **Os nós de vídeo não aceitam desligar a reescrita do prompt** (`enhance_prompt` não existe para o Gemini Omni 1.1).
- **A imagem de referência veio com o celular no bolso da frente** e com rótulos de texto. Não afetou as cenas fechadas.
- **A narração saiu com 8,2 s,** mais que os 6,7 s estimados. Coube, porque começa na cena 3 e termina no fechamento.
- **O "plim" entrou 5,6 s depois do início da cena 2.** A fala dela vai de 2,1 a 5,4 s, medida no áudio.
- **Montagem feita fora da ElevenLabs,** com `ffmpeg`: cortes secos, dissolvência de 2 s da cena 3 para o fechamento, som ambiente da cena 3 a 35%, narração a partir de 16 s. O fechamento é uma imagem montada com o logotipo oficial (`design-system/marca/logotipo-gradiente.svg`) e a Neue Machina.
- **Custo:** ≈ 23.400 créditos (≈ US$ 4,25), incluindo as duas cenas refeitas.
- **Não conferido:** o que as vozes dizem de fato, porque não há como ouvir no ambiente em que foi montado. Ouça antes de publicar.
- **Detalhes que ficaram:** uma lousa com "SÃO PAULO" e "2,50" ao fundo da cena 1 e uma placa pequena na cena 3. As legendas não foram queimadas no vídeo.

## Legendas (para quem assiste sem som)

| Cena | Legenda |
|---|---|
| 1 | "Aqui está, seu pãozinho quentinho." e "Obrigada!" |
| 2 | "Pão na padaria, três e cinquenta e sete, no débito." |
| 3 | "Gastos pequenos não precisam ser difíceis." e "Pagou, falou, lançou." |
| 4 | "Rápido, fácil e sem abrir o aplicativo." |

## Montagem

Na ordem 1, 2, 3, 4.

- **1 → 2:** corte seco, logo que ela se vira. O corte passa do plano médio para o close.
- **"Plim":** entra cerca de 0,5 s depois de ela terminar a frase, pouco antes do sorriso.
- **2 → 3:** corte seco, quando o celular sai do quadro por baixo.
- **Narração:** começa quando ela sai para a rua (início da cena 3).
- **3 → 4:** **dissolvência gradual**, de cerca de 2 s, da rua para o logotipo, que é o "a tela muda gradualmente" pedido pelo autor.

**Ferramenta:** o nó de composição da ElevenLabs junta vídeo e áudio. Não foi conferido se ele faz dissolvência ou se aceita posicionar o "plim" num instante exato. Se não fizer, monte num editor (CapCut, por exemplo) com os arquivos gerados.

## Custo estimado (ElevenLabs, 25/09/2026)

| Item | Custo |
|---|---|
| Vídeos (cenas 1, 2 e 3) | ≈ US$ 1,11 cada, em 720p |
| Imagem de referência | alguns centavos |
| Narração e "plim" | centavos |
| Plano B (lipsync), se precisar | por nó |
| **Total** | **entre US$ 3,50 e US$ 5** |

## O que conferir antes de publicar

- Mãos e dedos, dela e do padeiro, e a boca dela.
- **Continuidade:** o pão na mão esquerda na cena 1. Nas cenas 2 e 3, o braço esquerdo nunca aparece. Mesma roupa e mesma luz em tudo. Ela nunca aparece de mãos vazias.
- O padeiro não aparece: nem rosto nem corpo, só as mãos.
- A voz dela bate com a boca.
- A tela do celular nunca aparece de frente.
- Nenhum texto errado em placas ou embalagens ao fundo.
- A fala da cena 2 é a frase conferida acima.
- As legendas estão sem erro de acento.

## Outro criativo: a tela do app (fica para depois)

Decisão do autor: a demonstração com a tela do app vira um criativo próprio. A gravação é feita pelo autor, porque tela de app é sempre captura real. O que já ficou definido para ele:

1. **Conta:** a conta de teste, ou uma conta só com valores inventados. Nunca a conta pessoal: tudo o que aparecer na tela vai para um anúncio público.
2. **Aparelho:** modo não perturbe ligado e tela cheia na vertical.
3. **Frase:** a mesma deste Reels.
4. **Versão sem abrir o app:** tela inicial com o widget de voz e o widget "Livre para gastar". Fale a frase, espere a notificação do recibo e o "Livre para gastar" mudar de valor. O widget de voz atualiza o outro sozinho (`sincronizarWidgetsHome`), mas só tenta por 5 s: teste antes de gravar.
5. **Versão com o app aberto:** toque na notificação e role devagar até o lançamento na lista e até o "Livre para gastar". Nesta versão, a narração não pode dizer "sem abrir o aplicativo".
