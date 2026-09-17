/*
 * Lançamento pelo chat do Granabô.
 *
 * ── O defeito que originou isto ────────────────────────────────────────────
 *
 * Em 14/09/2026 o autor relatou: "o Granabô não está fazendo lançamento quando
 * envio um lançamento no chat pra ele fazer". A causa era estrutural — das
 * dezesseis ferramentas do assistente, NENHUMA escrevia. Ele só consultava.
 *
 * E havia um segundo defeito, pior: nada impedia o modelo de AFIRMAR que tinha
 * registrado. A única trava (`respostaFundamentada`) só recusa valor em R$ sem
 * evidência — uma frase como "Prontinho, lançamento registrado!", sem cifrão,
 * passava inteira. A pessoa fecharia o app achando que o gasto está lançado.
 *
 * ── O que este teste garante ───────────────────────────────────────────────
 *
 * Roda os MÓDULOS REAIS: o interpretador compartilhado (o mesmo que a Edge
 * Function importa) e as regras de fundamentação de `assistant-learning.ts`.
 * Não reimplementa regra nenhuma — reimplementar passaria mesmo com a
 * produção quebrada.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');

let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };
const igual = (a, b, nome) => { assert.deepEqual(a, b, nome); passou++; };

/* Carrega um módulo Deno (`.ts` com import relativo terminando em .ts)
   resolvendo os imports de verdade, em vez de dublá-los: o objetivo é exercitar
   a MESMA cadeia que roda no servidor. */
const cache = new Map();
function carregar(arquivo) {
  const abs = path.resolve(arquivo);
  if (cache.has(abs)) return cache.get(abs);
  const exports = {};
  cache.set(abs, exports);
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console, JSON, Date, String, Object, Array, Error, RegExp, Number, Math, Set, Map,
    require: (id) => carregar(path.resolve(path.dirname(abs), id)),
  }, { filename: arquivo });
  return exports;
}

const interp = carregar('supabase/functions/_shared/interpretar-lancamento.ts');
const aprendizado = carregar('supabase/functions/_shared/assistant-learning.ts');

/* ── 1. A leitura do lançamento é determinística e bate com o app ────────── */
{
  const casos = [
    ['almoço 20 reais', 20, 'out', 'Alimentação'],
    ['lança 38,50 de mercado', 38.5, 'out', 'Alimentação'],
    ['uber 15', 15, 'out', 'Transporte'],
    ['recebi 2500 de salário', 2500, 'in', 'Salário'],
    ['farmácia 45,90', 45.9, 'out', 'Saúde'],
  ];
  for (const [frase, valor, tipo, categoria] of casos) {
    igual(interp.guessAmountFromText(frase), valor, 'valor de: ' + frase);
    igual(interp.guessTypeFromText(frase), tipo, 'tipo de: ' + frase);
    igual(interp.guessCategoryFromText(frase, []).name, categoria, 'categoria de: ' + frase);
  }

  /* O inteiro solto passa aqui de propósito: no chat o texto é DIGITADO e a
     pessoa lê antes de enviar. A trava de voz (`precisaRevisarValorVoz`), que
     existe porque o reconhecedor de áudio pode colar reais e centavos sem
     ninguém ver, não foi trazida para cá — e não pode ser, senão "lança 20 de
     almoço" cairia em revisão, que é exatamente a queixa que originou a
     correção da voz no mesmo dia. */
  igual(interp.guessAmountFromText('lança 20 de almoço'), 20, 'inteiro digitado vale no chat');
  ok(!('precisaRevisarValorVoz' in interp), 'a trava de voz nao foi trazida para o chat');
  igual(
    interp.guessDescFromText('boleto para o dia 13 de setembro, 47 reais Liga das lendas', 'out'),
    'Liga das lendas',
    'boleto usa o nome depois do valor, nao o mes da data'
  );
}

/* ── 2. Frase sem valor não vira lançamento ──────────────────────────────── */
{
  for (const frase of ['gastei muito com comida esse mês', 'quanto gastei no mercado?']) {
    const v = interp.guessAmountFromText(frase);
    ok(!Number.isFinite(v) || v <= 0, 'sem valor explicito nao ha o que lancar: ' + frase);
  }
}

