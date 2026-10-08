import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { consultarAdmin, ErroAdmin, reciboLocal, type AcessoAdmin, type RespostaAdmin, type VisaoAdmin } from '@/lib/admin-web';
import { criarPrazoAdmin, type PrazoAdmin } from '@/lib/admin-auth-web';
import AdminVisual from './AdminVisual.web';

type Etapa = 'carregando' | 'sem-sessao' | 'nao-admin' | 'cadastrar-totp' | 'pedir-totp' | 'pronto' | 'erro' | 'limite';
type Fator = { id: string; qr?: string; segredo?: string };
export default function PainelAdmin() {
  const [etapa, setEtapa] = useState<Etapa>('carregando');
  const [erro, setErro] = useState<ErroAdmin | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [fator, setFator] = useState<Fator | null>(null);
  const [resumo, setResumo] = useState<RespostaAdmin<VisaoAdmin> | null>(null);
  const versao = useRef(0);
  const operacao = useRef(false);
  const fatorMemoria = useRef<Fator | null>(null);
  const autorMemoria = useRef<string | null>(null);
  const conferirRef = useRef<() => Promise<void>>(async () => {});

  const limpar = useCallback(() => {
    versao.current++;
    fatorMemoria.current = null;
    autorMemoria.current = null;
    setFator(null); setResumo(null); setCodigo(''); setSenha(''); setErro(null);
  }, []);

  const falhou = (error: unknown, mensagem: string) => {
    const recibo = error instanceof ErroAdmin ? error : reciboLocal('autenticacao', mensagem);
    // Só código e referência. Nunca mensagem crua do Auth, QR, segredo ou sessão.
    console.warn('[admin-web]', recibo.codigo, recibo.ocorrencia);
    setErro(recibo);
    return recibo;
  };

  const conferir = useCallback(async (prazo: PrazoAdmin = criarPrazoAdmin()) => {
    const atual = ++versao.current;
    setResumo(null); setErro(null); setEtapa('carregando');
    try {
      const { data, error } = await prazo.aguardar(() => supabase.auth.getSession());
      if (error) throw reciboLocal('sessao', 'Não foi possível conferir sua sessão. Tente de novo.');
      if (atual !== versao.current) return;
      if (!data.session) { limpar(); setEtapa('sem-sessao'); return; }
      if (autorMemoria.current !== data.session.user.id) {
        fatorMemoria.current = null; setFator(null); setCodigo('');
        autorMemoria.current = data.session.user.id;
      }
      const acesso = await prazo.aguardar(() => consultarAdmin<AcessoAdmin>('acesso'));
      if (atual !== versao.current) return;
      if (!acesso.dados.admin) { fatorMemoria.current = null; setFator(null); setEtapa('nao-admin'); return; }
      if (acesso.dados.aal === 'aal2' && acesso.dados.totp === 'verificado') {
        try {
          const dados = await prazo.aguardar(() => consultarAdmin<VisaoAdmin>('visao-geral'));
          if (atual !== versao.current) return;
          fatorMemoria.current = null; setFator(null); setCodigo(''); setResumo(dados); setEtapa('pronto'); return;
        } catch (error) {
          // Um aal2 de outro fator não substitui o TOTP exigido pelo servidor.
          if (!(error instanceof ErroAdmin) || error.codigo !== 'mfa-necessario') throw error;
          if (atual !== versao.current) return;
        }
      }
      const factors = await prazo.aguardar(() => supabase.auth.mfa.listFactors());
      if (factors.error) throw reciboLocal('mfa', 'Não foi possível conferir seu autenticador. Tente de novo.');
      if (atual !== versao.current) return;
      const verificado = factors.data.totp.find((f) => f.status === 'verified');
      if (verificado) {
        fatorMemoria.current = { id: verificado.id }; setFator(fatorMemoria.current); setEtapa('pedir-totp'); return;
      }
      if (fatorMemoria.current?.segredo) { setFator(fatorMemoria.current); setEtapa('cadastrar-totp'); return; }
      // Retomada após recarregar: um fator não verificado não permite recuperar
      // seu QR. Remover somente o cadastro incompleto deste painel, nunca outro fator.
      for (const incompleto of factors.data.all.filter((f) => f.factor_type === 'totp' && f.status !== 'verified' && f.friendly_name === 'Grana Admin')) {
        if (atual !== versao.current) return;
        const removido = await prazo.aguardar(() => supabase.auth.mfa.unenroll({ factorId: incompleto.id }));
        if (removido.error) throw reciboLocal('mfa', 'Não foi possível retomar o cadastro do autenticador. Tente de novo.');
      }
      if (atual !== versao.current) return;
      const cadastro = await prazo.aguardar(() => supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Grana Admin', issuer: 'Grana.' }));
      if (cadastro.error) throw reciboLocal('mfa', 'Não foi possível cadastrar seu autenticador. Tente de novo.');
      if (atual !== versao.current) return;
      fatorMemoria.current = { id: cadastro.data.id, qr: cadastro.data.totp.qr_code, segredo: cadastro.data.totp.secret };
      setFator(fatorMemoria.current); setEtapa('cadastrar-totp');
    } catch (error) {
      if (atual !== versao.current) return;
      const recibo = falhou(error, 'Não foi possível conferir o acesso. Tente de novo.');
      setEtapa(recibo.codigo === 'limite' ? 'limite' : recibo.codigo === 'nao-autorizado' ? 'nao-admin' : 'erro');
    }
  }, [limpar]);
  conferirRef.current = conferir;

  useEffect(() => {
    void conferir();
    // O callback é síncrono: chamar Auth aguardando aqui causa lock no SDK.
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') { limpar(); setEtapa('sem-sessao'); }
      else if (evento === 'SIGNED_IN' || evento === 'TOKEN_REFRESHED' || evento === 'MFA_CHALLENGE_VERIFIED' || evento === 'USER_UPDATED') {
        // Limpa imediatamente antes de revalidar, inclusive ao trocar de conta.
        versao.current++; setResumo(null);
        if (!operacao.current) queueMicrotask(() => void conferirRef.current());
      }
    });
    const limparAoSairDaPagina = () => { limpar(); setEtapa('carregando'); };
    const reabrir = () => void conferirRef.current();
    window.addEventListener('pagehide', limparAoSairDaPagina);
    window.addEventListener('pageshow', reabrir);
    return () => { data.subscription.unsubscribe(); window.removeEventListener('pagehide', limparAoSairDaPagina); window.removeEventListener('pageshow', reabrir); versao.current++; };
  }, [conferir, limpar]);

  async function entrar(event: FormEvent) {
    event.preventDefault();
    if (operacao.current) return;
    const prazo = criarPrazoAdmin();
    operacao.current = true; setOcupado(true); setErro(null);
    try {
      const result = await prazo.aguardar(() => supabase.auth.signInWithPassword({ email: email.trim(), password: senha }));
      setSenha('');
      if (result.error) throw reciboLocal('login', 'Não foi possível entrar. Confira seu e-mail e senha ou tente novamente.');
      await conferir(prazo);
    } catch (error) { falhou(error, 'Não foi possível entrar. Tente de novo.'); }
    finally { prazo.encerrar(); operacao.current = false; setOcupado(false); }
  }

  async function verificar(event: FormEvent) {
    event.preventDefault();
    if (operacao.current || !fator || !/^\d{6}$/.test(codigo)) return;
    const prazo = criarPrazoAdmin();
    operacao.current = true; setOcupado(true); setErro(null);
    try {
      const desafio = await prazo.aguardar(() => supabase.auth.mfa.challenge({ factorId: fator.id }));
      if (desafio.error) throw reciboLocal('mfa', 'Não foi possível iniciar a verificação. Tente de novo.');
      const result = await prazo.aguardar(() => supabase.auth.mfa.verify({ factorId: fator.id, challengeId: desafio.data.id, code: codigo }));
      setCodigo('');
      if (result.error) throw reciboLocal('totp', 'Não foi possível confirmar o código. Confira o autenticador e tente de novo.');
      fatorMemoria.current = null; setFator(null);
      await conferir(prazo);
    } catch (error) { falhou(error, 'Não foi possível verificar o autenticador. Tente de novo.'); }
    finally { prazo.encerrar(); operacao.current = false; setOcupado(false); }
  }

  async function sair() {
    if (operacao.current) return;
    const prazo = criarPrazoAdmin();
    operacao.current = true; setOcupado(true); limpar(); setEtapa('carregando');
    try {
      const { error } = await prazo.aguardar(() => supabase.auth.signOut());
      if (error) throw reciboLocal('sair', 'Não foi possível encerrar a sessão. Tente sair novamente.');
      setEtapa('sem-sessao');
    } catch (error) { falhou(error, 'Não foi possível encerrar a sessão.'); setEtapa('erro'); }
    finally { prazo.encerrar(); operacao.current = false; setOcupado(false); }
  }

  return <AdminVisual etapa={etapa} erro={erro} ocupado={ocupado}
    email={email} senha={senha} codigo={codigo} fator={fator} resumo={resumo}
    onEmailChange={setEmail} onSenhaChange={setSenha}
    onCodigoChange={(valor) => setCodigo(valor.replace(/\D/g, '').slice(0, 6))}
    onEntrar={entrar} onVerificar={verificar}
    onSair={() => void sair()} onAtualizar={() => void conferir()} />;
}
