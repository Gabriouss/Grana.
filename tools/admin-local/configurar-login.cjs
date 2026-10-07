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

const readline = require('readline');
const auth = require('./autenticacao.cjs');

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

async function cadastrarAutenticador(usuario) {
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
    if (auth.conferirTotp(segredo, codigo, null) !== null) return segredo;
    console.log('  Código não confere. Confira se o relógio do celular está certo e tente de novo.');
  }
  console.log('\nCinco códigos errados. Nada foi gravado. Rode o comando de novo.');
  process.exit(1);
}

async function principal() {
  console.log('\nGrana. Admin: cadastro da conta do painel local\n');
  const existe = auth.configurado();

  if (args.has('--refazer-totp')) {
    if (!existe) { console.log('Ainda não há conta. Rode sem --refazer-totp para criar.'); process.exit(1); }
    const senha = await perguntar('Senha atual (não aparece na tela): ', { oculto: true });
    if (!(await auth.conferirHash(senha, auth.conta().senha))) { console.log('Senha incorreta. Nada foi alterado.'); process.exit(1); }
    const segredo = await cadastrarAutenticador(auth.conta().usuario);
    await auth.trocarTotp(segredo);
    console.log('\nAutenticador trocado. O antigo deixou de funcionar. Reinicie o painel se ele estiver aberto.');
    return;
  }

  if (existe && !args.has('--refazer')) {
    console.log('A conta admin já existe. Para trocar só o autenticador: --refazer-totp. Para recriar tudo: --refazer.');
    process.exit(1);
  }
  if (existe) {
    const conf = await perguntar('Isto APAGA a conta atual e cria outra. Digite RECRIAR para seguir: ');
    if (conf.trim() !== 'RECRIAR') { console.log('Cancelado. Nada foi alterado.'); process.exit(1); }
  }

  let usuario = (await perguntar('Nome de usuário (Enter para "admin"): ')).trim().toLowerCase() || 'admin';
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) { console.log('Use de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado.'); process.exit(1); }
  const senha = await novaSenha();
  const segredo = await cadastrarAutenticador(usuario);
  process.stdout.write('\nGravando (o cálculo da senha leva alguns segundos)... ');
  await auth.salvarConta({ usuario, senha, segredoTotp: segredo });
  console.log('pronto.');
  console.log(`\nConta criada em ${auth.PASTA}. Para entrar: senha + código do app.`);
  console.log('Perdeu o celular? Rode este comando com --refazer-totp, nesta máquina.');
}

principal().catch((e) => { console.error('Falhou: ' + (e && e.message)); process.exit(1); });
