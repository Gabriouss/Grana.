/* Guardas estáticos do schema.sql — a classe de defeito que não aparece em tsc.
 *
 * O caso que originou este corpus: `processar_evento_assinatura` (na época `processar_evento_kiwify`) é
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
const MIGRATION_VOZ_CARTEIRAS = path.join(__dirname, '..', 'supabase', 'migrations', '20260908000000_voice_wallets.sql');
const migrationVozCarteiras = readFileSync(MIGRATION_VOZ_CARTEIRAS, 'utf8');
const MIGRATION_JANELAS = path.join(__dirname, '..', 'supabase', 'migrations', '20260905140000_janelas_notificacao.sql');
const migrationJanelas = readFileSync(MIGRATION_JANELAS, 'utf8');
const MIGRATION_ASSISTENTE = path.join(__dirname, '..', 'supabase', 'migrations', '20260905160000_assistant_messages.sql');
const migrationAssistente = readFileSync(MIGRATION_ASSISTENTE, 'utf8');
const MIGRATION_MEMORIA = path.join(__dirname, '..', 'supabase', 'migrations', '20260906120000_assistant_memory.sql');
const migrationMemoria = readFileSync(MIGRATION_MEMORIA, 'utf8');
const MIGRATION_COTAS = path.join(__dirname, '..', 'supabase', 'migrations', '20260908140000_ai_usage_quotas.sql');
const migrationCotas = readFileSync(MIGRATION_COTAS, 'utf8');
const MIGRATION_TRIGGERS_INTERNOS = path.join(__dirname, '..', 'supabase', 'migrations', '20260923220000_restringir_execucao_triggers_internos.sql');
const migrationTriggersInternos = readFileSync(MIGRATION_TRIGGERS_INTERNOS, 'utf8');

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
    "o provider aceita 'cakto' e 'interno' além de 'kiwify'",
    /check\s*\(provider in \('kiwify', 'cakto', 'interno'\)\)/.test(sql)
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

// ── 6. Triggers internos não ficam expostos como RPCs ─────────────────────
{
  const triggersInternos = [
    'handle_new_user_wallet',
    'preencher_wallet_padrao',
    'reatribuir_wallet_antes_de_excluir',
  ];
  for (const nome of triggersInternos) {
    const revoga = new RegExp(String.raw`revoke all on function public\.${nome}\(\)\s+from public, anon, authenticated;`);
    checar(`${nome} não fica exposta como RPC no schema`, revoga.test(sql));
    checar(`${nome} não fica exposta como RPC na migration`, revoga.test(migrationTriggersInternos));
  }
}

// ── 7. Push: token do dono, outbox só do servidor e claim atômico ─────────
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
  const migrationAPartirDe = (fonte: string, marcador: string) => {
    const inicio = fonte.indexOf(marcador);
    return inicio >= 0 ? normalizarSql(fonte.slice(inicio)) : '';
  };
  const inicioPush = sql.indexOf('create table if not exists public.push_tokens');
  // Âncora numa única linha, de propósito: `schema.sql` está com CRLF, e um
  // separador `\n` cru no meio de uma string de busca nunca bate ali.
  const inicioJanelasMarcador = sql.indexOf('add column if not exists almoco_ativo');
  const inicioJanelas = inicioJanelasMarcador >= 0 ? sql.lastIndexOf('alter table public.push_tokens', inicioJanelasMarcador) : -1;
  const inicioVoz = sql.indexOf('create table if not exists public.voice_operations');
  const inicioAssistente = sql.indexOf('create table if not exists public.assistant_messages');
  const inicioMemoria = sql.indexOf('create extension if not exists pg_trgm');
  const inicioCotas = sql.indexOf('create table if not exists public.ai_usage_counters');
  const fimCotas = sql.indexOf('-- Invariante: Total é somente uma visão, nunca um destino de dados');
  checar(
    'a migration do push permanece idêntica ao baseline do schema',
    inicioPush >= 0 && inicioJanelas > inicioPush
      && normalizarSql(sql.slice(inicioPush, inicioJanelas)) === migrationAPartirDe(migrationPush, 'create table if not exists public.push_tokens')
  );
  checar(
    'a migration das janelas de notificação permanece idêntica ao baseline do schema',
    inicioJanelas >= 0 && inicioVoz > inicioJanelas
      && normalizarSql(sql.slice(inicioJanelas, inicioVoz)) === migrationAPartirDe(migrationJanelas, 'alter table public.push_tokens')
  );
  checar(
    'a migration histórica base da voz continua versionada',
    migrationVoz.includes('create table if not exists public.voice_operations')
      && migrationVoz.includes('create or replace function public.registrar_operacao_voz(')
      && migrationVoz.includes('create or replace function public.desfazer_operacao_voz(')
  );
  {
    /* A seção de voz do schema é a de 08/09 (carteiras) com duas camadas por
       cima: a origem 'assistente' e o desfazer do Granabô (14/09), e a RPC de
       23/09 (carteira de volta, crédito exige cartão). A de 14/09 sozinha NÃO
       é baseline: ela foi escrita a partir da migration de 05/09 e apagou a
       carteira, que é o defeito que a de 23/09 corrige. */
    const trechoRegistrar = (fonte: string) => {
      const fim = 'grant execute on function public.registrar_operacao_voz(uuid, text, text, jsonb) to authenticated;';
      const i = fonte.indexOf('create or replace function public.registrar_operacao_voz(');
      return i >= 0 ? normalizarSql(fonte.slice(i, fonte.indexOf(fim, i) + fim.length)) : '<ausente>';
    };
    const migrationAssistenteLanca = readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260914120000_lancamento_pelo_assistente.sql'), 'utf8');
    const migrationVozCredito = readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260923230300_voz_credito_exige_cartao.sql'), 'utf8');
    const fimDesfazer = 'grant execute on function public.desfazer_ultimo_lancamento_assistente() to authenticated;';
    const inicioDesfazer = migrationAssistenteLanca.indexOf('create or replace function public.desfazer_ultimo_lancamento_assistente(');
    const desfazerUltimo = normalizarSql(migrationAssistenteLanca.slice(inicioDesfazer, migrationAssistenteLanca.indexOf(fimDesfazer) + fimDesfazer.length));
    const esperado = migrationAPartirDe(migrationVozCarteiras, 'create table if not exists public.voice_operations')
      .replace(trechoRegistrar(migrationVozCarteiras), () => trechoRegistrar(migrationVozCredito) + ' ' + desfazerUltimo) // função, para o '$$' do corpo não virar '$'
      .replace("check (source in ('app', 'widget'))", "check (source in ('app', 'widget', 'assistente'))");
    checar(
      'a seção de voz do schema = 08/09 + origem e desfazer de 14/09 + RPC de 23/09',
      inicioVoz >= 0 && inicioAssistente > inicioVoz && inicioDesfazer >= 0
        && normalizarSql(sql.slice(inicioVoz, inicioAssistente)) === esperado
    );
  }
  checar(
    'a migration do assistente permanece idêntica ao baseline do schema',
    inicioAssistente >= 0 && inicioMemoria > inicioAssistente
      && normalizarSql(sql.slice(inicioAssistente, inicioMemoria)) === migrationAPartirDe(migrationAssistente, 'create table if not exists public.assistant_messages')
  );
  checar(
    'a migration de memória do assistente permanece idêntica ao baseline do schema',
    inicioMemoria >= 0 && inicioCotas > inicioMemoria
      && normalizarSql(sql.slice(inicioMemoria, inicioCotas)) === migrationAPartirDe(migrationMemoria, 'create extension if not exists pg_trgm')
  );
  checar(
    'a migration de cotas de IA permanece idêntica ao baseline do schema',
    inicioCotas > inicioMemoria && fimCotas > inicioCotas
      && normalizarSql(sql.slice(inicioCotas, fimCotas)) === migrationAPartirDe(migrationCotas, 'create table if not exists public.ai_usage_counters')
  );
  checar(
    'cotas de IA têm RLS e não expõem a tabela ao app',
    /alter table public\.ai_usage_counters enable row level security/.test(sql)
      && /revoke all on public\.ai_usage_counters from public, anon, authenticated/.test(sql)
  );
  checar(
    'RPC de quota deriva o usuário do JWT e fixa o search_path',
    /create or replace function public\.consumir_cota_ia\(p_tipo text\)[\s\S]*v_user uuid := \(select auth\.uid\(\)\)/.test(sql)
      && /consumir_cota_ia\(p_tipo text\)[\s\S]*set search_path = ''/.test(sql)
  );
}

