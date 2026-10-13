# E-mails e mensagens de entrega

## Supabase Auth

- confirmar-email.html: confirmação do cadastro; não contém secrets.
- redefinir-senha.html: recuperação de senha; usa link PKCE do Supabase.

O Supabase Auth envia esses e-mails pela Resend, remetente
nao-responda@granaponto.com.br.

## E-mail corporativo (contato@, suporte@, admin@, marketing@)

Domínio granaponto.com.br na Resend, região sa-east-1. Envio por qualquer
endereço do domínio; recebimento pelo MX do Registro.br
(10 inbound-smtp.sa-east-1.amazonaws.com).

- contato@, suporte@ e admin@: o webhook email.received chama a Edge Function
  email-recebido, que encaminha para EMAIL_ENCAMINHAR_PARA (o Gmail do Grana)
  com anexos, Reply-To do cliente e remetente "Grana. caixa". Quem mandou
  aparece na primeira linha do corpo, nunca no From: o nome do remetente
  original no From ("security@facebookmail.com via admin") gerou alerta de
  abuso na Resend em 12/10/2026. Endereço
  desconhecido do domínio entra como contato@.
- marketing@: só envio. O que chega só para ele é descartado.
- Resposta: pelo Gmail, "Enviar e-mail como", SMTP smtp.resend.com:465 SSL,
  usuário resend, senha numa chave de envio da Resend. contato@ é o
  remetente padrão. O campo de senha do Gmail limita o tamanho e corta a
  chave: apagar o maxlength pelo Inspecionar antes de colar.
- Segredos da função (só nomes): RESEND_API_KEY, RESEND_WEBHOOK_SECRET,
  EMAIL_ENCAMINHAR_PARA. Publicar com --no-verify-jwt.
- Falha definitiva no encaminhamento manda à caixa um e-mail "Falha ao
  encaminhar"; o original continua no painel da Resend, em Emails, Receiving.

## Kiwify

O e-mail pós-compra é configurado no painel da Kiwify e deve conter dois
destinos separados:

- Baixar o aplicativo: /baixar ou URL estável do APK.
- Ativar minha assinatura: /ativar?token=... .

O token não deve ser usado como senha, URL de download ou parâmetro de
webhook. O texto comercial de preço, renovação, cancelamento e reembolso deve
ser o texto efetivamente configurado na Kiwify.

## Falhas

E-mail ausente não deve ser tratado como prova de que a compra não existe.
Orientar o usuário a conferir o e-mail da Kiwify e o suporte; confirmar o
vínculo pelo botão do app.
