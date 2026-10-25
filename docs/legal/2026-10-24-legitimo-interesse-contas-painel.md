# Legítimo interesse: tela Contas do painel local (24/10/2026)

**Decisão:** o autor pediu, em 24/10/2026, as informações de login dos usuários no painel admin e escolheu a lista por pessoa com último acesso ("2 com ultimo acesso"). A revisão LGPD do Lynx (APTO COM AJUSTES, relatório em `E:/Grana-temporarios/2026-10-24-contas-painel/relatorio-lynx-lgpd-contas.md`) pediu este registro (O-02). Ele documenta o raciocínio e o risco que sobra, sem valor de parecer jurídico, para que uma revisão futura parta daqui.

Serve também como registro da operação de tratamento (LGPD, art. 37) desta tela.

## Fatos, com a fonte de cada um

| Fato | Fonte |
|---|---|
| A tela lista cada conta com e-mail, data de cadastro, e-mail confirmado, último login, último acesso e estado da assinatura (origem, status e acesso até). | `tools/admin-local/adaptadores/supabase.cjs` (`contas()`), `tools/admin-local/web/telas/contas.js` |
| Último acesso é a renovação mais recente da sessão, lida de `auth.sessions` e `auth.refresh_tokens`. Nada novo é gravado no banco e o app não muda. | `contas()`; commit `cc237ca5` |
| Na lista, o e-mail sai cortado, e o domínio só sai inteiro nos provedores grandes. O e-mail completo só aparece na busca pelo endereço exato. | `mascararEmail()`; commit `4b474342` |
| Não saem id, IP nem aparelho da sessão. | DTO fechado em `contas()`; teste `__tests__/admin-local-contas.cjs` |
| A tela só abre com o login completo do painel (senha e código de autenticação), num servidor que escuta só neste computador. | `tools/admin-local/rotas.cjs`; relatório do Lynx, pergunta 4 |
| A consulta é um SELECT fixo, com o e-mail validado antes de entrar no filtro. Ela vai primeiro ao endpoint read-only da Management API do Supabase; se esse endpoint não existir (404 ou 405), a mesma consulta segue pelo endpoint comum, que não tem a barreira de só leitura. A lista fica 30 s na memória do servidor local; a busca não fica guardada. Erro do banco chega ao log só com o status e o código SQLSTATE, sem o texto do provedor. | `sql()` e `causaSql()` em `tools/admin-local/adaptadores/supabase.cjs`; rota `/api/supabase/contas` |
| No modo simulado (`GRANA_ADMIN_SIMULAR=1`, o dos agentes de QA), a tela não lê produção. | `contas()`; commit `4b474342` |
| A tela não mostra lançamentos, saldos, cartões nem metas. | DTO de `contas()` |

## 1. Finalidade (art. 10, I)

**Interesse do Grana.:** atender quem procura o suporte ("não consigo entrar", "paguei e não liberou"), conferir o estado de acesso de uma conta e acompanhar se as pessoas continuam usando o app depois do cadastro, o que orienta produto e suporte.

A busca pelo e-mail exato, feita a partir de um pedido concreto da pessoa, se apoia na execução do contrato (art. 7º, V). Este registro cobre a parte que não depende de pedido: percorrer a lista de todas as contas e os números "acessaram em 7 e 30 dias".

## 2. Necessidade (art. 10, §1º, e art. 6º, III)

- **Alternativas consideradas:** só números totais (descartada pelo autor, porque não serve ao suporte); gravar o último acesso pelo app (exigiria build nova e um dado novo); levar a lista ao painel web da nuvem (exigiria publicação em produção e poria dado pessoal no site público).
- **Minimização:** cada campo serve à finalidade. E-mail confirmado e último login servem ao suporte de entrada na conta; último acesso, ao acompanhamento de uso; status e "acesso até", à conferência do acesso pago. Id, IP e aparelho ficam de fora.

## 3. Balanceamento (art. 10, II, e legítima expectativa)

- **Dados:** metadados de conta, sem dado financeiro e sem dado sensível (art. 5º, II).
- **Expectativa:** quem assina um serviço espera que a equipe consiga ver se a conta está ativa e quando foi usada, para atendê-lo. A política passa a dizer isso por extenso (versão de 24/10/2026 de `lib/legal-content.ts`, seções 2, 3 e 7).
- **Impacto:** baixo. Ninguém fora da equipe vê, nada é gravado e nenhum dado vai a terceiros.
- **O ponto que pesa contra:** a lista mostra todas as contas sem pedido da pessoa, e o último acesso revela hábito de uso. A máscara do e-mail e o uso só pela equipe reduzem esse peso.

**Resultado:** o interesse prevalece para metadados de conta, de baixo impacto, declarados na política e sem conteúdo financeiro, desde que as salvaguardas abaixo sejam cumpridas.

## 4. Salvaguardas (art. 10, §§2º e 3º; art. 18, §2º)

- **Transparência:** a política cita os dados de acesso (seção 2), a finalidade e a base legal (seção 3) e a ferramenta interna, com o que ela mostra e o que não mostra (seção 7).
- **Oposição:** a pessoa pode se opor ao acompanhamento de uso pelo e-mail de contato. Hoje a oposição é atendida à mão; a tela não tem um filtro de exclusão.
- **Acesso:** só a equipe, com senha e código de autenticação, num servidor local. Agentes de IA que testam o painel rodam no modo simulado, em que a tela não lê produção.
- **Retenção:** nenhuma além de 30 s na memória do servidor local. Conta excluída some da lista, porque a exclusão é definitiva.
- **Revisão:** esta avaliação é refeita se a tela ganhar campos, se passar a gravar algo, se for levada ao painel web ou se a lista passar a ser exportada.

## Risco que sobra

- Um print da tela compartilhado fora da equipe expõe e-mails cortados e datas. A máscara reduz, sem eliminar.
- A oposição ao acompanhamento depende de atendimento manual.
- A guarda de 6 meses dos registros de acesso (Marco Civil, art. 15) é anterior a esta tela e não é cumprida por ela; depende de o Grana. operar como pessoa jurídica (observação O-03 do Lynx).
