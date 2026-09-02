/**
 * Guarda ortográfica das notas de versão — o texto do pop-up "O que mudou no
 * Grana." (`components/NovidadesModal.tsx`, alimentado por `lib/atualizacao.ts`).
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 *
 * A versão 1.4.1 foi ao ar com "Corrige tela branca apos desbloqueio por
 * digital" — "apos" sem acento, num pop-up que abre na cara de TODO mundo que
 * atualiza. Não foi descuido isolado: é o caminho padrão do sistema.
 *
 * A cadeia inteira: os commits deste repositório são escritos sem acento por
 * convenção ("fix: estabiliza navegacao apos biometria"); quando o
 * `eas build` roda sem `--message`, o EAS preenche a mensagem do build com a
 * mensagem do commit; a Edge Function `eas-build-webhook` copia essa
 * mensagem VERBATIM para `app_release.notes`; e o app renderiza `notes` sem
 * tocar em nada. Ou seja, o default do pipeline publica texto interno, escrito
 * sem acento, como copy de produto. Ia acontecer de novo.
 *
 * Este módulo é o ponto onde a cadeia para. Ele NÃO conserta o texto: acento
 * é ambíguo demais em português para consertar por adivinhação ("esta"/"está",
 * "e"/"é", "pais"/"país"), e um conserto errado é pior que o erro original.
 * Ele REPROVA, alto e claro, e quem escreveu corrige.
 *
 * Usado em três lugares, e é de propósito que sejam três:
 *  1. `npm run notas:check "<mensagem>"` — antes do `eas build`, custa zero;
 *  2. a Edge Function `eas-build-webhook` — a rede de segurança, porque o
 *     passo 1 depende de alguém lembrar de rodar;
 *  3. `__tests__/corpus-notas-release.ts`, dentro de `npm run test:parser`.
 *
 * A cópia dentro da Edge Function (que roda em Deno e não importa do app) é
 * verificada por `__tests__/sync-parser.js` — divergir as duas é erro de teste.
 */

export type ProblemaNota = {
  tipo: 'acento' | 'commit-tecnico' | 'vazia';
  trecho: string;
  sugestao: string | null;
  explicacao: string;
};

/**
 * Palavras que, sem acento, simplesmente não existem em português — não há
 * leitura alternativa possível, então acusar é sempre correto.
 *
 * O que está FORA daqui é tão deliberado quanto o que está dentro: "esta"
 * (esta/está), "e" (e/é), "pais" (pais/país), "valido" (valido/válido),
 * "analise" (analise/análise), "duvida" (duvida/dúvida) e "secretaria" são
 * ambíguas de verdade — as duas grafias existem e significam coisas
 * diferentes. Acusar uma dessas travaria um build por causa de uma frase
 * correta, e um verificador que crava lobo onde não tem é um verificador que
 * alguém desliga.
 */
const ACENTUADAS_OBRIGATORIAS: Record<string, string> = {
  apos: 'após', ate: 'até', ja: 'já', alem: 'além', tambem: 'também',
  voce: 'você', mes: 'mês', atras: 'atrás', tras: 'trás', sera: 'será',
  historico: 'histórico', grafico: 'gráfico', credito: 'crédito',
  debito: 'débito', codigo: 'código', inicio: 'início', ultimo: 'último',
  unico: 'único', proximo: 'próximo', numero: 'número', rapido: 'rápido',
  automatico: 'automático', invalido: 'inválido', area: 'área',
  saude: 'saúde', pagina: 'página', media: 'média', minimo: 'mínimo',
  maximo: 'máximo', otimo: 'ótimo', proprio: 'próprio', memoria: 'memória',
};

/**
 * Regras por terminação. São elas que dão a garantia de verdade: uma lista de
 * palavras envelhece e deixa passar a próxima palavra que ninguém previu,
 * enquanto "nenhuma palavra do português termina em -cao sem til" continua
 * valendo para palavras que nunca vimos.
 *
 * Cada terminação abaixo é sempre acentuada em português — não existe
 * contraexemplo. Por isso "-oria" (categoria, memória) e "-aria" (padaria,
 * faria) ficaram DE FORA: nessas duas as duas formas existem.
 *
 * Uma palavra já acentuada não casa aqui, porque o caractere é outro:
 * "versão" não termina em "ao", termina em "ão".
 */
