/* O que o webhook do EAS GRAVA em `app_release.apk_url`.
 *
 * O link de artefato do EAS expira, e o vencimento tem modo de falha
 * silencioso: em `lib/atualizacao.ts`, quem está numa build sem a URL estável
 * embutida cai no ramo que SUPRIME o aviso de atualização inteiro em vez de
 * mostrar um link morto. A pessoa simplesmente para de saber que saiu versão
 * nova — a regra 5 do AGENTS.md acontecendo por outro caminho.
 *
 * Em 09/09/2026 a produção estava assim: `apk_url` apontando para
 * `expo.dev/artifacts/eas/...` com vencimento em 23/09. Quem estava na 1.8.4
 * não seria afetado (a URL estável está embutida naquela build, conferido
 * abrindo o APK publicado), mas quem ficou numa build anterior perderia o
 * aviso em silêncio.
 *
 * A função é lida do ARQUIVO REAL (ver `extrair.ts`), não copiada: o webhook
 * é Deno e não carrega no Node, e um teste sobre uma cópia passaria mesmo com
 * a função de produção errada.
 *
 * Roda: npx tsx __tests__/eas-download-estavel.ts
 */
import * as path from 'path';
import { corpoDaFuncao } from './extrair';

const ARQUIVO = path.join(__dirname, '..', 'supabase', 'functions', 'eas-build-webhook', 'index.ts');

type Escolha = { url: string; expiraEm: string | null; ignorou: boolean };
const escolher = new Function(
  `${corpoDaFuncao('escolherDownloadPublicado', ARQUIVO)}
   return escolherDownloadPublicado;`
)() as (configurada: string | undefined, artefato: string, expiracao: string | null) => Escolha;

const ARTEFATO = 'https://expo.dev/artifacts/eas/9TRXShnbCgf0DtyXXD6c2ev__Mh2f4sQ0qFzoNUaAKo.apk';
const VENCE = '2026-09-23T00:10:27.997Z';
const ESTAVEL = 'https://granaponto.com.br/downloads/grana-latest.apk';

let falhas = 0;
let total = 0;
function checar(rotulo: string, obtido: unknown, esperado: unknown) {
  total++;
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++;
    console.log(`FALHA  [${rotulo}] = ${JSON.stringify(obtido)} (esperado ${JSON.stringify(esperado)})`);
  }
}

// Com endereço estável configurado, é ele que fica gravado — e sem data de
// vencimento, senão a data do artefato descartado seguiria suprimindo o aviso.
checar('estável configurada substitui o artefato', escolher(ESTAVEL, ARTEFATO, VENCE), {
  url: ESTAVEL, expiraEm: null, ignorou: false,
});

// Sem configuração, o comportamento antigo continua: artefato e a data dele.
checar('sem configuração, grava o artefato do EAS', escolher(undefined, ARTEFATO, VENCE), {
  url: ARTEFATO, expiraEm: VENCE, ignorou: false,
});
checar('string vazia é o mesmo que não configurada', escolher('', ARTEFATO, VENCE), {
  url: ARTEFATO, expiraEm: VENCE, ignorou: false,
});
checar('só espaços é o mesmo que não configurada', escolher('   ', ARTEFATO, VENCE), {
  url: ARTEFATO, expiraEm: VENCE, ignorou: false,
});

// Espaço em volta do valor no painel não pode invalidar a configuração.
checar('espaço em volta é aparado', escolher(`  ${ESTAVEL}  `, ARTEFATO, VENCE), {
  url: ESTAVEL, expiraEm: null, ignorou: false,
});

/* Valor errado NÃO pode virar silêncio: cai pro artefato, mas marca `ignorou`
   pro chamador registrar no log. Um `http://` ou um caminho solto aqui seria
   configuração quebrada, e configuração quebrada tem que aparecer. */
for (const ruim of ['http://granaponto.com.br/x.apk', '/downloads/grana-latest.apk', 'granaponto.com.br/x.apk', 'ftp://x/y.apk']) {
  checar(`valor inválido "${ruim}" cai pro artefato e avisa`, escolher(ruim, ARTEFATO, VENCE), {
    url: ARTEFATO, expiraEm: VENCE, ignorou: true,
  });
}

// Build sem data de expiração no payload continua sem data.
checar('artefato sem data de expiração', escolher(undefined, ARTEFATO, null), {
  url: ARTEFATO, expiraEm: null, ignorou: false,
});

// Maiúsculas no esquema são válidas — o teste existe porque a checagem é regex.
checar('HTTPS maiúsculo é aceito', escolher('HTTPS://granaponto.com.br/a.apk', ARTEFATO, VENCE), {
  url: 'HTTPS://granaponto.com.br/a.apk', expiraEm: null, ignorou: false,
});

console.log(`\n${total - falhas}/${total} checagens do link de download passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
