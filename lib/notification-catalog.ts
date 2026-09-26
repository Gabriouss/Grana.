export type CategoriaMensagem =
  | 'noturno_humor'
  | 'streak_protecao'
  | 'micro_gastos'
  | 'fim_de_semana'
  | 'fim_de_semana_meio_dia'
  | 'saudade'
  | 'dicas_atalhos'
  | 'almoco';

/** Janela de horário do lembrete — decide só o pool geral de fallback em
    `selecionarMensagem`; a prioridade de saudade/fim de semana/streak é
    igual e compartilhada entre as duas (ver spec
    docs/superpowers/specs/2026-09-05-janelas-notificacao-design.md).
    `meio_dia_finde` (25/09/2026, decisão do autor "Sim") é a mesma ideia do
    `almoco`, só que o oposto no dia: só sábado e domingo, nunca dia útil —
    por isso tem pool de fim de semana próprio (`fim_de_semana_meio_dia`),
    em vez de reaproveitar `fim_de_semana` (que é a janela da NOITE). */
export type JanelaLembrete = 'noite' | 'almoco' | 'meio_dia_finde';

export type MensagemNotif = {
  id: string;
  categoria: CategoriaMensagem;
  titulo: string;
  /** Pode conter o token literal "{streak}", substituído na hora de agendar. */
  texto: string;
  /* Dias da semana em que a mensagem faz sentido, no formato de `getDay()`
     (0 = domingo). Ausente significa "qualquer dia".

     Existe porque a CATEGORIA é sensível ao dia e a mensagem não era: a
     categoria `fim_de_semana` cobre sexta, sábado e domingo, e o sorteio
     dentro dela podia entregar "Domingo à noite é um ótimo momento" numa
     sexta. Foi o que aconteceu com o autor em 11/09/2026. */
  dias?: number[];
};

