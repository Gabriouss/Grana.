// Sonda com escrita: executar somente com autorização para popular a conta QA.
// Credenciais exclusivamente por variáveis de ambiente. Reexecução não duplica fixtures.
const fs = require('node:fs');
const path = require('node:path');
const cfg = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/)
  .filter((s) => /^[A-Z_]+=/.test(s)).map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1).replace(/^['"]|['"]$/g, '')]; }));
const url = cfg.EXPO_PUBLIC_SUPABASE_URL;
const headers = { apikey: cfg.EXPO_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
async function request(endpoint, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(url + endpoint, { method, headers: { ...headers, Prefer: 'return=representation' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}
const marker = 'QA Granabo 20260906';
const report = { criado: new Date().toISOString(), cartoes: [], lancamentos: [], testes: [] };
const output = path.resolve('docs/GRANABO_TESTE_CARTOES_20260906.json');
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2));
(async () => {
  const auth = await request('/auth/v1/token?grant_type=password', { email: process.env.GRANA_QA_EMAIL, password: process.env.GRANA_QA_PASSWORD });
  if (auth.user.email !== 'gbr.design30@gmail.com') throw new Error('Conta fora do escopo QA autorizado');
  headers.Authorization = 'Bearer ' + auth.access_token;
  const uid = auth.user.id;
  const existing = await request('/rest/v1/credit_cards?select=id,name,closing_day,due_day');
  for (const [name, bank, closing_day, due_day, color] of [
    ['QA C6', 'c6', 15, 22, '#00BFA5'], ['QA Nubank', 'nubank', 25, 2, '#820AD1'],
  ]) {
    let card = existing.find((c) => c.name === name);
    if (!card) [card] = await request('/rest/v1/credit_cards', { user_id: uid, name, bank, closing_day, due_day, color, limit_amount: 10000 });
    if (card.closing_day !== closing_day) throw new Error('Cartão QA existente tem outro fechamento');
    report.cartoes.push({ id: card.id, name, closing_day, due_day });
  }
  const specs = [
    [0, '2026-07-20', 80, 'Alimentação'], [0, '2026-08-14', 40, 'Alimentação'],
    [0, '2026-08-15', 100, 'Alimentação'], [0, '2026-08-24', 150, 'Alimentação'],
    [0, '2026-09-06', 25, 'Alimentação'], [0, '2026-08-30', 60, 'Outros'],
    [1, '2026-07-26', 90, 'Alimentação'], [1, '2026-08-24', 110, 'Alimentação'],
    [1, '2026-08-25', 200, 'Alimentação'], [1, '2026-09-01', 50, 'Alimentação'],
    [1, '2026-09-06', 75, 'Alimentação'], [1, '2026-08-30', 70, 'Outros'],
    [null, '2026-09-04', 999, 'Alimentação', 'pix'], [null, '2026-09-05', 888, 'Alimentação', 'debit'],
  ];
  const prior = await request('/rest/v1/transactions?select=id,description&description=like.QA%20Granabo%2020260906*');
  for (const [i, [card, occurred_on, amount, category, payment_method = 'credit']] of specs.entries()) {
    const description = `${marker} #${i + 1}`;
    const payload = { user_id: uid, type: 'out', description, amount, category, color: '#00BFA5', occurred_on,
      recurring: false, card_id: card === null ? null : report.cartoes[card].id, payment_method, installment_current: 1, installment_total: 1 };
    let tx = prior.find((r) => r.description === description);
    if (!tx) [tx] = await request('/rest/v1/transactions', payload);
    report.lancamentos.push({ id: tx.id, description, amount, category, occurred_on, payment_method, cartao: card === null ? null : report.cartoes[card].name });
  }
  save();
  console.log('Fixtures prontas: 2 cartões, 6 lançamentos em cada e 2 controles Pix/débito.');
  const history = [];
  for (const [pergunta, esperado, cartao] of [
    ['Quanto gastei em Alimentação na fatura passada do cartão QA C6?', 120, 'C6'],
    ['E na fatura atual?', 275, 'C6'],
    ['E no cartão QA Nubank?', 325, 'Nubank'],
    ['E na categoria Outros?', 70, 'Nubank'],
    ['Qual é o total da fatura atual desse cartão, considerando todas as categorias?', 395, 'Nubank'],
    ['E o total da fatura atual do QA C6, em todas as categorias?', 335, 'C6'],
    ['Quanto gastei em Alimentação apenas no crédito do QA C6 na fatura atual, sem Pix nem débito?', 275, 'C6'],
    ['E em Alimentação na fatura passada do QA Nubank?', 200, 'Nubank'],
    ['E na fatura atual?', 325, 'Nubank'],
  ]) {
    const start = Date.now();
    try {
      const result = await request('/functions/v1/assistente-financeiro', { mensagem: pergunta, historico: history.slice(-20) });
      const valores = [...String(result.resposta).matchAll(/R\$\s*(\d[\d.]*(?:,\d{2})?)/g)].map((m) => Number(m[1].replace(/\./g, '').replace(',', '.')));
      const ok = valores.length === 1 && valores[0] === esperado && result.resposta?.toLowerCase().includes(cartao.toLowerCase());
      const entry = { pergunta, esperado, resposta: result.resposta, ferramenta: result.ferramenta, segundos: Math.round((Date.now() - start) / 100) / 10, passou: !!ok };
      report.testes.push(entry); console.log(JSON.stringify(entry));
      history.push({ papel: 'usuario', texto: pergunta }, { papel: 'assistente', texto: result.resposta });
    } catch (e) { const entry = { pergunta, erro: e.message, passou: false }; report.testes.push(entry); console.log(JSON.stringify(entry)); }
    save();
  }
  console.log('Relatório: ' + output);
})().catch((e) => { save(); console.error(e.message); process.exitCode = 1; });
