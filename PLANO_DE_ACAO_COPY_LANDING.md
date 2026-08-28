# Plano de ação — Copy da landing page do Grana.

**Data:** 28 de agosto de 2026  
**Escopo:** landing page pública (`app/index.tsx`)  
**Objetivo principal:** aumentar a conversão de visitantes frios em contas criadas sem perder precisão, confiança ou humanidade.  
**Status deste documento:** plano de ação; nenhuma alteração de copy foi aplicada à landing.

## 1. Resumo executivo

A landing já tem bons fundamentos: fala em português brasileiro natural,
apresenta dores reconhecíveis, mostra telas reais e sustenta uma diferenciação
forte — registrar gastos por voz, WhatsApp ou QR Code sem conectar a conta
bancária.

O principal obstáculo à conversão não é falta de impacto. É falta de uma
hierarquia inequívoca entre:

1. o que a pessoa recebe agora;
2. o que depende dos dados registrados por ela;
3. o que será cobrado no futuro;
4. qual ação deve tomar em seguida.

A página também repete os mesmos mecanismos em várias seções, alterna entre
tom acolhedor e tom de cobrança e usa algumas promessas mais absolutas do que
a implementação permite. A reforma proposta deve tornar a copy mais curta,
específica e convincente sem criar urgência, prova social ou garantia
artificial.

## 2. Verdades estabelecidas do produto

Estas premissas devem orientar toda a reescrita:

- O Grana. não se conecta a banco e não usa Open Finance.
- Voz dentro do produto, WhatsApp por texto/áudio e QR Code de NFC-e são
  mecanismos reais de entrada.
- A empresa Grana. está verificada pela Meta e o WhatsApp é canal oficial e
  operacional (confirmado pelo autor em 28/08/2026). Pode permanecer como
  diferencial central da página.
- A verificação da Meta não deve ser apresentada como certificação geral de
  segurança, endosso comercial ou garantia do produto. A formulação segura é
  "WhatsApp oficial, verificado pela Meta"; um "aprovado pela Meta" solto ao
  lado do bloco de segurança insinua endosso e não deve ser usado.
- O QR Code gera um lançamento com o valor total da compra; não categoriza
  item por item.
- As heurísticas de reconhecimento e categorização podem errar. A pessoa pode
  revisar e corrigir lançamentos.
- O acesso antecipado é gratuito e completo por enquanto.
- O modelo comercial futuro é uma assinatura recorrente de R$ 19,99 por mês,
  cancelável quando a pessoa quiser.
- O cadastro atual não solicita cartão. Antes de prometer a transição para o
  plano pago, confirmar como usuários do acesso antecipado serão convidados a
  assinar e garantir que não haverá cobrança automática sem consentimento.
- Não existem depoimentos, avaliações públicas, números de usuários ou cases
  validados que possam ser usados como prova social.
- O Grana. não vende dados nem os usa para publicidade.

### Documentação alinhada (28/08/2026)

**Resolvido.** A verificação da empresa pela Meta foi confirmada pelo autor em
28/08/2026, e `PRODUCT.md` e `context.md` — que ainda diziam "em revisão" —
foram atualizados com o estado real do canal e com a distinção entre o que a
verificação permite afirmar e o que ela não significa.

## 3. Diagnóstico priorizado