// 8. Voz: request persistente, escrita/undo atômicos e menor privilégio.
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

/* Reabrir conta desfaz o pagamento INTEIRO (U1, 19/09/2026). "Apertou, pagou.
   Apertou de novo, cancela o pagamento e a saída do dinheiro é cancelada."
   Pagar conta recorrente cria a do mês seguinte, e reabrir não a apagava:
   sobrava um boleto fantasma. O comportamento foi testado em Postgres de
   verdade (PGlite) antes de aplicar; este guarda impede uma edição futura de
   tirar uma das três pernas sem ninguém perceber. */
{
  const migracao = readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260919150000_reabrir_conta_desfaz_proxima.sql'), 'utf8');
  for (const [onde, texto] of [['schema.sql', sql], ['migration', migracao]] as const) {
    const pagar = texto.slice(texto.indexOf('create or replace function public.pagar_conta'));
    const reabrir = texto.slice(texto.indexOf('create or replace function public.reabrir_conta'));
    checar(`${onde}: pagar_conta guarda a conta seguinte que ELA criou`,
      /on conflict \(user_id, parent_id, due_date\) do nothing\s+returning id into v_next_id;/.test(pagar) &&
      /set next_bill_id = v_next_id/.test(pagar));
    checar(`${onde}: reabrir_conta apaga a conta seguinte só se ainda não foi paga`,
      /delete from public\.bills\s+where id = v_bill\.next_bill_id\s+and user_id = v_user\s+and status = 'due'\s+and paid_transaction_id is null;/.test(reabrir));
    checar(`${onde}: reabrir_conta limpa o vínculo`,
      /set status = 'due', paid_transaction_id = null, next_bill_id = null/.test(reabrir));
    checar(`${onde}: coluna com FK de mesmo dono e índice`,
      /add column if not exists next_bill_id uuid references public\.bills\(id\) on delete set null/.test(texto) &&
      /bills_next_bill_same_owner_fkey/.test(texto) && /bills_next_bill_id_idx/.test(texto));
  }
  checar('o backfill casa por igualdade exata de created_at (mesma transação)',
    /proxima\.created_at = saida\.created_at/.test(migracao));
}