const REGRAS_DE_SUFIXO: { fim: string; minimo: number; troca: [string, string] }[] = [
  { fim: 'ao', minimo: 3, troca: ['ao', 'ão'] },
  { fim: 'oes', minimo: 4, troca: ['oes', 'ões'] },
  { fim: 'aos', minimo: 4, troca: ['aos', 'ãos'] },
  { fim: 'encia', minimo: 6, troca: ['encia', 'ência'] },
  { fim: 'encias', minimo: 7, troca: ['encias', 'ências'] },
  { fim: 'ancia', minimo: 6, troca: ['ancia', 'ância'] },
  { fim: 'ancias', minimo: 7, troca: ['ancias', 'âncias'] },
  { fim: 'ario', minimo: 5, troca: ['ario', 'ário'] },
  { fim: 'arios', minimo: 6, troca: ['arios', 'ários'] },
  { fim: 'orio', minimo: 5, troca: ['orio', 'ório'] },
  { fim: 'orios', minimo: 6, troca: ['orios', 'órios'] },
  { fim: 'avel', minimo: 5, troca: ['avel', 'ável'] },
  { fim: 'aveis', minimo: 6, troca: ['aveis', 'áveis'] },
  { fim: 'ivel', minimo: 5, troca: ['ivel', 'ível'] },
  { fim: 'iveis', minimo: 6, troca: ['iveis', 'íveis'] },
  { fim: 'ovel', minimo: 5, troca: ['ovel', 'óvel'] },
  { fim: 'oveis', minimo: 6, troca: ['oveis', 'óveis'] },
];

/**
 * Prefixo de Conventional Commits. Se a nota começa com "fix:" ou "feat:", a
 * mensagem do build é a mensagem do commit — quer dizer que o `eas build`
 * rodou sem `--message` e ninguém escreveu nota nenhuma. O pop-up ia mostrar
 * changelog técnico para quem só quer saber o que mudou no app.
 */
const PREFIXO_COMMIT = /^\s*(fix|feat|chore|docs|refactor|test|build|ci|perf|style|merge|revert)(\([^)]*\))?!?:/i;

/** Só as palavras, separadas por qualquer coisa que não seja letra — números,
    pontuação, R$ e emoji não interessam para ortografia. */
function palavrasDe(texto: string): string[] {
  return texto.split(/[^\p{L}]+/u).filter(Boolean);
}

/**
 * Devolve tudo que está errado na nota. Lista vazia = pode publicar.
 *
 * A mesma palavra errada repetida vira UM problema só: o pop-up de 1.4.1 tinha
 * uma linha, mas uma nota de release de verdade repete "atualizacao" em três
 * bullets, e listar o mesmo erro três vezes esconde os outros dois.
 */
export function validarNotaRelease(texto: string): ProblemaNota[] {
  const problemas: ProblemaNota[] = [];
  if (!texto || !texto.trim()) {
    return [{ tipo: 'vazia', trecho: '', sugestao: null, explicacao: 'A nota está vazia.' }];
  }

  if (PREFIXO_COMMIT.test(texto)) {
    problemas.push({
      tipo: 'commit-tecnico',
      trecho: texto.trim().split('\n')[0],
      sugestao: null,
      explicacao:
        'A nota começa com prefixo de commit, então o build rodou sem --message e o EAS copiou a mensagem do commit. Escreva a nota pensando em quem usa o app.',
    });
  }

  const vistas = new Set<string>();
  for (const palavra of palavrasDe(texto)) {
    const minuscula = palavra.toLowerCase();
    if (vistas.has(minuscula)) continue;

    let sugestao = ACENTUADAS_OBRIGATORIAS[minuscula] ?? null;

    /* Plural de palavra da lista: "historicos" não está no dicionário, mas
       "historico" está — e a sugestão precisa sair no plural também. */
    if (!sugestao && minuscula.endsWith('s')) {
      const singular = ACENTUADAS_OBRIGATORIAS[minuscula.slice(0, -1)];
      if (singular) sugestao = singular + 's';
    }

    if (!sugestao) {
      for (const regra of REGRAS_DE_SUFIXO) {
        if (minuscula.length >= regra.minimo && minuscula.endsWith(regra.fim)) {
          sugestao = minuscula.slice(0, -regra.troca[0].length) + regra.troca[1];
          break;
        }
      }
    }

    if (sugestao && sugestao !== minuscula) {
      vistas.add(minuscula);
      problemas.push({
        tipo: 'acento',
        trecho: palavra,
        sugestao,
        explicacao: 'Falta acento: "' + palavra + '" deveria ser "' + sugestao + '".',
      });
    }
  }

  return problemas;
}

/** Atalho para quem só precisa do sim/não — a Edge Function, por exemplo. */
export function notaEhPublicavel(texto: string): boolean {
  return validarNotaRelease(texto).length === 0;
}