/** Catálogo canônico da copy aprovada para os lembretes de hábito. */
export const MENSAGENS: MensagemNotif[] = [
  // ---- noturno_humor: fechamento leve do dia ----
  { id: 'noturno-1', categoria: 'noturno_humor', titulo: 'Fechando o dia?', texto: 'Teve algum gasto hoje? Se teve, dá pra registrar agora 👀' },
  { id: 'noturno-2', categoria: 'noturno_humor', titulo: 'Um minutinho só', texto: 'Se ficou algo de hoje pra registrar, o Grana. está aqui 🌙' },
  { id: 'noturno-3', categoria: 'noturno_humor', titulo: 'Antes de dormir', texto: 'Com o celular na mão, que tal ver se falta algum lançamento de hoje? 😉' },
  { id: 'noturno-4', categoria: 'noturno_humor', titulo: 'Resuminho do dia', texto: 'Como foi o dia no bolso? Se tiver algo pra registrar, é por aqui 💭' },
  { id: 'noturno-5', categoria: 'noturno_humor', titulo: 'Antes de encerrar', texto: 'Algum gasto de hoje ficou de fora? Dá pra lançar agora 📒' },
  { id: 'noturno-6', categoria: 'noturno_humor', titulo: 'Enquanto está fresco', texto: 'Gasto de hoje é mais fácil de lembrar hoje. Se teve algum, registre 🧠' },
  { id: 'noturno-7', categoria: 'noturno_humor', titulo: 'Passadinha rápida', texto: 'Se rolou algum gasto hoje, conta pro Grana. quando puder 🙂' },
  { id: 'noturno-8', categoria: 'noturno_humor', titulo: 'Última chamada do dia', texto: 'Antes que o dia vire "ontem": tem algum gasto pra lançar? 📝' },

  // ---- streak_protecao: urgência/motivação pra sequência ativa ----
  { id: 'streak-1', categoria: 'streak_protecao', titulo: 'Sua sequência segue viva 🔥', texto: 'São {streak} dias seguidos. Se tiver algo de hoje, dá pra continuar por aqui.' },
  { id: 'streak-2', categoria: 'streak_protecao', titulo: 'Sua sequência te espera', texto: '{streak} dias seguidos até aqui. Um lançamento de hoje soma mais um 🔥' },
  { id: 'streak-3', categoria: 'streak_protecao', titulo: 'Bela sequência', texto: 'Você chegou a {streak} dias seguidos. Quer somar o de hoje? 💪' },
  { id: 'streak-4', categoria: 'streak_protecao', titulo: 'Protege sua sequência', texto: 'Sua sequência de {streak} dias está de pé. Um lançamento rápido mantém.' },
  { id: 'streak-5', categoria: 'streak_protecao', titulo: 'Vale continuar', texto: '{streak} dias seguidos. Se tiver um gasto de hoje, é só registrar 🔥' },
  { id: 'streak-6', categoria: 'streak_protecao', titulo: 'No seu ritmo', texto: 'Sua sequência de {streak} dias segue com você. Registre hoje quando for melhor 🙂' },
  { id: 'streak-7', categoria: 'streak_protecao', titulo: 'Cada dia soma', texto: 'Sua sequência está em {streak} dias. Registrando hoje, ela cresce mais um 🔥' },
  { id: 'streak-8', categoria: 'streak_protecao', titulo: 'Boa constância', texto: '{streak} dias seguidos registrando. Hoje pode ser mais um 🔥' },

  // ---- micro_gastos: lembretes pós-almoço/tarde ----
  { id: 'micro-1', categoria: 'micro_gastos', titulo: 'Um café também conta', texto: 'Se teve um café ou lanche hoje, ele também cabe no Grana. ☕' },
  { id: 'micro-2', categoria: 'micro_gastos', titulo: 'Gastos do dia a dia', texto: 'Comida, transporte, um lanche: se teve algo hoje, dá pra registrar 🛵' },
  { id: 'micro-3', categoria: 'micro_gastos', titulo: 'Lanche rápido?', texto: 'Se teve um lanche rápido hoje, ele entra no controle do mesmo jeito 🥪' },
  { id: 'micro-4', categoria: 'micro_gastos', titulo: 'Gastos pequenos somam', texto: 'Gasto pequeno é o que mais escapa da memória. Bora garantir que ele entrou no controle? 💸' },
  { id: 'micro-5', categoria: 'micro_gastos', titulo: 'Uber ou app de transporte?', texto: 'Se rolou corrida de app hoje, já aproveita e lança 🚗' },
  { id: 'micro-6', categoria: 'micro_gastos', titulo: 'Um agrado hoje?', texto: 'Se você se deu um agrado hoje (e tudo bem!), dá pra registrar 🍫' },
  { id: 'micro-7', categoria: 'micro_gastos', titulo: 'Os pequenos da rotina', texto: 'Estacionamento, aplicativo, assinatura: os pequenos também merecem um lugar no Grana. 🅿️' },
  { id: 'micro-8', categoria: 'micro_gastos', titulo: 'Nada é pequeno demais', texto: 'Não existe gasto pequeno demais pra registrar. Bora fechar a contagem de hoje? 📋' },

  // ---- fim_de_semana: sexta/sábado/domingo à noite ----
  { id: 'finde-1', dias: [5], categoria: 'fim_de_semana', titulo: 'Fim de semana chegando', texto: 'Antes do fim de semana começar valendo, que tal fechar os gastos da semana? 🎉' },
  { id: 'finde-2', dias: [6], categoria: 'fim_de_semana', titulo: 'Sábado sem pressa', texto: 'Se rolou algum gasto hoje, registre quando fizer sentido 🎊' },
  { id: 'finde-3', dias: [0], categoria: 'fim_de_semana', titulo: 'Fechando a semana', texto: 'Domingo à noite é um ótimo momento pra revisar como foi a semana no bolso 📊' },
  { id: 'finde-4', dias: [6, 0], categoria: 'fim_de_semana', titulo: 'Balanço do fim de semana', texto: 'Se o fim de semana teve gastos, dá pra registrar com calma 😄' },
  { id: 'finde-5', dias: [5], categoria: 'fim_de_semana', titulo: 'Sexta chegou', texto: 'Antes de virar a página da semana, quer conferir seus lançamentos? 📋' },
  { id: 'finde-6', dias: [0], categoria: 'fim_de_semana', titulo: 'Antes da segunda chegar', texto: 'Fecha o fim de semana com o controle em dia. A segunda agradece 🗓️' },
  { id: 'finde-7', dias: [0], categoria: 'fim_de_semana', titulo: 'Domingo de organização', texto: 'Domingão é ótimo pra revisar a semana inteira, não só hoje. Já deu uma olhada? 🧾' },
  { id: 'finde-8', dias: [0], categoria: 'fim_de_semana', titulo: 'Semana começando', texto: 'Comece a semana sabendo como terminou a anterior. Quer dar uma olhada? ✅' },
  // finde-9/10 (sexta), finde-11 a 14 (sábado) e finde-15/16 (domingo):
  // copy do Beacon de 24/09, janela da NOITE — a de sexta some do almoço
  // (critério de aceite 1 do Beacon), que passa a seguir a prioridade de
  // dia útil (ver `selecionarMensagem`).
  { id: 'finde-9', dias: [5], categoria: 'fim_de_semana', titulo: 'Fim da semana útil', texto: 'Se algum gasto da semana ficou de fora, dá pra lançar agora 🗂️' },
  { id: 'finde-10', dias: [5], categoria: 'fim_de_semana', titulo: 'Sextou', texto: 'Antes de desligar da semana, vale ver se ficou algum lançamento pra trás 🙂' },
  { id: 'finde-11', dias: [6], categoria: 'fim_de_semana', titulo: 'Sábado no bolso', texto: 'Como foi o sábado? Se tiver algo pra registrar, dá pra fazer agora 🌤️' },
  { id: 'finde-12', dias: [6], categoria: 'fim_de_semana', titulo: 'Sábado de descanso?', texto: 'Se o dia foi tranquilo, ótimo. Se teve gasto, dá pra registrar quando quiser 🛋️' },
  { id: 'finde-13', dias: [6], categoria: 'fim_de_semana', titulo: 'Metade do fim de semana', texto: 'Quer adiantar os lançamentos de hoje antes do domingo? 📝' },
  { id: 'finde-14', dias: [6], categoria: 'fim_de_semana', titulo: 'Lembrete de sábado', texto: 'Nada obrigatório: se algum gasto de hoje merecer registro, o Grana. anota 🙂' },
  { id: 'finde-15', dias: [0], categoria: 'fim_de_semana', titulo: 'Olhada na semana?', texto: 'Seus lançamentos da semana estão aqui pra você conferir 📊' },
  { id: 'finde-16', dias: [0], categoria: 'fim_de_semana', titulo: 'Domingo tranquilo', texto: 'Se quiser, confira a semana antes da segunda. Se não, tudo bem também 🌙' },

  // ---- fim_de_semana_meio_dia: sábado e domingo ao meio-dia (25/09/2026) ----
  // Copy do Beacon; pool PRÓPRIO da janela `meio_dia_finde`, nunca sai à
  // noite nem se mistura com finde-1 a finde-16.
  { id: 'finde-17', dias: [6], categoria: 'fim_de_semana_meio_dia', titulo: 'Sábado no seu ritmo', texto: 'Se algo ficou para registrar, você decide se e quando vale cuidar disso 🙂' },
  { id: 'finde-18', dias: [6], categoria: 'fim_de_semana_meio_dia', titulo: 'Pausa para conferir', texto: 'Se quiser, confira o que já está organizado na semana. Sem pressa 🌤️' },
  { id: 'finde-19', dias: [6], categoria: 'fim_de_semana_meio_dia', titulo: 'Seu sábado, sem pressa', texto: 'Qualquer ajuste pode esperar o momento certo. O ritmo é seu 🌿' },
  { id: 'finde-20', dias: [6], categoria: 'fim_de_semana_meio_dia', titulo: 'Sábado com leveza', texto: 'Se algo financeiro pedir atenção, cuide disso no seu tempo 🤍' },
  { id: 'finde-21', dias: [0], categoria: 'fim_de_semana_meio_dia', titulo: 'Domingo com calma', texto: 'Se quiser, dê uma olhada no que ficou registrado nesta semana 🌙' },
  { id: 'finde-22', dias: [0], categoria: 'fim_de_semana_meio_dia', titulo: 'Antes da segunda', texto: 'Uma revisão pode ajudar. Deixar para amanhã também pode estar tudo bem 🙂' },
  { id: 'finde-23', dias: [0], categoria: 'fim_de_semana_meio_dia', titulo: 'Seu domingo, seu ritmo', texto: 'Se houver algo para anotar, faça quando for melhor para você 📝' },
  { id: 'finde-24', dias: [0], categoria: 'fim_de_semana_meio_dia', titulo: 'Fechando a semana', texto: 'O que merecer atenção pode entrar na sua lista, sem pressa 🌿' },

  // ---- saudade: 2+ dias sem registrar lançamento (não mede abertura do app) ----
  { id: 'saudade-1', categoria: 'saudade', titulo: 'Voltar é simples', texto: 'Quer retomar pelo próximo lançamento? O resto pode esperar 👋' },
  { id: 'saudade-2', categoria: 'saudade', titulo: 'A porta está aberta', texto: 'Dá pra retomar com um lançamento só, do dia que você lembrar 🙂' },
  { id: 'saudade-3', categoria: 'saudade', titulo: 'Bora recomeçar', texto: 'Dá pra retomar de onde parou. Registre o que lembrar desses dias 🔄' },
  { id: 'saudade-4', categoria: 'saudade', titulo: 'Seu histórico está aqui', texto: 'Quando quiser voltar a registrar, é só abrir o Grana. 📈' },
  { id: 'saudade-5', categoria: 'saudade', titulo: 'Sem julgamento', texto: 'Pausa acontece. Quando quiser, dá uma olhada nos seus lançamentos 😌' },
  { id: 'saudade-6', categoria: 'saudade', titulo: 'Vale a pena retomar', texto: 'Toda sequência interrompida pode recomeçar hoje mesmo. Topa? 🔥' },
  { id: 'saudade-7', categoria: 'saudade', titulo: 'Um oi rapidinho', texto: 'Só passando pra lembrar que o Grana. tá aqui quando você quiser voltar 💚' },
  { id: 'saudade-8', categoria: 'saudade', titulo: 'Que tal um resumo?', texto: 'Já que faz uns dias, que tal abrir o app e dar uma geral no que ficou pra trás? 🗂️' },

  // ---- dicas_atalhos: voz, QR de nota fiscal, cofrinhos ----
  { id: 'dica-1', categoria: 'dicas_atalhos', titulo: 'Sabia que dá pra falar?', texto: 'Dá pra lançar um gasto só falando com o Grana. Experimente a voz 🎙️' },
  { id: 'dica-2', categoria: 'dicas_atalhos', titulo: 'Nota fiscal em segundos', texto: 'Escaneie o QR Code da nota fiscal e deixa o Grana. preencher o lançamento sozinho 📷' },
  { id: 'dica-3', categoria: 'dicas_atalhos', titulo: 'Já criou um cofrinho?', texto: 'Que tal criar um cofrinho pra aquele objetivo que você vem adiando? 🐷' },
  { id: 'dica-4', categoria: 'dicas_atalhos', titulo: 'Menos digitação, mais rapidez', texto: 'Falar é mais rápido que digitar. Experimenta o lançamento por voz hoje 🗣️' },
  { id: 'dica-5', categoria: 'dicas_atalhos', titulo: 'Compra no mercado?', texto: 'Na próxima compra, escaneie o QR da nota e o Grana. ajuda a preencher o lançamento 🛒' },
  { id: 'dica-6', categoria: 'dicas_atalhos', titulo: 'Metas com cofrinho', texto: 'Cofrinhos ajudam a visualizar o quanto falta pra sua meta. Já deu uma olhada nos seus? 🎯' },
  /* `dica-7` ("Atalho pelo WhatsApp") saiu em 13/09/2026. O autor: "SEM
     WHATSAPP, NÃO IREMOS UTILIZAR WHATSAPP". O id não é reaproveitado, para
     `mensagens_recentes` antigas não apontarem para uma copy diferente. */
  { id: 'dica-8', categoria: 'dicas_atalhos', titulo: 'Menos atrito, mais constância', texto: 'Quanto mais fácil lançar, mais fácil manter o hábito. Já viu os atalhos do Grana.? ⚡' },

  // ---- almoco: janela de 12h, dias úteis, tom descontraído ----
  { id: 'almoco-1', categoria: 'almoco', titulo: 'Pausa do meio-dia', texto: 'Teve algo para registrar? Dá para fazer agora ou depois 🍴' },
  { id: 'almoco-2', categoria: 'almoco', titulo: 'Hora do almoço', texto: 'Se o almoço tiver gasto, dá pra registrar quando quiser 🥡' },
  { id: 'almoco-3', categoria: 'almoco', titulo: 'Hora do intervalo', texto: 'Se teve algum gasto de manhã, a pausa é um bom momento pra registrar 🕐' },
  { id: 'almoco-4', categoria: 'almoco', titulo: 'Extras do dia', texto: 'Suco, café ou sobremesa: se teve, dá pra registrar 🥤' },
  { id: 'almoco-5', categoria: 'almoco', titulo: 'Antes de voltar', texto: 'Se ficou algum gasto de hoje pra trás, um lançamento rápido resolve 💼' },
  { id: 'almoco-6', categoria: 'almoco', titulo: 'Do jeito que for', texto: 'Restaurante, marmita ou vale: se teve gasto, ele cabe no Grana. 🍱' },
  { id: 'almoco-7', categoria: 'almoco', titulo: 'Meio-dia bateu', texto: 'Bom momento pra ver se falta algum lançamento de hoje 🍽️' },
  { id: 'almoco-8', categoria: 'almoco', titulo: 'Rapidinho', texto: 'Se teve algum gasto até agora, dá pra registrar e seguir o dia 😉' },
  { id: 'almoco-9', categoria: 'almoco', titulo: 'Olhada rápida', texto: 'Algum gasto da manhã ficou de fora do Grana.? 🔎' },
];

