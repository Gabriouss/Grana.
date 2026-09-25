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

A demonstração da tela do app fica para **outro criativo** (ver o fim deste documento). Neste, a própria ação dela, lançando por voz sem abrir o app, é a demonstração.

- **Formato:** Reels 9:16, 720×1280 ou maior.
- **Duração:** cerca de 26 s.
- **Origem:** tudo gerado na ElevenLabs, menos a logo do fechamento, que é a real.

## Regras que este criativo segue (`PRODUCT.md`)

- **Personagens fictícios.** A moça e o padeiro demonstram o uso e nunca se apresentam como cliente nem dão depoimento de resultado (CDC/CONAR). Sem rosto nem voz do autor.
- **Tela do app é sempre captura real, nunca desenhada pela IA.** Por isso, em toda cena, a tela do celular fica virada para longe da câmera.
- **Verdade do produto.** O vídeo só mostra o que o app faz. Ver a seção do "plim", abaixo.
- **Copy:** sem travessão, sem "não é X, é Y", sem nomear o "apagão financeiro".
- **Preço:** só "menos de R$ 0,37 por dia".
- **Só Android.** O widget existe só no Android, e a narração promete "sem abrir o aplicativo". Segmente o anúncio para Android.

## O "plim": hoje o app NÃO faz esse som

Conferido no código em 25/09/2026: a notificação que o widget manda ao lançar usa o canal `lancamento-voz`, criado com `sound: null` em `lib/widget-voz-notificacoes.ts`. Ou seja, o recibo chega **sem som**. Um anúncio com "plim" mostraria algo que o app não faz, e isso fere a regra de verdade do produto.

Os caminhos, para decisão do autor:

1. **Pôr o som no app antes de publicar o anúncio** (recomendado). É preciso:
   - um arquivo de som curto e agudo;
   - registrá-lo no plugin `expo-notifications` do `app.json`;
   - criar um canal NOVO, porque no Android o som de um canal não muda depois de criado;
   - uma build.
   Aí o "plim" do anúncio pode ser o mesmo arquivo do app.
2. **Tirar o "plim" do anúncio** e deixar só o sorriso dela como sinal de que deu certo.

Até essa decisão, o "plim" do roteiro fica marcado como **condicional**.

## As falas

| Quem | Fala | Duração estimada |
|---|---|---|
| Padeiro | "Aqui está, seu pãozinho quentinho." | ≈ 2 s |
| Ela | "Obrigada!" | < 1 s |
| Ela, no celular | **"Pão na padaria, três e cinquenta e sete, no débito."** | ≈ 3 s |

A frase do celular foi conferida no código em 25/09/2026. É uma frase que o app entende de verdade: o widget salva sozinho como **"Pão na padaria · R$ 3,57 · Alimentação · Débito"**, sem abrir o app. Formas parecidas falham:

| Frase | O que o app faz |
|---|---|
| "Pão, 3,57, no débito" | "pão" sozinho não é reconhecido como Alimentação. O widget para e pergunta "Qual categoria?". |
| "Pão, três e cinquenta e sete, alimentação, no débito" | Salva, mas a descrição fica "Pão alimentação". |
| **"Pão na padaria, três e cinquenta e sete, no débito"** | **Salva direto, com descrição e categoria certas.** |

**"Sem abrir o aplicativo" é verdade.** O widget grava, transcreve e lança com o app fechado (`lib/widget-voz-task.ts`), e o recibo chega como notificação, com o botão "Desfazer".

## Personagens (mesma descrição em todos os prompts)

**Carla, a moça (nome interno, nunca aparece no vídeo).**

> A fictional Brazilian woman in her late twenties, warm light-brown skin, dark curly shoulder-length hair tied in a loose high ponytail, small gold hoop earrings, mustard-yellow cotton t-shirt, light-wash jeans, a small crossbody bag, a phone in a plain black case in her back pocket.

**Seu Zé, o padeiro (nome interno).**

> A fictional friendly Brazilian baker in his fifties, short grey hair, trimmed grey moustache, white baker's apron over a light-blue short-sleeve shirt, warm smile.

Para a aparência não mudar entre as cenas, gere primeiro as imagens de referência (cena 0). Depois ligue a da moça em todos os nós de vídeo e a do padeiro na cena 1, como referência (`images`).

## Estrutura

| # | Tempo | Cena | Som |
|---|---|---|---|
| 0 | — | Imagens de referência da moça e do padeiro | — |
| 1 | 0–8 s | Ela paga no débito. O padeiro entrega: "Aqui está, seu pãozinho quentinho." Ela pega o pão, agradece e se vira. | Voz do padeiro, "Obrigada!" dela, ambiente de padaria |
| 2 | 8–16 s | Antes de sair, tira o celular do bolso, toca no widget e fala a frase. O celular faz o "plim" (condicional) e ela sorri. | A voz dela, o "plim", ambiente |
| 3 | 16–22 s | Guarda o celular e sai para a rua, feliz. Nos últimos ~2 s, a imagem se dissolve aos poucos no fechamento. | Rua + **narração** |
| 4 | 22–26 s | Fechamento com a logo real | Fim da narração |

