# E-mails e mensagens de entrega

## Supabase Auth

- confirmar-email.html: confirmação do cadastro; não contém secrets.
- redefinir-senha.html: recuperação de senha; usa link PKCE do Supabase.

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
