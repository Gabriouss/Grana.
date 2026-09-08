import assert from 'node:assert/strict';
import { limparReferenciaCarteira, matchWalletByText } from '../lib/heuristics';

const wallets = [
  { id: 'pessoal', name: 'Pessoal' },
  { id: 'empresa', name: 'Empresa' },
  { id: 'viagem', name: 'Viagem São Paulo' },
];

assert.equal(matchWalletByText('festa 143,98 reais carteira empresa', wallets)?.id, 'empresa');
assert.equal(matchWalletByText('mercado 34 reais na conta pessoal', wallets)?.id, 'pessoal');
assert.equal(matchWalletByText('hotel 500 carteira viagem sao paulo', wallets)?.id, 'viagem');
assert.equal(matchWalletByText('mercado 34 reais', wallets), null);
assert.equal(limparReferenciaCarteira('festa 143,98 reais carteira empresa', 'Empresa'), 'festa 143,98 reais');

console.log('OK — nomes personalizados de carteira reconhecidos e removidos da descrição.');
