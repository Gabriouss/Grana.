# Reels: "o pão lançado pelo widget"

Roteiro e prompts para gerar na ElevenLabs. Estrutura pedida pelo autor em 25/09/2026:

> A mulher paga o pão, pega o pão. Quando ela dá as costas para sair da padaria,
> pega o celular do bolso, aperta no widget e fala o gasto. Ela é vista falando
> com o celular: a narração não fica por cima do que ela fala. Corta para o
> aplicativo, a tela rolando, o lançamento. Quando termina, ela guarda o
> celular e vai embora feliz.

- **Formato:** Reels 9:16, 720×1280 ou maior.
- **Duração:** cerca de 30 s.
- **Quem gera o quê:** as cenas com a personagem saem da ElevenLabs. A gravação de tela do app é feita pelo autor.

## Regras que este criativo segue (`PRODUCT.md`)

- **A personagem é fictícia.** Ela demonstra o uso e nunca se apresenta como cliente nem dá depoimento de resultado (CDC/CONAR). Sem rosto nem voz do autor.
- **Tela do app é sempre captura real,** nunca desenhada pela IA. Por isso, em toda cena gerada, a tela do celular fica virada para longe da câmera.
- **Copy:** sem travessão, sem "não é X, é Y", sem nomear o "apagão financeiro".
- **Preço:** só "menos de R$ 0,37 por dia".

## A frase falada (conferida no código em 25/09/2026)

**"Pão na padaria, três e cinquenta e sete, no débito."**

Com essa frase, o widget salva sozinho e a notificação mostra **"Pão na padaria · R$ 3,57"** e **"Alimentação · Débito"**. As outras formas testadas dão errado na gravação real:

| Frase | O que o app faz |
|---|---|
| "Pão, 3,57, no débito" | "pão" sozinho não é reconhecido como Alimentação. O widget para e pergunta "Qual categoria?". |
| "Pão, três e cinquenta e sete, alimentação, no débito" | Salva, mas a descrição fica "Pão alimentação". |
| **"Pão na padaria, três e cinquenta e sete, no débito"** | **Salva direto, com descrição e categoria certas.** |

A personagem precisa falar no vídeo a MESMA frase que o autor fala na gravação de tela. Senão o que se ouve não bate com o que aparece.

**O que o app mostra de verdade, para o roteiro não prometer outra coisa.** Com a frase certa, o widget lança sozinho e avisa com uma notificação que tem o botão "Desfazer". Ele não pede confirmação: só pede quando a fala é ambígua. Então a "confirmação" que aparece no vídeo é ela conferindo o lançamento no app: o recibo na notificação, a lista e o "Livre para gastar" atualizado.

## Personagem (mesma descrição em todos os prompts)

**Carla (nome interno, nunca aparece no vídeo).**

> A fictional Brazilian woman in her late twenties, warm light-brown skin, dark curly shoulder-length hair tied in a loose high ponytail, small gold hoop earrings, mustard-yellow cotton t-shirt, light-wash jeans, a small crossbody bag, a phone in a plain black case in her back pocket.

Para a aparência não mudar entre as cenas, gere primeiro a imagem de referência (passo 0). Depois ligue essa imagem como referência (`images`) em todos os nós de vídeo.

## Estrutura

| # | Tempo | Cena | Origem | Som |
|---|---|---|---|---|
| 0 | — | Imagem de referência da personagem | ElevenLabs (imagem) | — |
| 1 | 0–6 s | Paga e pega o pão no balcão | ElevenLabs (vídeo) | Ambiente de padaria + **narração de abertura** |
| 2 | 6–14 s | Dá as costas, tira o celular, toca no widget e FALA a frase | ElevenLabs (vídeo) | **A voz dela** + ambiente |
| 3 | 14–23 s | Recibo na notificação e o widget "Livre para gastar" atualizando, na tela inicial (versão A) | **Gravação de tela do autor** | Ambiente baixo, ou uma trilha leve |
| 4 | 23–28 s | Guarda o celular e vai embora feliz | ElevenLabs (vídeo) | Ambiente de rua + **narração de fechamento** |
| 5 | 28–31 s | Fechamento com a marca | Montagem com a logo real | Fim da narração |

## Narração

Pedido do autor (25/09/2026): *"chega de dificuldade pra lançar coisinhas pequenas. Faz o pagamento e lança por voz. Rápido, fácil, sem abrir o aplicativo."*

