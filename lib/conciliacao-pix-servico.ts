import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { supabase } from './supabase';
import { buscarTodasAsPaginas } from './paginacao';
import { conciliarPix, lerExtratoConciliacao, type ResultadoPix } from './conciliacao-pix';
import { marcarLancamentosAlterados } from './lancamentos-alterados';
import { invalidarRespostasAtrasadas } from './cache-de-tela';
import { notificarDadosDosWidgetsAlterados } from './widgets-home-events';
import type { Transaction, Wallet } from './types';

export type AnalisePix = { userId: string; carteiraId: string; resultados: ResultadoPix[]; cancelar: () => void };
export type EscolhaPix = { id: string; categoria: string; cor: string };
export type ReciboPix = { id: string; status: 'salvo' | 'conflito' | 'erro'; mensagem: string };
class ErroPix extends Error {}
type SessaoAnalise = { token: string; conferir: () => Promise<void> };
const sessoes = new WeakMap<AnalisePix, SessaoAnalise>();
const camposSnapshot = ['occurred_on', 'amount', 'type', 'description', 'category', 'color', 'wallet_id', 'card_id', 'payment_method', 'fitid', 'recurring', 'parent_id', 'installment_current', 'installment_total'] as const;
const snapshot = (t: Transaction) => Object.fromEntries(camposSnapshot.map(k => [k, t[k] ?? null]));

export async function analisarExtratoPix(op: { userId: string; carteiraId: string; origemConta: string; texto: string }): Promise<AnalisePix> {
  // Só o parser local recebe o texto; consultas abaixo não contêm o extrato nem a origem digitada.
  const linhas = lerExtratoConciliacao(op.texto);
  if (op.origemConta.trim().length < 3 || op.origemConta.length > 100) throw new ErroPix('Informe o banco e um apelido desta conta para reconhecer reimportações.');
  const inicial = await supabase.auth.getSession();
  const token = inicial.data.session?.access_token;
  if (inicial.error || !token || inicial.data.session?.user.id !== op.userId) throw new ErroPix('Confirme a conta para conferir o extrato.');
  let cancelada = false;
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_evento, atual) => {
    if (atual?.user.id !== op.userId || atual?.access_token !== token) cancelada = true;
  });
  async function conferir() {
    const atual = await supabase.auth.getSession();
    if (cancelada || atual.error || atual.data.session?.user.id !== op.userId || atual.data.session?.access_token !== token) throw new ErroPix('A conta ou a sessão mudou. Escolha o extrato novamente.');
  }
  try {
    await conferir();
    const usuario = await supabase.auth.getUser(token);
    if (usuario.error || usuario.data.user?.id !== op.userId) throw new ErroPix('Confirme seu login para conferir o extrato.');
    const acesso = await supabase.rpc('obter_estado_acesso').setHeader('Authorization', `Bearer ${token}`);
    if (acesso.error || acesso.data?.allowed !== true) throw new ErroPix('Não foi possível confirmar seu acesso. Verifique a conexão e tente novamente.');
    async function ler<T>(tabela: 'wallets' | 'transactions') {
      return buscarTodasAsPaginas<T>(async (de, ate) => {
        await conferir();
        const r = await supabase.from(tabela).select('*').eq('user_id', op.userId).order('id', { ascending: true })
          .range(de, ate).setHeader('Authorization', `Bearer ${token}`);
        await conferir(); return r;
      });
    }
    const carteiras = await ler<Wallet>('wallets');
    if (carteiras.some(w => w.user_id !== op.userId) || !carteiras.some(w => w.id === op.carteiraId)) throw new ErroPix('A carteira mudou. Escolha novamente.');
    const principal = carteiras.filter(w => w.is_default).sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];
    if (!principal) throw new ErroPix('Não foi possível identificar a carteira Principal.');
    const lancamentos = await ler<Transaction>('transactions');
    if (lancamentos.some(t => t.user_id !== op.userId)) throw new ErroPix('A conta da consulta mudou. Confira novamente.');
    const hash = (s: string) => digestStringAsync(CryptoDigestAlgorithm.SHA256, s);
    const origem = await hash(JSON.stringify([op.userId, op.carteiraId, op.origemConta.normalize('NFKC').trim().toLowerCase()]));
    for (const l of linhas) {
      const identidade = l.idBanco ? ['id', l.idBanco] : ['linha', l.data, l.direcao, l.centavos, l.descricao.normalize('NFKC').trim().toLowerCase()];
      l.fitid = 'pix1:' + origem + ':' + await hash(JSON.stringify(identidade));
    }
    await conferir();
    const analise: AnalisePix = { userId: op.userId, carteiraId: op.carteiraId,
      resultados: conciliarPix({ userId: op.userId, carteiraId: op.carteiraId, principalId: principal.id, linhas, lancamentos }),
      cancelar() { cancelada = true; subscription.unsubscribe(); sessoes.delete(analise); analise.resultados.length = 0; },
    };
    sessoes.set(analise, { token, conferir });
    return analise;
  } catch (erro) {
    subscription.unsubscribe(); console.warn('[conciliacao] análise não concluída');
    throw erro instanceof ErroPix ? erro : new ErroPix('Não foi possível conferir o extrato. Verifique a conexão e tente novamente.');
  }
}

