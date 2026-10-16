/*
 * V-2 (15/10/2026): a migration do bucket `marketing` só retira o acesso público.
 *
 *   node __tests__/bucket-marketing-privado.cjs
 *
 * O autor autorizou corrigir vulnerabilidade em produção "desde que a correção só retire
 * acesso indevido e não mude o comportamento do app". Este teste trava exatamente isso no
 * texto da migration: um UPDATE em storage.buckets, só no bucket `marketing`, só de
 * public=true para false, sem apagar objeto, bucket ou policy, e sem tocar o `avatars`.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const arquivo = path.join(__dirname, '..', 'supabase', 'migrations', '20261015200100_bucket_marketing_privado.sql');
const sql = fs.readFileSync(arquivo, 'utf8');
const codigo = sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
let ok = 0;
const checar = (cond, nome) => { assert.ok(cond, nome); ok++; };

checar(/^update storage\.buckets set public = false where id = 'marketing' and public = true;$/.test(codigo),
  'a migration é um único UPDATE de public=true para false, só no bucket marketing');
checar(!/\b(delete|drop|truncate|insert|alter|grant|revoke|create)\b/.test(codigo), 'não apaga, cria nem muda permissão');
checar(!codigo.includes('avatars'), 'não toca o bucket avatars do app');
checar(/N[ÃA]O APLICADA/.test(sql), 'marcada no topo como não aplicada, aguardando o autor');

/* O app não lê o bucket: nenhuma referência a ele no código que vai para o aparelho ou para a web. */
const raiz = path.join(__dirname, '..');
const pastas = ['app', 'lib', 'components'];
const usos = [];
for (const pasta of pastas) {
  const andar = (dir) => {
    for (const nome of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, nome.name);
      if (nome.isDirectory()) andar(p);
      else if (/\.(tsx?|jsx?)$/.test(nome.name) && /from\(\s*['"]marketing['"]\s*\)|object\/public\/marketing/.test(fs.readFileSync(p, 'utf8'))) usos.push(p);
    }
  };
  andar(path.join(raiz, pasta));
}
checar(usos.length === 0, `o app não lê o bucket marketing (${usos.join(', ')})`);

console.log(`bucket-marketing-privado: ${ok} checagens passaram — 0 falhas`);
