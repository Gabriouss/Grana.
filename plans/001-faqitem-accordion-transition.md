# 001 — Animar abertura/fechamento do FaqItem (altura, opacidade, ícone)

- **Status**: TODO
- **Commit**: c60e5ac
- **Severity**: LOW (não quebra nada, mas é a lacuna de maior leverage encontrada — interação repetida em toda visita que passa pela seção de FAQ)
- **Category**: Missed opportunity / Preventing a jarring change / State indication
- **Estimated scope**: 1 arquivo (`components/FaqItem.tsx`), ~35 linhas alteradas

## Problem

A resposta do FAQ é montada e desmontada do zero a cada clique — sem transição
de altura nem de opacidade — e o ícone troca de glifo (`add` → `remove`)
instantaneamente, sem transição de rotação.

`components/FaqItem.tsx:1-42` (arquivo inteiro, para contexto de imports/tipos):

```tsx
import { useId, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing, fonts, type } from '@/lib/theme';
import AppPressable from '@/components/AppPressable';

type Props = {
  pergunta: string;
  resposta: string;
  estiloExtra?: object;
  abertoInicial?: boolean;
};

/** Uma linha de FAQ que abre sozinha — mantém a página de entrada curta pra quem só quer ler o essencial. */
export function FaqItem({ pergunta, resposta, estiloExtra, abertoInicial = false }: Props) {
  const [aberto, setAberto] = useState(abertoInicial);
  const respostaId = `faq-resposta-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <View style={[styles.linha, estiloExtra]}>
      <AppPressable
        style={({ hovered }) => [styles.cabecalho, hovered && styles.cabecalhoHover]}
        onPress={() => setAberto((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberto }}
        aria-expanded={aberto}
        aria-controls={respostaId}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      >
        <Text style={styles.pergunta}>{pergunta}</Text>
        <View style={styles.iconeWrapper} aria-hidden>
          <Ionicons name={aberto ? 'remove' : 'add'} size={18} color={aberto ? theme.accent2 : theme.inkSoft} />
        </View>
      </AppPressable>
      {aberto && (
        <View nativeID={respostaId} role="region" accessibilityLabel={`Resposta: ${pergunta}`}>
          <Text style={styles.resposta}>{resposta}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { borderBottomWidth: 1, borderBottomColor: theme.rule, paddingVertical: spacing.md },
  cabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    gap: spacing.md,
    ...({ cursor: 'pointer', transition: 'opacity 150ms ease' } as any),
  },
  cabecalhoHover: { opacity: 0.85 },
  iconeWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.hover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pergunta: { flex: 1, color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular },
  resposta: {
    color: theme.inkSoft,
    fontSize: type.apoio,
    lineHeight: 21,
    fontFamily: fonts.light,
    marginTop: spacing.md,
    paddingRight: spacing.sm,
  },
});
```

Dois problemas concretos:

1. **`{aberto && (<View>...)}` (linha 35-39)** — o bloco de resposta é criado e destruído no DOM a cada clique. Sem nó nenhum durante o fechamento, não existe o que animar: a resposta só pode teleportar.
2. **Troca de glifo do ícone (linha 32)** — `Ionicons name={aberto ? 'remove' : 'add'}` desenha um ícone DIFERENTE a cada estado (glifo `remove`, um traço; glifo `add`, uma cruz). Não há ponte visual entre os dois.

Efeito colateral de a11y encontrado de graça nesta auditoria (correto de arrumar junto, mesmo arquivo, mesmo escopo): `aria-controls={respostaId}` no cabeçalho aponta para um `nativeID` que **não existe no DOM** enquanto `aberto` é `false`, porque o nó só é criado quando `aberto` vira `true`. É uma referência ARIA quebrada em metade dos estados possíveis do componente. Manter o nó sempre montado (necessário de qualquer forma para animar) resolve isso de graça.

## Target

```tsx
import { useId, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing, fonts, type } from '@/lib/theme';
import AppPressable from '@/components/AppPressable';
import { useReducedMotion } from '@/lib/motion';

type Props = {
  pergunta: string;
  resposta: string;
  estiloExtra?: object;
  abertoInicial?: boolean;
};