| Prioridade | Achado | Risco de conversão | Direção |
|---|---|---|---|
| P0 | Acesso gratuito atual, preço futuro e “use por 30 dias” convivem sem uma regra comercial explícita. | A pessoa não sabe se está entrando grátis, começando um trial ou assumindo uma assinatura. | Vender primeiro o acesso antecipado; apresentar R$ 19,99 como condição futura transparente. |
| P0 | A seção de inteligência diz que a projeção de parcelas futuras gera o “Livre para Gastar”. | A copy promete um cálculo diferente do atual. | Descrever a fórmula real ou evoluir o produto antes de usar a promessa mais ampla. |
| P0 | “Categoriza sozinho”, “na hora”, “cada real” e “nada pega de surpresa” são absolutos. | Um erro normal da heurística parece quebra de promessa. | Usar linguagem de automação com possibilidade de conferência e ajuste. |
| P1 | O hero começa com uma dor forte, mas não apresenta toda a proposta de valor imediatamente. | Visitante frio precisa decodificar o produto antes de entender o benefício. | Mostrar resultado, mecanismo e diferenciação na primeira dobra. |
| P1 | Hero, guia e grade de recursos explicam os mesmos canais de entrada. | A página fica longa sem avançar o argumento de compra. | Consolidar demonstração e “como funciona”. |
| P1 | Algumas frases culpabilizam ou desafiam o visitante. | Conflita com a marca acolhedora e sem julgamento. | Tratar a fricção do processo como vilã, não a pessoa. |
| P1 | CTA “Criar conta” e microcopy “Leva 30 segundos” se repetem. | A ação não comunica valor e o tempo não está comprovado. | Adotar CTA de benefício e microcopy específica para cada objeção. |
| P1 | A faixa de confiança traz autoafirmações como “Sem burocracia” e “Sem letra miúda”. | Não funciona como prova e ocupa espaço crítico antes do hero. | Usar fatos verificáveis ou prova visual do mecanismo. |
| P2 | Termos como “comprometimento futuro”, “composição por categoria” e “dados isolados por conta” são técnicos. | A leitura fica menos humana e exige interpretação. | Traduzir para situações cotidianas. |
| P2 | FAQ não responde às dúvidas sobre erro de reconhecimento, cálculo, gratuidade e cobrança futura. | Objeções decisivas ficam sem resposta. | Reordenar FAQ por risco percebido. |

## 4. Proposta central de posicionamento

### Público principal

Pessoa que quer entender para onde o dinheiro está indo, já tentou planilha ou
aplicativo tradicional e não manteve o hábito porque registrar tudo dá
trabalho.

### Problema central

O controle financeiro falha antes do gráfico: falha no momento de registrar.
Formulários, planilhas e navegação demais transformam cada gasto em uma tarefa.

### Transformação

A pessoa consegue registrar gastos em poucos passos e manter uma visão mais
realista do mês sem compartilhar credencial bancária.

### Diferencial

Três entradas convenientes — voz, WhatsApp e QR Code da nota — alimentam o
mesmo registro organizado, sem conexão bancária.

### Promessa recomendada

> Registre seus gastos em segundos. Entenda quanto está livre para gastar.

A segunda frase deve ser acompanhada, em algum ponto próximo, pela condição:

> Com base no que você registra no Grana.

## 5. Nova arquitetura narrativa

### 1. Hero

Função: explicar resultado, mecanismo e diferencial sem depender da rolagem.

### 2. Prova do mecanismo

Função: mostrar uma entrada real virando lançamento organizado. Substitui
autoafirmações por evidência do produto.

### 3. Problema reconhecível

Função: demonstrar empatia e remover a culpa da pessoa.

### 4. Como funciona

Função: reduzir a percepção de esforço em três passos.

### 5. Resultado principal

Função: explicar visão do mês e “Livre para Gastar” com a fórmula correta e
sem apresentar a estimativa como garantia financeira.

### 6. Privacidade e controle

Função: responder ao receio de informar dados financeiros e reforçar a
escolha deliberada de não conectar banco.

### 7. Recursos complementares

Função: mostrar metas, gráficos, contas e parcelas depois que o diferencial
principal já foi entendido.

### 8. Oferta

Função: separar claramente acesso gratuito atual e assinatura futura.

### 9. FAQ

Função: resolver objeções concretas antes da decisão.

### 10. CTA final

Função: resumir a transformação e convidar para o primeiro passo sem ameaça,
culpa ou falsa urgência.

## 6. Plano por seção

### Hero

**Problema atual:** “Cadê meu dinheiro?” é memorável, mas não define sozinho a
categoria do produto nem o resultado. O restante da proposta aparece aos
poucos durante o storytelling.

**Direção recomendada:** manter “Cadê meu dinheiro?” como gancho secundário e
subir uma promessa completa para o título principal.

**Opção A — recomendada**

Eyebrow:

> Controle financeiro sem planilha

Headline:

> Registre seus gastos em segundos. Saiba quanto está livre para gastar.

Subheadline:

