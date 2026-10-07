'use strict';
// Configuração do painel local (dono: Keel).
//
// Lê o .env da raiz do repositório com um parser próprio (sem dotenv) e
// guarda os valores SÓ dentro deste módulo. Nada aqui devolve o conjunto de
// variáveis: quem precisa de uma credencial pede pelo nome, e o adaptador a
// usa num cabeçalho de saída. Os valores nunca vão para resposta HTTP, log ou
// arquivo. `ocultar()` existe para limpar qualquer texto de erro que,
// por acidente, carregue um deles (ex.: corpo de resposta que ecoa o token).

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const ARQUIVO_ENV = path.join(RAIZ, '.env');

const valores = new Map();

function parse(texto) {
  const saida = new Map();
  for (const bruta of texto.replace(/^﻿/, '').split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha || linha.startsWith('#')) continue;
    const m = linha.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let valor = m[2];
    if ((valor.startsWith('"') && valor.endsWith('"') && valor.length >= 2) ||
        (valor.startsWith("'") && valor.endsWith("'") && valor.length >= 2)) {
      valor = valor.slice(1, -1);
    } else {
      // comentário no fim da linha só quando separado por espaço
      valor = valor.replace(/\s+#.*$/, '').trim();
    }
    saida.set(m[1], valor);
  }
  return saida;
}

function carregar() {
  valores.clear();
  let texto = '';
  try {
    texto = fs.readFileSync(ARQUIVO_ENV, 'utf8');
  } catch {
    return; // sem .env: toda integração aparece como "ausente"
  }
  for (const [k, v] of parse(texto)) valores.set(k, v);
}
carregar();

/** Valor da variável (string) ou null. Use só para montar a chamada de saída. */
function ler(nome) {
  const v = valores.get(nome);
  return v ? v : null;
}

function tem(nome) {
  return !!ler(nome);
}

// Segredos derivados (token OAuth obtido em tempo de execução, hipótese H2 do
// Lynx): também saem de qualquer resposta ou log.
const derivados = new Set();
function registrarSegredo(valor) {
  if (typeof valor === 'string' && valor.length >= 8) derivados.add(valor);
}

/** Troca qualquer valor sensível presente no texto por "[oculto]". */
function ocultar(texto) {
  let s = String(texto == null ? '' : texto);
  for (const v of derivados) s = s.split(v).join('[oculto]');
  for (const [nome, v] of valores) {
    if (!v || v.length < 6) continue;
    if (nome.startsWith('EXPO_PUBLIC_SUPABASE_URL')) continue; // URL pública, não é segredo
    s = s.split(v).join('[oculto]');
  }
  return s;
}

/** Ref do projeto Supabase, derivado da URL pública. */
function refSupabase() {
  const url = ler('EXPO_PUBLIC_SUPABASE_URL');
  const m = url && url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/);
  return m ? m[1] : null;
}

const PORTA = Number(process.env.GRANA_ADMIN_PORTA) || 4317;
const SIMULAR = process.env.GRANA_ADMIN_SIMULAR === '1';
const REPO_GITHUB = 'Gabriouss/Grana.';

// Raiz alternativa SÓ para os dados de marketing (teste de escrita numa cópia,
// sem tocar no aprovacoes.json real).
const RAIZ_DADOS = process.env.GRANA_ADMIN_RAIZ_DADOS ? path.resolve(process.env.GRANA_ADMIN_RAIZ_DADOS) : RAIZ;

module.exports = { RAIZ, RAIZ_DADOS, PORTA, SIMULAR, REPO_GITHUB, ler, tem, ocultar, registrarSegredo, refSupabase, _parse: parse };