/** Uma linha de FAQ que abre sozinha — mantém a página de entrada curta pra quem só quer ler o essencial. */
export function FaqItem({ pergunta, resposta, estiloExtra, abertoInicial = false }: Props) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [alturaConteudo, setAlturaConteudo] = useState<number | null>(null);
  const medido = useRef(false);
  const reduzirMovimento = useReducedMotion();
  const respostaId = `faq-resposta-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  // Mede a altura real do conteúdo uma vez (a primeira vez que o layout
  // roda, aberto ou fechado) — é o que permite animar até um valor exato em
  // vez de um teto arbitrário tipo `maxHeight: 999`, que faria uma resposta
  // de duas linhas percorrer a mesma "distância" de tempo que uma de dez.
  const aoMedirConteudo = (evento: LayoutChangeEvent) => {
    if (medido.current) return;
    medido.current = true;
    setAlturaConteudo(evento.nativeEvent.layout.height);
  };

  const estiloAnimado = reduzirMovimento
    ? { height: aberto ? alturaConteudo ?? undefined : 0, opacity: aberto ? 1 : 0, overflow: 'hidden' as const }
    : ({
        height: aberto ? alturaConteudo ?? undefined : 0,
        opacity: aberto ? 1 : 0,
        overflow: 'hidden',
        transitionProperty: 'height, opacity',
        transitionDuration: '220ms',
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      } as any);

  return (
    <View style={[styles.linha, estiloExtra]}>
      <AppPressable
        style={({ hovered }) => [styles.cabecalho, hovered && styles.cabecalhoHover]}
        onPress={() => setAberto((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberto }}
        aria-expanded={aberto}
        aria-controls={respostaId}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      >
        <Text style={styles.pergunta}>{pergunta}</Text>
        <View style={styles.iconeWrapper} aria-hidden>
          <View
            style={
              reduzirMovimento
                ? undefined
                : ({
                    transform: [{ rotate: aberto ? '45deg' : '0deg' }],
                    transitionProperty: 'transform',
                    transitionDuration: '160ms',
                    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                  } as any)
            }
          >
            <Ionicons name="add" size={18} color={aberto ? theme.accent2 : theme.inkSoft} />
          </View>
        </View>
      </AppPressable>
      <View
        nativeID={respostaId}
        role="region"
        accessibilityLabel={`Resposta: ${pergunta}`}
        aria-hidden={!aberto}
        style={estiloAnimado}
      >
        <View onLayout={aoMedirConteudo} style={styles.respostaMedidor}>
          <Text style={styles.resposta}>{resposta}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { borderBottomWidth: 1, borderBottomColor: theme.rule, paddingVertical: spacing.md },
  cabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    gap: spacing.md,
    ...({ cursor: 'pointer', transition: 'opacity 150ms ease' } as any),
  },
  cabecalhoHover: { opacity: 0.85 },
  iconeWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.hover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pergunta: { flex: 1, color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular },
  // `position: absolute` faz o medidor não empurrar layout enquanto o pai
  // está com `height: 0` durante o fechamento — sem isso, a View interna
  // (que precisa ficar sempre montada pra `onLayout` medir) somaria sua
  // altura real por baixo do pai colapsado por um quadro, antes do
  // `overflow: hidden` do pai cortar a exibição.
  respostaMedidor: { position: 'absolute', top: 0, left: 0, right: 0 },
  resposta: {
    color: theme.inkSoft,
    fontSize: type.apoio,
    lineHeight: 21,
    fontFamily: fonts.light,
    marginTop: spacing.md,
    paddingRight: spacing.sm,
  },
});
```

Mudança de comportamento explícita e intencional: o nó de resposta agora
**sempre existe no DOM** (antes só existia quando `aberto === true`). Isso é
necessário tanto pra animar quanto pra corrigir a referência `aria-controls`
quebrada citada acima — `aria-hidden={!aberto}` cobre a exposição pra
leitor de tela enquanto fechado.

## Repo conventions to follow

- Curva e padrão de "propriedades CSS via cast `as any` fora de
  `StyleSheet.create`" — `components/RevealOnScroll.tsx:130-139` é o
  exemplar: `transitionProperty`/`transitionDuration`/`transitionTimingFunction`
  como objeto solto, castado com `as any`, nunca uma chave estática dentro de
  `StyleSheet.create` (essas props não existem no tipo `ViewStyle` do React
  Native — só o react-native-web as reconhece).
- Curva `cubic-bezier(0.16, 1, 0.3, 1)` — a mesma que toda variante de
  `RevealOnScroll` usa (`components/RevealOnScroll.tsx:138`). Não inventar
  uma curva nova pra este componente.
- Hook de reduced-motion — `lib/motion.ts` (`useReducedMotion`), já usado em
  `components/AppPressable.tsx`. Preferir este hook ao padrão mais antigo de
  `AccessibilityInfo.isReduceMotionEnabled()` manual que `RevealOnScroll.tsx`
  usa (esse é mais velho e existe por precisar de um valor síncrono no
  primeiro render antes do efeito rodar — `FaqItem` abre só por clique, nunca
  precisa desse valor síncrono, então o hook mais simples é suficiente e é a
  convenção mais nova do repo).

