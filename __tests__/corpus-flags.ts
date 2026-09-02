/**
 * Corpus dos interruptores remotos (`lib/feature-flags.tsx`).
 *
 * Lógica pura, sem React e sem rede: `efetivamenteLigado` é exportada
 * justamente para poder ser testada assim.
 *
 * A regra que mais importa aqui é a FALHA ABERTA. Um erro nela não aparece
 * como bug — aparece como o app inteiro parecendo quebrado para todo mundo ao
 * mesmo tempo, no pior momento possível (durante uma instabilidade do
 * Supabase, que é exatamente quando ninguém tem paciência).
 */
import { readFileSync } from 'fs';
import { efetivamenteLigado, type Flag } from '../lib/feature-flags-regras';

let passaram = 0;
let falhas = 0;

function checar(descricao: string, condicao: boolean, detalhe = '') {
  if (condicao) passaram++;
  else {
    falhas++;
    console.log('FALHOU   ' + descricao + (detalhe ? ' — ' + detalhe : ''));
  }
}

const AGORA = Date.now();
const ONTEM = new Date(AGORA - 24 * 3600 * 1000).toISOString();
const AMANHA = new Date(AGORA + 24 * 3600 * 1000).toISOString();

function flag(over: Partial<Flag> = {}): Flag {
  return {
    key: 'whatsapp',
    enabled: false,
    titulo: 'Fora do ar',
    mensagem: 'Está passando por instabilidade.',
    severidade: 'aviso',
    reativa_em: null,
    aviso_versao: 1,
    plataformas: null,
    versao_min: null,
    versao_max: null,
    ...over,
  };
}

/* ── Base ──────────────────────────────────────────────────────────────── */

checar('enabled=true está ligado', efetivamenteLigado(flag({ enabled: true }), '1.4.1', 'android'));
checar('enabled=false está desligado', !efetivamenteLigado(flag(), '1.4.1', 'android'));

/* ── Religamento automático ────────────────────────────────────────────── */

checar(
  'reativa_em no passado religa sozinho',
  efetivamenteLigado(flag({ reativa_em: ONTEM }), '1.4.1', 'android')
);
checar(
  'reativa_em no futuro mantém desligado',
  !efetivamenteLigado(flag({ reativa_em: AMANHA }), '1.4.1', 'android')
);

/* ── Escopo por plataforma ─────────────────────────────────────────────── */

checar(
  'desligado só no Android não afeta o iOS',
  efetivamenteLigado(flag({ plataformas: ['android'] }), '1.4.1', 'ios')
);
checar(
  'desligado só no Android afeta o Android',
  !efetivamenteLigado(flag({ plataformas: ['android'] }), '1.4.1', 'android')
);
checar(
  'plataformas nulo vale para todas',
  !efetivamenteLigado(flag({ plataformas: null }), '1.4.1', 'ios')
);
checar(
  'plataformas vazio vale para todas (não é "nenhuma")',
  !efetivamenteLigado(flag({ plataformas: [] }), '1.4.1', 'ios')
);

/* ── Escopo por versão ─────────────────────────────────────────────────── */

checar(
  'versao_max 1.4.1 não desliga quem está na 1.5.0',
  efetivamenteLigado(flag({ versao_max: '1.4.1' }), '1.5.0', 'android')
);
checar(
  'versao_max 1.4.1 desliga quem está na 1.4.1',
  !efetivamenteLigado(flag({ versao_max: '1.4.1' }), '1.4.1', 'android')
);
checar(
  'versao_min 1.5.0 não desliga quem está na 1.4.1',
  efetivamenteLigado(flag({ versao_min: '1.5.0' }), '1.4.1', 'android')
);
checar(
  'faixa fechada desliga só dentro dela',
  !efetivamenteLigado(flag({ versao_min: '1.4.0', versao_max: '1.4.9' }), '1.4.1', 'android')
);
/* Comparação numérica por segmento, não texto: "1.10.0" > "1.9.0" é verdade
   como versão e falso como string — foi por isso que compararVersoes existe. */
checar(
  '1.10.0 é mais nova que 1.9.0 (não comparar como texto)',
  efetivamenteLigado(flag({ versao_max: '1.9.0' }), '1.10.0', 'android')
);

/* ── Precedência: religamento vence escopo ─────────────────────────────── */

checar(
  'reativa_em vencido religa mesmo com escopo de plataforma casando',
  efetivamenteLigado(flag({ reativa_em: ONTEM, plataformas: ['android'] }), '1.4.1', 'android')
);

/* ── Sincronia entre a união do TypeScript e o seed do banco ───────────── */

const fonteFlags = readFileSync('lib/feature-flags-regras.ts', 'utf8');
const uniao = new Set(
  [...fonteFlags.matchAll(/^  \| '([a-z_]+)';?$/gm)].map((m) => m[1])
);

const schema = readFileSync('supabase/schema.sql', 'utf8');
const bloco = schema.slice(schema.indexOf('insert into feature_flags (key, enabled) values'));
const seed = new Set(
  [...bloco.slice(0, bloco.indexOf('on conflict')).matchAll(/\('([a-z_]+)',/g)].map((m) => m[1])
);

checar('ChaveFlag tem 13 chaves', uniao.size === 13, 'tem ' + uniao.size);
checar('o seed do schema tem 13 chaves', seed.size === 13, 'tem ' + seed.size);
checar(
  'ChaveFlag e o seed do banco têm exatamente as mesmas chaves',
  uniao.size === seed.size && [...uniao].every((k) => seed.has(k)),
  'só no tipo: ' + [...uniao].filter((k) => !seed.has(k)).join(', ') +
    ' | só no banco: ' + [...seed].filter((k) => !uniao.has(k)).join(', ')
);

/* Esta checagem existe porque a lista JÁ saiu de sincronia uma vez, na revisão
   do documento de plano: o tipo ficou com 4 chaves quando o inventário já
   tinha 13. Chave no banco e não no tipo não compila na chamada; chave no tipo
   e não no banco cai silenciosamente no caminho "desconhecida = ligada" e
   nunca desliga — o pior dos dois, porque não dá erro nenhum. */

console.log(
  '\n' + passaram + '/' + (passaram + falhas) + ' checagens de interruptores passaram — ' + falhas + ' falhas'
);
if (falhas > 0) process.exit(1);
