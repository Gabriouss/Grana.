# Reels: "o pão lançado pelo widget"

Roteiro e prompts para gerar na ElevenLabs. Estrutura decidida pelo autor em 25/09/2026:

> A moça faz o pagamento, depois dá as costas, pega o celular do bolso, faz o
> lançamento pela voz, bota o celular de volta no bolso e segue a vida feliz.
> Depois vem a narração: gastos pequenos não precisam ser difíceis.

A demonstração da tela do app fica para **outro criativo** (ver o fim deste documento). Neste, a própria ação dela, lançando por voz sem abrir o app, é a demonstração.

- **Formato:** Reels 9:16, 720×1280 ou maior.
- **Duração:** cerca de 24 s.
- **Origem:** tudo gerado na ElevenLabs, menos a logo do fechamento, que é a real.

## Regras que este criativo segue (`PRODUCT.md`)

- **A personagem é fictícia.** Ela demonstra o uso e nunca se apresenta como cliente nem dá depoimento de resultado (CDC/CONAR). Sem rosto nem voz do autor.
- **Tela do app é sempre captura real, nunca desenhada pela IA.** Por isso, em toda cena, a tela do celular fica virada para longe da câmera.
- **Copy:** sem travessão, sem "não é X, é Y", sem nomear o "apagão financeiro".
- **Preço:** só "menos de R$ 0,37 por dia".
- **Só Android.** O widget existe só no Android, e a narração promete "sem abrir o aplicativo". Segmente o anúncio para Android.

## A frase que ela fala (conferida no código em 25/09/2026)

**"Pão na padaria, três e cinquenta e sete, no débito."**

É uma frase que o app entende de verdade. O widget salva sozinho como **"Pão na padaria · R$ 3,57 · Alimentação · Débito"**, sem abrir o app. Formas parecidas falham:

| Frase | O que o app faz |
|---|---|
| "Pão, 3,57, no débito" | "pão" sozinho não é reconhecido como Alimentação. O widget para e pergunta "Qual categoria?". |
| "Pão, três e cinquenta e sete, alimentação, no débito" | Salva, mas a descrição fica "Pão alimentação". |
| **"Pão na padaria, três e cinquenta e sete, no débito"** | **Salva direto, com descrição e categoria certas.** |

**"Sem abrir o aplicativo" é verdade.** O widget grava, transcreve e lança com o app fechado (`lib/widget-voz-task.ts`), e o recibo chega como notificação, com o botão "Desfazer".

## Personagem (mesma descrição em todos os prompts)

**Carla (nome interno, nunca aparece no vídeo).**

> A fictional Brazilian woman in her late twenties, warm light-brown skin, dark curly shoulder-length hair tied in a loose high ponytail, small gold hoop earrings, mustard-yellow cotton t-shirt, light-wash jeans, a small crossbody bag, a phone in a plain black case in her back pocket.

Para a aparência não mudar entre as cenas, gere primeiro a imagem de referência (cena 0). Depois ligue essa imagem como referência (`images`) em todos os nós de vídeo.

## Estrutura

| # | Tempo | Cena | Som |
|---|---|---|---|
| 0 | — | Imagem de referência da personagem | — |
| 1 | 0–6 s | Paga o pão no débito e pega o saquinho | Ambiente de padaria |
| 2 | 6–14 s | Dá as costas, tira o celular do bolso, toca no widget e FALA a frase | **A voz dela** + ambiente |
| 3 | 14–21 s | Guarda o celular no bolso e segue a vida, feliz | Ambiente de rua + **narração** |
| 4 | 21–24 s | Fechamento com a logo real | Fim da narração |

## Narração

Entra DEPOIS da fala dela, nunca por cima. Começa logo que ela termina a frase e vai até o fechamento.

> **"Gastos pequenos não precisam ser difíceis. Pagou, falou, lançou. Rápido, fácil e sem abrir o aplicativo."**

- **Duração estimada:** ≈ 6,7 s, pela velocidade da voz "Beatriz - Warm and Natural" medida em 25/09/2026 (186 caracteres em 11,9 s).
- **Versão curta** (≈ 5,6 s), se o fechamento ficar apertado: *"Gastos pequenos não precisam ser difíceis. Pagou, falou, lançou. Sem abrir o aplicativo."*
- **Como gerar:** voz "Beatriz - Warm and Natural" (pt-BR, feminina, acolhedora), modelo `eleven_multilingual_v2`.

## Prompts

