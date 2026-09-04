import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { Alert } from '@/lib/alert';
import { deleteBill, deleteTransaction } from '@/lib/data';
import { ehIntencaoBoleto, ehIntencaoCredito } from '@/lib/heuristics';
import { ACAO_DESFAZER, type DadosNotifVoz } from '@/lib/widget-voz-notificacoes';

/**
 * O que acontece quando a pessoa TOCA na notificação do widget de voz.
 *
 * O widget lança com o app fechado (ver lib/widget-voz-task.ts), então a única
 * superfície de resposta é a notificação. Duas coisas chegam por aqui:
 *
 *  - "Desfazer" num lançamento salvo — apaga o que aquele comando criou,
 *    inclusive todas as parcelas de uma compra parcelada;
 *  - um lançamento que o widget se recusou a salvar sozinho (sem valor,
 *    categoria incerta, crédito sem cartão) — abre a tela certa com a
 *    transcrição já preenchida, pra não obrigar a repetir a fala.
 *
 * Montado uma vez em app/_layout.tsx. Não desenha nada.
 */
export default function RespostaVozWidget() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    async function tratar(resposta: Notifications.NotificationResponse) {
      const dados = resposta.notification.request.content.data as unknown as DadosNotifVoz | undefined;
      if (!dados || dados.origem !== 'voz') return;

      if (dados.resultado === 'salvo') {
        /* Só desfaz quando o botão foi o "Desfazer". Tocar no CORPO da
           notificação é a pessoa querendo VER o que foi lançado — apagar aí
           seria destruir por causa de um toque de curiosidade. */
        if (resposta.actionIdentifier !== ACAO_DESFAZER) {
          router.push(dados.tipo === 'bill' ? '/(app)/contas' : '/(app)/lancamentos');
          return;
        }
        try {
          for (const id of dados.ids) {
            if (dados.tipo === 'bill') await deleteBill(id);
            else await deleteTransaction(id);
          }
          Alert.alert('Desfeito', 'O lançamento criado por voz foi removido.');
        } catch {
          /* Não fingir que desfez: a linha continua lá, e a pessoa precisa
             saber pra apagar na mão. */
          Alert.alert(
            'Não consegui desfazer',
            'O lançamento continua salvo. Abra Lançamentos e apague manualmente.'
          );
        }
        return;
      }

      const texto = dados.transcricao;
      if (!texto) {
        router.push('/(app)/');
        return;
      }
      /* Mesma ordem de roteamento do botão de voz das telas (boleto antes de
         crédito): um caminho só, pra fala do widget e fala do app abrirem a
         mesma coisa. */
      if (ehIntencaoBoleto(texto)) {
        router.push({ pathname: '/(app)/contas', params: { novaConta: '1', texto } });
        return;
      }
      if (ehIntencaoCredito(texto)) {
        router.push({ pathname: '/(app)/credito', params: { novaCompra: '1', texto } });
        return;
      }
      router.push({ pathname: '/(app)/', params: { colarTexto: texto } });
    }

    /* Duas fontes, e as duas importam: `getLastNotificationResponseAsync`
       cobre o app ABERTO PELA notificação (o listener não existia na hora do
       toque), e o listener cobre o app já rodando. */
    let vivo = true;
    Notifications.getLastNotificationResponseAsync()
      .then((resposta) => {
        if (vivo && resposta) tratar(resposta);
      })
      .catch(() => {});

    const inscricao = Notifications.addNotificationResponseReceivedListener(tratar);
    return () => {
      vivo = false;
      inscricao.remove();
    };
  }, [router]);

  return null;
}
