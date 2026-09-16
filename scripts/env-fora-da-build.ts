/**
 * O `.env` não pode ir no pacote que o EAS manda para o servidor de build.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 *
 * Com um `.easignore` na raiz, o EAS NÃO lê o `.gitignore`: ele copia a pasta
 * de trabalho inteira e só tira o que o `.easignore` manda tirar (conferido
 * no código do `eas-cli` 24.3.0). O `.easignore` nasceu em 01/09/2026
 * (`00de222`) sem a linha do `.env`, e toda build desde então levou o `.env`
 * da máquina que a disparou. A 1.10.2, em 12/09, levou os segredos da Cakto,
 * do GitHub, do Supabase e da Vercel para o servidor do EAS. A regra foi
 * corrigida em `4ce2242`, e esta checagem impede que ela se perca de novo —
 * numa edição do `.easignore`, ou numa máquina que buildar sem ter puxado a
 * correção.
 *
 * O `preparar-lancamento.ts` chama isto antes de escrever qualquer coisa, e
 * recusa preparar a build se algum arquivo de variáveis for no pacote.
 *
 * ── Como as regras são lidas ──────────────────────────────────────────────
 *
 * Só importam arquivos da RAIZ do projeto, que é onde o Expo procura o
 * `.env`. Para eles, a sintaxe do `.gitignore` se reduz ao que está abaixo:
 * padrão terminado em `/` só vale para pasta; padrão com `/` no meio aponta
 * para dentro de uma pasta; `!` devolve o arquivo ao pacote; a última regra
 * que casa decide. O teste confere o resultado contra a biblioteca `ignore`,
 * a mesma que o `eas-cli` usa — ela não é dependência declarada do projeto,
 * por isso não é usada aqui.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/** Nomes que o Expo carrega, mesmo que ainda não existam nesta máquina. */
export const NOMES_DE_VARIAVEIS = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
  '.env.test',
  '.env.test.local',
];

/** Versionado de propósito, só com nomes e valores de exemplo. */
const PODE_IR = new Set(['.env.example']);

const escapar = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function padraoParaRegex(padrao: string): RegExp {
  let r = '';
  for (let i = 0; i < padrao.length; i++) {
    const c = padrao[i];
    if (c === '\\' && i + 1 < padrao.length) {
      r += escapar(padrao[++i]);
    } else if (c === '*') {
      r += '[^/]*';
      while (padrao[i + 1] === '*') i++;
    } else if (c === '?') {
      r += '[^/]';
    } else if (c === '[') {
      const fim = padrao.indexOf(']', i + 2);
      if (fim < 0) {
        r += '\\[';
      } else {
        // Sem negação: a biblioteca `ignore` do eas-cli lê "[!v]" e "[^v]" como
        // os caracteres "!"/"^" e "v", diferente do git. Vale o que o EAS faz.
        const classe = padrao.slice(i + 1, fim).replace(/[\\^\]]/g, '\\$&');
        r += '[' + classe + ']';
        i = fim;
      }
    } else {
      r += escapar(c);
    }
  }
  return new RegExp('^' + r + '$');
}

/** Se um arquivo da raiz fica FORA do pacote, segundo estas regras. */
export function ficaForaDoPacote(nome: string, regras: string): boolean {
  let fora = false;
  for (const bruta of regras.split(/\r?\n/)) {
    let linha = bruta.replace(/(?<!\\)\s+$/, '');
    if (!linha || linha.startsWith('#')) continue;
    let devolve = false;
    if (linha.startsWith('!')) {
      devolve = true;
      linha = linha.slice(1);
    }
    if (linha.endsWith('/')) continue; // só pasta
    if (linha.startsWith('/')) linha = linha.slice(1);
    else if (linha.startsWith('**/')) linha = linha.slice(3);
    if (linha.includes('/')) continue; // aponta para dentro de uma pasta
    if (padraoParaRegex(linha).test(nome)) fora = !devolve;
  }
  return fora;
}

export type ResultadoDoPacote = {
  /** De onde o EAS tira as regras: `.easignore` manda sozinho quando existe. */
  fonte: '.easignore' | '.gitignore' | 'nenhuma';
  /** Arquivos de variáveis que IRIAM para o servidor de build. */
  vaoNoPacote: string[];
};

export function variaveisNoPacoteDaBuild(raiz: string): ResultadoDoPacote {
  const easignore = join(raiz, '.easignore');
  const gitignore = join(raiz, '.gitignore');
  const fonte = existsSync(easignore) ? '.easignore' : existsSync(gitignore) ? '.gitignore' : 'nenhuma';
  const regras = fonte === 'nenhuma' ? '' : readFileSync(join(raiz, fonte), 'utf8');
  const presentes = readdirSync(raiz).filter((nome) => /^\.env(?:\.|$)/.test(nome));
  const nomes = [...new Set([...NOMES_DE_VARIAVEIS, ...presentes])].filter((nome) => !PODE_IR.has(nome));
  return { fonte, vaoNoPacote: nomes.filter((nome) => !ficaForaDoPacote(nome, regras)) };
}