Todos os vídeos usam **Gemini Omni 1.1 Flash**, com `aspect_ratio` **9:16**, `resolution` **720p** (ou 1080p), `duration_secs` indicado em cada cena e a imagem da cena 0 ligada em `images`. Escrever "vertical" no prompt não basta: a proporção é o parâmetro do nó, e o padrão dele é 16:9. Os prompts ficam em inglês, que é como o modelo segue melhor. A fala fica em português, entre aspas.

### Cena 0: imagem de referência

- **Modelo:** `gemini-3-pro-image` (segura a mesma personagem entre as cenas).
- **Proporção:** 9:16.

> Full-body and close-up character reference sheet of the same person, plain light-grey studio background, soft even daylight. A fictional Brazilian woman in her late twenties, warm light-brown skin, dark curly shoulder-length hair tied in a loose high ponytail, small gold hoop earrings, mustard-yellow cotton t-shirt, light-wash jeans, a small crossbody bag, a phone in a plain black case in her back pocket. Friendly relaxed expression, natural skin texture, realistic photography.

### Cena 1: paga e pega o pão (6 s)

- **Duração:** `duration_secs` 6.

> Medium shot, one continuous shot, natural smartphone camera look. The woman from the reference image stands at the counter of a small, cozy neighborhood bakery in São Paulo, warm morning sunlight through the front window, glass display case with bread rolls. She taps a debit card on a small card machine held by the baker, whose face stays out of frame, then takes a small paper bag of bread rolls with a friendly smile and a small nod of thanks. Ambient bakery sounds: soft chatter, a coffee machine, paper bag rustle. No music, no on-screen text. Grounded, realistic, warm tones.

### Cena 2: toca no widget e fala o gasto (8 s)

- **Duração:** `duration_secs` 8.

> Medium close-up, one continuous shot, natural smartphone camera look. The woman from the reference image turns away from the bakery counter holding the paper bag of bread, walks slowly toward the open door, takes her phone out of her back pocket, taps the screen once with her thumb, then holds the phone near her mouth with the screen facing away from the camera and says clearly, in a relaxed natural Brazilian Portuguese voice: "Pão na padaria, três e cinquenta e sete, no débito." Her lips match the words. Warm morning light from the doorway. Ambient bakery sounds, low. No music, no on-screen text. Realistic, warm.

**Plano B, se a voz ou a boca saírem ruins:**
1. Gere a mesma cena sem fala ("she speaks a short phrase to the phone").
2. Gere a frase na voz **"Jully - Calm & Young"** (pt-BR, feminina, jovem), com o modelo `eleven_multilingual_v2`.
3. Sincronize a boca com um nó `sync-lipsync-v3`: o vídeo da cena entra como vídeo e a frase como áudio.

Não use voz clonada de pessoa real.

### Cena 3: guarda o celular e segue a vida (7 s)

- **Duração:** `duration_secs` 7.

> Medium shot, one continuous shot, natural smartphone camera look. On a sunny sidewalk just outside a small São Paulo bakery, the woman from the reference image lowers her phone, the screen facing away from the camera, slides it back into her back pocket without looking at it again, adjusts the paper bag of bread on her arm and walks away down the street with a light, happy step and a relaxed smile. Ambient street sounds: distant traffic, birds. No music, no dialogue, no on-screen text. Realistic, warm tones.

### Cena 4: fechamento (3 s)

- **Imagem:** a logo e a fonte são as reais. Não peça logo à IA, porque ela inventa uma marca parecida. Use `assets/icon.png` e o logotipo do site sobre o fundo petróleo `#052229`.
- **Texto na tela:** "Grana." / "Fala o gasto. Pronto." / "Menos de R$ 0,37 por dia".
- **Som:** o fim da narração.

## Legendas (para quem assiste sem som)

| Cena | Legenda |
|---|---|
| 2 | "Pão na padaria, três e cinquenta e sete, no débito." |
| 3 | "Gastos pequenos não precisam ser difíceis." e "Pagou, falou, lançou." |
| 4 | "Rápido, fácil e sem abrir o aplicativo." |

## Montagem

Composição na ElevenLabs, na ordem 1, 2, 3, 4. Nos cortes:

- **1 → 2:** logo que ela pega o saquinho.
- **2 → 3:** no instante em que ela termina a frase. A narração começa ali.

## Custo estimado (ElevenLabs, 25/09/2026)

| Item | Custo |
|---|---|
| Vídeos (cenas 1, 2 e 3) | ≈ US$ 1,11 cada, em 720p |
| Imagem de referência | alguns centavos |
| Narração | centavos |
| Plano B da cena 2 | um nó de lipsync a mais |
| **Total** | **entre US$ 3,50 e US$ 4,50** |

## O que conferir antes de publicar

- Mãos, dedos e boca da personagem.
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