## Narração

Entra DEPOIS da fala dela, nunca por cima de nenhuma fala. Começa quando ela sai para a rua e acompanha a passagem para o logotipo.

> **"Gastos pequenos não precisam ser difíceis. Pagou, falou, lançou. Rápido, fácil e sem abrir o aplicativo."**

- **Duração estimada:** ≈ 6,7 s, pela velocidade da voz "Beatriz - Warm and Natural" medida em 25/09/2026 (186 caracteres em 11,9 s).
- **Versão curta** (≈ 5,6 s): *"Gastos pequenos não precisam ser difíceis. Pagou, falou, lançou. Sem abrir o aplicativo."*
- **Como gerar:** voz "Beatriz - Warm and Natural" (pt-BR, feminina, acolhedora), modelo `eleven_multilingual_v2`.

## Prompts

Todos os vídeos usam **Gemini Omni 1.1 Flash**, com `aspect_ratio` **9:16**, `resolution` **720p** (ou 1080p), `duration_secs` indicado em cada cena e as imagens da cena 0 ligadas em `images`. Escrever "vertical" no prompt não basta: a proporção é o parâmetro do nó, e o padrão dele é 16:9. Os prompts ficam em inglês, que é como o modelo segue melhor. As falas ficam em português, entre aspas.

### Cena 0: imagens de referência

- **Modelo:** `gemini-3-pro-image` (segura os mesmos personagens entre as cenas).
- **Proporção:** 9:16.
- Gere uma imagem para cada personagem.

**Moça:**

> Full-body and close-up character reference sheet of the same person, plain light-grey studio background, soft even daylight. A fictional Brazilian woman in her late twenties, warm light-brown skin, dark curly shoulder-length hair tied in a loose high ponytail, small gold hoop earrings, mustard-yellow cotton t-shirt, light-wash jeans, a small crossbody bag, a phone in a plain black case in her back pocket. Friendly relaxed expression, natural skin texture, realistic photography.

**Padeiro:**

> Waist-up and close-up character reference sheet of the same person, plain light-grey studio background, soft even daylight. A fictional friendly Brazilian baker in his fifties, short grey hair, trimmed grey moustache, white baker's apron over a light-blue short-sleeve shirt, warm smile. Natural skin texture, realistic photography.

### Cena 1: paga, recebe o pão, agradece e se vira (8 s)

- **Duração:** `duration_secs` 8.
- **Referências:** moça e padeiro.

> Medium shot, one continuous shot, natural smartphone camera look. Inside a small, cozy neighborhood bakery in São Paulo, warm morning sunlight through the front window, glass display case with bread rolls. The woman from the reference image taps a debit card on a small card machine on the counter. The baker from the reference image, behind the counter, hands her a small paper bag of warm bread rolls and says in a warm, friendly Brazilian Portuguese voice: "Aqui está, seu pãozinho quentinho." She takes the bag, smiles and says: "Obrigada!", then turns away from the counter toward the door. Their lips match their words. Ambient bakery sounds: soft chatter, a coffee machine, paper bag rustle. No music, no on-screen text. Grounded, realistic, warm tones.

### Cena 2: lança por voz antes de sair (8 s)

- **Duração:** `duration_secs` 8.
- **Referência:** moça.
- **Som do "plim":** NÃO peça ao modelo de vídeo (ele inventa um som qualquer, em qualquer momento). O "plim" entra na montagem, como faixa separada, no instante exato (ver "Montagem").

> Medium close-up, one continuous shot, natural smartphone camera look. Near the open door of a small São Paulo bakery, warm morning light, the woman from the reference image holds a paper bag of bread in one arm, pauses before stepping outside, takes her phone out of her back pocket, taps the screen once with her thumb, then holds the phone near her mouth with the screen facing away from the camera and says clearly, in a relaxed natural Brazilian Portuguese voice: "Pão na padaria, três e cinquenta e sete, no débito." Her lips match the words. A second later she glances at the phone, the screen still facing away from the camera, and breaks into a small satisfied smile. Ambient bakery sounds, low. No music, no on-screen text. Realistic, warm.

**Plano B, se a voz ou a boca saírem ruins:**
1. Gere a mesma cena sem fala ("she speaks a short phrase to the phone").
2. Gere a frase na voz **"Jully - Calm & Young"** (pt-BR, feminina, jovem), com o modelo `eleven_multilingual_v2`.
3. Sincronize a boca com um nó `sync-lipsync-v3`: o vídeo da cena entra como vídeo e a frase como áudio.

