/* Guardas estáticos do schema.sql — a classe de defeito que não aparece em tsc.
 *
 * O caso que originou este corpus: `processar_evento_kiwify` é
 * `security definer` com `set search_path = ''`, que é o endurecimento correto,
 * e chamava `gen_random_bytes(...)` sem qualificar. Com o search_path vazio, a
 * função do pgcrypto (que no Supabase vive no schema `extensions`) não resolve,
 * e a chamada estoura em tempo de execução.
 *
 * O detalhe caro: isso não quebra nada até alguém comprar. A PRIMEIRA compra de
 * verdade seria a primeira execução, e ela falharia. Quatro funções estavam
 * assim, incluindo as duas do pareamento por WhatsApp.
 *
 * Nada disso é pego por `tsc`, por revisão de tipos ou por teste de app: é SQL
 * dentro de uma string, executado só em produção. Daí um guarda de texto.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ESQUEMA = path.join(__dirname, '..', 'supabase', 'schema.sql');
const sql = readFileSync(ESQUEMA, 'utf8');
const MIGRATION_PUSH = path.join(__dirname, '..', 'supabase', 'migrations', '20260904190000_push_habito.sql');
const migrationPush = readFileSync(MIGRATION_PUSH, 'utf8');
const MIGRATION_VOZ = path.join(__dirname, '..', 'supabase', 'migrations', '20260905004109_voice_operations.sql');
const migrationVoz = readFileSync(MIGRATION_VOZ, 'utf8');
const MIGRATION_JANELAS = path.join(__dirname, '..', 'supabase', 'migrations', '20260905140000_janelas_notificacao.sql');
const migrationJanelas = readFileSync(MIGRATION_JANELAS, 'utf8');

let total = 0;
let falhas = 0;

function checar(nome: string, condicao: boolean, detalhe = '') {
  total += 1;
  if (!condicao) {
    falhas += 1;
    console.log(`  FALHA  ${nome}${detalhe ? '\n         ' + detalhe : ''}`);
  }
}

/** Funções do pgcrypto: no Supabase moram em `extensions`, não em `pg_catalog`. */
const PGCRYPTO = ['gen_random_bytes', 'digest', 'crypt', 'gen_salt', 'hmac'];

/**
 * Divide o arquivo nos corpos de função, guardando se cada um restringe o
 * search_path. O delimitador é `as $$ ... $$;`, que é como todo o arquivo
 * escreve corpo de função.
 */
