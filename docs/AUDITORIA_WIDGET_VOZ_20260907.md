# Verificação do widget de voz — 07/09/2026

## Resultado

Backend de transcrição funcional na sonda autenticada. Não foi feita gravação
pelo widget em Android real: adb/SDK não está disponível neste ambiente. Nenhuma
build EAS foi disparada.

Áudio sintético pt-BR gerado localmente: "Gastei trinta e dois reais no mercado
no pix". Convertido para AAC mono, 44.100 Hz, 64 kbps, contêiner M4A, 33.851
bytes, enviado por multipart `audio`, MIME `audio/m4a`, nome `widget.m4a`.
Essas configurações correspondem às do serviço Android, mas não reproduzem
microfone, ruído nem permissões do aparelho.

| Tentativa | HTTP | Provedor | Tempo | Transcrição |
| --- | --- | --- | --- | --- |
| 1 | 200 | Groq | 0,83 s | gastei 32 reais no mercado no pix |
| 2 | 200 | Groq | 0,72 s | gastei 32 reais no mercado no pix |
| 3 | 200 | Groq | 0,64 s | gastei 32 reais no mercado no pix |

Essas chamadas somente transcreveram; não criaram lançamentos. Ferramentas de
conversão e áudio ficam na pasta temporária, sem dependências novas no app.

## Código e testes

- Serviço grava AAC/M4A e entrega arquivo + requestId à tarefa registrada no
  boot em `index.js`. Permissões de microfone/notificação são verificadas.
- `test:voz` estava desatualizado: esperava o nome do arquivo original em vez
  do nome padrão transmitido e não simulava o helper de segurança importado.
  Corrigido e reforçado para conferir MIME/nome próprios do widget. Passou com
  o serializador real do Expo instalado, cliente real e rede simulada.
- Guardas de idempotência: 11/11. Guardas visuais: 9/9. São verificações de
  código, não execução de serviço Android.
- Defeito corrigido: com vários cartões e sem cartão reconhecido na fala, o
  widget escolhia o primeiro. Agora envia "Qual cartão?" à revisão e não grava.
  `node __tests__/widget-voz-cartoes.cjs` executa a tarefa real com dependências
  simuladas: ambiguidade, cartão identificado, cartão único, permissão ausente
  e exclusão do áudio passaram. Mudança depende da próxima versão do app.

## Antes de considerar o widget validado no aparelho

- A cópia da função publicada foi baixada em pasta temporária: a transcrição
  ainda usa provedores sequenciais. O fallback local com início após 8 segundos
  continua sem deploy, como registrado na decisão anterior de mantê-lo apenas
  commitado. A nova build, sozinha, não publica essa melhoria do servidor.
- Testar no Android: app encerrado/segundo plano, permitir/negar microfone e
  notificações, parar/cancelar gravação, perda de rede, recibo e Desfazer.
- Verificar a tarefa sob rede lenta: timeout headless é 120s; cliente permite
  75s por tentativa e pode repetir em falha de sessão/corpo ambíguo. O teste
  rápido de transcrição não cobre esse pior caso.
- O reconhecimento de nome usa o matcher existente; nomes semelhantes ou
  vários cartões do mesmo banco ainda precisam de testes específicos.

Não há evidência suficiente para afirmar funcionamento completo do widget em
Android apenas com estes resultados. Há evidência de upload/transcrição e
proteções do fluxo JS funcionando nos cenários descritos.
