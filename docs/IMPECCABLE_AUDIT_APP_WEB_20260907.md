# Auditoria Impeccable — Grana. app e desktop web

Data: 07/09/2026. Modo: Operate. Auditoria técnica de código, sem alterações de produto e sem build. Fonte de estado: context.md, incluindo migration de voz aplicada, build 1.8.3 e FCM aguardando próxima APK. A falha antiga de lançamento por voz não é um achado aberto.

## Veredito e alcance

Identidade de produto coerente: petróleo/menta, Neue Machina, tokens de tamanho por plataforma e controles compartilhados. Conformidade nativa parcial: seis destinos mais a ação central do assistente sobrecarregam a navegação compacta. A avaliação abaixo é de implementação, não certificação de acessibilidade ou desempenho.

Inspecionados: layout raiz e de abas, AppPressable, SideNav, Granachat, FlowChart, ToggleSwitch, aviso de pendências, lista de lançamentos, campos de comprovante, tokens e configuração. Não houve execução autenticada no navegador, captura de APK atual, TalkBack/VoiceOver, medição de FPS, teclado físico ou fonte ampliada. Os prints históricos não são prova de defeitos na versão atual. Não inferir aprovação das telas não inspecionadas.

## Notas provisórias de código

| Dimensão | Web | Nativo | Evidência |
|---|---:|---:|---|
| Acessibilidade | 2/4 | 2/4 | Bons rótulos, lacunas no aviso e em controles de estado |
| Desempenho | 3/4 | 3/4 | FlatList, lazy e freezeOnBlur; sem medição de execução |
| Tema | 3/4 | 3/4 | Tokens consistentes, exceção tipográfica no aviso |
| Responsividade / adaptatividade | 3/4 | 2/4 | Breakpoints presentes; navegação compacta sobrecarregada |
| Integridade / conformidade | 3/4 | 2/4 | Sistema próprio coerente; mistura ação/destinos na barra |
| Total | 14/20 | 12/20 | Provisório; não equivale a aprovação de release |

## Achados

### 1. [P1] Controles web de estado não bloqueiam Space quando desabilitados

Local: components/AppPressable.tsx:170–177. A condição precisaDeEspaco verifica papel e onPress, mas não disabled; o manipulador chama rest.onPress diretamente. Afeta checkbox, radio e switch que utilizem essa combinação. O componente pode executar uma ação declarada indisponível pelo teclado. Recomendação: guardar disabled no manipulador e validar Enter/Space com controle habilitado/desabilitado. Critério: sem chamadas ao callback quando bloqueado. Comando: /impeccable harden. Não foi demonstrado um formulário específico afetado nesta rodada.

### 2. [P2] Chat força o fim da conversa durante leitura do histórico

Local: components/Granachat.tsx:238–246 e 490. scrollParaFim é incondicional e ligado ao tamanho do conteúdo e à quantidade de mensagens. Uma nova mensagem ou alteração de dimensões pode retirar a pessoa do trecho que está lendo. Recomendação: acompanhar proximidade do fim e rolar automaticamente apenas nesse caso ou no envio explícito do usuário; oferecer indicador de nova resposta. Comando: /impeccable harden. Testar enquanto se lê mensagem antiga, inclusive ao ampliar fonte.

### 3. [P2] Navegação compacta mistura seis destinos com uma ação central

Local: app/(app)/_layout.tsx:385–406. FloatingTabBar recebe seis telas e a ação de abrir Granabô. Supera a recomendação de 3–5 destinos de navegação Android e aumenta a competição por largura e atenção. Recomendação: estudar hierarquia com até cinco destinos, preservando acesso aos demais e distinguindo ação de destino. Comando: /impeccable shape, depois /impeccable adapt. Não mudar hierarquia apenas por estética; validar os fluxos frequentes antes.

### 4. [P2] Aviso de pendências usa fonte padrão em vez da marca

Local: components/VozesSalvasLocalmente.tsx:38–43. Os três estilos Text não definem fontFamily; o Text é importado diretamente de react-native, sem wrapper tipográfico. Diverge da regra explícita Neue Machina em todos os papéis e ignora tokens de tamanho por plataforma. Recomendação: usar textStyles/fonts e type existentes. Comando: /impeccable typeset. Não substituir a fonte da marca por fonte de sistema em outras telas.

### 5. [P2] Aviso de pendências não anuncia resultado nem garante alvo Android

Local: components/VozesSalvasLocalmente.tsx:23–34 e 43. A alteração de mensagem não tem região viva/anúncio acessível; ocupado muda o texto e disabled, mas não comunica busy. O botão tem apenas padding vertical de 8 e texto 15, sem minHeight touchTarget ou hitSlop. Não garante 48dp no Android. Recomendação: alvo mínimo explícito, estado ocupado e anúncio educado de resultado. Comando: /impeccable harden. Medir geometria no aparelho em fonte normal e ampliada antes de concluir.

### 6. [P2] Granabô na lateral é exposto como link sem destino

Local: components/SideNav.tsx:114–121 e app/(app)/_layout.tsx:379–381. accessibilityRole é sempre link, mas assistente não recebe href e abre uma conversa por setChatAberto. O leitor de tela recebe uma expectativa de navegação incompatível com uma ação de abertura. Recomendação: usar button para assistente, mantendo link nos destinos reais. Comando: /impeccable harden.

## Detector e falsos positivos

Detector aplicado somente a quatro componentes compartilhados para inspeção da implementação web: SideNav, AppPressable, Granachat e VozesSalvasLocalmente. Resultado bruto em IMPECCABLE_AUDIT_20260907_DETECTOR.json. Um aviso: rgba(0,0,0,0.6) em Granachat:606. Trata-se de scrim de modal; não foi promovido a defeito de paleta. Detector não foi usado como validação nativa. Zero erros do detector não significa zero erros de UX.

## Boas práticas a preservar

- FlatList em lançamentos e chat; abas lazy, freezeOnBlur e detachInactiveScreens.
- AppPressable integra redução de movimento e tradução de estados para ARIA na web.
- FlowChart possui rótulos acessíveis com período e valores, respeitando modo privacidade.
- ToggleSwitch possui papel, rótulo, estado e alvo touchTarget.
- Campos de descrição, valor e comprovante têm nomes acessíveis.
- Paleta escura e Neue Machina são decisões explícitas da marca, não defeitos por divergirem de temas genéricos de plataforma.

## Ordem recomendada

1. /impeccable harden: teclado desabilitado, semântica da lateral, avisos e preservação da leitura do chat.
2. /impeccable shape e /impeccable adapt: navegação compacta, fonte ampliada e janelas intermediárias.
3. /impeccable typeset: aviso de pendências no sistema tipográfico.
4. /impeccable polish: acabamento após validação funcional.

Antes de release: verificar web autenticada em 1440px e 768px com teclado/zoom 200%; Android real com fonte 1,3, teclado aberto/fechado e TalkBack; testar aviso de pendências com sucesso e falha controlada. Só então atualizar as notas com evidência de execução. Sem nova build nesta auditoria.

Contagem: 0 P0, 1 P1, 5 P2, 0 P3. A causa antiga de voz e a ausência esperada de push_tokens antes da nova APK foram excluídas de propósito, conforme contexto atualizado.
