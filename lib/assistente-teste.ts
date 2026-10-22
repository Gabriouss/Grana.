import { lancamentosDeExemplo } from './lancamentos-teste';

/**
 * Respostas do Granabô no teste da landing (lib/modo-teste.ts). Lá não existe
 * servidor nem modelo de linguagem: a resposta sai daqui, calculada com os
 * lançamentos que a pessoa está vendo no teste, para o número bater com a tela.
 * O app de verdade responde qualquer pergunta; aqui são os temas mais comuns.
 */
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function doMes() {
  const prefixo = new Date().toISOString().slice(0, 7);
  return lancamentosDeExemplo().filter((t) => t.occurred_on.startsWith(prefixo));
}

export function respostaDoTeste(pergunta: string): string {
  const p = pergunta.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const mes = doMes();
  const saidas = mes.filter((t) => t.type === 'out');
  const entradas = mes.filter((t) => t.type === 'in');
  const soma = (l: typeof mes) => l.reduce((s, t) => s + t.amount, 0);

  const categoria = ['mercado', 'alimentacao', 'transporte', 'moradia', 'lazer', 'saude', 'educacao']
    .find((c) => p.includes(c));
  if (categoria) {
    const nome = saidas.find((t) => t.category.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(categoria === 'mercado' ? 'alimentacao' : categoria))?.category;
    if (!nome) return 'Não achei gastos nessa categoria neste mês. Quer que eu olhe outra?';
    const total = soma(saidas.filter((t) => t.category === nome));
    return `Neste mês você gastou ${brl(total)} em ${nome}.`;
  }
  if (/(maior|mais).*(gasto|gastei)|onde.*(gast|foi)/.test(p)) {
    const porCat = new Map<string, number>();
    for (const t of saidas) porCat.set(t.category, (porCat.get(t.category) ?? 0) + t.amount);
    const [nome, total] = [...porCat].sort((a, b) => b[1] - a[1])[0] ?? [];
    return nome ? `O que mais pesou neste mês foi ${nome}: ${brl(total!)}.` : 'Ainda não tem gasto neste mês.';
  }
  if (/(entrou|entrada|recebi|ganhei)/.test(p)) return `Neste mês entraram ${brl(soma(entradas))}.`;
  if (/(gastei|gasto|saiu|saida)/.test(p)) return `Neste mês saíram ${brl(soma(saidas))}, em ${saidas.length} lançamentos.`;
  if (/(livre|sobra|posso gastar)/.test(p)) return 'O Livre para gastar fica no topo da Início: é o que sobra do mês dividido pelos dias que faltam. Lance um gasto e veja o número mudar.';
  return 'Aqui no teste eu respondo sobre os lançamentos que você está vendo. Pergunte, por exemplo: "quanto gastei este mês?", "onde mais gastei?" ou "quanto gastei com transporte?".';
}
