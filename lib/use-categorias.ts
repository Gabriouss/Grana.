import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from './auth-context';
import { consultarCategorias, type CategoriasConsultadas } from './categorias-cliente';
import { apurarGastosCategoria, type Visao } from './gastos-categoria';
import { useRecarregarAoChegarDadoNovo } from '@/components/FaixaOffline';
import type { Transaction } from './types';

export function useCategorias(inicio: string, fim: string, demo: boolean, linhasDemo: Transaction[], ativo = true) {
  const { session } = useSession();
  const userId = demo ? 'demo' : session?.user.id;
  const [resultado, setResultado] = useState<CategoriasConsultadas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const anterior = useRef<CategoriasConsultadas | null>(null);
  const geracao = useRef(0);
  const carregar = useCallback(async () => {
    const atual = ++geracao.current;
    if (!ativo) { setCarregando(false); return; }
    setCarregando(true);
    if (demo) {
      setResultado({ userId: 'demo', inicio, fim, atualizadoEm: new Date().toISOString(), linhas: linhasDemo, consumo: apurarGastosCategoria(linhasDemo, { inicio, fim }), doCache: false });
      setErro(null); setCarregando(false); return;
    }
    try {
      const r = await consultarCategorias(inicio, fim, anterior.current);
      if (atual !== geracao.current) return;
      anterior.current = r.resultado;
      setResultado(r.resultado); setErro(r.erro);
    } catch (e) {
      console.error('[categorias] sessão indisponível', e);
      if (atual === geracao.current) setErro('Não foi possível consultar as categorias.');
    } finally { if (atual === geracao.current) setCarregando(false); }
  }, [inicio, fim, demo, linhasDemo, userId, ativo]);
  useFocusEffect(useCallback(() => { void carregar(); return () => { geracao.current++; }; }, [carregar]));
  useRecarregarAoChegarDadoNovo(() => { void carregar(); });
  const resultadoDoPeriodo = resultado?.userId === userId && resultado.inicio === inicio && resultado.fim === fim ? resultado : null;
  return { resultado: resultadoDoPeriodo, erro, carregando, carregar };
}

export function useVisaoCategorias() {
  const { session } = useSession();
  const userId = session?.user.id;
  const [preferencia, setPreferencia] = useState<{ userId?: string; visao: Visao }>({ visao: 'tudo' });
  useEffect(() => {
    let ativo = true;
    if (userId) AsyncStorage.getItem(`grana:categorias:visao:${userId}`).then(v => {
      if (ativo) setPreferencia({ userId, visao: v === 'avista' || v === 'credito' ? v : 'tudo' });
    }).catch(e => console.error('[categorias] leitura da preferência falhou', e));
    return () => { ativo = false; };
  }, [userId]);
  const mudar = (visao: Visao) => {
    setPreferencia({ userId, visao });
    if (userId) AsyncStorage.setItem(`grana:categorias:visao:${userId}`, visao).catch(e => console.error('[categorias] preferência não foi guardada', e));
  };
  return { visao: preferencia.userId === userId ? preferencia.visao : 'tudo' as Visao, mudar };
}