> Fale no app, mande texto ou áudio pelo WhatsApp ou leia o QR Code da nota. O Grana. organiza seus lançamentos sem conectar à sua conta bancária.

CTA:

> Começar grátis

Microcopy:

> Acesso antecipado gratuito. Sem cartão.

**Opção B — mais autoral**

> Fale um gasto. Entenda para onde seu dinheiro está indo.

O storytelling pode continuar como demonstração visual, mas não deve ser o
único lugar em que o visitante descobre o valor completo.

### Faixa de confiança

**Problema atual:** “Sem burocracia”, “Sem letra miúda” e “Preço simples e
fixo” são avaliações da própria empresa, não provas.

**Substituir por fatos:**

- Sem conectar conta bancária.
- Texto e áudio pelo WhatsApp.
- Funciona direto no navegador.
- Dados não são vendidos.
- Acesso antecipado gratuito.

Não é obrigatório manter cinco itens. Três fatos fortes são preferíveis a
cinco afirmações genéricas.

### Seção de dor

**Atual:**

> Anotar gastos dá trabalho. Por isso você não dá continuidade.

**Problema:** atribui a falha à pessoa.

**Direção recomendada:**

> Controle financeiro não devia virar mais uma tarefa.

Ela tira a culpa da pessoa sem usar a estrutura de contraste que a marca não
aceita (ver "Regra de estilo obrigatória" na seção 8). A versão
"Você não abandona o controle por falta de disciplina. Abandona porque
registrar tudo dá trabalho." resolve o mesmo problema de tom, mas é
exatamente o padrão "não é X, é Y" que está proibido — foi descartada.

As cenas de sexta-feira, fatura inesperada e planilha abandonada são
reconhecíveis e podem permanecer, desde que a saída da seção apresente o
Grana. como aliado.

### Guia e entrada de lançamentos

**Problema atual:** duas seções explicam voz, WhatsApp e nota, enquanto o guia
afirma “um jeito só” apesar de apresentar três formas.

**Consolidar em três passos:**

1. **Conte do jeito mais fácil.** Fale, mande uma mensagem pelo WhatsApp ou leia o QR Code da nota.
2. **Confira o lançamento organizado.** O Grana. reconhece valor e descrição e sugere uma categoria; você ajusta se precisar.
3. **Veja o mês com mais clareza.** Seus lançamentos alimentam gráficos, metas e a estimativa do que está livre para gastar.

Evitar “sem revisar linha por linha”. A proposta correta é reduzir trabalho,
não declarar que conferência nunca será necessária.

### Recursos

**Problema atual:** seis recursos recebem peso semelhante e diluem o motivo
principal para experimentar o produto.

**Agrupar em três benefícios:**

1. **Registre sem formulário.** Voz, WhatsApp e QR Code.
2. **Entenda o mês sem montar conta.** Gastos organizados, gráficos e estimativa do Livre para Gastar.
3. **Planeje o que vem depois.** Contas, parcelas e metas num só lugar.

Detalhes como “composição por categoria” devem virar linguagem cotidiana:

> Veja onde você gastou mais no mês.

### Livre para Gastar

**Problema atual:** a landing liga o cálculo à linha do tempo de parcelas e
contas futuras. A implementação atual calcula o valor com saldo do mês,
contas pendentes do mês e dinheiro guardado em metas; compras no crédito são
tratadas separadamente na projeção futura.

**Copy compatível com a implementação atual:**

> Com base nos lançamentos do mês, nas contas pendentes e no que você separou para suas metas, o Grana. estima quanto está livre para gastar por dia.

**Mensagem de confiança:**

> É uma referência baseada no que você registra. Você continua no controle.

Se o produto passar a incorporar parcelas futuras no cálculo, a copy poderá
evoluir depois de testes da fórmula e da interface.

### Segurança e privacidade

**Manter:**

- ausência de conexão bancária;
- dados acessíveis apenas pela própria conta;
- modo privacidade;
- bloqueio por biometria/senha do aparelho no app móvel;
- checagem de senha vazada;
- ausência de venda de dados e publicidade.

**Humanizar termos técnicos:**