## Steps

1. Em `components/FaqItem.tsx`, trocar o import `useId, useState` por
   `useId, useRef, useState`, adicionar `type LayoutChangeEvent` ao import de
   `'react-native'`, e importar `useReducedMotion` de `@/lib/motion`.
2. Adicionar `alturaConteudo` (`useState<number | null>(null)`), `medido`
   (`useRef(false)`) e `reduzirMovimento` (`useReducedMotion()`) dentro do
   componente, como no bloco Target acima.
3. Adicionar a função `aoMedirConteudo` (mede uma vez só, via `medido.current`
   — evita re-medir a cada `onLayout` disparado por rerender).
4. Construir `estiloAnimado` como no bloco Target — dois ramos (`reduzirMovimento`
   true/false), nenhum `as any` faltando.
5. Trocar `<Ionicons name={aberto ? 'remove' : 'add'} .../>` por um único
   `<Ionicons name="add" .../>` envolvido numa `View` com `transform: rotate(...)`
   — exatamente como no bloco Target. Note que o glifo agora é sempre `add`;
   é a rotação de 45° que o transforma visualmente num "×".
6. Remover a condicional `{aberto && (...)}` — o `View` de resposta passa a
   renderizar sempre, recebendo `aria-hidden={!aberto}` e `style={estiloAnimado}`.
   Dentro dele, envolver o `<Text style={styles.resposta}>` numa nova `View`
   com `onLayout={aoMedirConteudo}` e `style={styles.respostaMedidor}`.
7. Adicionar o estilo `respostaMedidor: { position: 'absolute', top: 0, left: 0, right: 0 }`
   a `StyleSheet.create` (comentário explicando o porquê, ver bloco Target).

## Boundaries

- Não mexer em `app/index.tsx` nem em nenhum outro arquivo que consome
  `FaqItem` — a prop pública (`pergunta`, `resposta`, `estiloExtra`,
  `abertoInicial`) não muda.
- Não trocar o glifo do ícone por outro par (`chevron-down`/`chevron-up`
  etc.) — a solução é rotação de um glifo só, não troca de glifo.
- Não introduzir `Animated` (API do React Native) nem nenhuma lib nova —
  manter CSS puro via `as any`, no padrão que `RevealOnScroll.tsx` já usa
  nesta mesma pasta.
- Não animar `maxHeight` com um teto arbitrário (`999px` ou similar) — a
  altura tem que vir de medição real (`onLayout`), conforme o Target.
- Se o código encontrado em `components/FaqItem.tsx` não bater com o bloco
  "Problem" acima (arquivo mudou desde o commit `c60e5ac`), PARE e reporte
  em vez de improvisar em cima de uma base diferente.

## Verification

- **Mecânica**: `npx tsc --noEmit` limpo. `npm run test:parser` não toca
  nesta área, mas rodar mesmo assim como gate padrão do repo (deve
  continuar 100%).
- **Feel check**: abrir a landing local (`npx expo start --web`), rolar até
  a seção de FAQ (`nativeID="faq"` em `app/index.tsx`), e conferir:
  - O primeiro item já abre sozinho ao carregar (comportamento de
    `abertoInicial`), sem nenhum "pulo" — a altura correta já deve estar
    presente no primeiro layout, não animando a partir de 0 no load inicial.
  - Clicar num item fechado: a resposta cresce suavemente até a altura real
    do texto (nunca ultrapassa nem falta), e o ícone gira de "+" pra "×" no
    mesmo instante.
  - Clicar de novo pra fechar: a resposta encolhe pelo mesmo caminho, sem
    "flash" de conteúdo cortado no meio do movimento.
  - Clicar em dois itens rapidamente em sequência (spam-click): nenhuma
    resposta reinicia do zero nem trava num estado intermediário — é
    `transition` de CSS, não `@keyframes`, então deve retargetar liso.
  - No DevTools, abrir o painel Rendering, ativar
    "Emulate CSS prefers-reduced-motion: reduce", e conferir: a resposta
    ainda abre/fecha (aparece/desaparece), mas sem a transição suave —
    feedback continua existindo, só sem o movimento.
  - No painel Animations do DevTools, reduzir a velocidade de reprodução
    pra 10% e clicar num item: confirmar visualmente que a curva desacelera
    no final (não é linear, não é `ease-in` que começaria devagar).
- **Done when**: os cinco itens de feel check acima passam, `tsc --noEmit`
  está limpo, e nenhum outro arquivo fora de `components/FaqItem.tsx` foi
  tocado.
