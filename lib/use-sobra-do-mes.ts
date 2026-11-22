import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { todayISO } from './format';
import { buscarSobraDoMes, confirmarSobraDoMes, converterSobraLegada, sobraPrecisaConverter, type EstadoSobra } from './sobra-do-mes';
import { adiarSobraAteAmanha, sobraAdiadaHoje } from './sobra-adiada';
import { geracaoDasLeituras, guardarTela, invalidarRespostasAtrasadas, isLikelyNetworkError, lerTela, veioDoServidorDesde } from './cache-de-tela';
import { ehLancamentoDeSobra } from './sobra-lancamento';
import type { SobraForaDaLista } from './sobra-do-mes';
import type { Transaction } from './types';

/* Sobra CONFIRMADA guardada no aparelho (Supremo, 20/11/2026). Só quem pede
   `usarCacheOffline` (o Saldo do mês de Lançamentos) a lê sem rede, e só do
   mesmo mês e da mesma conta. O Livre da Início NÃO pede: offline ele continua
   indisponível como hoje (regra 20, paridade com widget e Granabô). Pendente
   não é guardada. Erro que não é de rede continua erro (regra 9).
   v2 (21/11/2026): a v1 guardava `valor X` do modelo antigo; lida hoje, somaria
   X por fora além do lançamento. A chave nova ignora o que ficou na v1. */
const CHAVE_DO_DISCO = 'sobra-do-mes-v2';

type Fonte = {
  userId: string; dia: string; sobra: EstadoSobra | null;
  adiada: boolean | null; carregando: boolean; erro: boolean; semConexao: boolean;
  leitura: number;
};

/** Estado da pergunta e do cálculo compartilha dono/mês, foco e relógio local.
    `aoLancar`: a sobra virou lançamento (confirmação ou conversão) ou a lista
    ficou para trás; quem tem a lista recarrega e devolve a promessa da carga.

    `lancamentos`: a lista que a tela mostra (ausente enquanto carrega, ou se
    ela é de outro mês). Com ela, a sobra e a lista nunca se desencontram em
    silêncio (A3 a A5, 22/11/2026), decidido no MESMO render da lista:
    - legada já presente na lista como lançamento, mesmo editado: não soma por fora;
    - ligada ausente e X conhecido desta montagem: X segue por fora até a lista
      voltar do servidor numa recarga pedida depois da conversão (R1); se ela
      vier sem o lançamento, ele foi movido ou apagado, e X sai;
    - ligada ausente e X desconhecido: `sobraForaDaLista`, e a tela avisa. */