- “Dados isolados por conta” → “Só você acessa os dados da sua conta.”
- “Reforçado no banco de dados” → detalhe secundário ou link para a política.
- “Modo privacidade oculta os valores da tela” → “Oculte seus valores com um toque quando houver alguém por perto.”

**Adicionar controle do usuário:**

> Você pode editar seus lançamentos e excluir sua conta e seus dados quando quiser.

### Oferta e preço

**Objetivo:** a pessoa deve saber, em uma leitura, o que paga hoje, o que pode
pagar depois e se existe cobrança automática.

**Título:**

> Comece grátis. Decida depois se quer continuar.

**Texto recomendado, condicionado à confirmação da transição comercial:**

> Durante o acesso antecipado, você usa todos os recursos sem pagar e sem cadastrar cartão. Quando a assinatura começar, o plano será de R$ 19,99 por mês. Você será avisado e escolherá se quer assinar.

**Rótulo do card:**

> Plano mensal

**Preço:**

> R$ 19,99/mês depois do acesso antecipado

**CTA:**

> Entrar no acesso antecipado

**Microcopy:**

> Grátis agora. Sem cobrança automática.

Remover “Assinatura única”, que pode ser confundida com pagamento único, e
“preço fixo”, salvo se existir garantia comercial formal de que nunca mudará.

### FAQ

Reordenar pelas objeções de maior impacto:

1. O Grana. acessa minha conta bancária?
2. O que já está disponível no acesso antecipado?
3. Como funciona o lançamento pelo WhatsApp?
4. E se o Grana. entender um lançamento errado?
5. Como o Livre para Gastar é calculado?
6. O acesso gratuito vai gerar cobrança automática?
7. Posso editar ou excluir meus dados?
8. Como meus dados são protegidos?
9. Quanto custará depois?

A resposta do WhatsApp deve dizer que o canal está aprovado e operacional,
explicar o pareamento e evitar apresentar a aprovação da Meta como endosso do
produto.

### CTA final

**Remover:**

> Use o Grana. por 30 dias e descubra pra onde foi cada real. Ou continuar perguntando “cadê meu dinheiro”.

**Motivos:** parece um trial de 30 dias, promete cobertura total e encerra a
página confrontando a pessoa.

**Direção recomendada:**

> Comece pelo próximo gasto. O resto fica mais claro.

CTA:

> Começar grátis

Microcopy:

> Acesso antecipado gratuito. Sem cartão.

## 7. Sistema de CTAs

Manter uma ação principal — começar gratuitamente — com pequenas variações
contextuais:

| Contexto | CTA | Microcopy |
|---|---|---|
| Hero | Começar grátis | Acesso antecipado gratuito. Sem cartão. |
| Demonstração | Registrar meu primeiro gasto | Comece direto pelo navegador. |
| Segurança | Criar minha conta | Você pode excluir sua conta e seus dados quando quiser. |
| Preço | Entrar no acesso antecipado | Grátis agora. Sem cobrança automática. |
| Final | Começar grátis | Leva poucos passos para começar. |

Evitar repetir “Leva 30 segundos”. O formulário exige e-mail, senha,
confirmação, aceite dos termos e pode exigir confirmação por e-mail; o tempo
precisa ser medido antes de virar promessa.

## 8. Voz e critérios editoriais

### Regra de estilo obrigatória (vale para todo texto do Grana.)

Duas construções são **proibidas** em qualquer copy do produto, não só nesta
rodada:

1. **Travessão (—).** Usar ponto, vírgula ou dois pontos. Em vez de
   "É uma referência baseada no que você registra — você continua no
   controle", escrever duas frases.
2. **Contraste "não é X, é Y"** (e variantes: "não por X, mas por Y",
   "o problema não é X, é Y"). Afirmar direto o que se quer dizer.

Exceção conhecida: o travessão do título de marca
("Grana. — Controle financeiro por voz, WhatsApp e nota fiscal"), que já é o
padrão vigente em `landing-meta.json` e não muda.

Esta regra já custou duas frases desta primeira versão do plano. Passar toda
copy nova por ela antes de propor.

### A voz desejada

- Conversa como uma pessoa brasileira, sem formalidade desnecessária.
- Explica dinheiro sem julgamento.
- É direta, mas não agressiva.
- Assume limites do produto sem parecer insegura.
- Prioriza situações concretas em vez de linguagem de fintech.

