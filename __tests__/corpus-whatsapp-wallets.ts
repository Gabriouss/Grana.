import assert from 'node:assert/strict';
import path from 'node:path';
import { corpoDaFuncao } from './extrair';

const webhook = path.join(__dirname, '..', 'supabase', 'functions', 'whatsapp-webhook', 'index.ts');
const keywords = path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'category-keywords.ts');

const fonte = [
  corpoDaFuncao('normalizarParaBusca', keywords),
  corpoDaFuncao('normalizarNomeCarteira', webhook),
  corpoDaFuncao('carteiraFoiMencionada', webhook),
  corpoDaFuncao('carteirasMencionadas', webhook),
  corpoDaFuncao('limparReferenciaCarteira', webhook),
  corpoDaFuncao('carteirasElegiveisDoTexto', webhook),
].join('\n\n').replace(/:\s*CarteiraBusca(?:\[\])?/g, '');

const resolver = new Function(`${fonte}; return { carteiraFoiMencionada, carteirasMencionadas, limparReferenciaCarteira, carteirasElegiveisDoTexto };`)() as {
  carteiraFoiMencionada: (text: string) => boolean;
  carteirasMencionadas: (text: string, wallets: { id: string; name: string; is_default: boolean }[]) => { id: string; name: string; is_default: boolean }[];
  limparReferenciaCarteira: (text: string, walletName: string) => string;
  carteirasElegiveisDoTexto: (text: string, wallets: { id: string; name: string; is_default: boolean }[]) => {
    carteira: { id: string; name: string; is_default: boolean } | null;
    mencionada: boolean;
    erro: string | null;
  };
};

const wallets = [
  { id: 'pessoal', name: 'Pessoal', is_default: true },
  { id: 'empresa', name: 'Empresa', is_default: false },
  { id: 'viagem', name: 'Viagem São Paulo', is_default: false },
];

assert.equal(resolver.carteiraFoiMencionada('festa 143,98 reais carteira empresa'), true);
assert.equal(resolver.carteirasElegiveisDoTexto('festa 143,98 reais carteira empresa', wallets).carteira?.id, 'empresa');
assert.equal(resolver.carteirasElegiveisDoTexto('mercado 34 reais na conta pessoal', wallets).carteira?.id, 'pessoal');
assert.equal(resolver.carteirasElegiveisDoTexto('hotel 500 carteira viagem sao paulo', wallets).carteira?.id, 'viagem');
assert.equal(resolver.carteirasElegiveisDoTexto('mercado 34 reais', wallets).carteira?.id, 'pessoal');
assert.equal(resolver.carteirasElegiveisDoTexto('festa 10 carteira inexistente', wallets).erro, 'nao_encontrada');
assert.equal(resolver.limparReferenciaCarteira('festa 143,98 reais carteira empresa', 'Empresa'), 'festa 143,98 reais');

const semelhantes = [
  { id: 'pessoal', name: 'Pessoal', is_default: true },
  { id: 'pessoal-empresa', name: 'Pessoal Empresa', is_default: false },
];
assert.equal(resolver.carteirasElegiveisDoTexto('festa 10 carteira pessoal empresa', semelhantes).erro, 'ambigua');

console.log('OK — WhatsApp resolve carteiras personalizadas, padrão, inexistente e ambígua.');
