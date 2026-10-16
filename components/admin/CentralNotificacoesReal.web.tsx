import { useEffect, useRef, useState } from 'react';
import {
  ErroAdmin, listarNotificacoesMarketing, marcarNotificacoesLidas, type NotificacaoServidor,
} from '@/lib/admin-web';
import { fundacaoNaoPublicada, notificacaoDoServidor, type Notificacao } from '@/lib/admin-notificacoes';
import CentralNotificacoes from './CentralNotificacoes.web';

// Liga o sino ao servidor (função admin-marketing). Três saídas, todas visíveis:
//   - leu: lista real, sem aviso de teste;
//   - função ainda não publicada (404): cai no dublê, que a central marca como "dados de teste";
//   - qualquer outra falha: erro com "Tentar de novo". Falha nunca vira lista vazia nem dublê.
// Marcar como lida grava no servidor ANTES de mudar a tela (a central já só muda depois que a
// gravação resolve); desfazer e preferências não existem no contrato, então a central os desliga.

const POR_PEDIDO = 50;
const MAX_PAGINAS = 4;

async function lerTudo(): Promise<Notificacao[]> {
  const todas: NotificacaoServidor[] = [];
  let cursor: { criadoEm: string; id: string } | undefined;
  for (let i = 0; i < MAX_PAGINAS; i++) {
    const r = await listarNotificacoesMarketing(cursor);
    todas.push(...r.dados.notificacoes);
    if (!r.dados.proximaPagina) break;
    cursor = r.dados.proximaPagina;
  }
  return todas.map(notificacaoDoServidor);
}

async function persistir(ids: string[], lida: boolean): Promise<void> {
  // O servidor só sabe marcar como lida; ids de preferência e "desmarcar" não têm rota.
  if (!lida || ids.some((id) => id.startsWith('pref:'))) throw new Error('sem-rota');
  for (let i = 0; i < ids.length; i += POR_PEDIDO) await marcarNotificacoesLidas(ids.slice(i, i + POR_PEDIDO));
}

type Fase =
  | { tipo: 'carregando' }
  | { tipo: 'real'; lista: Notificacao[]; em: string }
  | { tipo: 'duble' }
  | { tipo: 'erro' };

export default function CentralNotificacoesReal() {
  const [fase, setFase] = useState<Fase>({ tipo: 'carregando' });
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    (async () => {
      try {
        const lista = await lerTudo();
        if (vivo.current) setFase({ tipo: 'real', lista, em: new Date().toISOString() });
      } catch (error) {
        if (!vivo.current) return;
        // Só código e referência: nada de conteúdo.
        const codigo = error instanceof ErroAdmin ? error.codigo : 'rede';
        console.warn('[admin-notificacoes]', codigo, error instanceof ErroAdmin ? error.ocorrencia : '');
        setFase(fundacaoNaoPublicada(codigo) ? { tipo: 'duble' } : { tipo: 'erro' });
      }
    })();
    return () => { vivo.current = false; };
  }, []);

  if (fase.tipo === 'duble') return <CentralNotificacoes key="duble" />;
  if (fase.tipo === 'real') {
    return <CentralNotificacoes key="real" real persistir={persistir} recarregar={lerTudo}
      leituraInicial={{ situacao: 'ok', lista: fase.lista, atualizadoEm: fase.em }} />;
  }
  return <CentralNotificacoes key={fase.tipo} real persistir={persistir} recarregar={lerTudo}
    leituraInicial={fase.tipo === 'erro' ? { situacao: 'erro' } : { situacao: 'carregando' }} />;
}