/* ── 3. Categoria não reconhecida precisa virar pergunta, não 'Outros' ───── */
{
  const cat = interp.guessCategoryFromText('paguei 80 pro fulano', []);
  igual(cat.name, 'Outros', 'o interpretador sinaliza o desconhecido como Outros');
  /* É esse 'Outros' que o executor usa para PERGUNTAR em vez de gravar. Se um
     dia o interpretador passar a devolver outra coisa, o executor grava na
     categoria errada em silêncio — por isso o sinal está preso aqui. */
}

/* ── 4. Escrita conta como fonte de valor, mas nunca vira exemplo aprendido ─ */
{
  ok(aprendizado.ESCRITAS.has('criarLancamento'), 'criarLancamento e reconhecida como escrita');
  ok(aprendizado.META.has('criarLancamento'), 'e fica fora da injecao de filtros da conversa');

  const registroDeEscrita = {
    nome: 'criarLancamento',
    args: { texto: 'almoço 20 reais' },
    resultado: 'Lançamento registrado: R$ 20,00 em Alimentação (Almoço), na carteira Principal.',
    ok: true,
    consulta: false,
  };

  /* O ponto exato do defeito: a confirmação verdadeira cita o valor gravado.
     Sem `ESCRITAS` em `permitidos`, essa frase seria reprovada e o app diria
     "não consegui" DEPOIS de o dinheiro ter entrado. */
  ok(
    aprendizado.respostaFundamentada('Pronto! Lancei R$ 20,00 em Alimentação.', [registroDeEscrita]),
    'a confirmacao do valor realmente gravado e aceita'
  );
  ok(
    !aprendizado.respostaFundamentada('Lancei R$ 999,00 em Alimentação.', [registroDeEscrita]),
    'mas um valor que a ferramenta nao devolveu continua reprovado'
  );
  ok(
    !aprendizado.exemploElegivel('Pronto! Lancei R$ 20,00.', [registroDeEscrita]),
    'uma escrita NUNCA vira exemplo aprendido — senao o assistente repetiria lancamento por semelhanca'
  );

  /* E se o modelo falhar em redigir, a saída de emergência diz o que FOI
     FEITO. A mensagem genérica de falha mandaria a pessoa lançar de novo, e
     ela terminaria com o gasto em dobro. */
  const saida = aprendizado.fallbackSeguro([registroDeEscrita]);
  ok(/R\$ 20,00/.test(saida), 'o fallback repete o que foi gravado');
  ok(!/nao consegui|não consegui/i.test(saida), 'e nunca diz "nao consegui" depois de ter gravado');

  /* ── Afirmar escrita sem ter chamado ferramenta de escrita ──────────────
   *
   * Observado no Granachat em 16/09/2026, durante a auditoria: o chat
   * respondeu "Desfeito. Removi o último lançamento que eu tinha registrado."
   * numa hora em que NADA foi desfeito no banco — `voice_operations` sem
   * `undone_at` correspondente e a transação ainda na tabela. A trava de
   * valores não pega isso: a frase não tem um único "R$". */
  const consulta = { nome: 'gastoPorCategoria', args: {}, resultado: 'R$ 113,30 em Alimentação.', ok: true, consulta: true };
  const desfazerRecusado = { nome: 'desfazerUltimoLancamento', args: {}, resultado: 'Não consegui desfazer. O lançamento continua na sua conta.', ok: false, consulta: false };
  const desfazerSemNada = { nome: 'desfazerUltimoLancamento', args: {}, resultado: 'Não tenho lançamento recente meu para desfazer.', ok: true, consulta: false };

  for (const frase of [
    'Desfeito. Removi o último lançamento que eu tinha registrado.',
    'Prontinho, lançamento registrado!',
    'Pronto, já apaguei esse gasto pra você.',
    'Feito! Anotei aqui.',
    'Seu lançamento foi salvo.',
  ]) {
    ok(!aprendizado.respostaFundamentada(frase, []), `sem ferramenta nenhuma, "${frase}" e reprovada`);
    ok(!aprendizado.respostaFundamentada(frase, [consulta]), `so com consulta, "${frase}" e reprovada`);
  }

  /* Chamar a ferramenta não basta: se ela RECUSOU, o modelo não pode dizer que
     desfez. Era o buraco que sobrava quando a regra olhava só a chamada. */
  ok(
    !aprendizado.respostaFundamentada('Pronto, desfiz o último lançamento.', [desfazerRecusado]),
    'ferramenta chamada e recusada: afirmar que desfez e reprovado'
  );
  /* Com a escrita aceita, a resposta passa — e o que chega à tela é o texto da
     ferramenta, literal, por respostaFinalSegura. */
  ok(
    aprendizado.respostaFundamentada('O último lançamento já foi desfeito.', [desfazerSemNada]),
    'escrita aceita: a redacao do modelo passa'
  );
  ok(
    aprendizado.respostaFinalSegura('O último lançamento já foi desfeito.', [desfazerSemNada]) === desfazerSemNada.resultado,
    'e a tela mostra o texto da ferramenta, nao o do modelo'
  );
  ok(
    aprendizado.respostaFundamentada('Desfeito. Removi o último lançamento.', [{ ...desfazerSemNada, resultado: 'Desfeito. Removi o último lançamento que eu tinha registrado.' }]),
    'e a confirmacao verdadeira continua passando'
  );

  /* Negativas não são afirmação, e não podem ser barradas: são justamente o
     que se quer que o assistente diga quando não registrou. */
  for (const negativa of [
    'Ainda não registrei nada.',
    'Não consegui registrar esse lançamento.',
    'Não apaguei nada, o lançamento continua lá.',
    'Não removi nada agora: esse lançamento já não estava mais na conta.',
  ]) {
    ok(aprendizado.respostaFundamentada(negativa, []), `a negativa "${negativa}" nao pode ser barrada`);
  }

  /* E uma resposta de consulta comum segue passando: o filtro novo só olha
     afirmação de escrita. */
  ok(
    aprendizado.respostaFundamentada('Você gastou R$ 113,30 em Alimentação.', [consulta]),
    'resposta de consulta nao e afetada pelo filtro de escrita'
  );

  /* ── A confirmação do desfazer depende do que saiu do banco ──────────────
   *
   * A RPC devolve {status:'undone', count, replayed}. `count` vem ZERO quando
   * a operação já tinha sido desfeita, ou quando as linhas já não existiam
   * porque a pessoa apagou o lançamento à mão. Até 16/09/2026 o executor
   * tratava qualquer status != 'nada_para_desfazer' como sucesso. */
  const fn = fs.readFileSync('supabase/functions/assistente-financeiro/index.ts', 'utf8');
  const desfazer = fn.slice(fn.indexOf('async function executarDesfazerLancamento'));
  const corpo = desfazer.slice(0, desfazer.indexOf('\nasync function'));
  ok(/Number\(resposta\.count\) > 0/.test(corpo),
    'o executor so confirma o desfazer quando algo foi realmente removido');
  ok(/resposta\.status !== 'undone'/.test(corpo),
    'status inesperado nao vira confirmacao de remocao');
  ok(
    corpo.indexOf("'Desfeito. Removi") > corpo.indexOf('Number(resposta.count) > 0'),
    'a frase de sucesso vem DEPOIS das guardas, nunca como saida padrao'
  );

  /* Todo texto do desfazer que o filtro ACEITA vai literal para a tela, então
     não pode conter instrução para o modelo. Na v34, "Não removi nada" chegou
     ao Granachat com "Diga isso ao usuário e peça para conferir..." no fim. */
  const textos = [...corpo.matchAll(/return '([^']+)';/g)].map((m) => m[1]);
  ok(textos.length >= 4, 'os quatro desfechos do desfazer tem texto proprio');
  for (const texto of textos.filter((t) => aprendizado.resultadoValido(t))) {
    ok(
      !/usu[aá]rio|\bdiga\b|\boriente\b|\bse ele\b|\bpe[cç]a para\b/i.test(texto),
      `texto que vai para a tela escrito para o modelo: ${texto}`
    );
  }
}

