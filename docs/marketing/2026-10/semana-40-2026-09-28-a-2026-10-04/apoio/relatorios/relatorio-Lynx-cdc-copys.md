# Lynx (Auditor, time Claude): conferência de CDC das copys (30/09/2026)

Escopo: só `copys-para-aprovacao.md` (Flare, rascunho 2) contra `matriz-plataformas.md` (Meridian, v2 em `4df1554`). Não editei o arquivo do Flare. Não avaliei Meta nem nada publicado. Nada foi publicado.
Critérios do pedido:
1. nenhuma promessa de app de iPhone;
2. nada que a web não tem;
3. nenhuma garantia ou resultado financeiro;
4. oferta de assinatura clara, com preço só como "menos de R$ 0,37 por dia".
Base legal considerada: CDC, arts. 6º III e IV, 30, 31, 37 §1º e 49.

**Preço conferido na nota "Preço Vigente e Parcelamento - Cakto"** (vault, revisada em 13/09, só lida):
- mensal R$ 9,90 dá R$ 0,33 por dia em 30 dias e R$ 0,354 em fevereiro;
- anual R$ 97,90 à vista dá R$ 0,268 por dia; em 12x, R$ 121,34 dá R$ 0,332.

Todos ficam abaixo de R$ 0,37, então **"menos de R$ 0,37 por dia" é verdadeiro**. Não reconferi na Cakto hoje: se o preço mudou depois de 13/09, a conta muda.

## Ponto geral (vale para várias copys)

- **G1 (procede): as copys citam a matriz v1, e a v2 mudou a regra de publicação.** O cabeçalho usa a base `8d7b461` e as marcas "✅ funciona". A v2 separa implementado (I) de validado (V), e diz: "**Publicar** uma promessa exige que ela esteja **validada** na plataforma do público" (`matriz-plataformas.md`, seção "Duas perguntas separadas"). Na v2, as funções web (C01 a C06, C13) estão "I", com QA pendente no Chrome, e as do iPhone (C07 a C12) estão "I · QA". **Consequência de CDC (art. 37 §1º, publicidade enganosa por omissão ou falsidade):** anunciar uma função que ninguém viu funcionar na plataforma do público é risco. Os portões de C01 a C06 pedem só uma "captura" e precisam exigir o **QA mínimo 1 da matriz (Chrome no computador)**. Os de C07 a C12 já exigem o Safari num iPhone real, o que atende. O texto das copys não precisa mudar; muda o portão.

## Copy por copy

| Copy | Parecer | Motivo |
|---|---|---|
| C01 Livre para gastar | **Procede** (com G1) | Descreve a fórmula da regra 20 (saldo do mês menos cofrinhos, dividido pelos dias) sem prometer resultado financeiro. "Dados de exemplo" está declarado. |
| C02 Colar comprovante | **Procede** (com G1) | Função web "I" na matriz. "Confira o valor" deixa o controle com a pessoa. "Sem baixar nada" é verdadeiro na web. |
| C03 Importar extrato | **Procede** (com G1) | Função web "I" (seletor do navegador). "Confira as categorias" é verdadeiro. |
| C04 Contas do mês | **Procede** (com G1) | A legenda informa que a conta só entra no saldo quando é marcada como paga (regra 20), o que evita expectativa errada sobre o saldo. |
| C05 Cartão e fatura | **Procede** (com G1) | Descritivo, sem promessa de resultado. |
| C06 Granabô | **Procede** (com G1) | Enumera o que ele consulta, sem prometer acerto. "Confira sempre os valores" funciona como ressalva. O portão exige resposta real, sem texto inventado. |
| C07 Abre no Safari | **Procede** | Diz "abre no Safari", e **não** "app". "Sem baixar nada" é verdadeiro. O portão exige iPhone real e a tela sem o convite do Android. |
| C08 Colar no iPhone | **Procede** | "Direto do Safari", e o portão exige testar o gesto de colar do iOS. |
| C09 Contas no iPhone | **Procede** | "Tudo no navegador", sem app. |
| C10 Cartão no iPhone | **Procede** | Idem. |
| C11 Granabô no iPhone | **Procede** | "Consulta os seus lançamentos para responder", sem promessa de número. Tem a ressalva de conferir os valores. |
| C12 Assinatura (iPhone) | **Não procede como está** | (a) "**Sete dias de garantia**": a landing promete **reembolso** nos 7 primeiros dias (`app/index.tsx:1685`), que é o direito de arrependimento do art. 49. Escrito como "garantia" solto, pode ser lido como garantia de funcionamento ou de resultado. Trocar por "**Sete dias para pedir o reembolso.**" (b) Oferta: fica claro que é assinatura ("Assine"), mas **nem a peça nem a legenda dizem que a cobrança é mensal ou anual e se renova** (arts. 6º III e 31). Sugestão de legenda (revista na rodada com o Watchtower): "Assinatura mensal ou anual. Valores, renovação e forma de pagamento na página de planos." O preço continua só "menos de R$ 0,37 por dia", como pedido. |
| C13 A mesma conta | **Procede** (com G1) | Diz "mesma conta", e não "na hora". O portão exige ver o lançamento do Android aparecer no navegador. |
| C14 Assinatura (computador + Android) | **Não procede como está** | Os mesmos (a) e (b) de C12, e ainda (c): a legenda **não aponta a página de planos**, onde ficam o valor real e a periodicidade. As outras duas apontam. Acrescentar a mesma legenda de C12. |
| C15 Voz pelo widget | **Procede** | Restrito ao Android e à legenda "só no aplicativo de Android". A ressalva "se algo estiver ambíguo, [...] pede a confirmação" bate com a regra 13. Portão: dia D e QA do APK. |
| C16 Widget na tela inicial | **Procede** | Restrito ao Android. O portão exige ver os toques abrindo o formulário num Android real (`8b31f2a` sem teste em aparelho). |
| C17 Foto da nota | **Procede** | "Confira sempre o valor lido" funciona como ressalva. O portão dos 10 cupons ainda não rodou, então não publicar antes dele, como a própria copy diz. |
| C18 Biometria | **Procede** | Informa a condição (biometria cadastrada) e a carência de 30 segundos, o que evita propaganda enganosa por omissão. |
| C19 Baixar o app de Android | **Procede** | Informa que não está na Play Store e que o Android pede autorização para instalar de fora da loja. Transparência adequada. |
| C20 Assinatura (Android) | **Não procede como está** | Os mesmos (a) e (b) de C12. A legenda já aponta a página de planos, mas precisa da mesma legenda revista de C12. |

