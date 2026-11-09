import { Platform } from 'react-native';
import { supabase } from './supabase';
import { buscarTodasAsPaginas } from './paginacao';
import { montarCsvLancamentos, type PeriodoCsv } from './exportar-lancamentos-csv';
import type { Transaction, Wallet, CreditCard } from './types';

class ErroCsv extends Error {}

type Opcoes = { userId: string; carteiraId: string; periodo: PeriodoCsv };

/** Cópia consultada no servidor; pendentes locais não são anunciados como sincronizados. */
export async function exportarLancamentosCsv(opcoes: Opcoes): Promise<{ quantidade: number; nomeArquivo: string }> {
  if (opcoes.periodo !== 'tudo' && !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(opcoes.periodo)) throw new ErroCsv('Período inválido.');
  const { data, error } = await supabase.auth.getSession();
  const sessao = data.session;
  if (error || !sessao?.access_token || sessao.user.id !== opcoes.userId) throw new ErroCsv('Confirme a conta antes de exportar.');
  const token = sessao.access_token;
  let mudou = false;
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_evento, atual) => {
    if (atual?.user.id !== opcoes.userId || atual?.access_token !== token) mudou = true;
  });
  async function conferirSessao() {
    const atual = await supabase.auth.getSession();
    if (mudou || atual.error || atual.data.session?.user.id !== opcoes.userId || atual.data.session?.access_token !== token) {
      throw new ErroCsv('A conta ou a sessão mudou. Peça uma nova exportação.');
    }
  }
  async function validar() {
    await conferirSessao();
    const usuario = await supabase.auth.getUser(token);
    if (usuario.error || usuario.data.user?.id !== opcoes.userId) throw new ErroCsv('Confirme seu login para exportar.');
    const acesso = await supabase.rpc('obter_estado_acesso').setHeader('Authorization', `Bearer ${token}`);
    if (acesso.error || acesso.data?.allowed !== true) throw new ErroCsv('Não foi possível confirmar seu acesso. Verifique a conexão ou solicite seus dados pelo suporte.');
    const prazo = Math.max(...[acesso.data.access_until, acesso.data.status === 'past_due' ? acesso.data.grace_until : null]
      .map(v => typeof v === 'string' ? Date.parse(v) : NaN).filter(Number.isFinite));
    if (acesso.data.enforced && Number.isFinite(prazo) && prazo <= Date.now()) throw new ErroCsv('Seu acesso venceu. Solicite seus dados pelo suporte.');
    await conferirSessao();
  }
  async function consultar<T>(tabela: 'transactions' | 'wallets' | 'credit_cards'): Promise<T[]> {
    return buscarTodasAsPaginas<T>(async (de, ate) => {
      await conferirSessao();
      let q = supabase.from(tabela).select('*').eq('user_id', opcoes.userId).order('id', { ascending: true }).range(de, ate);
      if (tabela === 'transactions' && opcoes.periodo !== 'tudo') {
        const [ano, mes] = opcoes.periodo.split('-').map(Number);
        const seguinte = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`;
        q = q.gte('occurred_on', opcoes.periodo + '-01').lt('occurred_on', seguinte + '-01');
      }
      const resposta = await q.setHeader('Authorization', `Bearer ${token}`);
      await conferirSessao();
      return resposta;
    });
  }
  try {
    await validar();
    const lancamentos = await consultar<Transaction>('transactions');
    const carteiras = await consultar<Wallet>('wallets');
    const cartoes = await consultar<CreditCard>('credit_cards');
    if ([...lancamentos, ...carteiras, ...cartoes].some(l => l.user_id !== opcoes.userId)) throw new ErroCsv('A conta da consulta mudou. Exporte novamente.');
    const csv = montarCsvLancamentos({ ...opcoes, lancamentos, carteiras, cartoes });
    if (Platform.OS === 'web') {
      await validar();
      const url = URL.createObjectURL(new Blob([csv.conteudo], { type: 'text/csv;charset=utf-8' }));
      try {
        const link = globalThis.document.createElement('a');
        link.href = url;
        link.download = csv.nomeArquivo;
        link.click();
      } finally { setTimeout(() => URL.revokeObjectURL(url), 10_000); }
    } else {
      const [{ File, Paths }, Sharing, { randomUUID }] = await Promise.all([
        import('expo-file-system'), import('expo-sharing'), import('expo-crypto'),
      ]);
      if (!await Sharing.isAvailableAsync()) throw new ErroCsv('O compartilhamento está indisponível neste aparelho. Tente novamente ou exporte pela web.');
      await validar();
      const arquivo = new File(Paths.cache, csv.nomeArquivo.replace(/\.csv$/, `-${randomUUID()}.csv`));
      let entregue = false;
      try {
        arquivo.create();
        arquivo.write(csv.conteudo);
        await validar();
        await Sharing.shareAsync(arquivo.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Exportar lançamentos do Grana.' });
        entregue = true;
        // O receptor pode ler a URI depois de a folha fechar; o cache mantém esta cópia única.
      } finally {
        if (!entregue && arquivo.exists) arquivo.delete();
      }
    }
    return { quantidade: csv.quantidade, nomeArquivo: csv.nomeArquivo };
  } catch (erro) {
    console.warn('[csv] exportação não concluída');
    throw erro instanceof ErroCsv ? erro : new ErroCsv('Não foi possível preparar o CSV. Confira a conexão e tente novamente.');
  } finally { subscription.unsubscribe(); }
}
