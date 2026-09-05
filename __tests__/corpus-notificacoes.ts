import {
  ehIdLembreteHabito,
  ID_HABITO_LEGADO,
  planejarLembretesHabito,
  PREFIXO_ID_HABITO,
  QUANTIDADE_LEMBRETES_HABITO,
} from '../lib/notification-schedule';
import { MENSAGENS, selecionarMensagem } from '../lib/notification-catalog';
import {
  atrasoDaTentativa,
  chaveColapsoEntrega,
  chegouHorario,
  chegouHorarioAlmoco,
  contextoDasDatas,
  ehDiaUtil,
  momentoNaZona,
} from '../supabase/functions/_shared/push-habit';

let passou = 0;
let falhou = 0;

function checar(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou++;
    return;
  }
  falhou++;
  console.error(`FALHOU: ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
}

const antesDoHorario = planejarLembretesHabito({
  agora: new Date(2026, 8, 4, 9, 22),
  hour: 20,
  minute: 30,
  jaLancouHoje: false,
});

checar('mantém uma semana inteira à frente', antesDoHorario.length === QUANTIDADE_LEMBRETES_HABITO);
checar('inclui hoje antes do horário', antesDoHorario[0].id === 'habito-diario-2026-09-04');
checar('preserva o horário escolhido', antesDoHorario.every((item) => item.quando.getHours() === 20 && item.quando.getMinutes() === 30));
checar('gera ids únicos', new Set(antesDoHorario.map((item) => item.id)).size === antesDoHorario.length);

const depoisDoHorario = planejarLembretesHabito({
  agora: new Date(2026, 8, 4, 22, 0),
  hour: 20,
  minute: 30,
  jaLancouHoje: false,
});
checar('começa amanhã quando o horário passou', depoisDoHorario[0].id === 'habito-diario-2026-09-05');

const lancouHoje = planejarLembretesHabito({
  agora: new Date(2026, 8, 4, 9, 22),
  hour: 20,
  minute: 30,
  jaLancouHoje: true,
});
checar('silencia hoje depois de lançar', lancouHoje[0].id === 'habito-diario-2026-09-05');

const viradaDoAno = planejarLembretesHabito({
  agora: new Date(2026, 11, 31, 10, 0),
  hour: 19,
  minute: 0,
  jaLancouHoje: false,
  quantidade: 2,
});
checar('atravessa a virada do ano', viradaDoAno[1].id === 'habito-diario-2027-01-01');
checar('reconhece o id legado', ehIdLembreteHabito(ID_HABITO_LEGADO));
checar('reconhece ids datados', ehIdLembreteHabito(`${PREFIXO_ID_HABITO}2026-09-04`));
checar('não captura lembretes de conta', !ehIdLembreteHabito('conta-123-3d'));

checar('mantém as 57 copies aprovadas (48 + 9 de almoço)', MENSAGENS.length === 57);
checar('cada copy tem id único', new Set(MENSAGENS.map((item) => item.id)).size === MENSAGENS.length);
checar('categoria almoco tem as 9 mensagens pedidas', MENSAGENS.filter((m) => m.categoria === 'almoco').length === 9);

const mensagemSaudade = selecionarMensagem(
  { streak: 0, diasInativo: 3, diaSemana: 2 },
  ['saudade-1'],
  () => 0
);
checar('inatividade usa a copy de saudade', mensagemSaudade.categoria === 'saudade');
checar('sorteio remoto respeita o histórico antirrepetição', mensagemSaudade.id !== 'saudade-1');

const momentoBrasil = momentoNaZona(new Date('2026-09-04T23:31:00.000Z'), 'America/Sao_Paulo');
checar('converte o instante para a data local do aparelho', momentoBrasil?.data === '2026-09-04');
checar('considera vencido depois do horário escolhido', !!momentoBrasil && chegouHorario(momentoBrasil, 20, 30));
checar('timezone inválida não derruba o lote', momentoNaZona(new Date(), 'timezone-inexistente') === null);

const contexto = contextoDasDatas(['2026-09-03', '2026-09-02', '2026-08-31'], '2026-09-04');
checar('calcula streak até ontem quando hoje ainda não teve lançamento', contexto.streak === 2);
checar('calcula dias de inatividade', contexto.diasInativo === 1);
checar('retentativa tem teto de seis horas', atrasoDaTentativa(20) === 6 * 60 * 60_000);
const chaveColapsoNoite = chaveColapsoEntrega('2026-09-04', 'noite');
const chaveColapsoAlmoco = chaveColapsoEntrega('2026-09-04', 'almoco');
checar('retentativas do dia usam uma chave de colapso determinística', chaveColapsoNoite === 'grana-habito-2026-09-04-noite');
checar('a chave de colapso cabe no limite dos provedores', new TextEncoder().encode(chaveColapsoNoite).length <= 64);
checar('almoço e noite têm chave de colapso distinta no mesmo dia', chaveColapsoNoite !== chaveColapsoAlmoco);

// ---- janela de almoço (docs/superpowers/specs/2026-09-05-janelas-notificacao-design.md) ----

checar('ehDiaUtil aceita segunda a sexta', [1, 2, 3, 4, 5].every((d) => ehDiaUtil(d)));
checar('ehDiaUtil recusa sábado e domingo', !ehDiaUtil(0) && !ehDiaUtil(6));
checar('chegouHorarioAlmoco vence ao meio-dia', chegouHorarioAlmoco({ ...momentoBrasil!, minutosDoDia: 12 * 60 }));
checar('chegouHorarioAlmoco ainda não venceu às 11h59', !chegouHorarioAlmoco({ ...momentoBrasil!, minutosDoDia: 11 * 60 + 59 }));

// 05/09/2026 é sábado, 06/09 domingo, 07/09 segunda.
const almocoDesdeSabado = planejarLembretesHabito({
  agora: new Date(2026, 8, 5, 8, 0),
  hour: 12,
  minute: 0,
  jaLancouHoje: false,
  quantidade: 3,
  janela: 'almoco',
});
checar('almoço pula sábado e domingo', almocoDesdeSabado.every((item) => item.quando.getDay() !== 0 && item.quando.getDay() !== 6));
checar('almoço começa na próxima segunda', almocoDesdeSabado[0].id === 'habito-almoco-2026-09-07');

const noiteMesmoDia = planejarLembretesHabito({ agora: new Date(2026, 8, 7, 8, 0), hour: 20, minute: 30, jaLancouHoje: false, quantidade: 1, janela: 'noite' });
const almocoMesmoDia = planejarLembretesHabito({ agora: new Date(2026, 8, 7, 8, 0), hour: 12, minute: 0, jaLancouHoje: false, quantidade: 1, janela: 'almoco' });
checar('almoço e noite não colidem de id no mesmo dia', noiteMesmoDia[0].id !== almocoMesmoDia[0].id);

// Contexto neutro (terça, sem streak nem inatividade) força o pool geral —
// é aí que o pool por janela precisa se manter separado.
const contextoNeutro = { streak: 0, diasInativo: 0, diaSemana: 2 };
let poolAlmocoNuncaSaiNoturno = true;
let poolNoiteNuncaSaiAlmoco = true;
for (let i = 0; i < 30; i++) {
  const sorteio = i / 30;
  if (selecionarMensagem(contextoNeutro, [], () => sorteio, 'almoco').categoria === 'noturno_humor') poolAlmocoNuncaSaiNoturno = false;
  if (selecionarMensagem(contextoNeutro, [], () => sorteio, 'noite').categoria === 'almoco') poolNoiteNuncaSaiAlmoco = false;
}
checar('pool geral da janela de almoço nunca sorteia noturno_humor', poolAlmocoNuncaSaiNoturno);
checar('pool geral da janela de noite nunca sorteia almoco', poolNoiteNuncaSaiAlmoco);

const sextaAlmoco = selecionarMensagem({ streak: 0, diasInativo: 0, diaSemana: 5 }, [], () => 0, 'almoco');
const sextaNoite = selecionarMensagem({ streak: 0, diasInativo: 0, diaSemana: 5 }, [], () => 0, 'noite');
checar('sexta produz tom de fim de semana na janela de almoço', sextaAlmoco.categoria === 'fim_de_semana');
checar('sexta produz tom de fim de semana na janela de noite', sextaNoite.categoria === 'fim_de_semana');

console.log(`${passou}/${passou + falhou} notificações passaram`);
if (falhou > 0) process.exit(1);
