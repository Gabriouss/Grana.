/* Paginação das consultas ao Supabase — a parte pura, sem banco.
 *
 * Vale um corpus próprio porque o PostgREST deste projeto corta a resposta em
 * 1000 linhas SEM erro, e o saldo do app depende do histórico inteiro. Um erro
 * de contagem aqui não aparece como falha: aparece como dinheiro errado na
 * tela. Os limites do laço (página cheia, página exata, sobra) são justamente
 * onde esse tipo de laço costuma quebrar.
 */
import { buscarTodasAsPaginas, TAMANHO_DA_PAGINA, type RespostaDePagina } from '../lib/paginacao';

let total = 0;
let falhas = 0;

function checar(nome: string, recebido: unknown, esperado: unknown) {
  total += 1;
  const ok = JSON.stringify(recebido) === JSON.stringify(esperado);
  if (!ok) {
    falhas += 1;
    console.log(`  FALHA  ${nome}\n         esperado: ${JSON.stringify(esperado)}\n         recebido: ${JSON.stringify(recebido)}`);
  }
}

/** Banco de mentira com N linhas, que respeita o teto por requisição. */
function bancoCom(linhas: number) {
  const chamadas: [number, number][] = [];
  const todas = Array.from({ length: linhas }, (_, i) => ({ id: i }));
  const consulta = (de: number, ate: number): PromiseLike<RespostaDePagina<{ id: number }>> => {
    chamadas.push([de, ate]);
    const fatia = todas.slice(de, ate + 1);
    return Promise.resolve({ data: fatia.slice(0, TAMANHO_DA_PAGINA), error: null });
  };
  return { consulta, chamadas };
}

async function rodar() {
  // Vazio: uma requisição, nada devolvido.
  {
    const { consulta, chamadas } = bancoCom(0);
    const r = await buscarTodasAsPaginas(consulta);
    checar('tabela vazia devolve lista vazia', r.length, 0);
    checar('tabela vazia faz 1 requisição', chamadas.length, 1);
  }

  // Menos de uma página: para na primeira.
  {
    const { consulta, chamadas } = bancoCom(7);
    const r = await buscarTodasAsPaginas(consulta);
    checar('7 linhas devolve 7', r.length, 7);
    checar('7 linhas faz 1 requisição', chamadas.length, 1);
  }

  // Uma página cheia menos uma: ainda para na primeira.
  {
    const { consulta, chamadas } = bancoCom(TAMANHO_DA_PAGINA - 1);
    const r = await buscarTodasAsPaginas(consulta);
    checar('999 linhas devolve 999', r.length, TAMANHO_DA_PAGINA - 1);
    checar('999 linhas faz 1 requisição', chamadas.length, 1);
  }

  // Exatamente uma página: precisa de uma segunda volta para saber que acabou.
  {
    const { consulta, chamadas } = bancoCom(TAMANHO_DA_PAGINA);
    const r = await buscarTodasAsPaginas(consulta);
    checar('1000 linhas devolve 1000, sem cortar', r.length, TAMANHO_DA_PAGINA);
    checar('1000 linhas faz 2 requisições', chamadas.length, 2);
  }

  // O caso que motivou tudo: uma linha além do teto.
  {
    const { consulta, chamadas } = bancoCom(TAMANHO_DA_PAGINA + 1);
    const r = await buscarTodasAsPaginas(consulta);
    checar('1001 linhas devolve 1001', r.length, TAMANHO_DA_PAGINA + 1);
    checar('1001 linhas faz 2 requisições', chamadas.length, 2);
    checar('a linha 1001 é a última, não some', r[r.length - 1], { id: TAMANHO_DA_PAGINA });
  }

  // Várias páginas com sobra, e sem repetir nem pular linha.
  {
    const linhas = TAMANHO_DA_PAGINA * 2 + 137;
    const { consulta, chamadas } = bancoCom(linhas);
    const r = await buscarTodasAsPaginas(consulta);
    checar('2137 linhas devolve 2137', r.length, linhas);
    checar('2137 linhas faz 3 requisições', chamadas.length, 3);
    checar('sem repetição nem buraco', new Set(r.map((x) => x.id)).size, linhas);
    checar('as faixas pedidas são contíguas', chamadas, [
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  }

  // Erro do banco sobe, nunca vira lista parcial silenciosa.
  {
    let subiu = false;
    try {
      await buscarTodasAsPaginas(() => Promise.resolve({ data: null, error: { message: 'falhou' } }));
    } catch (e) {
      subiu = (e as { message: string }).message === 'falhou';
    }
    checar('erro do banco é propagado', subiu, true);
  }

  // Erro na SEGUNDA página também sobe: o pior caso seria devolver as 1000
  // primeiras como se fossem tudo, que é exatamente o defeito original.
  {
    let chamadas = 0;
    let subiu = false;
    try {
      await buscarTodasAsPaginas<{ id: number }>(() => {
        chamadas += 1;
        if (chamadas === 1) {
          return Promise.resolve({ data: Array.from({ length: TAMANHO_DA_PAGINA }, (_, i) => ({ id: i })), error: null });
        }
        return Promise.resolve({ data: null, error: { message: 'caiu na segunda' } });
      });
    } catch (e) {
      subiu = (e as { message: string }).message === 'caiu na segunda';
    }
    checar('erro na segunda página não vira resultado parcial', subiu, true);
  }

  console.log(`\n${total - falhas}/${total} checagens de paginação passaram — ${falhas} falhas`);
  if (falhas > 0) process.exit(1);
}

void rodar();