A narração nunca fica por cima da fala da personagem. Ela entra em dois pedaços: um ANTES de a personagem falar (cena 1) e outro DEPOIS (cenas 4 e 5).

| Pedaço | Texto | Duração estimada |
|---|---|---|
| Abertura (cena 1) | "Chega de complicação pra lançar gasto pequeno." | ≈ 3 s |
| Fechamento (cenas 4 e 5) | "Pagou, falou, lançou. Rápido, fácil e sem abrir o aplicativo." | ≈ 4 s |

A duração foi estimada pela velocidade da voz "Beatriz - Warm and Natural" medida em 25/09/2026 (186 caracteres em 11,9 s). Gere cada pedaço como um nó de fala separado, com `eleven_multilingual_v2`, para encaixar cada um no seu corte.

Alternativa de abertura: *"Gasto pequeno também conta, e anotar não precisa dar trabalho."* (≈ 4 s)

**"Sem abrir o aplicativo" precisa ser verdade na tela.** O widget de voz lança com o app fechado e, depois de lançar, atualiza sozinho o widget "Livre para gastar" da tela inicial (`sincronizarWidgetsHome`, chamado por `lib/widget-voz-task.ts`, com prazo de 5 s). Por isso a cena 3 tem duas versões:

- **Versão A (combina com esta narração):** a gravação mostra a notificação do recibo e o widget "Livre para gastar" mudando de valor, **sem abrir o app**.
- **Versão B (o app aberto, rolando):** ela toca na notificação e o app abre. Nesta versão, a narração de fechamento **não pode** dizer "sem abrir o aplicativo". Use *"Pagou, falou, lançou. Rápido e fácil."*

A versão B também serve de base para um segundo vídeo, focado em mostrar o app por dentro.

**Só existe no Android.** Widget não existe no app para iPhone. Se o anúncio falar de widget ou de "sem abrir o aplicativo", segmente para Android.

## Prompts

Todos os vídeos usam **Gemini Omni 1.1 Flash**, com `aspect_ratio` **9:16**, `resolution` **720p** (ou 1080p) e a imagem da cena 0 ligada em `images`. Escrever "vertical" no prompt não basta: a proporção é o parâmetro do nó, e o padrão dele é 16:9. Os prompts ficam em inglês, que é como o modelo segue melhor. A fala fica em português, entre aspas.

### Cena 0: imagem de referência

- **Modelo:** `gemini-3-pro-image` (segura a mesma personagem entre as cenas).
- **Proporção:** 9:16.

> Full-body and close-up character reference sheet of the same person, plain light-grey studio background, soft even daylight. A fictional Brazilian woman in her late twenties, warm light-brown skin, dark curly shoulder-length hair tied in a loose high ponytail, small gold hoop earrings, mustard-yellow cotton t-shirt, light-wash jeans, a small crossbody bag, a phone in a plain black case in her back pocket. Friendly relaxed expression, natural skin texture, realistic photography.

### Cena 1: paga e pega o pão (6 s)

- **Duração:** 6 s.

> Medium shot, one continuous shot, natural smartphone camera look. The woman from the reference image stands at the counter of a small, cozy neighborhood bakery in São Paulo, warm morning sunlight through the front window, glass display case with bread rolls. She taps a debit card on a small card machine held by the baker, whose face stays out of frame, then takes a small paper bag of bread rolls with a friendly smile and a small nod of thanks. Ambient bakery sounds: soft chatter, a coffee machine, paper bag rustle. No music, no on-screen text. Grounded, realistic, warm tones.

### Cena 2: toca no widget e fala o gasto (8 s)

- **Duração:** 8 s.

> Medium close-up, one continuous shot, natural smartphone camera look. The woman from the reference image turns away from the bakery counter holding the paper bag of bread, walks slowly toward the open door, takes her phone out of her back pocket, taps the screen once with her thumb, then holds the phone near her mouth with the screen facing away from the camera and says clearly, in a relaxed natural Brazilian Portuguese voice: "Pão na padaria, três e cinquenta e sete, no débito." Her lips match the words. Warm morning light from the doorway. Ambient bakery sounds, low. No music, no on-screen text. Realistic, warm.

**Plano B, se a voz ou a boca saírem ruins:**
1. Gere a mesma cena sem fala ("she speaks a short phrase to the phone").
2. Gere a frase na voz **"Jully - Calm & Young"** (pt-BR, feminina, jovem), com o modelo `eleven_multilingual_v2`.
3. Sincronize a boca com um nó `sync-lipsync-v3`: o vídeo da cena entra como vídeo e a frase como áudio.

