# Checklist de validação Android

Este roteiro cobre o que a suíte determinística não consegue provar: teclado,
gesto, renderização e escrita real no Supabase. Deve ser executado em uma
build nova, instalada em aparelho físico, com uma conta descartável.

## Preparar

1. Gerar uma build interna com o perfil `preview`:

   ```bash
   npm run build:preparar -- "Corrige estabilidade e lancamentos do Granabo."
   eas build --profile preview --platform android --message "Corrige estabilidade e lancamentos do Granabo."
   ```

2. Instalar o APK no aparelho e entrar somente com a conta de teste.
3. Confirmar que a build mostra a versão anunciada e que a conta não é a de
   produção usada para dados reais.

## Casos obrigatórios

| Caso | Ação | Aprovação |
| --- | --- | --- |
| Granachat com teclado | Abrir o Granachat, enviar mensagens suficientes para ultrapassar a altura da tela, fechar e reabrir o teclado, arrastar para cima e aguardar alguns segundos. | A lista permanece na posição escolhida; não volta sozinha ao fim. |
| Crédito parcelado | Registrar uma compra de R$ 300 no crédito em 3 parcelas. | Aparecem 3 parcelas de R$ 100,00 e a soma é R$ 300,00. |
| Boleto com nome | Registrar “Boleto para o dia 13 de setembro, 47 reais Liga das lendas”. | A conta a pagar aparece como “Liga das lendas”, com R$ 47,00 e vencimento correto. |
| Falha recuperável | Desativar a rede antes de abrir uma tela protegida e tentar recarregar. | A tela mostra um aviso e uma ação de recuperação; não fica vazia. |
| Tela inexistente | Abrir uma rota inválida no web export, quando a validação web for feita. | A página mostra 404 e oferece retorno ao início. |

## Matriz mínima

Executar pelo menos em um aparelho compacto (aprox. 360–390 dp), com teclado
aberto e fechado, e em um aparelho mais alto. Repetir o caso do Granachat com
movimento reduzido quando o sistema oferecer essa opção.

## Evidência

Registrar versão, modelo Android, tamanho aproximado da tela, resultado de
cada caso e, em caso de falha, vídeo ou captura sem dados financeiros reais.
Este roteiro não substitui a suíte `npm run test:ci`: os dois comprovam
camadas diferentes.
