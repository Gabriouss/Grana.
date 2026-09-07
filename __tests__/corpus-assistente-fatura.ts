import { janelaFatura, mesFaturaDoLancamento } from '../supabase/functions/_shared/fatura-ciclo';

let total = 0;
let falhas = 0;
function checar(nome: string, ok: boolean, detalhe = '') {
  total += 1;
  if (!ok) falhas += 1;
  console.log(`${ok ? '✓' : '✗'} ${nome}${ok ? '' : ` — ${detalhe}`}`);
}

checar(
  'compra antes do fechamento fica na fatura do mês de fechamento',
  JSON.stringify(mesFaturaDoLancamento('2026-08-19', 20)) === JSON.stringify({ year: 2026, month: 7 }),
);
checar(
  'compra no dia do fechamento fica na próxima fatura',
  JSON.stringify(mesFaturaDoLancamento('2026-08-20', 20)) === JSON.stringify({ year: 2026, month: 8 }),
);
const janela = janelaFatura(2026, 8, 20);
checar('fatura de setembro começa em 20/08 e termina em 19/09', janela.inicio === '2026-08-20' && janela.fim === '2026-09-19', JSON.stringify(janela));
checar('rótulo da janela deixa o ciclo explícito', janela.rotulo === '20 ago – 19 set', janela.rotulo);

console.log(`\n${total - falhas}/${total} checagens do assistente por ciclo passaram — ${falhas} falhas`);
if (falhas) process.exitCode = 1;