function corposDeFuncao(): { nome: string; corpo: string; restringeSearchPath: boolean }[] {
  const blocos: { nome: string; corpo: string; restringeSearchPath: boolean }[] = [];
  const re = /create or replace function\s+(?:public\.)?([a-z_0-9]+)\s*\(([\s\S]*?)\bas\s*\$\$([\s\S]*?)\$\$;/gi;
  for (const m of sql.matchAll(re)) {
    blocos.push({
      nome: m[1],
      corpo: m[3],
      // `set search_path = ''` ou `set search_path = public`: os dois restringem.
      restringeSearchPath: /set\s+search_path\s*=/i.test(m[2]),
    });
  }
  return blocos;
}

const funcoes = corposDeFuncao();
checar('o arquivo tem funções para inspecionar', funcoes.length > 20, `encontrei ${funcoes.length}`);

// ── 1. pgcrypto sempre qualificado dentro de search_path restrito ──────────
{
  const infratoras: string[] = [];
  for (const f of funcoes) {
    if (!f.restringeSearchPath) continue;
    for (const nome of PGCRYPTO) {
      const usoNu = new RegExp(String.raw`(^|[^.\w])${nome}\s*\(`);
      if (usoNu.test(f.corpo)) infratoras.push(`${f.nome} -> ${nome}`);
    }
  }
  checar(
    'nenhuma função com search_path restrito chama pgcrypto sem qualificar',
    infratoras.length === 0,
    infratoras.length ? 'qualifique com `extensions.`:\n         ' + infratoras.join('\n         ') : ''
  );
}

// ── 2. Toda função `security definer` fixa o search_path ──────────────────
{
  const semTrava: string[] = [];
  const re = /create or replace function\s+(?:public\.)?([a-z_0-9]+)\s*\(([\s\S]*?)\bas\s*\$\$/gi;
  for (const m of sql.matchAll(re)) {
    const cabecalho = m[2];
    if (/security\s+definer/i.test(cabecalho) && !/set\s+search_path\s*=/i.test(cabecalho)) {
      semTrava.push(m[1]);
    }
  }
  checar(
    'toda função security definer fixa o search_path',
    semTrava.length === 0,
    semTrava.length ? 'sem `set search_path`: ' + semTrava.join(', ') : ''
  );
}

// ── 3. A migração do código de pareamento mantém a ordem que funciona ─────
{
  const iDrop = sql.indexOf('drop constraint if exists whatsapp_links_pairing_code_len');
  const iUpdate = sql.indexOf("set pairing_code = encode(extensions.digest(pairing_code, 'sha256'), 'hex')");
  const iAdd = sql.indexOf('add constraint whatsapp_links_pairing_code_len');
  checar('a migração do pareamento existe inteira', iDrop > 0 && iUpdate > 0 && iAdd > 0);
  checar(
    'a ordem é derrubar, migrar, recriar',
    iDrop < iUpdate && iUpdate < iAdd,
    'com a regra antiga de pé o UPDATE é recusado; com a nova criada antes, é a criação que é recusada'
  );
}

// ── 4. Cortesia nunca se confunde com venda ───────────────────────────────
{
  checar(
    "o provider aceita 'interno' além de 'kiwify'",
    /check\s*\(provider in \('kiwify', 'interno'\)\)/.test(sql)
  );
  checar(
    'revogar cortesia filtra por provider interno',
    /delete from public\.subscriptions s\s*\n\s*where s\.provider = 'interno'/.test(sql),
    'sem esse filtro, um engano cancelaria a assinatura paga de alguém'
  );
}

// ── 5. As funções de administração não ficam ao alcance do usuário ────────
{
  const admin = ['conceder_acesso_cortesia', 'revogar_acesso_cortesia', 'listar_acessos_cortesia', 'configurar_bloqueio_assinatura'];
  for (const nome of admin) {
    const revoga = new RegExp(String.raw`revoke all on function public\.${nome}\([^)]*\) from public, anon, authenticated`);
    checar(`${nome} tem execução revogada de anon e authenticated`, revoga.test(sql));
  }
}

// ── 6. Push: token do dono, outbox só do servidor e claim atômico ─────────
{
  checar(
    'push_tokens tem RLS habilitado',
    /alter table public\.push_tokens enable row level security/.test(sql)
  );
  checar(
    'a outbox de push não é exposta ao app',
    /revoke all on public\.push_habit_deliveries from anon, authenticated/.test(sql)
  );
  checar(
    'o claim do push usa SKIP LOCKED contra disparo duplicado',
    /reivindicar_entregas_push_habito[\s\S]*for update skip locked/.test(sql)
  );
  checar(
    'RPCs de contexto e claim são exclusivos do service_role',
    /revoke all on function public\.contextos_push_habito\(uuid\[\]\) from public, anon, authenticated/.test(sql)
      && /revoke all on function public\.reivindicar_entregas_push_habito\(integer\) from public, anon, authenticated/.test(sql)
  );
  const normalizarSql = (fonte: string) => fonte
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const inicioPush = sql.indexOf('create table if not exists public.push_tokens');
  // Âncora numa única linha, de propósito: `schema.sql` está com CRLF, e um
  // separador `\n` cru no meio de uma string de busca nunca bate ali.
  const inicioJanelasMarcador = sql.indexOf('add column if not exists almoco_ativo');
  const inicioJanelas = inicioJanelasMarcador >= 0 ? sql.lastIndexOf('alter table public.push_tokens', inicioJanelasMarcador) : -1;
  const inicioVoz = sql.indexOf('create table if not exists public.voice_operations');
  checar(
    'a migration do push permanece idêntica ao baseline do schema',
    inicioPush >= 0 && inicioJanelas > inicioPush
      && normalizarSql(sql.slice(inicioPush, inicioJanelas)) === normalizarSql(migrationPush)
  );
  checar(
    'a migration das janelas de notificação permanece idêntica ao baseline do schema',
    inicioJanelas >= 0 && inicioVoz > inicioJanelas
      && normalizarSql(sql.slice(inicioJanelas, inicioVoz)) === normalizarSql(migrationJanelas)
  );
  checar(
    'a migration de voz permanece idêntica ao baseline do schema',
    inicioVoz >= 0 && normalizarSql(sql.slice(inicioVoz)) === normalizarSql(migrationVoz)
  );
}

// 7. Voz: request persistente, escrita/undo atômicos e menor privilégio.
{
  checar(
    'voice_operations tem RLS habilitado',
    /alter table public\.voice_operations enable row level security/.test(sql)
  );
  checar(
    'o app não altera recibos de voz diretamente',
    /revoke all on public\.voice_operations from anon, authenticated/.test(sql)
      && /grant select on public\.voice_operations to authenticated/.test(sql)
  );
  checar(
    'registro de voz deriva o dono exclusivamente de auth.uid',
    /registrar_operacao_voz[\s\S]*v_user uuid := \(select auth\.uid\(\)\)/.test(sql)
  );
  checar(
    'o mesmo request devolve o recibo já persistido',
    /registrar_operacao_voz[\s\S]*on conflict \(id\) do nothing[\s\S]*status in \('committed', 'undone'\)/.test(sql)
  );
  checar(
    'parcelamento vazio não pode virar operação committed sem linhas',
    /v_installments is null or v_installments not between 1 and 120/.test(sql)
      && /p_kind <> 'bill' and jsonb_array_length\(v_ids\) <> v_installments/.test(sql)
  );
  checar(
    'undo usa a lista persistida e marca tombstone undone',
    /desfazer_operacao_voz[\s\S]*jsonb_array_elements_text\(v_operation\.result_ids\)[\s\S]*status = 'undone'/.test(sql)
  );
}

console.log(`\n${total - falhas}/${total} guardas do schema passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