export function useSobraDoMes(
  userId: string | undefined, habilitada: boolean,
  { usarCacheOffline = false, aoLancar, lancamentos }: {
    usarCacheOffline?: boolean; aoLancar?: () => unknown;
    lancamentos?: readonly Pick<Transaction, 'id' | 'type' | 'amount' | 'category' | 'occurred_on'>[];
  } = {},
) {
  const [fonte, setFonte] = useState<Fonte | null>(null);
  const [, setDia] = useState(todayISO);
  const [revisao, setRevisao] = useState(0);
  const geracao = useRef(0);
  const dono = useRef(userId);
  dono.current = habilitada ? userId : undefined;
  const aoLancarRef = useRef(aoLancar);
  aoLancarRef.current = aoLancar;
  /* Uma tentativa de conversão por conta e mês nesta montagem: sem laço se o
     servidor recusar, e a próxima abertura tenta de novo. */
  const conversaoTentada = useRef<string | null>(null);
  const [recarregando, setRecarregando] = useState(false);
  const recargas = useRef(0);
  const recargaEmCurso = useRef(false);
  const recargaTentada = useRef<string | null>(null);
  /* Última legada desta montagem. `desde`: geração da primeira recarga pedida
     depois da conversão; lista do servidor dessa geração em diante aposenta o X. */
  const retida = useRef<{ chave: string; valor: number; desde?: number } | null>(null);
  const lida = useRef<{ chave: string; sobra: EstadoSobra } | null>(null);
  /* Ligado que a lista já mostrou: se sair dela, foi apagado ou movido. */
  const vistoNaLista = useRef<string | null>(null);
  const recarregarLista = useCallback(async () => {
    const vez = ++recargas.current;
    recargaEmCurso.current = true;
    setRecarregando(true);
    invalidarRespostasAtrasadas();
    if (retida.current) retida.current.desde ??= geracaoDasLeituras();
    try {
      await aoLancarRef.current?.();
    } catch (erro) {
      console.error('[sobra-do-mes] recarregar os lançamentos falhou', erro);
    } finally {
      if (vez === recargas.current) {
        recargaEmCurso.current = false;
        setRecarregando(false);
      }
    }
  }, []);
  const hoje = todayISO();
  const mes = hoje.slice(0, 7);

  useFocusEffect(useCallback(() => {
    if (!userId || !habilitada) return;
    let ativo = true;
    let timer: ReturnType<typeof setTimeout>;
    async function converterSePreciso(sobra: EstadoSobra) {
      const chave = `${userId}:${sobra.mes}`;
      if (!sobraPrecisaConverter(sobra) || conversaoTentada.current === chave) return;
      conversaoTentada.current = chave;
      try {
        if (await converterSobraLegada(sobra.mes, userId!) === 'convertida' && ativo && dono.current === userId) {
          void recarregarLista();
          setRevisao(n => n + 1);
        }
      } catch (erro) {
        /* A legada segue contando uma vez pela via antiga; não é ação da pessoa. */
        console.warn('[sobra-do-mes] converter a sobra legada falhou; segue pelo modelo antigo', erro);
      }
    }
    /* Guarda X e diz se a sobra perdeu o lançamento (apagado em outro lugar):
       sem id não há o que procurar na lista, então ela precisa ser relida. */
    function anotarLeitura(sobra: EstadoSobra): boolean {
      const chave = `${userId}:${sobra.mes}`;
      const antes = lida.current?.chave === chave ? lida.current.sobra : null;
      lida.current = { chave, sobra };
      if (sobra.estado !== 'confirmada') return false;
      if (sobra.convertida !== true && sobra.valor > 0) retida.current = { chave, valor: sobra.valor };
      return sobra.convertida === true && !sobra.transactionId && antes?.estado === 'confirmada'
        && (!!antes.transactionId || antes.valor > 0);
    }
    async function atualizar() {
      const tentativa = ++geracao.current;
      const dia = todayISO();
      setDia(dia);
      /* Relendo, a confirmada do mesmo dono e dia continua: o Saldo não perde X no foco. */
      setFonte(antes => antes?.userId === userId && antes?.dia === dia && antes.sobra?.estado === 'confirmada'
        ? { ...antes, adiada: null, carregando: true, erro: false, semConexao: false }
        : { userId: userId!, dia, sobra: null, adiada: null, carregando: true, erro: false, semConexao: false, leitura: tentativa });
      try {
        const [sobra, adiada] = await Promise.all([
          buscarSobraDoMes(dia.slice(0, 7), userId!), sobraAdiadaHoje(userId!, dia),
        ]);
        if (ativo && tentativa === geracao.current && dono.current === userId && dia === todayISO()) {
          const perdeuLancamento = anotarLeitura(sobra);
          setFonte({ userId: userId!, dia, sobra, adiada, carregando: false, erro: false, semConexao: false, leitura: tentativa });
          if (perdeuLancamento) void recarregarLista();
          if (sobra.estado === 'confirmada') void guardarTela(CHAVE_DO_DISCO, sobra, userId);
          void converterSePreciso(sobra);
        }
      } catch (erro) {
        console.error('[inicio] buscar sobra do mês falhou', erro);
        const semConexao = isLikelyNetworkError(erro);
        const guardada = semConexao && usarCacheOffline ? (await lerTela<EstadoSobra>(CHAVE_DO_DISCO))?.dados : undefined;
        const doDisco = guardada?.estado === 'confirmada' && guardada.userId === userId && guardada.mes === dia.slice(0, 7) ? guardada : null;
        if (ativo && tentativa === geracao.current && dono.current === userId && dia === todayISO()) {
          if (doDisco) anotarLeitura(doDisco);
          setFonte(doDisco
            ? { userId: userId!, dia, sobra: doDisco, adiada: null, carregando: false, erro: false, semConexao: true, leitura: tentativa }
            : { userId: userId!, dia, sobra: null, adiada: null, carregando: false, erro: true, semConexao, leitura: tentativa });
        }
      }
    }
    function programarVirada() {
      clearTimeout(timer);
      const agora = new Date();
      const amanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
      timer = setTimeout(() => { void atualizar(); programarVirada(); }, Math.max(1, amanha.getTime() - agora.getTime()));
    }
    void atualizar();
    programarVirada();
    const evento = AppState.addEventListener('change', estado => {
      if (estado === 'active') { void atualizar(); programarVirada(); }
      else geracao.current += 1;
    });
    return () => { ativo = false; geracao.current += 1; evento.remove(); clearTimeout(timer); };
  }, [userId, habilitada, revisao, usarCacheOffline, recarregarLista]));

  const vigente = habilitada && fonte && fonte.userId === userId && fonte.dia === hoje ? fonte : null;
  let sobraDoMes = vigente?.sobra ?? null;
  let ligadoAusente: string | null = null;
  let temX = false;
  /* Sem a lista do mês (outro mês na tela), a carga que chegar não prova nada sobre a sobra. */
  if (!lancamentos && retida.current?.desde !== undefined) {
    retida.current.desde = undefined;
    recargaTentada.current = null;
  }
  if (lancamentos && sobraDoMes?.estado === 'confirmada') {
    const { transactionId, valor } = sobraDoMes;
    if (sobraDoMes.convertida !== true && valor > 0) {
      const dia1 = `${sobraDoMes.mes}-01`;
      const noDia1 = lancamentos.filter(t => ehLancamentoDeSobra(t) && t.occurred_on === dia1);
      /* R2: o valor só desempata. Um só no dia 1 é o lançamento, mesmo editado. */
      const jaLancada = noDia1.find(t => Math.abs(Number(t.amount) - valor) < 0.005) ?? (noDia1.length === 1 ? noDia1[0] : undefined);
      if (jaLancada) sobraDoMes = { ...sobraDoMes, valor: 0, convertida: true, transactionId: jaLancada.id };
    } else if (transactionId) {
      if (lancamentos.some(t => t.id === transactionId)) vistoNaLista.current = transactionId;
      else if (vistoNaLista.current !== transactionId) {
        ligadoAusente = `${transactionId}:${vigente!.leitura}`;
        const x = retida.current;
        if (x?.chave === `${userId}:${sobraDoMes.mes}`) {
          if (x.desde !== undefined && veioDoServidorDesde(lancamentos, x.desde)) retida.current = null;
          else {
            temX = true;
            sobraDoMes = { ...sobraDoMes, valor: x.valor, convertida: false };
          }
        }
      }
    }
  }
  /* Uma recarga por leitura: sem laço se a lista voltar sem o lançamento. */
  useFocusEffect(useCallback(() => {
    if (!ligadoAusente || recargaTentada.current === ligadoAusente) return;
    recargaTentada.current = ligadoAusente;
    /* Em curso só serve se o X já tem marco; senão ela saiu antes de o mês voltar à tela. */
    if (!recargaEmCurso.current || (retida.current && retida.current.desde === undefined)) void recarregarLista();
  }, [ligadoAusente, recarregarLista]));
  const sobraForaDaLista: SobraForaDaLista = !ligadoAusente || temX ? null
    : recarregando || recargaTentada.current !== ligadoAusente ? 'conferindo' : 'ausente';
  function adiar() {
    if (!userId || !vigente || dono.current !== userId || hoje !== todayISO()) return;
    geracao.current += 1;
    setFonte({ ...vigente, adiada: true });
    void adiarSobraAteAmanha(userId, hoje);
  }
  async function confirmar(valor: number) {
    if (!userId || !vigente || vigente.sobra?.estado !== 'pendente' || vigente.sobra.mes !== mes
      || dono.current !== userId || hoje !== todayISO()) throw new Error('A conta ou o mês mudou. Atualize a Início.');
    const tentativa = ++geracao.current;
    const { transactionId } = await confirmarSobraDoMes(mes, valor, userId);
    /* Gravado no servidor: a lista de lançamentos precisa do lançamento novo
       mesmo se a tela mudou de conta ou de mês no meio. */
    void recarregarLista();
    if (tentativa !== geracao.current || dono.current !== userId || hoje !== todayISO()) {
      throw new Error('A conta ou o mês mudou. Atualize a Início.');
    }
    const confirmada: EstadoSobra = { estado: 'confirmada', mes, userId, valor: 0, convertida: true, transactionId };
    lida.current = { chave: `${userId}:${mes}`, sobra: confirmada };
    setFonte({ ...vigente, sobra: confirmada, leitura: tentativa });
    void guardarTela(CHAVE_DO_DISCO, confirmada, userId);
  }
  return {
    hoje, sobraDoMes, sobraForaDaLista, sobraAdiada: vigente?.adiada ?? null,
    carregando: habilitada && !!userId && (!vigente || vigente.carregando),
    erro: vigente?.erro ?? false, semConexao: vigente?.semConexao ?? false, adiar, confirmar, recarregar: () => setRevisao(n => n + 1),
  };
}
