import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import type * as NotificationsModule from 'expo-notifications';
import { useRouter } from 'expo-router';
import { Alert } from '@/lib/alert';
import { deleteBill, deleteTransaction } from '@/lib/data';
import { ehIntencaoBoleto, ehIntencaoCredito } from '@/lib/heuristics';
import { getNotifications } from '@/lib/notifications';
import { desfazerOperacaoVoz } from '@/lib/voice-operations';
import { ACAO_DESFAZER, podeNotificar, type DadosNotifVoz } from '@/lib/widget-voz-notificacoes';
import {
  definirEstado as definirEstadoWidgetVoz,
  estadoAtual as estadoWidgetVoz,
  widgetDisponivel as widgetVozDisponivel,
} from '@/modules/grana-voice-widget';

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

  /* O widget acende "Toque p/ ativar" quando não consegue notificar, e não
     tem como descobrir sozinho que a permissão voltou — ele só é redesenhado
     quando alguém manda.
     Na abertura E a cada volta do segundo plano, porque o caminho real é
     exatamente esse: tocar no widget abre o app, a pessoa concede a permissão
     nas CONFIGURAÇÕES DO SISTEMA e volta. Nessa volta o app é retomado, não
     remontado — só na montagem, o aviso ficaria preso pedindo uma permissão
     já concedida. */
  useEffect(() => {
    if (!widgetVozDisponivel) return;

    function conferir() {
      if (estadoWidgetVoz() !== 'atencao') return;
      podeNotificar()
        .then((pode) => {
          if (pode) definirEstadoWidgetVoz('ocioso');
        })
        .catch(() => {});
    }

    conferir();
    const inscricao = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') conferir();
    });
    return () => inscricao.remove();
  }, []);

  useEffect(() => {
    /* `getNotifications()` já cobre web (null direto) e Expo Go no Android
       (SDK 57 removeu o módulo nativo de push; até só importar o pacote, sem
       usar nada dele, derruba o app — ver o comentário de `isExpoGo` em
       lib/notifications.ts). Fora desses dois casos, `Notifications` é o
       módulo de verdade. */
    const Notifications = getNotifications();
    if (!Notifications) return;

    async function tratar(resposta: NotificationsModule.NotificationResponse) {
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
          if (dados.operationId) {
            await desfazerOperacaoVoz(dados.operationId);
          } else {
            /* Compatibilidade com recibos emitidos por uma build antiga. Os
               novos sempre usam a RPC atomica acima. */
            for (const id of dados.ids) {
              if (dados.tipo === 'bill') await deleteBill(id);
              else await deleteTransaction(id);
            }
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
