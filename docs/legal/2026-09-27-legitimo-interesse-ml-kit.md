# Legítimo interesse: métricas do Google ML Kit (27/09/2026)

Registro da avaliação de legítimo interesse (LGPD, art. 7º, IX, e art. 10) para as métricas técnicas que a biblioteca Google ML Kit envia ao Google no app Android do Grana. Segue o roteiro do guia da ANPD: finalidade, necessidade, balanceamento e salvaguardas.

**Decisão:** o autor decidiu, em 27/09/2026, não consultar advogado e seguir com o que funciona. O maestro escolheu o legítimo interesse, com base no parecer do Compass da mesma data. Este documento registra o raciocínio e o risco que sobra, sem valor de parecer jurídico, para que uma revisão futura parta daqui.

Fontes primárias:
- [LGPD, Lei 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm), arts. 6º, 7º IX, 10, 18 §2º e 33.
- [Guia orientativo da ANPD sobre legítimo interesse](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_hipoteses_legais_tratamento_de_dados_pessoais_legitimo_interesse).
- [Divulgação de dados do ML Kit para Android](https://developers.google.com/ml-kit/android-data-disclosure), atualizada em 15/07/2026 e consultada em 27/09/2026.
- [Termos do ML Kit](https://developers.google.com/ml-kit/terms), atualizados em 14/05/2025.

## Fatos, com a fonte de cada um

| Fato | Fonte |
|---|---|
| A foto da nota é lida por `@react-native-ml-kit/text-recognition` 2.0.0, que empacota `com.google.mlkit:text-recognition:16.0.1` no app. | `package-lock.json`; `node_modules/@react-native-ml-kit/text-recognition/android/build.gradle`; `lib/foto-nota-ocr.ts` |
| O QR é lido pelo `CameraView` do `expo-camera`, que usa `com.google.mlkit:barcode-scanning:17.3.0` (`BarcodeAnalyzer`). | `components/QrScannerModal.tsx`; `node_modules/expo-camera/android/build.gradle` e `.../analyzers/BarcodeAnalyzer.kt` |
| O ML Kit **inicializa quando o processo do app sobe**, e não só quando a foto ou o QR são usados. O AAR `com.google.mlkit:common:18.11.0` declara o provedor `com.google.mlkit.common.internal.MlKitInitProvider` (`initOrder=99`). O Android instancia provedores ao iniciar o processo, inclusive o processo aberto pela tarefa do widget. O provedor aparece no manifesto mesclado da build local (`com.gabriouss.grana.mlkitinitprovider`), e nada no projeto o remove. | Manifesto do AAR no cache do Gradle; `android/app/build/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml` (build local de 26/09/2026) |
| Imagem, texto e resultado da leitura são processados no aparelho, e o ML Kit não os envia ao Google. | Termos do ML Kit |
| O ML Kit envia métricas: dados do aparelho (fabricante, modelo, sistema, aceleradores), dados do app (pacote e versões), latência, configuração e tamanho da entrada e da saída, versão do recurso, tipos de evento (inicialização, detecção, liberação) e códigos de erro. Nas versões empacotadas, vai também um identificador por instalação. O transporte é HTTPS, sem repasse a terceiros, para medir desempenho, depurar, manter e melhorar as APIs e detectar abuso. | Divulgação de dados do ML Kit |
| O Grana. não recebe essas métricas. | Nenhum código do app lê ou encaminha esses dados; a coleta é interna à biblioteca |
| Não há controle oficial documentado para desligar só as métricas. | Parecer do Compass, seção 3 |

**Não comprovado:**
- os campos e a frequência exatos que as versões 16.0.1 e 17.3.0 enviam (a página do Google cobre só a versão mais recente);
- se a inicialização ao abrir o app envia alguma métrica;
- o local de processamento e o prazo de guarda do lado do Google;
- o manifesto do APK 1.10.5 final (a inferência vem da build local de debug).

## 1. Finalidade (art. 10, I)

**Interesse do Grana.:** oferecer a leitura da foto da nota e do QR no próprio aparelho, sem mandar a imagem nem o conteúdo para servidor algum, com uma biblioteca mantida, corrigida e protegida contra abuso pelo fornecedor.

As métricas são a condição do fornecedor para essa biblioteca existir e ser mantida. O Google declara o uso delas para manutenção, melhoria e proteção das APIs. Esse interesse é legítimo, concreto e atual, porque as duas funções estão no app hoje.

Os usos que ficam fora: publicidade, perfilamento e qualquer uso pelo Grana. O Grana. não recebe as métricas.

## 2. Necessidade (art. 10, §1º, e art. 6º, III)

- **Alternativas consideradas:**
  - Enviar a foto a um serviço de OCR na nuvem. Isso trataria muito mais dado (a imagem da nota inteira, com dados financeiros), então é pior para o titular.
  - Trocar por outra biblioteca local, com coleta e licença verificadas. É possível, mas custa desenvolvimento, e a qualidade da leitura não foi medida. Fica registrada como saída se o risco abaixo se concretizar.
  - Desligar só as métricas. Não há meio documentado.
- **Minimização:** as métricas são técnicas, e o conteúdo lido não sai do aparelho. O Grana. não adiciona nenhum dado próprio a elas. O auto zoom do scanner, que traria dados extras (sessão, zoom e coordenadas), não está ativado (`QrScannerModal.tsx`, `BarcodeAnalyzer.kt`).

## 3. Balanceamento (art. 10, II, e legítima expectativa)

- **Dados:** técnicos, sem dado financeiro, sem imagem e sem texto. Não são dados sensíveis (art. 5º, II). O identificador por instalação pode tornar o dado pessoal se for associado a outras informações. Por isso ele é tratado como dado pessoal, e não como anônimo.
- **Expectativa:** quem usa um app Android espera que bibliotecas de terceiros enviem diagnóstico ao fornecedor. A política passa a declarar isso por extenso, com as categorias e a finalidade (versão de 27/09/2026 de `lib/legal-content.ts`).
- **Impacto:** baixo. O Google declara que não repassa as métricas a terceiros e não as usa para identificar a pessoa.
- **O ponto que pesa contra:** a coleta pode acontecer só por o app ter sido aberto, antes de qualquer escolha de usar a foto ou o QR. Isso enfraquece o argumento de que o titular controla a coleta ao decidir usar a função. A política diz isso com todas as letras e não promete o contrário.

**Resultado:** o interesse prevalece para dados técnicos, de baixo impacto, declarados e sem conteúdo financeiro, desde que as salvaguardas abaixo sejam cumpridas.

## 4. Salvaguardas (art. 10, §§2º e 3º; art. 18, §2º)

- **Transparência:** a seção 4 da Política de Privacidade descreve as categorias, a finalidade declarada pelo Google, o fato de o Grana. não receber as métricas, a inicialização ao abrir o app e a base legal. A seção 2 remete a ela nos itens da foto e do QR.
- **Oposição:**
  - a foto da nota e o QR são opcionais, e deixar de usá-los evita as métricas dessas leituras;
  - o e-mail de contato da política é o canal para se opor.
- **Sem uso próprio:** o Grana. não coleta, não recebe e não combina essas métricas com os dados da conta.
- **Revisão:** esta avaliação é refeita se mudar a versão do ML Kit, se o Google mudar a divulgação, se o auto zoom for ativado, ou se o app passar a ser distribuído pelo Google Play (seção Data safety).

## Risco que sobra

1. **Oposição sem desligamento técnico.** Para quem escrever se opondo, não existe hoje um jeito de cessar só as métricas de inicialização daquele aparelho. A resposta possível é explicar o que a pessoa controla (não usar foto e QR) e que a coleta de inicialização só termina sem o app instalado. Se a ANPD ou o titular entenderem que isso não atende o art. 18, §2º, a saída é trocar a biblioteca ou isolar o ML Kit para que ele só inicie na primeira leitura. Essa segunda opção exige teste técnico e não está feita.
2. **Transferência internacional (art. 33):** o local de processamento das métricas não é informado. Não foi feita análise de transferência.
3. **Papéis jurídicos:** não está definido se o Google atua como controlador das métricas para as finalidades dele. A política descreve o fluxo sem fixar esse papel.
4. **Payload por versão:** a descrição segue as categorias públicas do Google, e não uma inspeção do tráfego das versões 16.0.1 e 17.3.0.
5. **Sem revisão jurídica:** o autor decidiu seguir sem advogado em 27/09/2026. O risco de interpretação diferente pela autoridade fica assumido por essa decisão.