/** Apenas seleções explícitas elegíveis; cada RPC revalida estado e duplicatas no servidor. */
export async function confirmarItensPix(analise: AnalisePix, escolhas: EscolhaPix[]): Promise<ReciboPix[]> {
  const sessao = sessoes.get(analise);
  if (!sessao) throw new ErroPix('A conferência foi encerrada. Escolha o extrato novamente.');
  if (new Set(escolhas.map(e => e.id)).size !== escolhas.length) throw new ErroPix('O mesmo item foi selecionado mais de uma vez.');
  const planos = escolhas.map(e => {
    const r = analise.resultados.find(r => r.linha.id === e.id);
    if (!r || !['falta', 'data'].includes(r.status) || r.linha.natureza !== 'movimento') throw new ErroPix('Um item precisa ser revisto antes de confirmar.');
    if (r.status === 'falta' && (!e.categoria.trim() || e.categoria.length > 60 || !/^#[0-9a-fA-F]{6}$/.test(e.cor))) throw new ErroPix('Escolha a categoria dos itens novos antes de confirmar.');
    return { e, r };
  });
  const recibos: ReciboPix[] = [];
  for (const { e, r } of planos) {
    try {
      await sessao.conferir();
      const l = r.linha;
      const { data, error } = await supabase.rpc('confirmar_conciliacao_pix', { p_item: {
        wallet_id: analise.carteiraId, chave: l.fitid, operacao: r.status === 'falta' ? 'novo' : 'data',
        data: l.data, centavos: l.centavos, direcao: l.direcao, descricao: l.descricao, categoria: e.categoria, cor: e.cor,
        alvo_id: r.alvo?.id ?? null, esperado: r.alvo ? snapshot(r.alvo) : null,
      } }).setHeader('Authorization', `Bearer ${sessao.token}`);
      await sessao.conferir();
      if (error) {
        if (error.code === 'PGRST202' || error.code === '42501') throw new ErroPix('A confirmação não está disponível para esta conta. Procure o suporte; o item continua aguardando conferência.');
        throw new ErroPix('Não foi possível confirmar o resultado. Confira o item e tente novamente; a mesma chave será usada.');
      }
      if (data?.situacao === 'conflito') recibos.push({ id: e.id, status: 'conflito', mensagem: 'O lançamento mudou ou há mais de uma correspondência. Confira novamente.' });
      else if (['inserido','corrigido','ja_confirmado'].includes(data?.situacao) && typeof data?.id === 'string') recibos.push({ id: e.id, status: 'salvo', mensagem: data.situacao === 'corrigido' ? 'Data corrigida no lançamento existente.' : 'Lançamento confirmado.' });
      else throw new ErroPix('O servidor não confirmou o item. Confira antes de tentar de novo.');
    } catch (erro) {
      console.warn('[conciliacao] item sem confirmação');
      recibos.push({ id: e.id, status: 'erro', mensagem: erro instanceof ErroPix ? erro.message : 'Resultado não confirmado. Confira e tente novamente com a mesma conta.' });
    }
  }
  if (recibos.some(r => r.status === 'salvo')) {
    try { marcarLancamentosAlterados(); invalidarRespostasAtrasadas(); notificarDadosDosWidgetsAlterados(); }
    catch { console.warn('[conciliacao] confirmação salva; tela precisa ser recarregada'); }
  }
  return recibos;
}
