# Guia de produção de criativos do Grana. (vigente desde 27/09/2026)

Leia este guia **antes de produzir qualquer criativo**: estático, carrossel, Story, Reel ou motion. Ele junta os materiais que o autor aprovou até 27/09/2026 e diz quando usar cada um. As regras de fundo continuam no `PRODUCT.md` ("Copy and Marketing Guidelines") e no `FUNIL.md`, que é local, das máquinas do autor.

## 1. Comece pelo que já existe

| Preciso de… | Use | Onde |
|---|---|---|
| Notificação do Grana. na tela | uma das 21 notificações prontas, com texto real do app | `arsenal/notificacoes/` |
| Ícone, selo ou símbolo de função | os 28 ícones do app (Ionicons) em 5 estilos | `arsenal/icones/` |
| Celular com tela real | `celular-1.png` (Início) e `celular-2.png` (Lançamentos) | `funil-criativos-flat-2026-09/revisao-04/assets/` |
| Notebook com tela real | `notebook.png` (Início web) | `funil-criativos-flat-2026-09/revisao-03/assets/` |
| Celular vazio, para compor tela recriada | `celular-vazio.png` | `../../design-system/marketing-mockups/` |
| Widget de voz, widget "Livre para gastar" ou notificação na tela do celular | recriar em HTML com texto e cor do código | modelos em `funil-criativos-flat-2026-09/exemplo-widget-voz/` e `motion-desistiu/` |
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

- **Sem sobretítulo** (etiqueta em caixa alta no canto) e **sem o rodapé** "Demonstração com dados fictícios.".
- **Sem botão desenhado na arte.** O "Saiba mais" é do Instagram.
- **Stories:** o texto fica entre y ≈ 230 e 1400. A parte de baixo pode ser coberta pela barra de resposta e pelo "Saiba mais".
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
