# Rotas públicas e SEO

| Rota | Indexável | Dados exibidos |
| --- | --- | --- |
| / | sim | marketing e preço público |
| /termos | sim | documento legal |
| /privacidade | sim | documento legal |
| /exclusao-de-dados | sim | instruções de exclusão |
| /baixar | sim | instruções e URL pública do APK |
| /ativar | não depende de dados públicos | token de ativação e estado da própria sessão |
| área autenticada | não | dados privados do usuário |

Metadados e sitemap ficam em public/. Nenhuma rota pública deve renderizar
lançamentos, e-mails, tokens ou respostas do Granabô.
