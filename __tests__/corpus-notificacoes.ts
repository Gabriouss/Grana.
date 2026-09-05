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
  contextoDasDatas,
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

checar('mantém as 48 copies aprovadas', MENSAGENS.length === 48);
checar('cada copy tem id único', new Set(MENSAGENS.map((item) => item.id)).size === MENSAGENS.length);

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
const chaveColapso = chaveColapsoEntrega('2026-09-04');
checar('retentativas do dia usam uma chave de colapso determinística', chaveColapso === 'grana-habito-2026-09-04');
checar('a chave de colapso cabe no limite dos provedores', new TextEncoder().encode(chaveColapso).length <= 64);

console.log(`${passou}/${passou + falhou} notificações passaram`);
if (falhou > 0) process.exit(1);
