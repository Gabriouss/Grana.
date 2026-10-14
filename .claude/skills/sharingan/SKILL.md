---
name: sharingan
description: Copia o estilo de um design feito à mão (estático, carrossel, capa, tela, vídeo) medindo as peças de referência pixel a pixel e transformando as medidas num guia de estilo com regras fixas, faixas que podem variar, arquétipos de composição e lista de conferência, para gerar peças novas que se reconhecem como da mesma série. Use quando o autor disser "/sharingan", "copie o estilo deste design", "replique o estilo destas peças", "faça um guia do estilo que eu montei", ou trouxer referências e pedir peças novas no mesmo visual.
---

# Sharingan: copiar o estilo de um design

O método que produziu o `guia-de-design-estatico-feed-3x4.md` do Grana. (regra 26 do `AGENTS.md`),
generalizado. Ele lê peças que o autor montou à mão e devolve **um guia medido**, não uma impressão:
cada regra vem com o número, a faixa observada e a confiança da medida.

O guia de referência, para copiar a estrutura e o grau de detalhe:
`docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11/apoio/referencias/guia-de-design-estatico-feed-3x4.md`.
Para vídeo, o equivalente é `docs/marketing/2026-10/semana-40-2026-09-28-a-2026-10-04/apoio/referencias/guia-de-estilo-de-video.md`.

## Princípio

**Identidade vem das constantes; variedade vem das variáveis, dentro das faixas medidas.**
O produto final é uma tabela "fixo em toda peça × varia de peça para peça", e tudo o mais justifica
uma linha dessa tabela. Uma regra só existe se aparece em todas as referências; o que muda entre elas
vira faixa (mínimo a máximo), nunca média.

## 1. Entrada (antes de medir)

- **Quais peças são o estilo.** Só peça feita ou aprovada pelo autor. Pergunte se houver dúvida:
  parecer de revisor não é aceite (regra 25), e uma peça fora do estilo contamina todas as faixas.
- **O arquivo-fonte, se existir** (PSD, PSB, Figma, AI, projeto de vídeo). Ele dá fonte, tamanho,
  entrelinha e espaçamento exatos, que no PNG só se estimam. Sem `psd_tools` instalado, as camadas de
  texto de um PSD/PSB ainda se leem procurando as strings `/FontSet`, `/FontSize`, `/Leading`,
  `/Tracking` no binário.
- **Mínimo de 3 referências** para separar regra de acaso. Com 1 ou 2, diga no guia que as faixas
  são provisórias.
- **Para onde vai o guia.** No Grana., em `docs/marketing/<mês>/<semana>/apoio/referencias/`
  (regra 25), com link no `INDICE.md` da semana. Em outro projeto, pergunte.

## 2. Medição automática

```
python -I .claude/skills/sharingan/scripts/medir_peca.py <ref1> <ref2> ... --saida <pasta temporária>
```

Para cada peça grava `<nome>.medidas.json` (formato, paleta quantizada com a parte de cada cor, luz
do fundo nas quatro bordas, espessura de moldura, margens e faixas de conteúdo) e
`<nome>.prancha.png` (a peça com grade de 10%, réguas e as caixas dos blocos achados).
**Abra todas as pranchas com Read.** O número orienta, o olho confirma: um ícone que atravessa a
borda aparece como "moldura mais grossa", e isso é estilo, não erro.