/* ── 5. A Edge Function declara as ferramentas e as regras que impedem a mentira ─ */
{
  const fonte = fs.readFileSync('supabase/functions/assistente-financeiro/index.ts', 'utf8');
  for (const alvo of ['criarLancamento', 'desfazerUltimoLancamento']) {
    ok(fonte.includes("name: '" + alvo + "'"), 'a ferramenta ' + alvo + ' esta declarada');
  }
  ok(/NUNCA afirme ter feito algo que voc[êe] n[ãa]o fez/.test(fonte),
    'a regra contra afirmar acao nao executada esta no prompt');
  ok(/Comentar um gasto N[ÃA]O [ée] pedir para registr/.test(fonte),
    'a regra que separa conversa de comando esta no prompt');
  ok(fonte.includes("p_source: 'assistente'"),
    'a gravacao usa a origem propria do assistente, nao a da voz nem a do widget');

  /* Nada de lançamento pode depender do WhatsApp: a feature será apagada por
     inteiro, e o registro de dinheiro não pode cair junto. */
  ok(!/whatsapp/i.test(fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')),
    'o assistente nao referencia whatsapp em codigo');
  /* No interpretador o que importa é o CÓDIGO: os comentários herdados do port
     citam o bot porque explicam por que cada heurística tem a forma que tem —
     "achado num lançamento real por WhatsApp" é a origem do caso de teste, e
     apagar isso perderia o porquê. O que não pode existir é import ou chamada.
     Quando o WhatsApp for removido, esses comentários se atualizam em
     `lib/heuristics.ts` e o port vem junto. */
  const interpCodigo = fs.readFileSync('supabase/functions/_shared/interpretar-lancamento.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  ok(!/whatsapp/i.test(interpCodigo),
    'o interpretador compartilhado nao referencia whatsapp em codigo');
}

/* ── 6. A migration estende o núcleo da voz em vez de criar um paralelo ──── */
{
  const mig = fs.readFileSync('supabase/migrations/20260914120000_lancamento_pelo_assistente.sql', 'utf8');
  ok(/check \(source in \('app', 'widget', 'assistente'\)\)/.test(mig),
    'a tabela passa a aceitar a origem assistente');
  ok(/p_source not in \('app', 'widget', 'assistente'\)/.test(mig),
    'e a RPC tambem');
  ok(/desfazer_ultimo_lancamento_assistente/.test(mig), 'o desfazer proprio do assistente existe');
  ok(/source = 'assistente'/.test(mig), 'e so alcanca o que o proprio assistente criou');
  ok(/interval '30 minutes'/.test(mig), 'limitado aos ultimos 30 minutos');
  ok(!/create table/i.test(mig), 'nenhuma tabela paralela foi criada — reusa voice_operations');
}

/* ── 7. Os três regressions reportados no aparelho ficam presos no código ── */
{
  const executor = fs.readFileSync('supabase/functions/assistente-financeiro/index.ts', 'utf8');
  ok(/const ehBoleto = ehIntencaoBoleto\(financeiro\)/.test(executor),
    'boleto e decidido antes do ramo de credito');
  ok(/const parcelas = parseParcelas\(financeiro\)/.test(executor),
    'parcelas sao extraidas antes de montar a operacao');
  ok(/const kind = ehBoleto \? 'bill' : parcelas && parcelas >= 2 \? 'installment' : 'transaction'/.test(executor),
    'compra parcelada sempre recebe o tipo installment');
  ok(/payload\.installments = parcelas/.test(executor),
    'a quantidade de parcelas chega ao payload da RPC');

  const chat = fs.readFileSync('components/Granachat.tsx', 'utf8');
  ok(/if \(!manterScrollNoFimRef\.current\) return;/.test(chat),
    'auto-scroll nao interrompe quem esta lendo acima');
  ok(/onScroll=\{registrarPosicaoScroll\}/.test(chat),
    'Granachat acompanha a posicao real da lista');
}

console.log(`granabo-lancamento: ${passou} verificacoes OK`);
