import Head from 'expo-router/head';
import type { FormEvent, ReactNode } from 'react';
import type { ErroAdmin, RespostaAdmin, VisaoAdmin } from '@/lib/admin-web';
import './admin-visual.css';

export type EtapaAdminVisual =
  | 'carregando'
  | 'sem-sessao'
  | 'nao-admin'
  | 'cadastrar-totp'
  | 'pedir-totp'
  | 'pronto'
  | 'erro'
  | 'limite';

export type AdminVisualProps = {
  etapa: EtapaAdminVisual;
  erro: ErroAdmin | null;
  ocupado: boolean;
  email: string;
  senha: string;
  codigo: string;
  fator: { qr?: string; segredo?: string } | null;
  resumo: RespostaAdmin<VisaoAdmin> | null;
  onEmailChange: (valor: string) => void;
  onSenhaChange: (valor: string) => void;
  onCodigoChange: (valor: string) => void;
  onEntrar: (evento: FormEvent<HTMLFormElement>) => void;
  onVerificar: (evento: FormEvent<HTMLFormElement>) => void;
  onSair: () => void;
  onAtualizar: () => void;
};

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const numero = (valor: number) => Number.isFinite(valor) ? valor.toLocaleString('pt-BR') : 'Não disponível';

type BlocoVisual<T> = (T & { indisponivel?: boolean }) | { indisponivel: true };

function blocoIndisponivel<T>(bloco: BlocoVisual<T>): boolean {
  return 'indisponivel' in bloco && bloco.indisponivel === true;
}

function CartaoMetrica<T>({
  id, titulo, periodo, lido, bloco, children,
}: {
  id: string;
  titulo: string;
  periodo: string;
  lido: string;
  bloco?: BlocoVisual<T>;
  children: ReactNode | ((dados: T) => ReactNode);
}) {
  const conteudo = bloco && blocoIndisponivel(bloco)
    ? <p role="status" className="admin-visual__indisponivel">Não foi possível ler este bloco. Atualize para tentar novamente.</p>
    : bloco && typeof children === 'function'
      ? children(bloco as T)
      : children as ReactNode;

  return (
    <section className="admin-visual__cartao" aria-labelledby={`admin-cartao-${id}`}>
      <header className="admin-visual__cartao-cabecalho">
        <h2 id={`admin-cartao-${id}`}>{titulo}</h2>
        <p>{periodo}</p>
      </header>
      {conteudo}
      <footer className="admin-visual__cartao-rodape">Lido às <time dateTime={lido}>{hora(lido)}</time></footer>
    </section>
  );
}

function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  const texto = valor;
  const longo = texto.length >= 16;
  return <div className={`admin-visual__linha-resumo${longo ? ' admin-visual__linha-resumo-longa' : ''}`}><dt>{rotulo}</dt><dd>{valor}</dd></div>;
}

function ValorDestaque({ valor, classe = '' }: { valor: string; classe?: string }) {
  const longo = valor.length >= 16;
  return <p className={`admin-visual__numero${classe ? ` ${classe}` : ''}${longo ? ' admin-visual__numero-longo' : ''}`}>{valor}</p>;
}

