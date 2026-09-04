export type CategoriaMensagem =
  | 'noturno_humor'
  | 'streak_protecao'
  | 'micro_gastos'
  | 'fim_de_semana'
  | 'saudade'
  | 'dicas_atalhos';

export type MensagemNotif = {
  id: string;
  categoria: CategoriaMensagem;
  titulo: string;
  /** Pode conter o token literal "{streak}", substituído na hora de agendar. */
  texto: string;
};

/** Catálogo canônico da copy aprovada para os lembretes de hábito. */
export const MENSAGENS: MensagemNotif[] = [
  // ---- noturno_humor: fechamento leve do dia ----
  { id: 'noturno-1', categoria: 'noturno_humor', titulo: 'Fechando o dia?', texto: 'Aquele Pix de R$ 3 da água no sinal também conta, viu? Bora registrar antes de esquecer! 👀' },
  { id: 'noturno-2', categoria: 'noturno_humor', titulo: 'Um minutinho só', texto: 'Seu futuro milionário agradece esse registro de 10 segundos 🚀' },
  { id: 'noturno-3', categoria: 'noturno_humor', titulo: 'Antes de dormir', texto: 'Já que você tá com o celular na mão mesmo, aproveita e lança os gastos de hoje 😉' },
  { id: 'noturno-4', categoria: 'noturno_humor', titulo: 'Resuminho do dia', texto: 'Como foi o dia no bolso? Registra rapidinho e durma tranquilo 🌙' },
  { id: 'noturno-5', categoria: 'noturno_humor', titulo: 'Falta pouco', texto: 'Faltam só os lançamentos de hoje pra fechar o dia com o Grana. em dia 📒' },
  { id: 'noturno-6', categoria: 'noturno_humor', titulo: 'Memória não é confiável', texto: 'Daqui a 2 dias você não vai lembrar quanto gastou hoje. Registra agora que é mais fácil 🧠' },
  { id: 'noturno-7', categoria: 'noturno_humor', titulo: 'Passadinha rápida', texto: 'Passa aqui só pra contar pro Grana. o que rolou hoje. Prometo que é rápido 🙂' },
  { id: 'noturno-8', categoria: 'noturno_humor', titulo: 'Última chamada do dia', texto: 'Antes que o dia vire "ontem": tem algum gasto pra lançar? 📝' },

  // ---- streak_protecao: urgência/motivação pra sequência ativa ----
  { id: 'streak-1', categoria: 'streak_protecao', titulo: 'Não deixa apagar!', texto: 'Não deixa o fogo apagar! 🔥 Você tá com {streak} dias seguidos. Registre 1 gasto pra manter a chama viva!' },
  { id: 'streak-2', categoria: 'streak_protecao', titulo: 'Sua sequência te espera', texto: '{streak} dias de sequência não se constroem sozinhos — falta só o de hoje 🔥' },
  { id: 'streak-3', categoria: 'streak_protecao', titulo: 'Quase lá hoje', texto: 'Você chegou até aqui: {streak} dias seguidos. Não vai deixar hoje quebrar a corrente, vai? 💪' },
  { id: 'streak-4', categoria: 'streak_protecao', titulo: 'Protege sua sequência', texto: 'Sua sequência de {streak} dias está de pé. Um lançamento rápido mantém.' },
  { id: 'streak-5', categoria: 'streak_protecao', titulo: 'Não jogue fora', texto: '{streak} dias de esforço por um lançamento de 10 segundos? Vale a pena manter 🔥' },
  { id: 'streak-6', categoria: 'streak_protecao', titulo: 'Ainda dá tempo', texto: 'Ainda dá tempo de manter os {streak} dias seguidos. Bora lá! ⏳' },
  { id: 'streak-7', categoria: 'streak_protecao', titulo: 'Recorde à vista', texto: 'Mais um dia e sua sequência de {streak} dias fica ainda mais forte 🔥' },
  { id: 'streak-8', categoria: 'streak_protecao', titulo: 'A chama depende de você', texto: '{streak} dias seguidos de disciplina. Não deixa isso esfriar hoje 🔥' },

  // ---- micro_gastos: lembretes pós-almoço/tarde ----
  { id: 'micro-1', categoria: 'micro_gastos', titulo: 'E aquele cafezinho?', texto: 'Aquele cafézinho da tarde também é gasto — bora registrar? ☕' },
  { id: 'micro-2', categoria: 'micro_gastos', titulo: 'Delivery de hoje', texto: 'Pediu alguma coisa no delivery hoje? Não esquece de lançar 🛵' },
  { id: 'micro-3', categoria: 'micro_gastos', titulo: 'Lanchinho da tarde', texto: 'Aquele lanchinho rápido conta tanto quanto uma compra grande — registra aí 🥪' },
  { id: 'micro-4', categoria: 'micro_gastos', titulo: 'Gastos pequenos somam', texto: 'Gasto pequeno é o que mais escapa da memória. Bora garantir que ele entrou no controle? 💸' },
  { id: 'micro-5', categoria: 'micro_gastos', titulo: 'Uber ou app de transporte?', texto: 'Se rolou corrida de app hoje, já aproveita e lança 🚗' },
  { id: 'micro-6', categoria: 'micro_gastos', titulo: 'Aquele agrado', texto: 'Se você se deu um agrado hoje (e tudo bem se deu!), só não esquece de registrar 🍫' },
  { id: 'micro-7', categoria: 'micro_gastos', titulo: 'Estacionamento, app, assinatura...', texto: 'Estacionamento, aplicativo, assinatura — os pequenos também merecem um lugar no Grana. 🅿️' },
  { id: 'micro-8', categoria: 'micro_gastos', titulo: 'Nada é pequeno demais', texto: 'Não existe gasto pequeno demais pra registrar. Bora fechar a contagem de hoje? 📋' },

  // ---- fim_de_semana: sexta/sábado/domingo à noite ----
  { id: 'finde-1', categoria: 'fim_de_semana', titulo: 'Fim de semana chegando', texto: 'Antes do fim de semana começar valendo, que tal fechar os gastos da semana? 🎉' },
  { id: 'finde-2', categoria: 'fim_de_semana', titulo: 'Sábado também conta', texto: 'Rolou programa hoje? Sábado também entra na conta — registra o que gastou 🎊' },
  { id: 'finde-3', categoria: 'fim_de_semana', titulo: 'Fechando a semana', texto: 'Domingo à noite é um ótimo momento pra revisar como foi a semana no bolso 📊' },
  { id: 'finde-4', categoria: 'fim_de_semana', titulo: 'Balanço do fim de semana', texto: 'Curtiu o fim de semana? Só falta contar pro Grana. quanto ele custou 😄' },
  { id: 'finde-5', categoria: 'fim_de_semana', titulo: 'Sexta é dia de gasto extra', texto: 'Sexta costuma ter aquele gasto a mais — bar, cinema, delivery. Bora registrar? 🍕' },
  { id: 'finde-6', categoria: 'fim_de_semana', titulo: 'Antes da segunda chegar', texto: 'Fecha o fim de semana com o controle em dia — a segunda agradece 🗓️' },
  { id: 'finde-7', categoria: 'fim_de_semana', titulo: 'Domingo de organização', texto: 'Domingão é ótimo pra revisar a semana inteira, não só hoje. Já deu uma olhada? 🧾' },
  { id: 'finde-8', categoria: 'fim_de_semana', titulo: 'Semana começando', texto: 'Comece a semana sabendo exatamente como terminou a anterior. Vamos fechar as contas? ✅' },

  // ---- saudade: 2+ dias sem abrir o app ----
  { id: 'saudade-1', categoria: 'saudade', titulo: 'Sentimos sua falta', texto: 'Faz um tempinho que a gente não se vê por aqui — como estão as finanças? 👋' },
  { id: 'saudade-2', categoria: 'saudade', titulo: 'Volta que a gente te espera', texto: 'Uns dias sem registrar não é o fim do mundo — mas quanto antes voltar, mais fácil fica 🙂' },
  { id: 'saudade-3', categoria: 'saudade', titulo: 'Bora recomeçar', texto: 'Ninguém é perfeito — o importante é retomar. Que tal registrar o que rolou nesses dias? 🔄' },
  { id: 'saudade-4', categoria: 'saudade', titulo: 'Seu controle te espera', texto: 'Seu histórico continua aqui, intacto. Só falta você voltar a alimentar ele 📈' },
  { id: 'saudade-5', categoria: 'saudade', titulo: 'Sem julgamento', texto: 'Pausa não é problema — só não deixa virar esquecimento total. Bora dar uma olhada? 😌' },
  { id: 'saudade-6', categoria: 'saudade', titulo: 'Vale a pena retomar', texto: 'Toda sequência interrompida pode recomeçar hoje mesmo. Topa? 🔥' },
  { id: 'saudade-7', categoria: 'saudade', titulo: 'Um oi rapidinho', texto: 'Só passando pra lembrar que o Grana. tá aqui quando você quiser voltar 💚' },
  { id: 'saudade-8', categoria: 'saudade', titulo: 'Que tal um resumo?', texto: 'Já que faz uns dias, que tal abrir o app e dar uma geral no que ficou pra trás? 🗂️' },

  // ---- dicas_atalhos: voz, QR de nota fiscal, cofrinhos ----
  { id: 'dica-1', categoria: 'dicas_atalhos', titulo: 'Sabia que dá pra falar?', texto: 'Você sabia que dá pra lançar um gasto só falando com o Grana.? Testa o lançamento por voz 🎙️' },
  { id: 'dica-2', categoria: 'dicas_atalhos', titulo: 'Nota fiscal em segundos', texto: 'Escaneie o QR Code da nota fiscal e deixa o Grana. preencher o lançamento sozinho 📷' },
  { id: 'dica-3', categoria: 'dicas_atalhos', titulo: 'Já criou um cofrinho?', texto: 'Que tal criar um cofrinho pra aquele objetivo que você vem adiando? 🐷' },
  { id: 'dica-4', categoria: 'dicas_atalhos', titulo: 'Menos digitação, mais rapidez', texto: 'Falar é mais rápido que digitar — experimenta o lançamento por voz hoje 🗣️' },
  { id: 'dica-5', categoria: 'dicas_atalhos', titulo: 'Compra no mercado?', texto: 'Se acabou de sair do mercado, escaneia a nota e economiza uns bons minutos 🛒' },
  { id: 'dica-6', categoria: 'dicas_atalhos', titulo: 'Metas com cofrinho', texto: 'Cofrinhos ajudam a visualizar o quanto falta pra sua meta. Já deu uma olhada nos seus? 🎯' },
  { id: 'dica-7', categoria: 'dicas_atalhos', titulo: 'Atalho pelo WhatsApp', texto: 'Sabia que também dá pra lançar gastos mandando mensagem no WhatsApp? Configura no Perfil 💬' },
  { id: 'dica-8', categoria: 'dicas_atalhos', titulo: 'Menos atrito, mais constância', texto: 'Quanto mais fácil for lançar, mais fácil manter o hábito. Já testou os atalhos do Grana.? ⚡' },
];

