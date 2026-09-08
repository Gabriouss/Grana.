# Distribuição direta do APK

## Fluxo curto de entrega

1. A pessoa compra pelo checkout da Kiwify.
2. O e-mail pós-compra oferece dois caminhos separados:
   - **Baixar o aplicativo** → `https://granaponto.com.br/baixar`;
   - **Ativar minha assinatura** → `https://granaponto.com.br/ativar?token=...`.
3. A página `/baixar` abre o APK oficial por uma URL estável.
4. Depois de instalar, a pessoa entra ou cria a conta.
5. A assinatura é vinculada automaticamente pelo e-mail ou pelo token de ativação.

O token de ativação não deve ser usado como link de download. São responsabilidades
separadas: o download entrega o aplicativo; o token prova o vínculo da compra.

## Configuração necessária

Definir `EXPO_PUBLIC_ANDROID_DOWNLOAD_URL` nos ambientes que exportam a página
web e nas próximas builds Android. O valor deve ser uma URL HTTPS estável para o
APK mais recente, por exemplo:

```text
https://granaponto.com.br/downloads/grana-latest.apk
```

Não usar como endereço comercial permanente o link bruto de
`expo.dev/artifacts/eas/`: os artefatos do EAS podem expirar.

## Origem do arquivo

O endereço acima é um redirecionamento do Vercel para o asset `grana.apk` da
release mais recente do repositório GitHub. O redirecionamento está versionado
em `vercel.json`; a aplicação nunca precisa conhecer a URL interna do GitHub.

Para cada versão publicada, criar uma release pública no GitHub, anexar o APK
com o nome exato `grana.apk`, e marcar a release como a mais recente. O endereço
`/releases/latest/download/grana.apk` continuará apontando para a versão nova.

O APK não deve ser protegido por login: ele pode ser compartilhado. O controle
de acesso comercial acontece no servidor, pela assinatura vinculada à conta, e
não pelo segredo do arquivo de instalação.

Enquanto a variável não estiver configurada, `/baixar` mostra uma mensagem de
indisponibilidade em vez de exibir um botão que leva a um link morto.

## Hospedagem do APK

O endereço estável precisa apontar sempre para o arquivo assinado da versão
publicada. O processo de release deve:

1. preparar a versão pelo script obrigatório do projeto;
2. gerar o APK somente com autorização explícita;
3. criar a release correspondente no GitHub e anexar o APK como `grana.apk`;
4. conferir o redirecionamento e o download em Android real;
5. calcular e guardar o SHA-256 do APK na anotação da release;
6. testar a atualização sobre uma versão anterior.

## Checklist da Kiwify

- [ ] O e-mail pós-compra contém o botão de download.
- [ ] O e-mail pós-compra contém o link de ativação.
- [ ] O link de download não contém token de assinatura.
- [ ] O link de ativação funciona com usuário logado e deslogado.
- [ ] Compra com e-mail igual à conta vincula automaticamente.
- [ ] Compra com e-mail diferente usa o fluxo de token.
- [ ] O suporte sabe orientar instalação de fonte externa no Android.
- [ ] O suporte sabe resolver “paguei, instalei, mas o acesso não foi liberado”.

## Estado atual

A rota pública, o link de ativação e o ponto de configuração da URL foram
implementados no aplicativo. Nenhum build foi disparado nesta mudança; a
instalação real só poderá ser validada depois que o APK for publicado no
endereço estável e uma nova build autorizada for gerada.

Quando a variável estiver configurada na build instalada, o aviso interno de
atualização também prefere essa URL estável. O link temporário registrado pelo
EAS continua servindo como fallback enquanto a configuração ainda não foi
publicada.

## Ações manuais obrigatórias

- [ ] Criar/publicar a release do GitHub com o APK autorizado.
- [ ] Confirmar que o asset se chama exatamente `grana.apk`.
- [ ] Configurar `EXPO_PUBLIC_ANDROID_DOWNLOAD_URL` no projeto Vercel.
- [ ] Configurar a mesma variável nos perfis EAS antes da próxima build.
- [ ] Configurar os dois botões no e-mail pós-compra da Kiwify.
- [ ] Fazer o primeiro teste em Android real, incluindo instalação e atualização.
