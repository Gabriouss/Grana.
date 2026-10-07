'use strict';
// Cadastro da conta admin do painel local (dono: Keel). Roda SÓ no terminal
// desta máquina:
//
//   node tools/admin-local/configurar-login.cjs              -> cria a conta (senha + autenticador)
//   node tools/admin-local/configurar-login.cjs --refazer-totp -> troca o autenticador (pede a senha atual)
//   node tools/admin-local/configurar-login.cjs --refazer      -> apaga e cria a conta de novo
//
// A senha e o segredo do autenticador ficam em %APPDATA%\grana-admin\conta.json
// (fora do repositório, com permissão só deste usuário). A senha é guardada como
// hash scrypt. A chave do autenticador aparece só nesta tela, uma vez: ela não é
// gravada em log nem enviada a lugar nenhum.
//
// Trocar o autenticador ou recriar a conta muda a "geração" da conta: quem
// estiver logado no painel sai no próximo pedido, sem reiniciar o servidor.
// O código conferido aqui fica marcado como usado e não serve para o login.
// Cada cadastro e recadastro deixa uma linha na auditoria, sem segredo.

const readline = require('readline');
const auth = require('./autenticacao.cjs');
const { registrar } = require('./auditoria.cjs'); // módulo isolado: não carrega o .env

const args = new Set(process.argv.slice(2));

function perguntar(texto, { oculto = false } = {}) {
  return new Promise((ok) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) {
      // Não ecoa o que é digitado.
      rl._writeToOutput = (s) => { if (s.includes(texto)) process.stdout.write(texto); };
    }
    rl.question(texto, (resp) => {
      rl.close();
      if (oculto) process.stdout.write('\n');
      ok(resp);
    });
  });
}

function senhaForte(s) {
  if (s.length < 12) return 'Use pelo menos 12 caracteres.';
  if (s.length > 256) return 'Use no máximo 256 caracteres.';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(s)).length;
  if (classes < 3 && s.length < 20) return 'Misture letras maiúsculas, minúsculas, números e símbolos (pelo menos 3 tipos), ou use uma frase de 20 caracteres ou mais.';
  return null;
}

async function novaSenha() {
  for (;;) {
    const s1 = await perguntar('Senha nova (não aparece na tela): ', { oculto: true });
    const problema = senhaForte(s1);
    if (problema) { console.log('  ' + problema); continue; }
    const s2 = await perguntar('Repita a senha: ', { oculto: true });
    if (s1 !== s2) { console.log('  As duas senhas não são iguais. De novo.'); continue; }
    return s1;
  }
}

/** Devolve { segredo, passo }: o passo do código conferido, para gravar como consumido. */
async function cadastrarAutenticador(usuario, acao) {
  const segredo = auth.novoSegredoTotp();
  const agrupado = segredo.match(/.{1,4}/g).join(' ');
  console.log('\nNo app autenticador do celular (Google Authenticator, Microsoft Authenticator, 1Password...),');
  console.log('escolha "Inserir chave de configuração" / "Digitar chave" e use:\n');
  console.log(`  Conta:  Grana. Admin (${usuario})`);
  console.log(`  Chave:  ${agrupado}`);
  console.log('  Tipo:   baseado em tempo (TOTP), 6 dígitos, 30 segundos\n');
  console.log('Se o app aceitar link, este é o mesmo cadastro em formato otpauth:');
  console.log('  ' + auth.uriOtpauth(segredo, usuario) + '\n');
  console.log('Esta chave aparece só agora. Não tire print nem cole em lugar nenhum.');
  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    const codigo = (await perguntar('Digite o código de 6 dígitos que o app mostra agora: ')).replace(/\s/g, '');
    const passo = auth.conferirTotp(segredo, codigo, null);
    if (passo !== null) return { segredo, passo };
    console.log('  Código não confere. Confira se o relógio do celular está certo e tente de novo.');
  }
  registrar('conta', { acao, resultado: 'recusado', motivo: 'codigo-errado' });
  console.log('\nCinco códigos errados. Nada foi gravado. Rode o comando de novo.');
  process.exit(1);
}

async function principal() {
  console.log('\nGrana. Admin: cadastro da conta do painel local\n');
  const situacao = auth.situacaoConta();

  if (args.has('--refazer-totp')) {
    if (situacao.estado !== 'ok') {
      registrar('conta', { acao: 'recovery', resultado: 'recusado', motivo: `conta-${situacao.estado}` });
      console.log(situacao.estado === 'ausente' ? 'Ainda não há conta. Rode sem --refazer-totp para criar.' : 'A conta está ilegível. Use --refazer para recriar.');
      process.exit(1);
    }
    const senha = await perguntar('Senha atual (não aparece na tela): ', { oculto: true });
    if (!(await auth.conferirHash(senha, situacao.conta.senha))) {
      registrar('conta', { acao: 'recovery', resultado: 'recusado', motivo: 'senha' });
      console.log('Senha incorreta. Nada foi alterado.');
      process.exit(1);
    }
    const { segredo, passo } = await cadastrarAutenticador(situacao.conta.usuario, 'recovery');
    await auth.trocarTotp(segredo, passo);
    registrar('conta', { acao: 'recovery', resultado: 'ok' });
    console.log('\nAutenticador trocado. O antigo deixou de funcionar, e quem estava logado no painel sai no próximo clique.');
    return;
  }

  const existe = situacao.estado !== 'ausente';
  if (existe && !args.has('--refazer')) {
    console.log(situacao.estado === 'ok'
      ? 'A conta admin já existe. Para trocar só o autenticador: --refazer-totp. Para recriar tudo: --refazer.'
      : 'Há uma conta admin ilegível. Para recriar: --refazer.');
    process.exit(1);
  }
  if (existe) {
    const conf = await perguntar('Isto APAGA a conta atual e cria outra. Digite RECRIAR para seguir: ');
    if (conf.trim() !== 'RECRIAR') {
      registrar('conta', { acao: 'recriar', resultado: 'cancelado' });
      console.log('Cancelado. Nada foi alterado.');
      process.exit(1);
    }
  }

  const acao = existe ? 'recriar' : 'bootstrap';
  const usuario = (await perguntar('Nome de usuário (Enter para "admin"): ')).trim().toLowerCase() || 'admin';
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) { console.log('Use de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado.'); process.exit(1); }
  const senha = await novaSenha();
  const { segredo, passo } = await cadastrarAutenticador(usuario, acao);
  process.stdout.write('\nGravando (o cálculo da senha leva alguns segundos)... ');
  await auth.salvarConta({ usuario, senha, segredoTotp: segredo, passoDoCadastro: passo });
  registrar('conta', { acao, resultado: 'ok' });
  console.log('pronto.');
  console.log(`\nConta criada em ${auth.PASTA}. Para entrar: senha + um código NOVO do app (o que você digitou agora já foi usado).`);
  console.log('Perdeu o celular? Rode este comando com --refazer-totp, nesta máquina.');
}

principal().catch((e) => {
  registrar('conta', { acao: 'cadastro', resultado: 'erro' });
  console.error('Falhou: ' + (e && e.message));
  process.exit(1);
});
