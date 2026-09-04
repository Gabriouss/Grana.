import {
  ehIdLembreteHabito,
  ID_HABITO_LEGADO,
  planejarLembretesHabito,
  PREFIXO_ID_HABITO,
  QUANTIDADE_LEMBRETES_HABITO,
} from '../lib/notification-schedule';

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

console.log(`${passou}/${passou + falhou} notificações passaram`);
if (falhou > 0) process.exit(1);