Pasta de saída: a temporária da sessão ou `E:\Grana-temporarios\` (fora do repositório e do vault).

## 3. Medição fina, elemento por elemento

Para cada camada visível, de trás para a frente, tire os números com numpy em pontos exatos
(script descartável na pasta temporária, nunca no repositório):

| Elemento | O que medir | Como |
|---|---|---|
| Grade | moldura, painel, raio do canto, margens do texto, posição da marca e dos rótulos fixos | varrer linhas e colunas até a cor mudar; raio por três pontos do arco |
| Fundo | camadas, degradê (diferença topo/base e esquerda/direita, num canal) | média de faixas; registrar a direção da luz em cada peça |
| Forma de marca no fundo (símbolo, G, onda) | centro, diâmetro, área coberta, contraste contra o entorno, rotação | ajuste de círculo por mínimos quadrados com RANSAC; sobrepor o SVG oficial |
| Tipografia | família, peso, tamanho, altura da maiúscula, entrelinha, espaçamento, cor, nº de linhas, palavras por linha, quebra | arquivo-fonte primeiro; sem ele, o conector Fonts (`detect_font_regions`) e a altura da maiúscula em px |
| Cor no texto | onde a cor vira e por quê (frase, situação × consequência) | ler cada peça e achar o padrão |
| Imagem/aparelho | caixa, proporção, inclinação, perspectiva, sombra de contato, margem mínima até a borda, qual tela e por quê | caixa pelos pixels; sombra pela queda de luminância logo abaixo |
| Elementos decorativos (ícones, adesivos) | quais do acervo, tamanho, quanto fica dentro da imagem, inclinação, desfoque | correlacionar cada glifo, já desfocado, com os arquivos do acervo; raio do desfoque pela largura da transição da borda (≈ 2,5× o raio) |
| Efeitos | desfoque, granulação, brilho, contorno | transição de borda e ruído local |

Para **vídeo**: `ffprobe` para formato e duração; extrair quadros (`ffmpeg -vf fps=10`); medir cortes
por segundo, duração de cada cena, curvas de entrada (posição quadro a quadro), tipografia sobre vídeo
e áudio. Compare quadro a quadro, nunca só o quadro final (regra 9: animação se confere vendo o valor mudar).

**Marque a confiança** de cada medida (alta, média, baixa) e a margem de erro em px. O que não deu
para afirmar é escrito como não afirmado.

## 4. Do número à regra

1. Monte, por elemento, a tabela com uma linha por peça.
2. Para cada coluna: igual em todas → **fixo**; muda → **faixa** (mín. a máx.) e, se der, o que
   faz mudar (ex.: texto alinhado à direita compacta o espaço).
3. Procure a **regra mais firme** da série (no Grana., o G cobrindo 41 a 43% do painel em qualquer
   posição). Ela costuma ser o que dá a identidade, e merece destaque.
4. Agrupe as composições em **arquétipos** (A, B, C…) com coordenadas, e liste os arranjos ainda
   não usados que respeitariam o sistema, marcados "testar antes".

## 5. O guia

Siga a ordem do guia de referência: 0. fixo × varia; 1. formato; 2. grade (com desenho em ASCII);
3. fundo; 4. forma de marca; 5. cores (tabela papel → cor → observação, e "nenhuma outra cor
entra"); 6. tipografia (tabela de níveis e espaços verticais); 7. cor no texto; 8. imagem/aparelho;
9. elementos decorativos; 10. arquétipos; 11. passo a passo para gerar uma peça nova; 12. lista de
conferência com caixas de marcar; 13. variantes de formato, se houver.

Abra o guia dizendo de quais peças saiu, como as medidas foram tiradas, a margem de erro, e que
**o guia descreve o estilo e não é aceite do autor**. Escreva sem travessão e sem "não é X, é Y".

## 6. Produzir e conferir uma peça nova

Antes de gerar qualquer coisa no Grana.: regra 21 (produção só quando o autor pedir), regra 23
(aparelho inteiro, logotipo em gradiente, mockup por homografia), regra 24 (ElevenLabs só com o
"sim" do autor, com custo em R$), regra 25 (peça nova vai para `para-aprovacao`). Prefira o
caminho local: PIL, `ffmpeg`, `rembg`.

Depois de gerar:

```
python -I .claude/skills/sharingan/scripts/comparar.py --refs <refs...> --nova <peça> --saida <pasta>
```

Ele diz, item a item, se a peça cai na faixa das referências (proporção, moldura, margens, densidade,
nº de blocos, luz, pixels fora da paleta). Cada "FORA" se resolve olhando: ou a peça erra, ou o
elemento atravessa a borda de propósito. Feche com a lista de conferência do guia e com a prancha da
peça nova ao lado das pranchas das referências.

## 7. Quando o guia vira regra do projeto

Se o autor adotar o guia como padrão, ele entra no `AGENTS.md` como a regra 26 entrou ("ao iniciar a
produção de X, leia primeiro o guia Y"), com o caminho, e com memória apontando para ela.