const CATEGORIA_GERAL: Record<JanelaLembrete, CategoriaMensagem[]> = {
  noite: ['noturno_humor', 'micro_gastos', 'dicas_atalhos'],
  almoco: ['almoco', 'micro_gastos', 'dicas_atalhos'],
  /* Mesmo tom de meio-dia do `almoco` — só muda o dia. */
  meio_dia_finde: ['almoco', 'micro_gastos', 'dicas_atalhos'],
};

/**
 * Escolhe a próxima mensagem do lembrete. Prioriza contexto (inatividade >
 * fim de semana > proteção de streak) e evita repetir os últimos 10 ids
 * escolhidos — se a categoria prioritária inteira já foi usada
 * recentemente, cai para o sorteio geral em vez de travar sem opção.
 *
 * `janela` decide qual pool GERAL usar no fallback (`almoco` nunca sai fora
 * da janela de almoço, `noturno_humor` nunca sai fora da janela da noite) —
 * a prioridade de saudade/fim de semana/streak não muda entre `noite` e
 * `almoco` de sábado/domingo (que na prática não existe, ver
 * `notification-schedule.ts`), e por isso um sábado ou domingo à noite já
 * produz tom de fim de semana sem precisar de lógica extra.
 *
 * A ÚNICA exceção é a janela de almoço de SEXTA (critério de aceite do
 * Beacon, decisão do autor repassada pelo maestro em 25/09): ela segue a
 * prioridade de dia útil (`saudade` > `streak_protecao` > pool geral de
 * almoço), nunca `fim_de_semana` — sextar ao meio-dia com "Domingo à noite"
 * ou títulos de fim de semana seria cedo demais. `meio_dia_finde` é o
 * oposto: só existe aos sábados/domingos (nunca dia útil) e usa o pool
 * PRÓPRIO `fim_de_semana_meio_dia`, nunca o de `fim_de_semana` da noite.
 */