export default function AdminVisual({
  etapa, erro, ocupado, email, senha, codigo, fator, resumo,
  onEmailChange, onSenhaChange, onCodigoChange, onEntrar, onVerificar, onSair, onAtualizar,
}: AdminVisualProps) {
  const dados = resumo?.dados;
  const autenticando = etapa === 'cadastrar-totp' || etapa === 'pedir-totp';
  const qr = fator?.qr?.startsWith('data:image/svg+xml')
    ? fator.qr
    : fator?.qr ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fator.qr)}` : undefined;

  return (
    <>
      <Head>
        <title>Painel administrativo | Grana.</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className="admin-visual">
        <a className="admin-visual__pular" href="#admin-titulo">Pular para o conteúdo</a>
        <div className="admin-visual__conteudo">
          <header className="admin-visual__topo">
            <div className="admin-visual__marca">
              <img src="/admin-marca.svg" alt="Grana." width="120" height="31" />
              <span>Painel administrativo</span>
            </div>
            {etapa !== 'sem-sessao' && (
              <button type="button" className="admin-visual__botao admin-visual__botao-secundario" disabled={ocupado} onClick={onSair}>
                Sair
              </button>
            )}
          </header>

          <div className="admin-visual__abertura">
            <p className="admin-visual__sobretitulo">Grana. por dentro</p>
            <h1 id="admin-titulo" tabIndex={-1}>{etapa === 'pronto' ? 'Visão geral' : 'Seu acesso ao painel'}</h1>
            <p>Consulta dos números agregados do Grana.</p>
          </div>

          <div className="admin-visual__principal">
            {erro && (
              <section role="alert" className="admin-visual__recibo" aria-labelledby="admin-erro-titulo">
                <h2 id="admin-erro-titulo">{erro.codigo === 'limite' ? 'Limite de consultas' : 'Não foi possível concluir'}</h2>
                <p>{erro.message}</p>
                <p className="admin-visual__referencia">Às {hora(erro.hora)} · Referência {erro.ocorrencia}</p>
                {(etapa === 'erro' || etapa === 'limite') && (
                  <button type="button" className="admin-visual__botao admin-visual__botao-primario" disabled={ocupado} onClick={onAtualizar}>
                    Tentar de novo
                  </button>
                )}
              </section>
            )}

            {etapa === 'carregando' && (
              <section className="admin-visual__acesso" role="status" aria-live="polite">
                <h2>Conferindo seu acesso…</h2>
                <p>Aguarde a resposta do servidor.</p>
              </section>
            )}

            {etapa === 'sem-sessao' && (
              <section className="admin-visual__acesso" aria-labelledby="admin-entrar-titulo">
                <h2 id="admin-entrar-titulo">Entre na sua conta</h2>
                <p>Use a conta autorizada para consultar o painel.</p>
                <form className="admin-visual__formulario" onSubmit={onEntrar}>
                  <label htmlFor="admin-email">E-mail</label>
                  <input
                    id="admin-email"
                    type="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    value={email}
                    onChange={(evento) => onEmailChange(evento.currentTarget.value)}
                    disabled={ocupado}
                  />
                  <label htmlFor="admin-senha">Senha</label>
                  <input
                    id="admin-senha"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={senha}
                    onChange={(evento) => onSenhaChange(evento.currentTarget.value)}
                    disabled={ocupado}
                  />
                  <button className="admin-visual__botao admin-visual__botao-primario" type="submit" disabled={ocupado}>
                    {ocupado ? 'Entrando…' : erro ? 'Tentar de novo' : 'Entrar'}
                  </button>
                </form>
              </section>
            )}

            {etapa === 'nao-admin' && (
              <section className="admin-visual__acesso" role="status" aria-labelledby="admin-sem-acesso-titulo">
                <h2 id="admin-sem-acesso-titulo">Esta conta não tem acesso ao painel.</h2>
                <p>Saia para entrar com outra conta.</p>
                <button type="button" className="admin-visual__botao admin-visual__botao-primario" disabled={ocupado} onClick={onSair}>
                  Sair
                </button>
              </section>
            )}

            {autenticando && (
              <section className="admin-visual__acesso" aria-labelledby="admin-totp-titulo">
                <h2 id="admin-totp-titulo">{etapa === 'cadastrar-totp' ? 'Cadastre seu autenticador' : 'Confirme seu acesso'}</h2>
                <p>{etapa === 'cadastrar-totp'
                  ? 'Escaneie o QR no seu autenticador e informe o código de seis dígitos.'
                  : 'Informe o código de seis dígitos do seu autenticador.'}</p>
                {etapa === 'cadastrar-totp' && (
                  <>
                    {qr && <img className="admin-visual__qr" src={qr} alt="QR para cadastrar o autenticador" width="200" height="200" />}
                    {fator?.segredo && (
                      <details className="admin-visual__segredo">
                        <summary>Usar código de configuração</summary>
                        <p>{fator.segredo}</p>
                      </details>
                    )}
                  </>
                )}
                <form className="admin-visual__formulario" onSubmit={onVerificar}>
                  <label htmlFor="admin-totp">Código do autenticador</label>
                  <p id="admin-totp-ajuda" className="admin-visual__ajuda">Digite os seis números exibidos no autenticador.</p>
                  <input
                    id="admin-totp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    aria-describedby="admin-totp-ajuda"
                    required
                    value={codigo}
                    onChange={(evento) => onCodigoChange(evento.currentTarget.value.replace(/\D/g, '').slice(0, 6))}
                    disabled={ocupado}
                  />
                  <button className="admin-visual__botao admin-visual__botao-primario" type="submit" disabled={ocupado || codigo.length !== 6}>
                    {ocupado ? 'Conferindo…' : erro ? 'Tentar de novo' : 'Confirmar código'}
                  </button>
                </form>
              </section>
            )}

            {etapa === 'pronto' && resumo && dados && (
              <>
                <div className="admin-visual__leitura">
                  <p>Leitura de <time dateTime={resumo.geradoEm}>{data(resumo.geradoEm)} às {hora(resumo.geradoEm)}</time></p>
                  <button type="button" className="admin-visual__botao admin-visual__botao-secundario" disabled={ocupado} onClick={onAtualizar}>
                    {ocupado ? 'Atualizando…' : 'Atualizar números'}
                  </button>
                </div>
                <div className="admin-visual__grade" role="group" aria-label="Números agregados">
                  <CartaoMetrica id="contas" titulo="Contas" periodo="Total e novos cadastros" lido={resumo.geradoEm} bloco={dados.contas}>
                    {({ total, novas7d, novas30d }) => <>
                      <ValorDestaque valor={numero(total)} />
                      <dl className="admin-visual__lista">
                        <LinhaResumo rotulo="Novas em 7 dias" valor={numero(novas7d)} />
                        <LinhaResumo rotulo="Novas em 30 dias" valor={numero(novas30d)} />
                      </dl>
                    </>}
                  </CartaoMetrica>
                  <CartaoMetrica id="assinaturas" titulo="Assinaturas" periodo="Ativas agora" lido={resumo.geradoEm} bloco={dados.assinaturas}>
                    {({ ativas, porPlano, porOrigem }) => <>
                      <ValorDestaque valor={numero(ativas)} />
                      <dl className="admin-visual__lista">
                        <LinhaResumo rotulo="Mensal / anual" valor={`${numero(porPlano.mensal)} / ${numero(porPlano.anual)}`} />
                        <LinhaResumo rotulo="Venda / cortesia" valor={`${numero(porOrigem.venda)} / ${numero(porOrigem.cortesia)}`} />
                      </dl>
                    </>}
                  </CartaoMetrica>
                  <CartaoMetrica id="receita" titulo="Receita" periodo="Vendas confirmadas em 30 dias" lido={resumo.geradoEm} bloco={dados.receita}>
                    {(receita) => receita.disponivel && receita.soma30d !== null
                      ? <ValorDestaque classe="admin-visual__numero-moeda" valor={receita.soma30d.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                      : <p className="admin-visual__indisponivel">Não disponível nesta versão.</p>}
                  </CartaoMetrica>
                  <CartaoMetrica id="app" titulo="App" periodo="Versão anunciada" lido={resumo.geradoEm} bloco={dados.app}>
                    {({ versaoAnunciada, anunciadaEm }) => <>
                      <ValorDestaque valor={versaoAnunciada ?? 'Não disponível'} />
                      <p className="admin-visual__texto-secundario">{anunciadaEm ? `Anunciada em ${data(anunciadaEm)}` : 'Sem data de anúncio disponível.'}</p>
                    </>}
                  </CartaoMetrica>
                  <CartaoMetrica id="uso" titulo="Uso" periodo="Voz em 7 dias e notificações agora" lido={resumo.geradoEm} bloco={dados.uso}>
                    {({ voz7d, aparelhosComNotificacao }) => <dl className="admin-visual__lista admin-visual__lista-solta">
                      <LinhaResumo rotulo="Lançamentos por voz" valor={numero(voz7d)} />
                      <LinhaResumo rotulo="Aparelhos com notificação ativa" valor={numero(aparelhosComNotificacao)} />
                    </dl>}
                  </CartaoMetrica>
                  <CartaoMetrica id="saude" titulo="Saúde" periodo="Esta consulta" lido={resumo.geradoEm}>
                    <ValorDestaque valor={hora(resumo.geradoEm)} />
                    <p className="admin-visual__texto-secundario">Resposta da função</p>
                    <p className="admin-visual__texto-secundario">Versão do contrato: {resumo.contrato}</p>
                  </CartaoMetrica>
                </div>
              </>
            )}
          </div>

          <footer className="admin-visual__rodape">Grana. · Painel de consulta · Dados agregados</footer>
        </div>
      </main>
    </>
  );
}