### Preferir

- “o que ainda vai chegar” em vez de “comprometimento futuro”;
- “veja onde gastou mais” em vez de “composição por categoria”;
- “só você acessa seus dados” em vez de “dados isolados por conta”;
- “o Grana. sugere uma categoria” em vez de “categoriza perfeitamente”;
- “com base no que você registrou” sempre que o resultado depender dos dados
  informados pela pessoa.

### Evitar

- culpa: “você não dá continuidade”;
- provocação: “ou continue perguntando...”;
- absolutos: “cada real”, “nunca se surpreenda”, “na hora”, “sozinho”;
- urgência fabricada;
- jargão técnico;
- estatísticas, depoimentos ou selos sem fonte verificável;
- usar a verificação da Meta como sinônimo de segurança financeira;
- travessão e a construção "não é X, é Y" (ver regra obrigatória acima).

## 8.1 Leitura do concorrente Graniq (graniq.com.br)

Analisado em 28/08/2026. Produto adjacente, com WhatsApp, categorização
automática, metas, simuladores e um "Niq Score".

**A diferença que define o posicionamento:** o Graniq é construído sobre
**Open Finance** — "mais de 210 bancos conectados em tempo real", "regulado
pelo Banco Central", "segurança de nível bancário". É exatamente a troca que
o Grana. recusa por princípio (ver `PRODUCT.md`, princípio 1). Os dois
resolvem o mesmo problema com trocas opostas, e isso é vantagem de
posicionamento. **A copy nova não deve tentar parecer com a deles.** A
resposta direta ao "regulado pelo Banco Central" deles é o par de fatos
"WhatsApp oficial verificado pela Meta" e "sem conectar banco".