// ── Crédito por ciclo de fatura (23/09/2026) ────────────────────────────────
// As três migrations também foram EXECUTADAS num Postgres embutido (PGlite),
// fora do repositório porque o PGlite não é dependência do projeto. Estes
// guardas travam o texto: o contrato de erro combinado com o Forge, e o
// schema.sql igual à migration.
{
  const lerMig = (nome: string) =>
    readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', nome), 'utf8').replace(/\r\n/g, '\n');
  const sqlLf = sql.replace(/\r\n/g, '\n');
  const funcao = (texto: string, nome: string) => {
    const i = texto.indexOf(`create or replace function public.${nome}(`);
    if (i < 0) return '';
    return texto.slice(i, texto.indexOf('\n$$;', i) + 4);
  };

  /* A voz foi dividida em duas: 230000 devolve a carteira (inofensiva para o
     APK instalado, pode ir antes) e 230300 acrescenta a recusa de crédito sem
     cartão (vai junto com o APK novo). A de 230300 é a de 230000 mais a
     recusa, e nada mais. */
  const vozCarteira = lerMig('20260923230000_voz_devolve_carteira.sql');
  const fVozCarteira = funcao(vozCarteira, 'registrar_operacao_voz');
  const voz = lerMig('20260923230300_voz_credito_exige_cartao.sql');
  const fVoz = funcao(voz, 'registrar_operacao_voz');
  const fimRecusa = "hint = 'cartao_obrigatorio';\n    end if;";
  const blocoRecusa = fVoz.slice(fVoz.indexOf('\n    -- Decisao do autor (23/09/2026)'), fVoz.indexOf(fimRecusa) + fimRecusa.length);
  checar('voz 230000: não recusa crédito sem cartão (pode ir antes do APK novo)', fVozCarteira !== '' && !vozCarteira.includes("hint = 'cartao_obrigatorio'"));
  checar('voz 230000: recria a origem assistente na tabela', vozCarteira.includes("check (source in ('app', 'widget', 'assistente'))"));
  checar('voz 230300 = 230000 + só a recusa', blocoRecusa.length > 50 && fVoz.split(blocoRecusa).join('') === fVozCarteira);
  checar('voz: cartão legado sem carteira aceito (APK antigo apaga a fala em 23503)',
    fVoz.includes('and (c.wallet_id = v_wallet_id or c.wallet_id is null)'));
  checar('voz: crédito sem cartão recusa com 23514 e hint cartao_obrigatorio',
    /if v_payment_method = 'credit' and v_card_id is null then\s+raise exception '[^']+'\s+using errcode = '23514', hint = 'cartao_obrigatorio';/.test(fVoz));
  checar('voz: aceita as três origens (app, widget, assistente)',
    fVoz.includes("p_source not in ('app', 'widget', 'assistente')"));
  checar('voz: wallet_id gravado em lançamento, parcela e conta',
    (fVoz.match(/card_id, wallet_id, payment_method/g) ?? []).length === 2 &&
    fVoz.includes('recurring, wallet_id, source, source_event_id'));
  checar('voz: sem carteira no pedido, usa a do cartão',
    /select c\.wallet_id into v_wallet_id\s+from public\.credit_cards c/.test(fVoz));
  checar('voz: cartão de outra carteira continua recusado', 
    /c\.wallet_id = v_wallet_id or c\.wallet_id is null\)\s+\) then\s+raise exception 'Cartao nao pertence a carteira escolhida' using errcode = '23503';/.test(fVoz));
  checar('voz: schema.sql igual à migration', fVoz !== '' && funcao(sqlLf, 'registrar_operacao_voz') === fVoz);

  const pagar = lerMig('20260923230100_pagar_fatura_valida_ciclo.sql');
  const fPagar = funcao(pagar, 'pagar_fatura_cartao');
  checar('pagar_fatura: recusa ciclo que não começou com 22023 e hint ciclo_invalido',
    /if v_inicio_ciclo > \(now\(\) at time zone 'America\/Sao_Paulo'\)::date then\s+raise exception '[^']+'\s+using errcode = '22023', hint = 'ciclo_invalido';/.test(fPagar));
  checar('pagar_fatura: dia efetivo = min(closing_day, último dia do mês)', /least\(\s*v_card\.closing_day::int,/.test(fPagar));
  const repetido = fPagar.indexOf('if found then\n    return v_invoice;');
  checar('pagar_fatura: pagamento repetido devolvido ANTES da validação do ciclo',
    repetido > 0 && repetido < fPagar.indexOf('v_inicio_ciclo :='));
  checar('pagar_fatura: cartão do próprio usuário', fPagar.includes('where c.id = p_card_id and c.user_id = v_user'));
  checar('pagar_fatura: execução revogada de anon',
    pagar.includes('revoke all on function public.pagar_fatura_cartao(uuid, integer, integer, numeric, date, uuid) from public, anon;'));
  checar('pagar_fatura: schema.sql igual à migration', fPagar !== '' && funcao(sqlLf, 'pagar_fatura_cartao') === fPagar);

  const trava = lerMig('20260923230200_travar_fechamento_com_historico.sql');
  const fTrava = funcao(trava, 'travar_fechamento_com_historico');
  checar('fechamento: só recusa quando o closing_day MUDA (o app manda o valor inalterado em toda edição)',
    fTrava.includes('new.closing_day is distinct from old.closing_day and ('));
  checar('fechamento: histórico = lançamento OU fatura paga',
    fTrava.includes('from public.transactions t where t.card_id = old.id') &&
    fTrava.includes('from public.credit_card_invoices i where i.card_id = old.id'));
  checar('fechamento: recusa com 23514 e hint fechamento_bloqueado',
    fTrava.includes("using errcode = '23514', hint = 'fechamento_bloqueado'"));
  checar('fechamento: trigger só em update de closing_day',
    /before update of closing_day on public\.credit_cards\s+for each row execute function public\.travar_fechamento_com_historico\(\);/.test(trava));
  const revogaTrava = /revoke all on function public\.travar_fechamento_com_historico\(\) from public, anon, authenticated;/;
  checar('fechamento: trigger interno não fica exposto como RPC', revogaTrava.test(trava) && revogaTrava.test(sqlLf));
  checar('fechamento: schema.sql igual à migration', fTrava !== '' && funcao(sqlLf, 'travar_fechamento_com_historico') === fTrava);

  const credito = lerMig('20260923230400_transacao_credito_exige_cartao.sql');
  const fCredito = funcao(credito, 'exigir_cartao_no_credito');
  checar('crédito sem cartão: trigger só em INSERT (órfão gravado continua editável)',
    /before insert on public\.transactions\s+for each row execute function public\.exigir_cartao_no_credito\(\);/.test(credito) &&
    !/before (?:insert or )?update/.test(credito));
  checar('crédito sem cartão: recusa com 23514 e hint cartao_obrigatorio',
    /if new\.payment_method = 'credit' and new\.card_id is null/.test(fCredito) &&
    fCredito.includes("using errcode = '23514', hint = 'cartao_obrigatorio'"));
  checar('crédito sem cartão: continuação de série órfã isenta (a recorrência vai em lote único)',
    /new\.parent_id is not null\s+and exists \(\s+select 1 from public\.transactions p\s+where p\.id = new\.parent_id\s+and p\.user_id = new\.user_id\s+and p\.payment_method = 'credit'\s+and p\.card_id is null/.test(fCredito));
  const revogaCredito = /revoke all on function public\.exigir_cartao_no_credito\(\) from public, anon, authenticated;/;

  // `$$` virando `$` numa geração por script: pego no Postgres embutido em 23/09.
  checar('crédito sem cartão: trigger interno não exposto como RPC', revogaCredito.test(credito) && revogaCredito.test(sqlLf));
  checar('crédito sem cartão: schema.sql igual à migration', fCredito !== '' && funcao(sqlLf, 'exigir_cartao_no_credito') === fCredito);

  for (const [nome, texto] of [['voz 230000', vozCarteira], ['voz 230300', voz], ['pagar', pagar], ['trava', trava], ['credito', credito], ['schema.sql', sqlLf]] as const) {
    checar(`${nome}: nenhum bloco com '$' solto no lugar de '$$'`, !/^(?:do|end|as) \$;?$/m.test(texto));
  }

  const previa = readFileSync(path.join(__dirname, '..', 'supabase', 'previa-faturas-mes-civil.sql'), 'utf8');
  checar('prévia das faturas antigas é somente leitura',
    !/\b(update|delete|insert|alter|drop|create|truncate|grant)\b/i.test(previa.replace(/--[^\n]*/g, '')));
}

console.log(`\n${total - falhas}/${total} guardas do schema passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
