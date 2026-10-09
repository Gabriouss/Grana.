# Documento de marketing do Grana.

Consolidação do material de marketing que já existe no repositório, montada pelo Flare em 07/10/2026 para o painel local. Este documento não cria campanha, peça nem promessa nova. Cada seção aponta a fonte; em contradição, vale a fonte.

Fontes principais: `PRODUCT.md`, `FUNIL.md`, `AGENTS.md` (regras 21 a 25), `docs/marketing/README.md`, os `INDICE.md` semanais e o material de apoio da semana 40 (`plano-verba-curta.md`, `matriz-plataformas.md`, `inventario-criativos.md`, `CHECKLIST-PEDIDOS-AUTOR.md`, `COPYS-FINAIS.md`).

Para execução operacional das frentes C e D, consulte também [Guia operacional C/D](GUIA-OPERACIONAL-C-D.md). As regras atualizadas abaixo refletem os contratos de 08/10/2026.

## 1. Estado agora

- Nada da campanha foi publicado, agendado ou impulsionado.
- Há aceite explícito registrado para o Reel da padaria v8, para o SHA1 indicado no índice da semana 39 e em `aprovacoes.json`. O aceite não significa publicação nem agendamento.
- O manifesto `docs/marketing/painel/cronograma.json` ainda não existe e `calendario.json` mantém `diaD: null` e nenhuma programação efetiva. Nada vai ao ar antes dos portões definidos pelo autor.
- A produção de peça está pausada fora das janelas que o autor abre na sessão (regra 21). A última janela foi 04/10/2026.

## 2. Posicionamento

Fonte: `PRODUCT.md`, seções Users, Product Purpose e Positioning.

- **Para quem:** público geral no Brasil que acha trabalhoso anotar gasto e por isso desiste da planilha ou do app tradicional. A pessoa quer saber para onde o dinheiro foi e quanto sobra, sem transformar isso numa tarefa a mais.
- **O que o Grana. faz:** registra gastos com pouco atrito (voz no app, voz pelo widget do Android, Pix colado, importação de extrato e, depois do dia D, foto da nota) e mostra o **Livre para Gastar** do mês vigente.
- **Mecanismo que sustenta a mensagem:** entrada rápida alimentando um categorizador automático, mais o cálculo do Livre para Gastar: saldo do mês, menos o que está guardado nos cofrinhos, dividido pelos dias restantes, contando hoje (regra 20).
- **Objetivo da campanha:** levar quem sente que o dinheiro some durante o mês até a assinatura e ao primeiro lançamento (`FUNIL.md`, seção 1).

## 3. Públicos e frentes

Fonte: `CHECKLIST-PEDIDOS-AUTOR.md` e `criativos-web.md` (semana 40, apoio), `matriz-plataformas.md`.

A divisão antiga em três públicos (Android, computador e iPhone) foi substituída por retorno do autor por **duas frentes**:

1. **Navegador, no computador e no celular.** Sem material exclusivo para iPhone; o iPhone entra no QA do navegador no celular.
2. **Aplicativo Android**, baixado pelo site, fora da Play Store.

Promessa por plataforma segue a matriz: produzir pode partir do que está implementado; publicar exige a função validada na plataforma do público. Hoje nenhuma função está validada nas três plataformas. Voz dentro do app não aparece em peça para web ou iPhone; widget e foto da nota são só Android, depois do QA.

## 4. Funil

Fonte: `FUNIL.md`, seções 3 e 14.

| Etapa | Pergunta da pessoa | Conteúdo | Próxima ação |
|---|---|---|---|
| Reconhecimento | Por que meu dinheiro some? | Situações cotidianas, linguagem concreta | Visitar o perfil |
| Consideração | Como eu registraria tudo sem parar minha vida? | Demonstrações de voz, Pix, foto da nota e widget | Ver a landing |
| Confiança | Isso funciona para a minha rotina? | Livre para Gastar, FAQ e objeções de uso | Salvar e voltar |
| Ativação | Como começo? | Primeiros 7 dias e próximo gasto | Assinar e lançar |
| Retargeting | Ainda tenho uma dúvida | Cortes de demonstração, oferta e garantia | Voltar ao checkout |

