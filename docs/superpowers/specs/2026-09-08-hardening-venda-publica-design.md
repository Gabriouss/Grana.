# Especificação: hardening para venda pública

## Contexto

O Grana. já possui checkout, vínculo de assinatura, lançamento por voz,
widgets Android, notificações e o Granabô. A revisão de prontidão encontrou
lacunas que não são novas features de produto, mas podem transformar uma venda
em acesso bloqueado, custo sem limite, informação legal incompleta ou falha sem
diagnóstico.

Esta entrega fecha essas lacunas no código e na documentação. A entrega não
gera APK, não ativa o bloqueio global de assinaturas e não depende de credenciais
externas que só o autor controla.

## Objetivos

1. Tornar o vínculo de pagamento observável e recuperável para o usuário.
2. Alinhar privacidade e termos ao uso atual de voz, push e Granabô.
3. Fazer o CI bloquear regressões conhecidas e executar a cobertura existente.
4. Substituir rate limits apenas em memória por cotas atômicas por usuário,
   protegendo as janelas por minuto e por dia dos provedores de IA.
5. Separar cobrança atrasada de uma nova compra e oferecer orientação segura.
6. Registrar arquitetura, fluxos, permissões, segredos, testes, e-mails,
   trabalhos agendados, SEO e automações para a próxima máquina.

## Não objetivos

- Não disparar `eas build`.
- Não ativar `app_backend_config.enforce_subscriptions` nesta entrega.
- Não publicar migrations ou Edge Functions em produção sem a credencial e a
  autorização operacional da outra máquina.
- Não inventar política de reembolso ou cancelamento: o texto continuará
  remetendo às condições efetivamente exibidas pela Kiwify.
- Não criar um provedor de observabilidade pago. O lote deixa logs estruturados,
  códigos de erro estáveis e uma operação documentada.

## Desenho

### Acesso pago

`vincularAssinaturasPendentes()` passa a devolver um resultado estruturado,
registrar falhas sem segredos e diferenciar: vínculo concluído, nenhum token,
falha temporária e token recusado. O `EntitlementProvider` mantém esse estado
para a tela de assinatura.

Quando o acesso estiver bloqueado por falha de sincronização, a tela mostrará
uma mensagem de atenção e um botão de nova verificação. O checkout geral não
será apresentado como “atualizar cobrança” para uma assinatura `past_due`.
Como a Kiwify é a autoridade da cobrança, a tela usará uma URL de gerenciamento
configurável quando ela existir; sem essa URL, orientará o usuário a usar o
e-mail/atendimento da Kiwify, sem iniciar outra compra automaticamente.

### Cotas de IA

Uma tabela privada `ai_usage_counters` terá uma linha por usuário e canal
(`assistente` ou `voz`). Uma RPC `consumir_cota_ia` usa `auth.uid()`, trava a
linha e reinicia contadores de minuto/dia conforme necessário. Os limites são
fixos no servidor: 10 perguntas por minuto e 120 por dia para o Granabô; 12
transcrições por minuto e 60 por dia para voz.

As Edge Functions consultam essa RPC antes de chamar provedores externos. O
limite em memória continua como defesa rápida local, mas deixa de ser a única
proteção. Falha da RPC retorna indisponibilidade explícita e não autoriza uma
chamada potencialmente cobrada sem controle.

### Legal e operação

Privacidade e termos passam a mencionar push tokens, notificações remotas,
voz no app/widget, Groq/OpenAI, Granabô/Gemini, histórico e memória. A
documentação técnica em `documentation/` será a fonte de intenção para revisão
humana e futura automação de testes.

### CI

O guarda de schema foi dividido por marcadores para que migrations novas não
alterem silenciosamente o escopo das migrations antigas. A migration inicial
de voz permanece verificada como histórico, enquanto o baseline final é
comparado com a migration posterior de carteiras. O workflow passa a executar
os scripts de teste existentes e os testes CJS de voz/widget, além da
verificação de tipos.

## Falhas e recibos

- Falha de sincronização de assinatura: estado visível na tela e log local sem
  token, senha ou payload de pagamento.
- Cota esgotada: HTTP 429 com código estável e mensagem curta, sem chamar IA.
- RPC de cota indisponível: HTTP 503 com código `limite_indisponivel`, log da
  função e nenhuma chamada ao provedor.
- Provedor de IA indisponível: mantém o fallback já existente e retorna erro
  amigável quando o prazo termina.
- Erro do CI: permanece bloqueante; não será escondido alterando o teste para
  sempre passar.

## Verificação

- TypeScript e `deno check` das funções alteradas.
- Testes de vínculo e falha de assinatura com dublês do Supabase.
- Testes de quota permitindo, bloqueando e reiniciando janelas.
- Corpus completo e todos os scripts existentes no CI.
- Guarda do schema com a migration histórica separada do baseline final.
- Verificação visual da tela de assinatura na web; nenhuma build Android.