Vale o mesmo para a cena 1, com uma voz masculina madura para o padeiro. Não use voz clonada de pessoa real.

### Som do "plim" (condicional)

- **Se o app ganhar o som:** use o MESMO arquivo do app. É o único jeito de o anúncio mostrar o som real.
- **Rascunho, só enquanto o app não tem o som:** nó `sfx` com o modelo `eleven_text_to_sound_v2`, cerca de 1 s.

> A single short, bright, high-pitched positive notification chime from a smartphone, clean and pleasant, "plim", no reverb, no melody.

### Cena 3: guarda o celular e segue a vida (6 s)

- **Duração:** `duration_secs` 6.
- **Referência:** moça.

> Medium shot, one continuous shot, natural smartphone camera look. The woman from the reference image steps out of a small São Paulo bakery onto a sunny sidewalk, slides her phone back into her back pocket, adjusts the paper bag of bread on her arm and walks away down the street with a light, happy step and a relaxed smile. Ambient street sounds: distant traffic, birds. No music, no dialogue, no on-screen text. Realistic, warm tones.

### Cena 4: fechamento (4 s)

- **Imagem:** a logo e a fonte são as reais. Não peça logo à IA, porque ela inventa uma marca parecida. Use `assets/icon.png` e o logotipo do site sobre o fundo petróleo `#052229`.
- **Texto na tela:** "Grana." / "Fala o gasto. Pronto." / "Menos de R$ 0,37 por dia".
- **Som:** o fim da narração.

## Legendas (para quem assiste sem som)

| Cena | Legenda |
|---|---|
| 1 | "Aqui está, seu pãozinho quentinho." e "Obrigada!" |
| 2 | "Pão na padaria, três e cinquenta e sete, no débito." |
| 3 | "Gastos pequenos não precisam ser difíceis." e "Pagou, falou, lançou." |
| 4 | "Rápido, fácil e sem abrir o aplicativo." |

## Montagem

Na ordem 1, 2, 3, 4.

- **1 → 2:** corte seco, logo que ela se vira.
- **"Plim":** entra cerca de 0,5 s depois de ela terminar a frase, pouco antes do sorriso.
- **2 → 3:** corte seco, depois do sorriso.
- **Narração:** começa quando ela sai para a rua (início da cena 3).
- **3 → 4:** **dissolvência gradual**, de cerca de 2 s, da rua para o logotipo, que é o "a tela muda gradualmente" pedido pelo autor.

**Ferramenta:** o nó de composição da ElevenLabs junta vídeo e áudio. Não foi conferido se ele faz dissolvência ou se aceita posicionar o "plim" num instante exato. Se não fizer, monte num editor (CapCut, por exemplo) com os arquivos gerados.

## Custo estimado (ElevenLabs, 25/09/2026)

| Item | Custo |
|---|---|
| Vídeos (cenas 1, 2 e 3) | ≈ US$ 1,11 cada, em 720p |
| Imagens de referência | alguns centavos |
| Narração e "plim" | centavos |
| Plano B (lipsync), se precisar | por nó |
| **Total** | **entre US$ 3,50 e US$ 5** |

## O que conferir antes de publicar

- Mãos, dedos e bocas dos dois personagens.
- As vozes: a do padeiro e a dela batem com as bocas.
- A tela do celular nunca aparece de frente.
- Nenhum texto errado em placas ou embalagens ao fundo.
- A fala da cena 2 é a frase conferida acima.
- **O "plim" só vai ao ar se o app tiver o mesmo som.**
- As legendas estão sem erro de acento.

## Outro criativo: a tela do app (fica para depois)

Decisão do autor: a demonstração com a tela do app vira um criativo próprio. A gravação é feita pelo autor, porque tela de app é sempre captura real. O que já ficou definido para ele:

1. **Conta:** a conta de teste, ou uma conta só com valores inventados. Nunca a conta pessoal: tudo o que aparecer na tela vai para um anúncio público.
2. **Aparelho:** modo não perturbe ligado e tela cheia na vertical.
3. **Frase:** a mesma deste Reels.
4. **Versão sem abrir o app:** tela inicial com o widget de voz e o widget "Livre para gastar". Fale a frase, espere a notificação do recibo e o "Livre para gastar" mudar de valor. O widget de voz atualiza o outro sozinho (`sincronizarWidgetsHome`), mas só tenta por 5 s: teste antes de gravar.
5. **Versão com o app aberto:** toque na notificação e role devagar até o lançamento na lista e até o "Livre para gastar". Nesta versão, a narração não pode dizer "sem abrir o aplicativo".
