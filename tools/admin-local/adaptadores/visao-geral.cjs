'use strict';
// Visão geral (dono: Keel). Junta o status de cada integração; uma falha vira
// status "erro" naquele cartão, nunca derruba a tela inteira.

const fs = require('fs');
const path = require('path');
const { RAIZ, SIMULAR } = require('../config.cjs');
const { statusDe } = require('./_http.cjs');
const supabase = require('./supabase.cjs');
const vercel = require('./vercel.cjs');
const github = require('./github.cjs');
const cakto = require('./cakto.cjs');
const eas = require('./eas.cjs');
const gitLocal = require('./git-local.cjs');

function versaoDoApp() {
  try {
    const app = JSON.parse(fs.readFileSync(path.join(RAIZ, 'app.json'), 'utf8'));
    return app.expo && app.expo.version ? app.expo.version : null;
  } catch { return null; }
}

/** O bloco de alerta do AGENTS.md só sai quando os segredos forem trocados. */
function segredosPendentes() {
  try {
    const t = fs.readFileSync(path.join(RAIZ, 'AGENTS.md'), 'utf8').slice(0, 8000);
    return /troca dos cinco segredos ADIADA/i.test(t);
  } catch { return null; }
}

// A visão geral nunca espera mais que isto por uma integração: quem passar
// disso aparece com o último valor guardado ou como "carregando", e a
// consulta continua em segundo plano enchendo o cache para a próxima leitura.
const ESPERA_MAX_MS = 2_500;

async function resumo(comCache, forcar) {
  const rapido = (chave, ms, fn) => {
    const p = statusDe(() => comCache(chave, ms, fn, forcar));
    let timer;
    const limite = new Promise((ok) => {
      timer = setTimeout(() => {
        const velho = comCache.espiar(chave);
        ok(velho ? { ...velho.valor, emCache: velho.em } : { status: 'carregando', motivo: 'Consulta em andamento. Atualize em alguns segundos.' });
      }, ESPERA_MAX_MS);
    });
    return Promise.race([p, limite]).finally(() => clearTimeout(timer));
  };
  const [sb, fn, vc, gh, ck, rel] = await Promise.all([
    rapido('sb-resumo', 30_000, () => supabase.resumo()),
    rapido('sb-funcoes', 30_000, () => supabase.funcoes()),
    rapido('vc-deps', 30_000, () => vercel.deployments()),
    rapido('gh', 60_000, () => github.releases()),
    rapido('cakto', 60_000, () => cakto.resumo()),
    rapido('sb-release', 30_000, () => supabase.appRelease()),
  ]);

  // EAS: a CLI leva até ~30s. Usa o último resultado guardado e, se não houver
  // ou estiver vencido, dispara a consulta em segundo plano sem esperar.
  const easGuardado = comCache.espiar('eas');
  comCache('eas', 60_000, () => eas.builds(), forcar).catch(() => {});
  const ultimaBuild = easGuardado && easGuardado.valor.status === 'ok' && easGuardado.valor.itens[0]
    ? (({ id, status: st, versao, perfil, criadoEm, concluidoEm, pagina }) => ({ id, status: st, versao, perfil, criadoEm, concluidoEm, pagina }))(easGuardado.valor.itens[0])
    : null;
  const git = gitLocal.estado();
  const saldo = eas.saldo();

  const alertas = [];
  const anunciada = rel.status === 'ok' && rel.linha ? rel.linha.version : null;
  const embutida = versaoDoApp();
  if (anunciada && embutida && anunciada !== embutida) {
    alertas.push({ nivel: 'info', codigo: 'versao-preparada-nao-anunciada', mensagem: `O app.json está em ${embutida} e a versão anunciada aos usuários é ${anunciada}. Normal entre preparar a build e ela terminar no EAS.` });
  }
  if (fn.status === 'ok' && fn.alertas.length) {
    alertas.push({ nivel: 'atencao', codigo: 'funcao-mais-nova-que-repositorio', mensagem: `Edge Functions publicadas mais de 24h depois do último commit: ${fn.alertas.join(', ')}. Conferir antes de qualquer deploy (regra 11).` });
  }
  if (segredosPendentes()) {
    alertas.push({ nivel: 'critico', codigo: 'segredos-nao-trocados', mensagem: 'Os segredos expostos no servidor do EAS em 16/09 (Cakto, GitHub, Supabase, Vercel) ainda não foram trocados. Decisão do autor: trocar depois.' });
  }
  if (saldo.status === 'ok' && !saldo.semana.podePreparar) {
    alertas.push({ nivel: 'info', codigo: 'teto-semanal', mensagem: `Teto de builds desta semana atingido (${saldo.semana.feitos} de ${saldo.semana.teto}).` });
  }
  if (git.status === 'ok' && git.origemMain.atras > 0) {
    alertas.push({ nivel: 'atencao', codigo: 'git-atras', mensagem: `A cópia local está ${git.origemMain.atras} commit(s) atrás de origin/main (sem fetch recente do painel).` });
  }

  const cartao = (x, extra) => (x.status === 'ok' ? { status: 'ok', ...extra } : { status: x.status, motivo: x.motivo, erro: x.erro });
  return {
    simulado: SIMULAR,
    versaoApp: embutida,
    versaoAnunciada: rel.status === 'ok' ? { versao: anunciada, apk: rel.linha && rel.linha.apk_url, atualizadaEm: rel.linha && rel.linha.updated_at } : { status: rel.status, motivo: rel.motivo, erro: rel.erro },
    ultimoCommit: git.status === 'ok' ? git.ultimoCommit : null,
    git: git.status === 'ok' ? { branch: git.branch, aFrente: git.origemMain.aFrente, atras: git.origemMain.atras, alteracoesNaoCommitadas: git.alteracoesNaoCommitadas } : null,
    buildsDaSemana: saldo.status === 'ok' ? { feitos: saldo.semana.feitos, teto: saldo.semana.teto, texto: `${saldo.semana.feitos} de ${saldo.semana.teto}`, zeraEm: saldo.semana.zeraEm, mes: saldo.mes } : null,
    ultimoDeploy: vc.status === 'ok' ? vc.ultimoProducao : null,
    assinantes: sb.status === 'ok' && sb.assinaturas.status === 'ok' ? { ativas: sb.assinaturas.ativas, porStatus: sb.assinaturas.porStatus } : null,
    usuarios: sb.status === 'ok' ? sb.usuarios : null,
    integracoes: {
      supabase: cartao(sb, { projeto: sb.projeto && { estado: sb.projeto.estado, regiao: sb.projeto.regiao } }),
      funcoes: cartao(fn, { total: fn.itens && fn.itens.length, alertas: fn.alertas }),
      vercel: cartao(vc, { ultimoProducao: vc.ultimoProducao }),
      eas: easGuardado
        ? (easGuardado.valor.status === 'ok' ? { status: 'ok', ultimaBuild, emCache: easGuardado.em } : { status: easGuardado.valor.status, motivo: easGuardado.valor.motivo, erro: easGuardado.valor.erro })
        : { status: 'carregando', motivo: 'Lendo as builds pela CLI do EAS (até ~30s na primeira vez). O saldo da semana já está ao lado.' },
      github: cartao(gh, { ultima: gh.itens && gh.itens[0] ? { tag: gh.itens[0].tag, publicadaEm: gh.itens[0].publicadaEm } : null }),
      cakto: cartao(ck, { pagos: ck.pagos }),
      git: git.status === 'ok' ? { status: 'ok' } : { status: 'erro', erro: git.erro },
    },
    alertas,
  };
}

module.exports = { resumo };
