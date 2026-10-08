import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Head from 'expo-router/head';
import { supabase } from '@/lib/supabase';
import { consultarAdmin, ErroAdmin, reciboLocal, type AcessoAdmin, type RespostaAdmin, type VisaoAdmin } from '@/lib/admin-web';
import './painel-admin.css';

type Etapa = 'carregando' | 'sem-sessao' | 'nao-admin' | 'cadastrar-totp' | 'pedir-totp' | 'pronto' | 'erro' | 'limite';
type Fator = { id: string; qr?: string; segredo?: string };
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const numero = (value: number) => Number.isFinite(value) ? value.toLocaleString('pt-BR') : 'Não disponível';

function Cartao({ titulo, periodo, lido, indisponivel, children }: {
  titulo: string; periodo: string; lido: string; indisponivel?: boolean; children: ReactNode;
}) {
  return <section className="admin-cartao" aria-label={titulo}>
    <header><h2>{titulo}</h2><span>{periodo}</span></header>
    {indisponivel ? <p role="status" className="admin-indisponivel">Não foi possível ler este bloco. Atualize para tentar novamente.</p> : children}
    <footer>Lido às {hora(lido)}</footer>
  </section>;
}

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

  const conferir = useCallback(async () => {
    const atual = ++versao.current;
    setResumo(null); setErro(null); setEtapa('carregando');
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw reciboLocal('sessao', 'Não foi possível conferir sua sessão. Tente de novo.');
      if (atual !== versao.current) return;
      if (!data.session) { limpar(); setEtapa('sem-sessao'); return; }
      if (autorMemoria.current !== data.session.user.id) {
        fatorMemoria.current = null; setFator(null); setCodigo('');
        autorMemoria.current = data.session.user.id;
      }
      const acesso = await consultarAdmin<AcessoAdmin>('acesso');
      if (atual !== versao.current) return;
      if (!acesso.dados.admin) { fatorMemoria.current = null; setFator(null); setEtapa('nao-admin'); return; }
      if (acesso.dados.aal === 'aal2') {
        const dados = await consultarAdmin<VisaoAdmin>('visao-geral');
        if (atual !== versao.current) return;
        fatorMemoria.current = null; setFator(null); setCodigo(''); setResumo(dados); setEtapa('pronto'); return;
      }
      const factors = await supabase.auth.mfa.listFactors();
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
        const removido = await supabase.auth.mfa.unenroll({ factorId: incompleto.id });
        if (removido.error) throw reciboLocal('mfa', 'Não foi possível retomar o cadastro do autenticador. Tente de novo.');
      }
      if (atual !== versao.current) return;
      const cadastro = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Grana Admin', issuer: 'Grana.' });
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
    operacao.current = true; setOcupado(true); setErro(null);
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
      setSenha('');
      if (result.error) throw reciboLocal('login', 'Não foi possível entrar. Confira seu e-mail e senha ou tente novamente.');
      await conferir();
    } catch (error) { falhou(error, 'Não foi possível entrar. Tente de novo.'); }
    finally { operacao.current = false; setOcupado(false); }
  }

  async function verificar(event: FormEvent) {
    event.preventDefault();
    if (operacao.current || !fator || !/^\d{6}$/.test(codigo)) return;
    operacao.current = true; setOcupado(true); setErro(null);
    try {
      const desafio = await supabase.auth.mfa.challenge({ factorId: fator.id });
      if (desafio.error) throw reciboLocal('mfa', 'Não foi possível iniciar a verificação. Tente de novo.');
      const result = await supabase.auth.mfa.verify({ factorId: fator.id, challengeId: desafio.data.id, code: codigo });
      setCodigo('');
      if (result.error) throw reciboLocal('totp', 'Não foi possível confirmar o código. Confira o autenticador e tente de novo.');
      fatorMemoria.current = null; setFator(null);
      await conferir();
    } catch (error) { falhou(error, 'Não foi possível verificar o autenticador. Tente de novo.'); }
    finally { operacao.current = false; setOcupado(false); }
  }

  async function sair() {
    if (operacao.current) return;
    operacao.current = true; setOcupado(true); limpar(); setEtapa('carregando');
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw reciboLocal('sair', 'Não foi possível encerrar a sessão. Tente sair novamente.');
      setEtapa('sem-sessao');
    } catch (error) { falhou(error, 'Não foi possível encerrar a sessão.'); setEtapa('erro'); }
    finally { operacao.current = false; setOcupado(false); }
  }

  const d = resumo?.dados;
  const qr = fator?.qr?.startsWith('data:image/svg+xml') ? fator.qr : fator?.qr ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fator.qr)}` : undefined;
  const autenticando = etapa === 'cadastrar-totp' || etapa === 'pedir-totp';
  return <main className="admin-pagina">
    <Head><title>Painel administrativo | Grana.</title><meta name="robots" content="noindex, nofollow" /></Head>
    <div className="admin-conteudo">
      <header className="admin-topo">
        <img src="/admin-marca.svg" alt="Grana." width="120" height="36" />
        <span className="admin-identificacao">Painel administrativo</span>
        {etapa !== 'sem-sessao' && <button type="button" className="admin-secundario" disabled={ocupado} onClick={() => void sair()}>Sair</button>}
      </header>
      <div className="admin-cabecalho"><p className="admin-sobretitulo">Grana. por dentro</p><h1>{etapa === 'pronto' ? 'Visão geral' : 'Seu acesso ao painel'}</h1><p>Consulta dos números agregados do Grana.</p></div>
      {erro && <section role="alert" className="admin-recibo"><h2>{erro.codigo === 'limite' ? 'Limite de consultas' : 'Não foi possível concluir'}</h2><p>{erro.message}</p><p className="admin-referencia">Às {hora(erro.hora)} · Referência {erro.ocorrencia}</p>{(etapa === 'erro' || etapa === 'limite') && <button className="admin-primario" disabled={ocupado} onClick={() => void conferir()}>Tentar de novo</button>}</section>}
      {etapa === 'carregando' && <section className="admin-acesso" role="status"><h2>Conferindo seu acesso…</h2><p>Aguarde a resposta do servidor.</p></section>}
      {etapa === 'sem-sessao' && <section className="admin-acesso"><h2>Entre na sua conta</h2><p>Use a conta autorizada para consultar o painel.</p><form onSubmit={entrar}>
        <label htmlFor="admin-email">E-mail</label><input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={ocupado} />
        <label htmlFor="admin-senha">Senha</label><input id="admin-senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} disabled={ocupado} />
        <button className="admin-primario" disabled={ocupado}>{ocupado ? 'Entrando…' : erro ? 'Tentar de novo' : 'Entrar'}</button>
      </form></section>}
      {etapa === 'nao-admin' && <section className="admin-acesso" role="status"><h2>Esta conta não tem acesso ao painel.</h2><p>Saia para entrar com outra conta.</p><button className="admin-primario" disabled={ocupado} onClick={() => void sair()}>Sair</button></section>}
      {autenticando && <section className="admin-acesso"><h2>{etapa === 'cadastrar-totp' ? 'Cadastre seu autenticador' : 'Confirme seu acesso'}</h2>
        <p>{etapa === 'cadastrar-totp' ? 'Escaneie o QR no seu autenticador e informe o código de seis dígitos.' : 'Informe o código de seis dígitos do seu autenticador.'}</p>
        {etapa === 'cadastrar-totp' && <><img className="admin-qr" src={qr} alt="QR para cadastrar o autenticador" width="200" height="200" /><details><summary>Usar código de configuração</summary><p className="admin-segredo">{fator?.segredo}</p></details></>}
        <form onSubmit={verificar}><label htmlFor="admin-totp">Código do autenticador</label><input id="admin-totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={ocupado} /><button className="admin-primario" disabled={ocupado || codigo.length !== 6}>{ocupado ? 'Conferindo…' : erro ? 'Tentar de novo' : 'Confirmar código'}</button></form>
      </section>}
      {etapa === 'pronto' && resumo && d && <>
        <div className="admin-leitura"><p>Leitura de {new Date(resumo.geradoEm).toLocaleDateString('pt-BR')} às {hora(resumo.geradoEm)}</p><button className="admin-secundario" disabled={ocupado} onClick={() => void conferir()}>Atualizar números</button></div>
        <div className="admin-grade">
          <Cartao titulo="Contas" periodo="Total e novos cadastros" lido={resumo.geradoEm} indisponivel={d.contas.indisponivel}><p className="admin-numero">{numero(d.contas.total)}</p><dl><div><dt>Novas em 7 dias</dt><dd>{numero(d.contas.novas7d)}</dd></div><div><dt>Novas em 30 dias</dt><dd>{numero(d.contas.novas30d)}</dd></div></dl></Cartao>
          <Cartao titulo="Assinaturas" periodo="Ativas agora" lido={resumo.geradoEm} indisponivel={d.assinaturas.indisponivel}><p className="admin-numero">{numero(d.assinaturas.ativas)}</p><dl><div><dt>Mensal / anual</dt><dd>{numero(d.assinaturas.porPlano.mensal)} / {numero(d.assinaturas.porPlano.anual)}</dd></div><div><dt>Venda / cortesia</dt><dd>{numero(d.assinaturas.porOrigem.venda)} / {numero(d.assinaturas.porOrigem.cortesia)}</dd></div></dl></Cartao>
          <Cartao titulo="Receita" periodo="Vendas confirmadas em 30 dias" lido={resumo.geradoEm} indisponivel={d.receita.indisponivel}>{d.receita.disponivel && d.receita.soma30d !== null ? <p className="admin-numero admin-moeda">{d.receita.soma30d.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p> : <p className="admin-indisponivel">Não disponível nesta versão.</p>}</Cartao>
          <Cartao titulo="App" periodo="Versão anunciada" lido={resumo.geradoEm} indisponivel={d.app.indisponivel}><p className="admin-numero">{d.app.versaoAnunciada ?? 'Não disponível'}</p><p>{d.app.anunciadaEm ? `Anunciada em ${new Date(d.app.anunciadaEm).toLocaleDateString('pt-BR')}` : 'Sem data de anúncio disponível.'}</p></Cartao>
          <Cartao titulo="Uso" periodo="Voz em 7 dias e notificações agora" lido={resumo.geradoEm} indisponivel={d.uso.indisponivel}><dl><div><dt>Lançamentos por voz</dt><dd>{numero(d.uso.voz7d)}</dd></div><div><dt>Aparelhos com notificação ativa</dt><dd>{numero(d.uso.aparelhosComNotificacao)}</dd></div></dl></Cartao>
          <Cartao titulo="Saúde" periodo="Esta consulta" lido={resumo.geradoEm}><p className="admin-numero">{hora(resumo.geradoEm)}</p><p>Resposta da função</p><p>Versão do contrato: {resumo.contrato}</p></Cartao>
        </div>
      </>}
      <footer className="admin-rodape">Grana. · Painel de consulta</footer>
    </div>
  </main>;
}
