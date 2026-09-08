# Mapa de verificação

## Cobertura existente e CI

| Regra | Teste | Estado |
| --- | --- | --- |
| TypeScript do app | npx tsc --noEmit | existente/CI |
| parser de voz e WhatsApp | npm run test:parser | existente/CI |
| upload, fallback e erros de voz | test:voz, voice-fallback.cjs, voz-offline.cjs | existente/CI |
| widget e cartões | widget-voz-cartoes.cjs, corpus-widgets-home.ts | existente/CI |
| Granabô/aprendizado/fatura | test:assistente-aprendizado, test:assistente-fatura | existente/CI |
| blur e motion | test:blur, test:motion | existente/CI |
| vínculo de assinatura | assinatura-sync.cjs | existente/CI |
| parsing da resposta de quota | ai-quota.cjs | existente/CI |
| Edge Functions alteradas | deno check | existente/CI |

## Proposto ou manual

| Caso | Tipo | Estado |
| --- | --- | --- |
| RPC de quota em Postgres concorrente | guarded live | outra máquina |
| compra, renovação, cancelamento e chargeback | manual/guarded live | outra máquina |
| exclusão de conta descartável | manual/guarded live | outra máquina |
| APK, widget, push, biometria e telas Android | manual físico | outra máquina |
| aplicação limpa de todo schema | integração Supabase local | não executado |

## Lacunas conhecidas

- A migration inicial de voz é mantida como histórico; a guarda compara o
  schema final com `20260908000000_voice_wallets.sql`, sem sobrescrever o
  arquivo da outra máquina.
- A pipeline não prova comportamento de FCM, Expo, Kiwify, Meta ou Gemini real.
- Não há teste físico automatizado para o módulo Kotlin e widgets.