## Checagens gerais

- **App de iPhone:** nenhuma copy promete. C07 a C12 dizem "navegador" e "Safari", e o arquivo lista "app de iPhone" como fora de todas as copys. **Procede.**
- **O que a web não tem:** nenhuma copy de web fala de voz, widget, foto, biometria, notificação, modo sem internet ou instalação. **Procede.** O risco que resta é o G1 (implementado ≠ validado).
- **Garantia ou resultado financeiro:** nenhuma copy promete economia, lucro ou resultado. Só "Sete dias de garantia" (C12, C14 e C20) precisa trocar de redação. **Procede, com a exceção dessas três.**
- **Defeito do convite do Android no Safari** (`components/ConviteAppAndroid.tsx:39-44`): o Flare já trata como portão que trava C07 a C12 inteiro. Concordo; do ponto de vista de CDC, uma tela que oferece o APK a quem só pode usar o navegador induz a erro.

## Resumo

17 procedem (7 delas condicionadas a G1: C01 a C06 e C13; contagem corrigida na rodada com o Watchtower). 3 não procedem como estão (C12, C14 e C20): falta de clareza da oferta (periodicidade e renovação) e "garantia" ambígua. O ajuste é de texto e de portão; nenhuma copy precisa sair.

## Revisão do par (Watchtower)

Enviada por `.maestri/enviar.sh`, em uma rodada. **O Watchtower concorda** com corrigir C12, C14 e C20 (`copys-para-aprovacao.md:124-125`, `:142-143`, `:190-191`) e com G1, e fez três ressalvas. Conferi cada uma e aceitei as três:

1. **Contagem (ACEITO, erro meu).** A tabela condiciona a G1 **7** copys (C01 a C06 e C13), e não 10. O resumo foi corrigido.
2. **"Renovada no fim de cada período" (ACEITO).** A única evidência que tenho é a nota de preço: segundo a API em 12/09, `esgddv2` tem recorrência de 30 dias e `323b2rs`, de 365. Isso é configuração da oferta, não prova de **cobrança automática efetiva**, principalmente por Pix, que é um pagamento avulso, diferente do Pix Automático. **A minha sugestão de legenda muda** para não afirmar a renovação: "**Assinatura mensal ou anual. Valores, renovação e forma de pagamento na página de planos.**" Afirmar a renovação na peça só depois de conferir o contrato ou a configuração da Cakto e a página de planos.
3. **Portão da oferta (ACEITO).** "Menos de R$ 0,37 por dia" não diz que a cobrança é por período nem quanto é o total. A nota de 13/09 e um link genérico não fecham a conformidade (CDC, arts. 31 e 37). **Novo portão para C12, C14 e C20:** antes de publicar, (a) conferir o preço vigente na Cakto; (b) a página de planos, para onde a peça leva, precisa mostrar o total de cada período, as parcelas com o total quando houver, e as condições de renovação e de reembolso. O preço na peça continua só "menos de R$ 0,37 por dia", como pediu o autor.

Sem nova rodada: acordo na primeira.

## Seis perguntas da regra 12 (para o Quill)

1. **Pedido:** "conferência de CDC, UMA rodada curta, SÓ do material em copys-para-aprovacao.md contra a matriz-plataformas.md [...] liste por número (C01...) procede / não procede com motivo."
2. **Sintoma e causa:** as três copys de oferta usam "garantia" sem dizer que é reembolso e não informam a periodicidade nem a renovação. Os portões citam a matriz v1, que marcava funções como "funciona" sem validação.
3. **Identificadores:** C01 a C20; `app/index.tsx:1685` (texto do reembolso na landing); `components/ConviteAppAndroid.tsx:39-44`; a nota de preço da Cakto.
4. **Descartado:** exigir o preço cheio na peça, porque o autor definiu "menos de R$ 0,37 por dia", e a clareza se resolve pela legenda que aponta a página de planos. Descartei também tirar qualquer copy.
5. **O que deu errado:** nada.
6. **Sem verificação:** o preço na Cakto hoje (a nota é de 13/09), a página de planos renderizada, se a página `/baixar` exige assinatura (C19 diz "depois de assinar"), e todas as peças em tela.
