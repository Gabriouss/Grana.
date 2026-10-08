# Guia de produção de criativos do Grana. (vigente desde 27/09/2026)

## Regra rígida do autor para toda tela em material visual (27/09/2026)

**Toda tela do aplicativo aparece SEMPRE dentro de uma moldura realista de celular.** Não usar desenho de celular flat 2D, screenshot solta nem tela do app colada em uma forma que só sugere o aparelho. Quando a peça mostrar a versão web em notebook, a moldura do notebook também precisa ser realista. A mesma exigência vale para estático, Story, carrossel, Reel, motion e widget recriado em HTML.

**Encaixe é critério de aceite:** medir no arquivo final as bordas retas e os quatro cantos da área de tela do mockup. Manter respiro visível entre conteúdo do app e borda interna do aparelho/notebook; nenhum texto, ícone, botão, notificação, barra ou valor pode ficar cortado, encostado na borda ou escondido pelo arredondamento dos cantos. Recortar a imagem pela geometria real da tela, preservando proporção e perspectiva, e conferir o resultado exportado em pixels nos quatro lados e cantos. Se o mockup não comportar a tela inteira com margem, trocar o enquadramento ou o mockup antes de entregar; não esconder o corte com máscara ou sobreposição. Esta regra prevalece sobre exemplos antigos e aprovações anteriores de layout.

Leia este guia **antes de produzir qualquer criativo**: estático, carrossel, Story, Reel ou motion. Ele junta os materiais que o autor aprovou até 27/09/2026 e diz quando usar cada um. As regras de fundo continuam no `PRODUCT.md` ("Copy and Marketing Guidelines") e no `FUNIL.md`, que é local, das máquinas do autor.

## 1. Comece pelo que já existe

| Preciso de… | Use | Onde |
|---|---|---|
| Notificação do Grana. na tela | uma das 21 notificações prontas, com texto real do app | `arsenal/notificacoes/` |
| Ícone, selo ou símbolo de função | os 28 ícones do app (Ionicons) em 5 estilos | `arsenal/icones/` |
| Celular com tela real | `celular-1.png` e `celular-2.png` **somente se** a moldura permanecer realista e a tela exportada tiver respiro medido nos quatro lados e cantos, sem corte; revisar cada composição, não presumir aprovação pelo nome do asset | `funil-criativos-flat-2026-09/revisao-04/assets/` |
| Notebook com tela real | `notebook.png` (e variantes) **somente se** a moldura for realista e a imagem web estiver inteira, com margem interna inclusive nos cantos arredondados | `funil-criativos-flat-2026-09/revisao-03/assets/` e `revisao-04/assets/` |
| Celular vazio, para compor tela real | `celular-vazio.png` **somente se** a composição final mantiver o corpo fotorealista, a perspectiva, os cantos reais e margem entre a interface e a borda interna | `../../design-system/marketing-mockups/` |
| Widget de voz, widget "Livre para gastar" ou notificação na tela do celular | HTML pode recriar o conteúdo fiel ao código **somente dentro de mockup realista**, com margem medida e sem encostar ou cortar conteúdo nos lados e cantos; modelo flat não passa | modelos em `funil-criativos-flat-2026-09/exemplo-widget-voz/` e `motion-desistiu/` |
| Logotipo e símbolo | sempre os arquivos oficiais, nunca redesenhados | `../../design-system/marca/` |
| Som | "plim" de sucesso a −16 dB sob música; trilha pop (motion) ou "house" 100 bpm (Reels de tela) | `identidade-sonora/`, `r5-colar-pix/gerar-trilha-house.py` |

**Não crie ícone ou elemento de interface que não exista no app.** O autor recusou um medidor circular inventado e um ícone desenhado à mão. Se faltar algo, gere a partir do arsenal (`arsenal/gerar.py`): ícone do Ionicons, notificação com texto tirado do código.

## 2. Estilos aprovados

- **Story escuro com celular e notificações** (`stories-estilo-referencias/story1.html`):
  - fundo petróleo com brilho suave;
  - logotipo pequeno no canto e título grande à esquerda, com o final em menta;
  - celular real entrando pela borda de baixo;
  - 1 ou 2 notificações do arsenal flutuando por cima do celular.
- **Story de marca com forma grande atrás do aparelho** (`stories-estilo-referencias/story2.html`):
  - logotipo centralizado e título centralizado em duas cores;
  - "G." em gradiente, enorme, atrás do notebook;
  - celular na frente;
  - um selo do arsenal (estilo `-gradiente` ou `-menta`) no canto do aparelho.
- **Card de feed 1080×1440** (`funil-criativos-flat-2026-09/exemplo-widget-voz/`): logotipo, H1 e H2 à esquerda, celular inclinado à direita.
- **Carrossel** (`funil-criativos-flat-2026-09/S8-primeiros-7-dias/`): uma rota de progresso que acende slide a slide. A capa e o fechamento o autor faz no Photoshop.
- **Reel de tela real** (`r5-colar-pix/`, v6 aprovado):
  - celular **só flutuando**, sem zoom, sem pulsar no ritmo e sem tremer;
  - textos entrando **inteiros e fluidos**, nunca palavra por palavra;
  - sem confete e sem contorno em volta de campo;
  - barra de progresso no topo;
  - ritmo de 100 bpm, lento o bastante para ler a tela.

## 3. Regras de composição que o autor já cobrou

- **Ícones do arsenal com muita parcimônia** (autor, 27/09/2026, duas revisões no S2): ícone grande em destaque não; marcador de lista e indicador de passos também não. Prefira número ou texto. O uso aprovado até aqui é um selo único no canto de um aparelho, como no Story 2. Na dúvida, não use.
- **Sem sobretítulo** (etiqueta em caixa alta no canto) e **sem o rodapé** "Demonstração com dados fictícios.".
- **Sem botão desenhado na arte.** O "Saiba mais" é do Instagram.
- **Stories:** o texto fica entre y ≈ 230 e 1400. A parte de baixo pode ser coberta pela barra de resposta e pelo "Saiba mais".
- **Evitar números redondos** (15, 20, 30, 50, 100) em valor que aparece na peça, na tela do app ou no texto (autor, 08/10/2026). Use valor quebrado, como R$ 23,90 ou R$ 103,05; prepare os dados da conta de teste para isso antes de gravar ou capturar, em vez de editar a tela depois. O preço segue como "menos de R$ 0,37 por dia".
- **Números fictícios nas telas não precisam seguir a regra 20** (decisão de 26/09). Preço só como "menos de R$ 0,37 por dia".
- **Nunca** falar de banco, conexão bancária ou Open Finance. Nenhum logo de banco ou marca real inventado.
- **Marca bem visível:** existe um concorrente chamado "Grana Smart". O logotipo com o ponto e a paleta petróleo e menta precisam ser reconhecíveis.
- **Referências de terceiros:** servem só para estilo visual (ver `referencias/`). Nunca copiar texto, marca ou layout.

## 4. Custo

- **Produza localmente:** HTML, fotografia no Chromium e `ffmpeg`. É de graça e o autor prefere o resultado.
- **ElevenLabs só com estimativa e OK do autor.** No teste de 26/09, o autor preferiu a versão local à gerada por IA.
- **Narração grátis (Piper): não usar.** As vozes em português têm base de licença não comercial (ver `identidade-sonora/README.md`).

## 5. Pendências de gravação (M1)

- R9 com **Importar extrato**: `solicitacoes/2026-09-26-gravar-r9-importar-extrato.md`
- Final do R5 na aba **Débito e Pix**: `solicitacoes/2026-09-27-gravar-r5-final-lancamentos.md`