Métricas que importam mais que alcance: visita qualificada, visualização dos planos, clique no checkout, assinatura e primeiro lançamento. A cadência antiga de três Reels e dois estáticos por semana não tem linha de base e não é meta (`FUNIL.md`, seção 4).

## 5. Mensagem e limites de copy

Fontes: `FUNIL.md` seção 2, `AGENTS.md`, memória do projeto sobre copy.

- **Preço:** a fonte única é a nota do vault `05 - Vendas/Preço Vigente e Parcelamento - Cakto`. Este documento não repete valores. Em criativo, anúncio, capa ou legenda, a única formulação permitida é **"menos de R$ 0,37 por dia"**. A garantia de reembolso em 7 dias pode ser comunicada.
- **Nunca** falar de conectar ou não conectar com banco, nem de Open Finance, em publicidade (decisão de 25/09/2026).
- **Nunca** WhatsApp como canal ou argumento.
- Sem travessão e sem a construção "não é X, é Y".
- Sem escassez inventada, contagem regressiva falsa ou prova social sem origem verificável.
- Tela do app é sempre captura real, com conta de teste e dados inventados. IA nunca desenha tela do app.
- Dado fictício é avisado na legenda. Não inserir aviso de exemplo dentro da arte ou do vídeo.

## 6. Regras de criativo (regras 21 a 25 do AGENTS.md)

- **Regra 21, janela de produção:** peça estática ou de vídeo só é produzida quando o autor pede na sessão. A janela de 03 e 04/10/2026 já passou; fora dela a pausa vale até nova abertura.
- **Regra 23, estilo de vídeo:** o vídeo `grana-motion-desistiu-foto-da-nota.mp4` (raiz de `Gabriel/Grana` no vault) é a referência de edição e motion. Celular e notebook sempre inteiros, com margem segura. Sem contador de página e sem aviso de exemplo dentro da arte. Logotipo sempre o gradiente oficial (`design-system/marca/logotipo-gradiente.svg`). Mockup é foto de aparelho vazio com o print real aplicado por homografia, respeitando os cantos arredondados. Guia medido em `docs/marketing/2026-10/semana-40-2026-09-28-a-2026-10-04/apoio/referencias/guia-de-estilo-de-video.md`.
- **Regra 24, ElevenLabs:** nenhuma geração que gaste crédito sem o "sim" do autor antes, com o custo estimado em créditos e em reais. Aprovação anterior não vale para nova geração. Preferir o caminho local (ffmpeg, rembg, PIL).
- **Regra 25, organização:** todo material versionado fica em `docs/marketing/AAAA-MM/semana-NN-.../{para-aprovacao,aprovados,historico,apoio}`. Criativo sem aceite fica em `para-aprovacao`. Parecer de revisor não é aceite do autor. Aceite não é publicação.
- **Moldura do produto (FUNIL, 27/09/2026):** toda captura aparece dentro de moldura realista de celular ou notebook, sem elemento cortado ou encostado na borda.

## 7. Acervo e aprovação no painel

- O painel lê `docs/marketing/` direto, sem copiar arquivo. Cada peça tem um `id` estável (hash do caminho) e uma `versao` (sha1 dos arquivos e da legenda). Mudar a arte ou só a legenda gera versão nova, e o aceite anterior deixa de valer.
- Imagens numeradas na mesma pasta (`carrossel-1.png` a `carrossel-5.png`) formam um carrossel. O HTML de render não é peça; o PNG ao lado dele é.
- A legenda vem do `COPYS-FINAIS.md` da semana. A ligação peça e copy é por regra explícita: pasta `r13` ou arquivo `reel-r13` para R13; `lumen*/carrossel-N` para C14; `lumen*/card.png` para C01; e, no resto, um código no início do nome do arquivo (`E01-`, `S2-`, `R5-`). Peça sem código fica sem legenda, sem palpite.
- **Aceitar** no painel registra o aceite para o SHA1 exato em `docs/marketing/painel/aprovacoes.json` e no `INDICE.md` semanal. O aceite projeta automaticamente a previsão no calendário quando existe vínculo válido com o manifesto. Não publica nem agenda na Meta.
- **Pedir ajuste** cria uma solicitação na fila privada, ligada ao SHA1 visto pelo autor. A peça corrigida fica em `para-aprovacao`; `aprovacoes[]` não recebe a versão corrigida antes do aceite explícito do autor. Motivos de pedidos novos não devem ir a arquivo público, commit, log ou relatório.
- As alterações ficam locais até alguém commitar; o painel não faz commit nem push.