const CATEGORIA_GERAL: CategoriaMensagem[] = ['noturno_humor', 'micro_gastos', 'dicas_atalhos'];

/**
 * Escolhe a próxima mensagem do lembrete diário. Prioriza contexto
 * (inatividade > fim de semana > proteção de streak) e evita repetir os
 * últimos 10 ids escolhidos — se a categoria prioritária inteira já foi
 * usada recentemente, cai para o sorteio geral em vez de travar sem opção.
 */
export function selecionarMensagem(contexto: {
  streak: number;
  diasInativo: number;
  diaSemana: number;
}, recentes: string[], aleatorio = Math.random): MensagemNotif {
  const semRepetir = (lista: MensagemNotif[]) => lista.filter((m) => !recentes.includes(m.id));

  let categoriaPrioritaria: CategoriaMensagem | null = null;
  if (contexto.diasInativo >= 2) categoriaPrioritaria = 'saudade';
  else if ([5, 6, 0].includes(contexto.diaSemana)) categoriaPrioritaria = 'fim_de_semana';
  else if (contexto.streak > 1) categoriaPrioritaria = 'streak_protecao';

  let candidatas: MensagemNotif[] = [];
  if (categoriaPrioritaria) {
    candidatas = semRepetir(MENSAGENS.filter((m) => m.categoria === categoriaPrioritaria));
  }
  if (candidatas.length === 0) {
    candidatas = semRepetir(MENSAGENS.filter((m) => CATEGORIA_GERAL.includes(m.categoria)));
  }
  if (candidatas.length === 0) {
    // Tudo foi usado recentemente (catálogo pequeno demais ou muita sorte
    // ruim) — melhor repetir do que não notificar nada.
    candidatas = MENSAGENS;
  }

  return candidatas[Math.floor(aleatorio() * candidatas.length)];
}
