import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { fetchWhatsappLink } from '@/lib/data';
import type { WhatsappLink } from '@/lib/types';

/* Espera o vínculo confirmar sozinho, sem a pessoa precisar avisar.
 *
 * O botão "Já enviei — verificar" partia de uma suposição errada: que depois
 * de mandar a mensagem a pessoa volta ao app e procura um botão pra apertar.
 * Na prática ela manda o código, vê o "✅ WhatsApp vinculado" chegar na
 * conversa, e volta pro app esperando encontrar tudo pronto — não um cartão
 * ainda pedindo confirmação, que passa a impressão de que não funcionou.
 *
 * Duas fontes de aviso, porque cada uma cobre um buraco da outra:
 *  - voltar pro app (AppState) resolve o caso do celular, onde sair pro
 *    WhatsApp e voltar é o percurso inteiro — a confirmação é instantânea;
 *  - a sondagem periódica resolve a web, onde o WhatsApp abre em outra aba e
 *    o app nunca chega a perder o foco.
 *
 * Para de sondar sozinha depois de alguns minutos: o código de pareamento
 * expira em 15, e um intervalo esquecido rodando pra sempre numa aba aberta
 * é o tipo de coisa que só aparece na conta do fim do mês.
 */

const INTERVALO_MS = 3000;
const LIMITE_TENTATIVAS = 80; // ~4 minutos

export function useAguardarVinculoWhatsapp(ativo: boolean, aoVincular: (link: WhatsappLink) => void): void {
  /* A callback vive numa ref pra não entrar nas dependências: quem chama
     costuma passar uma arrow inline, e isso reiniciaria a sondagem (e o
     contador de tentativas) a cada render. */
  const aoVincularRef = useRef(aoVincular);
  aoVincularRef.current = aoVincular;

  useEffect(() => {
    if (!ativo) return;

    let vivo = true;
    let tentativas = 0;

    async function conferir() {
      if (!vivo) return;
      try {
        const atual = await fetchWhatsappLink();
        if (vivo && atual?.verified) {
          vivo = false;
          aoVincularRef.current(atual);
        }
      } catch {
        /* Rede instável não é motivo pra desistir: a próxima rodada tenta de
           novo, e o botão manual continua ali como saída. */
      }
    }

    const intervalo = setInterval(() => {
      tentativas++;
      if (tentativas > LIMITE_TENTATIVAS) {
        clearInterval(intervalo);
        return;
      }
      void conferir();
    }, INTERVALO_MS);

    const inscricao = AppState.addEventListener('change', (estado) => {
      // Voltou do WhatsApp: confere na hora, sem esperar o próximo intervalo.
      if (estado === 'active') void conferir();
    });

    return () => {
      vivo = false;
      clearInterval(intervalo);
      inscricao.remove();
    };
  }, [ativo]);
}