## 8. Calendário

Fonte editorial: `docs/marketing/painel/cronograma.json`. `calendario.json` guarda a projeção operacional e dados legados.

- Cada item tem ID estável e data absoluta ou posição `diaD + N` em dias úteis. O vínculo fica no índice semanal como `manifestoId#itemId@manifestoVersao`; não inferir item pela pasta ou pelo nome do arquivo.
- O aceite exato projeta a previsão no calendário. Uma mudança no conteúdo invalida o aceite da versão anterior. Uma mudança só de data preserva o aceite; a substituição manual precisa de recibo.
- Posições relativas não resolvem enquanto o autor não declarar dia D com `DECLARAR DIA D`. Hora ou canal ausentes também bloqueiam o ensaio Meta. O cálculo usa segunda a sexta e não exclui feriados.
- Planejar e ensaiar não publica nem cria agendador. O ensaio local informa `realHabilitado: false` e `chamadasMeta: 0`. Integração real exige os portões técnicos, julgamento e autorização específica do autor.
- Portão editorial do dia D: build nova publicada e testada, QA da função nas plataformas anunciadas, capturas com conta de teste e aceite do autor para cada versão.

## 9. Tráfego pago

Fonte: `plano-verba-curta.md` (rascunho de 30/09/2026, sem aprovação do autor) e `FUNIL.md`, seção 13; dados em `docs/marketing/painel/trafego.json`.

- **Ordem:** orgânico primeiro (D até D+14), teste pago mínimo só se as portas abrirem (a partir de D+15), depois decisão.
- **Portas:** build publicada e testada; visita que vira clique em plano acima de 5%; pelo menos uma compra orgânica real; Pixel e InitiateCheckout medidos. No `trafego.json` de 08/10, a build está fechada e as demais portas não foram medidas.
- **Pré-requisitos técnicos:** Pixel com consentimento LGPD, InitiateCheckout no clique do plano, Purchase com valor vindo do webhook da Cakto, UTM por peça.
- **Campanhas em rascunho, sem gasto autorizado:** "Sonda de aprovação da conta" (R$ 7 por dia, 7 dias, total R$ 49) e "Teste de criativo" (R$ 14 por dia, 7 dias, total R$ 98). São hipóteses sem datas absolutas nem peças vinculadas; o total proposto é R$ 147 e depende de decisão explícita do autor.
- **Teto:** nunca mais de R$ 100 por semana sem nova decisão do autor (22/09/2026). O painel avisa quando uma campanha passa disso.
- **Limites de referência** (mercado, não medidos no Grana.): CTR de link abaixo de 0,8% troca o criativo; custo por InitiateCheckout acima de R$ 25 troca o criativo; visita que vira checkout abaixo de 5% para o pago e conserta a página; checkout que vira compra abaixo de 20% para o pago.
- Destino sempre a landing, nunca o `.apk` direto. Sem campanha de instalação de app. Anúncio só usa peça aprovada.
- Os status locais `rascunho`, `pronta`, `no-ar` e `encerrada` organizam o plano. `pronta` não autoriza gasto e `no-ar` não prova veiculação. Criar, pausar ou pagar anúncio continua no Gerenciador de Anúncios e exige autorização do autor.

## 10. O que depende do autor

- Manifesto, vínculo, data, hora e canal de cada item, depois das decisões editoriais necessárias.
- Declarar o dia D depois dos portões; isso exige a confirmação literal `DECLARAR DIA D`.
- Autorizar ou rejeitar um orçamento específico. Os R$ 147 são apenas hipótese de rascunho; o teto vigente é R$ 100 por semana sem nova decisão.
- Aceite explícito de cada versão que ainda esteja sem recibo exato. O Reel da padaria v8 já tem aceite registrado para seu SHA1 indicado no índice semanal.
- Bio do perfil do Instagram: nenhum material existente a define, e o feed simulado mostra o espaço vazio.
- Nova janela de produção, se quiser peça nova (regra 21).
