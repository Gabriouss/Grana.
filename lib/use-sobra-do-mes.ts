import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { todayISO } from './format';
import { buscarSobraDoMes, confirmarSobraDoMes, type EstadoSobra } from './sobra-do-mes';
import { adiarSobraAteAmanha, sobraAdiadaHoje } from './sobra-adiada';
import { guardarTela, isLikelyNetworkError, lerTela } from './cache-de-tela';

/* Sobra CONFIRMADA guardada no aparelho (Supremo, 20/11/2026). Só quem pede
   `usarCacheOffline` (o Saldo do mês de Lançamentos) a lê sem rede, e só do
   mesmo mês e da mesma conta. O Livre da Início NÃO pede: offline ele continua
   indisponível como hoje (regra 20, paridade com widget e Granabô). Pendente
   não é guardada. Erro que não é de rede continua erro (regra 9). */
const CHAVE_DO_DISCO = 'sobra-do-mes';

type Fonte = {
  userId: string; dia: string; sobra: EstadoSobra | null;
  adiada: boolean | null; carregando: boolean; erro: boolean; semConexao: boolean;
};

/** Estado da pergunta e do cálculo compartilha dono/mês, foco e relógio local. */
export function useSobraDoMes(userId: string | undefined, habilitada: boolean, { usarCacheOffline = false } = {}) {
  const [fonte, setFonte] = useState<Fonte | null>(null);
  const [, setDia] = useState(todayISO);
  const [revisao, setRevisao] = useState(0);
  const geracao = useRef(0);
  const dono = useRef(userId);
  dono.current = habilitada ? userId : undefined;
  const hoje = todayISO();
  const mes = hoje.slice(0, 7);

  useFocusEffect(useCallback(() => {
    if (!userId || !habilitada) return;
    let ativo = true;
    let timer: ReturnType<typeof setTimeout>;
    async function atualizar() {
      const tentativa = ++geracao.current;
      const dia = todayISO();
      setDia(dia);
      setFonte({ userId: userId!, dia, sobra: null, adiada: null, carregando: true, erro: false, semConexao: false });
      try {
        const [sobra, adiada] = await Promise.all([
          buscarSobraDoMes(dia.slice(0, 7), userId!), sobraAdiadaHoje(userId!, dia),
        ]);
        if (ativo && tentativa === geracao.current && dono.current === userId && dia === todayISO()) {
          setFonte({ userId: userId!, dia, sobra, adiada, carregando: false, erro: false, semConexao: false });
          if (sobra.estado === 'confirmada') void guardarTela(CHAVE_DO_DISCO, sobra, userId);
        }
      } catch (erro) {
        console.error('[inicio] buscar sobra do mês falhou', erro);
        const semConexao = isLikelyNetworkError(erro);
        const guardada = semConexao && usarCacheOffline ? (await lerTela<EstadoSobra>(CHAVE_DO_DISCO))?.dados : undefined;
        const doDisco = guardada?.estado === 'confirmada' && guardada.userId === userId && guardada.mes === dia.slice(0, 7) ? guardada : null;
        if (ativo && tentativa === geracao.current && dono.current === userId && dia === todayISO()) {
          setFonte(doDisco
            ? { userId: userId!, dia, sobra: doDisco, adiada: null, carregando: false, erro: false, semConexao: true }
            : { userId: userId!, dia, sobra: null, adiada: null, carregando: false, erro: true, semConexao });
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
  }, [userId, habilitada, revisao, usarCacheOffline]));

  const vigente = habilitada && fonte && fonte.userId === userId && fonte.dia === hoje ? fonte : null;
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
    await confirmarSobraDoMes(mes, valor, userId);
    if (tentativa !== geracao.current || dono.current !== userId || hoje !== todayISO()) {
      throw new Error('A conta ou o mês mudou. Atualize a Início.');
    }
    setFonte({ ...vigente, sobra: { estado: 'confirmada', mes, userId, valor } });
    void guardarTela(CHAVE_DO_DISCO, { estado: 'confirmada', mes, userId, valor }, userId);
  }
  return {
    hoje, sobraDoMes: vigente?.sobra ?? null, sobraAdiada: vigente?.adiada ?? null,
    carregando: habilitada && !!userId && (!vigente || vigente.carregando),
    erro: vigente?.erro ?? false, semConexao: vigente?.semConexao ?? false, adiar, confirmar, recarregar: () => setRevisao(n => n + 1),
  };
}