export function selecionarMensagem(contexto: {
  streak: number;
  diasInativo: number;
  diaSemana: number;
}, recentes: string[], aleatorio = Math.random, janela: JanelaLembrete = 'noite'): MensagemNotif {
  /* Duas peneiras, nesta ordem. A do DIA vem primeiro e não é negociável:
     uma mensagem que promete "Domingo à noite" numa sexta mente para a
     pessoa, e mentir é pior que repetir. A de repetição vem depois e cede
     quando precisa. */
  const doDia = (lista: MensagemNotif[]) =>
    lista.filter((m) => !m.dias || m.dias.includes(contexto.diaSemana));
  const semRepetir = (lista: MensagemNotif[]) => doDia(lista).filter((m) => !recentes.includes(m.id));

  let categoriaPrioritaria: CategoriaMensagem | null = null;
  if (contexto.diasInativo >= 2) categoriaPrioritaria = 'saudade';
  else if (janela === 'meio_dia_finde' && [6, 0].includes(contexto.diaSemana)) categoriaPrioritaria = 'fim_de_semana_meio_dia';
  else if (janela !== 'almoco' && [5, 6, 0].includes(contexto.diaSemana)) categoriaPrioritaria = 'fim_de_semana';
  else if (contexto.streak > 1) categoriaPrioritaria = 'streak_protecao';

  let candidatas: MensagemNotif[] = [];
  if (categoriaPrioritaria) {
    candidatas = semRepetir(MENSAGENS.filter((m) => m.categoria === categoriaPrioritaria));
  }
  if (candidatas.length === 0) {
    const pool = CATEGORIA_GERAL[janela];
    candidatas = semRepetir(MENSAGENS.filter((m) => pool.includes(m.categoria)));
  }
  if (candidatas.length === 0) {
    // Tudo foi usado recentemente (catálogo pequeno demais ou muita sorte
    // ruim) — melhor repetir do que não notificar nada.
    // Ainda respeitando o dia: repetir é aceitável, mentir não.
    candidatas = doDia(MENSAGENS);
  }
  if (candidatas.length === 0) {
    candidatas = MENSAGENS;
  }

  return candidatas[Math.floor(aleatorio() * candidatas.length)];
}