Não use voz clonada de pessoa real.

### Cena 3: gravação de tela (autor)

Especificação da gravação no fim deste documento.

### Cena 4: guarda o celular e vai embora (5 s)

- **Duração:** 5 s.

> Medium shot, one continuous shot, natural smartphone camera look. On a sunny sidewalk just outside a small São Paulo bakery, the woman from the reference image glances at her phone, the screen facing away from the camera, and gives a satisfied little smile. She slides the phone back into her back pocket, adjusts the paper bag of bread on her arm and walks away down the street, relaxed and happy. Ambient street sounds: distant traffic, birds. No music, no on-screen text. Realistic, warm tones.

### Cena 5: fechamento (3 s)

- **Imagem:** a logo e a fonte são as reais. Não peça logo à IA, porque ela inventa uma marca parecida. Use `assets/icon.png` e o logotipo do site sobre o fundo petróleo `#052229`.
- **Texto na tela:** "Grana." / "Fala o gasto. Pronto." / "Menos de R$ 0,37 por dia".
- **Narração:** é o final da narração de fechamento (ver "Narração"). Não precisa de um terceiro pedaço.

## Legendas (para quem assiste sem som)

| Cena | Legenda |
|---|---|
| 2 | "Pão na padaria, três e cinquenta e sete, no débito." |
| 1 | "Chega de complicação pra lançar gasto pequeno." |
| 3 | "Lançado na hora" (quando aparece a notificação) e "Já conta no seu Livre para gastar" (quando o widget muda) |
| 4 | "Pagou, falou, lançou. Rápido, fácil e sem abrir o aplicativo." |

## Gravação de tela: o que o autor grava (cena 3, ~9 s)

1. **Conta:** use a conta de teste ou uma conta só com valores inventados. Nunca a conta pessoal: tudo o que aparecer na tela vai para um anúncio público. Confira que nenhum nome, saldo ou lançamento real aparece.
2. **Aparelho:** celular em modo não perturbe (nenhuma notificação de outro app), bateria e hora sem nada estranho, tela cheia na vertical.
3. **Roteiro da gravação, versão A (sem abrir o app):**
   1. tela inicial com o widget de voz e o widget "Livre para gastar", os dois visíveis na mesma tela;
   2. toque no widget de voz;
   3. fale a MESMA frase ("Pão na padaria, três e cinquenta e sete, no débito");
   4. o widget encerra sozinho no silêncio;
   5. aparece a notificação "Pão na padaria · R$ 3,57 / Alimentação · Débito";
   6. espere o widget "Livre para gastar" mudar de valor (até uns 5 s). Não abra o app.

   **Versão B (app aberto):** mesmos passos 1 a 5; depois toque na notificação e role devagar até o lançamento na lista e até o "Livre para gastar".

   **Conferir antes de gravar a versão A:** o widget "Livre para gastar" mudar sem abrir o app depende da rede e do Android. O código tenta por 5 s e desiste em silêncio. Se na sua tentativa ele não mudar, grave a versão B e use a narração da versão B.
4. **Duração:** grave com folga (15 a 20 s) e corte na montagem para uns 9 s.
5. **Ritmo:** role devagar. Rolagem rápida vira borrão em vídeo comprimido.

## Montagem

Composição na ElevenLabs, ou editor à escolha, na ordem 1, 2, 3, 4, 5. Nos cortes:

- **2 → 3:** cortar no instante em que ela termina a frase.
- **3 → 4:** cortar quando o lançamento aparece na lista.

## Custo estimado (ElevenLabs, 25/09/2026)

| Item | Custo |
|---|---|
| Vídeos (cenas 1, 2 e 4) | ≈ US$ 1,11 cada, em 720p |
| Imagem de referência | alguns centavos |
| Narração | centavos |
| Plano B da cena 2 | um nó de lipsync a mais |
| **Total** | **entre US$ 3,50 e US$ 5** |

## O que conferir antes de publicar

- Mãos, dedos e boca da personagem.
- Nenhuma tela inventada: nas cenas geradas, a tela do celular nunca aparece de frente.
- Nenhum texto errado em placas ou embalagens ao fundo.
- A fala da cena 2 é igual à da gravação de tela.
- As legendas estão sem erro de acento.