**O que eles têm e não pode ser copiado:** "mais de 500 mil brasileiros",
sete depoimentos nominais com profissão e valores ("Economizei R$ 1.200 no
primeiro mês"), além de estatísticas de abertura ("78% dos brasileiros têm
dificuldades financeiras"). É a parte que faz a página deles parecer mais
convincente e é justamente a que o Grana. não pode reproduzir hoje. Não
tentar empatar aí; a saída é a prova do mecanismo da seção 9.

**O que vale aprender:**

1. O bloco de WhatsApp deles mostra a conversa real acontecendo
   ("Gastei R$ 45 no Uber" → "Registrado! R$ 45 em Transporte. Seu gasto com
   transporte este mês: R$ 312"). É a prova do mecanismo que a seção 9 propõe,
   executada melhor do que a landing do Grana. faz hoje. Técnica a copiar, com
   dado fictício.
2. A headline deles entrega resultado, o que reforça o achado P1 do hero. Mas
   é genérica e serviria a qualquer fintech; "Cadê meu dinheiro?" é mais
   memorável. Reforça a direção já adotada: manter o gancho e subir uma
   promessa completa ao lado, sem trocar uma pela outra.
3. Doze "diferenciais" com peso igual diluem o argumento — a mesma doença que
   a seção de Recursos tem com seis. Serve de evidência de que agrupar em três
   é a decisão certa.

## 9. Prova e confiança sem depoimentos inventados

Enquanto não houver prova social validada, usar prova do mecanismo:

1. mostrar uma frase realista, como “gastei 30 no mercado”;
2. mostrar o lançamento resultante com valor, descrição e categoria sugerida;
3. mostrar como esse registro aparece no mês;
4. usar capturas reais com dados fictícios;
5. deixar visível que tudo funciona sem conexão bancária.

Fatos que podem funcionar como barra de confiança:

- Sem conectar banco.
- WhatsApp aprovado e operacional.
- Sem venda de dados.
- Funciona no navegador.
- Acesso antecipado gratuito.

Após haver uso real, coletar depoimentos com autorização e contexto específico,
sem transformar elogios genéricos em prova de resultado.

## 10. SEO e compartilhamento

Depois de aprovada a nova promessa central, alinhar `landing-meta.json`, título,
descrição, Open Graph e hero.

### Direção de título

> Grana. — Controle financeiro por voz, WhatsApp e nota fiscal

O título atual é claro e pode permanecer se os três canais estiverem
operacionais para o público.

### Direção de descrição

> Registre gastos por voz, WhatsApp ou QR Code da nota e acompanhe seu mês sem planilha e sem conectar a conta bancária.

Evitar que a meta description prometa um valor “seguro” ou exato para gastar.

## 11. Medição e experimentos

Copy de alta performance precisa ser validada por comportamento, não apenas
por preferência editorial.

### Funil mínimo

1. visualização da landing;
2. clique em CTA;
3. início do cadastro;
4. conta criada;
5. e-mail confirmado;
6. primeiro lançamento criado;
7. retorno na primeira semana.

### Sequência sugerida de testes

1. Hero orientado a resultado × hero “Cadê meu dinheiro?”.
2. “Começar grátis” × “Criar conta grátis”.
3. Oferta gratuita primeiro × preço futuro primeiro.
4. Demonstração real do mecanismo × grade de recursos.
5. CTA final acolhedor × CTA centrado na dor.

Testar uma variável por vez. Separar resultados por origem de tráfego e
preservar message match:

- anúncio sobre voz → hero com exemplo de voz;
- anúncio sobre WhatsApp → hero mostrando a conversa;
- anúncio sobre privacidade → hero destacando “sem conectar banco”;
- busca orgânica → proposta abrangente.

## 12. Ordem de execução

### Etapa 1 — Verdade e oferta

- Atualizar o estado documental do WhatsApp.
- Confirmar fluxo de transição do gratuito para o pago.
- Fixar a definição pública do “Livre para Gastar”.
- Criar matriz “disponível agora / depende de configuração / futuro”.

### Etapa 2 — Reescrita estrutural

- Aprovar posicionamento e hero.
- Consolidar guia e canais de entrada.
- Reordenar benefícios e objeções.
- Reescrever oferta e CTA final.

### Etapa 3 — Revisão de consistência

- Comparar landing, `PRODUCT.md`, `context.md`, termos e política.
- Revisar todas as promessas absolutas.
- Verificar tom sem culpa em títulos, microcopy e CTAs.
- Alinhar metadados de SEO.

### Etapa 4 — Implementação e QA

- Aplicar a copy aprovada sem alterar a hierarquia visual além do necessário.
- Testar desktop e mobile.
- Verificar quebras de linha e densidade de texto.
- Confirmar que CTA e microcopy permanecem visíveis juntos.
- Validar o fluxo completo até o primeiro lançamento.

### Etapa 5 — Medição

- Instrumentar o funil.
- Definir baseline antes dos testes.
- Executar experimentos isolados.
- Registrar decisões vencedoras e aprendizados de voz do cliente.

## 13. Critérios de aprovação da nova copy

A reescrita estará pronta quando:

- um visitante entender em uma dobra o que é o Grana., como funciona e por
  que não precisa conectar o banco;
- ficar claro que o acesso é gratuito agora e que R$ 19,99 é o preço mensal
  futuro;
- não houver frase que pareça trial automático de 30 dias;
- o WhatsApp estiver descrito como recurso aprovado e operacional, sem falsa
  alegação de endosso;
- o “Livre para Gastar” estiver explicado conforme a fórmula real;
- erros possíveis de reconhecimento não forem escondidos;
- todas as seções avançarem um argumento diferente;
- o tom acolher a pessoa em vez de culpá-la;
- o CTA principal comunicar benefício e gratuidade;
- nenhuma estatística, prova social ou urgência for inventada;
- landing, SEO, documentos de produto e páginas legais disserem a mesma coisa.

## 14. Resultado esperado

Uma landing menos repetitiva e mais confiável, em que o visitante entende
rapidamente:

1. o problema que o Grana. resolve;
2. por que voz, WhatsApp e QR Code reduzem o esforço;
3. como o produto ajuda a enxergar o mês;
4. por que não precisa acessar o banco;
5. o que é gratuito agora;
6. quanto custará depois;
7. qual é o próximo passo.

A meta não é soar mais “vendedora”. É reduzir incerteza, aumentar desejo e
fazer a decisão de começar parecer simples, segura e honesta.
