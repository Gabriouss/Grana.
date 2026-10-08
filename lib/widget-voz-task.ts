import { AppRegistry, Platform } from 'react-native';
import { isLikelyNetworkError } from './offline-cache';
import type { CreditCard } from './types';
import type { DesfechoOperacaoVoz } from './voice-operations';
import { dataDaFala, referenciaDaFala, resumoDaDataDoLancamento, type ReferenciaDaFala } from './data-da-fala';

/** Por que a fala voltou para a fila. A faixa do topo diz isto, e não um
    "aguardando conexão" genérico (26/09/2026). */
export type MotivoFalaGuardada = 'sem_rede' | 'demorou' | 'sessao' | 'sem_notificacao' | 'revisao';

class VozPendenteOffline extends Error {
  readonly nome = 'VozPendenteOffline';
  constructor(mensagem: string, readonly motivo: MotivoFalaGuardada) {
    super(mensagem);
  }
}

/** Fala GUARDADA que o reconhecimento não entendeu. Apagá-la, como se faz com
    a fala nova (a pessoa está ali e repete), perdeu a fala do autor em
    26/09/2026: ela tinha sido gravada horas antes e não havia outra cópia. */
class FalaParaRevisar extends Error {
  constructor(readonly transcricao: string) {
    super('fala guardada não entendida');
  }
}

/** Como terminou uma execução: `guardada` quando a fala continua na fila. */
export type DesfechoTarefa = { guardada: false } | { guardada: true; motivo: MotivoFalaGuardada };

/**
 * Prazo TOTAL de uma execução (07/10/2026). O Android mata a tarefa headless
 * aos 120 s (GranaVoiceHeadlessService.kt) sem avisar ninguém; aqui a tarefa
 * desiste antes, com 20 s de folga para guardar a fala, dar o recibo e
 * limpar. Estourou: a fala fica na fila ("demorou") e sobe na próxima
 * retomada, com o mesmo requestId.
 *
 * As etapas já tinham prazos próprios (15 s de transcrição, 8 s de
 * referências, 15 s de gravação, 5 s de resumo). Este é o teto que vale para
 * a SOMA, inclusive para o que ninguém previu.
 */
export const PRAZO_TOTAL_TAREFA_MS = 100_000;
/** Quanto a tarefa espera o cliente dizer quem é o dono antes de ler o aparelho. */
const PRAZO_DONO_MS = 3_000;
/** Quanto a tarefa espera o sistema dizer se pode notificar. */
const PRAZO_PERMISSAO_MS = 5_000;
/**
 * Teto de PONTA A PONTA (achado R2 do Watchtower, 08/10/2026). O prazo total
 * acima só envolve o processamento; a preparação (reserva, permissão) e o
 * desfecho (guardar, recibo, limpeza) ficavam fora de qualquer relógio, e um
 * recibo que nunca respondesse deixava o widget em "Lançando…" até o Android
 * matar a tarefa aos 120 s, em silêncio. Aqui a tarefa devolve o controle
 * antes disso, com o widget em atenção. A fala nova já está reservada na fila
 * desde o começo, e a reserva vencida a devolve à retomada.
 */
export const PRAZO_FIM_DA_TAREFA_MS = 112_000;

/** A permissão de notificação, com prazo. Sem resposta, vale "não pode":
    a tarefa não lança sem ter como entregar o recibo, e a fala fica guardada. */
function podeAvisar(notificacoes: Pick<ReciboVoz, 'podeNotificar'>): Promise<boolean> {
  let corte: ReturnType<typeof setTimeout> | undefined;
  const consulta = notificacoes.podeNotificar();
  consulta.catch(() => {});
  const estouro = new Promise<boolean>((resolver) => {
    corte = setTimeout(() => {
      console.error('[voz] a permissão de notificação não respondeu no prazo; a fala fica guardada');
      resolver(false);
    }, PRAZO_PERMISSAO_MS);
  });
  return Promise.race([consulta, estouro]).finally(() => clearTimeout(corte));
}

function comPrazoTotal<T>(trabalho: Promise<T>, restaMs: number, cancelar: () => void): Promise<T> {
  let corte: ReturnType<typeof setTimeout> | undefined;
  const estouro = new Promise<never>((_, rejeitar) => {
    corte = setTimeout(
      () => {
        cancelar();
        rejeitar(new VozPendenteOffline('A tarefa passou do prazo total; a fala fica guardada.', 'demorou'));
      },
      Math.max(1, restaMs),
    );
  });
  // O trabalho abandonado não pode virar rejeição sem dono.
  trabalho.catch(() => {});
  return Promise.race([trabalho, estouro]).finally(() => clearTimeout(corte));
}

type ExecucaoDaFala = { encerrada: boolean; gravouDepois: boolean; finalizada: Promise<void> };
function conferirExecucao(execucao: ExecucaoDaFala): void {
  if (execucao.encerrada) throw new VozPendenteOffline('A execução desta fala terminou.', 'demorou');
}

/** Só a confirmação de uma RPC que JÁ saiu pode ter recibo depois do prazo. */
function recibosDuranteExecucao(base: ReciboVoz, execucao: ExecucaoDaFala): ReciboVoz {
  const conferir = () => { if (!execucao.gravouDepois) conferirExecucao(execucao); };
  return {
    podeNotificar: () => { conferir(); return base.podeNotificar(); },
    notificarRevisao: (...args) => { conferir(); return base.notificarRevisao(...args); },
    notificarSucesso: (...args) => { conferir(); return base.notificarSucesso(...args); },
    notificarFalha: (...args) => { conferir(); return base.notificarFalha(...args); },
    notificarSalvoLocal: () => { conferir(); return base.notificarSalvoLocal(); },
    notificarPendenteOffline: () => { conferir(); return base.notificarPendenteOffline(); },
  };
}

/**
 * RESERVA a fala na fila antes de qualquer rede (07/10/2026). Até aqui o
 * áudio vivia só no cache enquanto a tarefa rodava: se o Android a matasse
 * no meio, nada apontava para ele e a fala se perdia em silêncio. Reservada,
 * ela vira fala guardada sozinha quando a reserva vence (ver
 * `reservarFalaEmAndamento` em widget-voz-pendentes) e sobe na próxima
 * abertura do app. Vale para o botão do app e para o widget (regra 13).
 *
 * Falhar aqui não impede o lançamento: a tarefa segue como antes, só sem a
 * rede de segurança, e fica o log.
 */
async function reservarFala(caminho: string, requestId: string, source: Payload['source'], captura: object): Promise<boolean> {
  try {
    const [{ reservarFalaEmAndamento }, { idDoUsuarioLocal }] = await Promise.all([
      import('./widget-voz-pendentes'),
      import('./sessao-offline'),
    ]);
    const userId = await idDoUsuarioLocal(PRAZO_DONO_MS);
    if (!userId) return false;
    return await reservarFalaEmAndamento({ caminho, requestId, userId, source, ...captura });
  } catch (erro) {
    console.error('[voz] a fala não foi reservada na fila; segue sem a rede de segurança', requestId, erro);
    return false;
  }
}

/**
 * Tarefa headless do widget Android de lançamento por voz.
 *
 * Roda com o app FECHADO, sem React e sem tela: o serviço nativo grava o
 * áudio (modules/grana-voice-widget) e entrega o caminho do arquivo aqui.
 * Daqui em diante é o mesmo caminho de sempre — transcrição pela Edge Function
 * (`lib/voz.ts`), interpretação por `lib/heuristics.ts`, gravação por
 * `lib/data.ts`. Nenhuma regra financeira nova mora neste arquivo, de
 * propósito: um segundo motor de lançamento é exatamente o que a unificação
 * existe pra não ter.
 *
 * Registrado no boot do bundle (ver `index.js`), não dentro de um componente:
 * quando o Android inicia a tarefa, não existe árvore React montada.
 *
 * Os imports pesados são carregados DENTRO da tarefa, não no topo: este módulo
 * é avaliado em toda abertura normal do app, e puxar Supabase/notificações só
 * pra registrar um nome de tarefa atrasaria o arranque de todo mundo.
 */

type Payload = {
  caminho?: string;
  requestId?: string;
  source?: 'app' | 'widget';
  transcricao?: string;
  /* A captura (data na voz, 30/09/2026), anotada NO INÍCIO da gravação pelo
     botão do app ou pelo widget: `dataCaptura` é a data civil local, e é ela
     que resolve "ontem" e "na sexta", nunca a hora em que a fala é
     processada. Da fila chegam também `criadoEm` e `referenciaAproximada`. */
  capturadoEm?: number;
  dataCaptura?: string;
  criadoEm?: number;
  referenciaAproximada?: boolean;
  /* Sem campo de prazo, de propósito: o prazo da voz é um só para as duas
     entradas (`PRAZO_TRANSCRICAO_MS`, em lib/voz.ts). Até 25/09/2026 o botão
     do app declarava 15s aqui e o widget ficava com 60s. */
};

type ReciboVoz = Pick<typeof import('./widget-voz-notificacoes'), 'podeNotificar' | 'notificarSucesso' | 'notificarFalha' | 'notificarSalvoLocal' | 'notificarPendenteOffline'> & {
  /** `ref`: a data da captura, que a revisão usa para ler a data dita. */
  notificarRevisao: (titulo: string, transcricao: string, ref?: ReferenciaDaFala) => Promise<void>;
};

/** Toda revisão desta fala leva a referência dela, sem cada chamada lembrar. */
function comReferencia(base: ReciboVoz, ref: ReferenciaDaFala): ReciboVoz {
  return { ...base, notificarRevisao: (titulo, transcricao) => base.notificarRevisao(titulo, transcricao, ref) };
}

/** O erro da gravação visto pelo núcleo (`desfechoDoErroVoz`, a mesma
    decisão da revisão). Roda dentro do `catch` da tarefa: se a checagem
    falhar, a fala segue pelo caminho de falha de sempre, em vez de escapar
    do `catch`. */
async function desfechoDoErro(erro: unknown): Promise<DesfechoOperacaoVoz | null> {
  try {
    const { desfechoDoErroVoz } = await import('./voice-operations');
    return desfechoDoErroVoz(erro);
  } catch (erroChecagem) {
    console.error('[voz] não consegui conferir se a fala já foi usada', erroChecagem);
    return null;
  }
}

/** Nada foi gravado agora: a fala já estava lançada (replay do servidor,
    achado A2 do Lynx de 29/09/2026), já tinha sido desfeita (C2) ou já foi
    usada com outro conteúdo (22023, C3). O recibo diz qual, e nunca o de
    lançamento novo. A falha do recibo não provoca nova gravação. */
async function avisarSemLancamentoNovo(notificacoes: ReciboVoz, codigo: 'ja_lancada' | 'desfeita' | 'ja_usada'): Promise<void> {
  try {
    await notificacoes.notificarFalha(codigo);
  } catch (erroRecibo) {
    console.error('[voz] recibo de fala sem lançamento novo não foi entregue', codigo, erroRecibo);
  }
}

/** O recibo quando a gravação NÃO criou lançamento novo. A decisão é a de
    `desfechoDaOperacaoVoz` (lib/voice-operations.ts), a mesma que as três
    telas de revisão leem: aqui só se apresenta, nada se decide (regra 13;
    achado C1 do Lynx, 30/09/2026, em que a tarefa repetia a ordem à mão nos
    quatro tipos de lançamento). Devolve `false` só para lançamento novo,
    que segue para o recibo de sucesso. */
async function reciboSemLancamentoNovo(desfecho: DesfechoOperacaoVoz, notificacoes: ReciboVoz): Promise<boolean> {
  if (desfecho === 'nova') return false;
  if (desfecho === 'pendente') await notificacoes.notificarSalvoLocal();
  else await avisarSemLancamentoNovo(notificacoes, desfecho);
  return true;
}

/** Núcleo único de execução. A origem só identifica auditoria e apresentação. */
export async function executarTarefa(payload: Payload, recibo?: ReciboVoz): Promise<DesfechoTarefa> {
  const definirEstado = payload.source === 'app' ? (_estado: string) => {} : (await import('@/modules/grana-voice-widget')).definirEstado;
  /* O que já tem índice de retomada (fila ou pasta de recuperação). O teto
     só afirma "guardada" com isso: sem índice, nada retomaria a fala, e a
     promessa seria falsa (resíduo da leitura final do Lynx, 08/10/2026). */
  const andamento = { indexada: false };
  const trabalho = executarAteODesfecho(payload, recibo, definirEstado, andamento);
  // O trabalho que passou do teto não pode virar rejeição sem dono.
  trabalho.catch(() => {});
  let corte: ReturnType<typeof setTimeout> | undefined;
  const teto = new Promise<DesfechoTarefa>((resolver) => {
    corte = setTimeout(() => {
      console.error('[voz] a tarefa não chegou ao desfecho no teto de ponta a ponta', payload?.requestId);
      try {
        definirEstado('atencao');
      } catch (erroEstado) {
        console.error('[voz] o widget não pôde ser posto em atenção', erroEstado);
      }
      const daFila = !!payload?.caminho?.includes('/voz-pendente/');
      resolver(andamento.indexada || daFila ? { guardada: true, motivo: 'demorou' } : { guardada: false });
    }, PRAZO_FIM_DA_TAREFA_MS);
  });
  return Promise.race([trabalho, teto]).finally(() => clearTimeout(corte));
}

async function executarAteODesfecho(
  payload: Payload,
  recibo: ReciboVoz | undefined,
  definirEstado: (estado: 'ocioso' | 'atencao') => unknown,
  andamento: { indexada: boolean },
): Promise<DesfechoTarefa> {
  const caminho = payload?.caminho;
  const requestId = payload?.requestId;
  /* A data da captura acompanha a fala até a revisão (data na voz,
     30/09/2026): toda revisão pedida por esta execução leva a referência,
     para a tela contar "ontem" a partir do dia em que a fala foi dita. */
  const referencia = referenciaDaFala(payload, hojeISO());
  const notificacoes = comReferencia(recibo ?? daFala(await import('./widget-voz-notificacoes'), requestId), referencia);
  /* A mesma captura, se a fala precisar ir (ou voltar) para a fila. */
  const captura = {
    ...(payload.capturadoEm ?? payload.criadoEm ? { criadoEm: payload.capturadoEm ?? payload.criadoEm } : null),
    ...(payload.dataCaptura ? { dataCaptura: payload.dataCaptura } : null),
    ...(payload.referenciaAproximada ? { referenciaAproximada: true } : null),
  };
  /* O estado final do widget é decidido aqui e não no `finally` de sempre:
     quando não há como avisar a pessoa, ele NÃO pode voltar ao repouso como
     se nada tivesse acontecido — é justamente esse "nada aconteceu" que
     esconderia um lançamento perdido. */
  let estadoFinal: 'ocioso' | 'atencao' = 'ocioso';
  let manterArquivo = false;
  /* A fala foi reservada na fila por ESTA execução (fala nova). */
  let reservada = false;
  let copiaDuravel = false;
  const inicio = Date.now();
  let finalizar!: () => void;
  const execucao: ExecucaoDaFala = { encerrada: false, gravouDepois: false,
    finalizada: new Promise<void>((resolve) => { finalizar = resolve; }) };
  const contexto: { transcricao?: string } = {};
  let desfecho: DesfechoTarefa = { guardada: false };
  let desfechoDoConflito: DesfechoOperacaoVoz | null = null;

  try {
    if (!caminho) return desfecho;
    if (!requestId) throw new Error('request_id_ausente');
    /* Antes de tudo: a fala nova fica reservada na fila. Fala que já veio
       da fila não precisa, ela já está lá. */
    if (!caminho.includes('/voz-pendente/')) reservada = await reservarFala(caminho, requestId, payload.source, captura);
    if (reservada) andamento.indexada = true;

    /* Antes de gastar transcrição, e muito antes de gravar qualquer coisa:
       sem permissão de notificação o widget não tem como entregar o recibo
       nem o "Desfazer". Nesse caso ele não lança — acende o estado de
       atenção, e um toque abre o app pra resolver a permissão. */
    if (!(await podeAvisar(notificacoes))) {
      estadoFinal = 'atencao';
      // A permissão pode ter mudado depois da gravação. Preservar com dono;
      // nunca atribuir uma fala sem sessão à próxima conta do aparelho.
      manterArquivo = caminho.includes('/voz-pendente/');
      if (!manterArquivo) {
        const { idDoUsuarioLocal } = await import('./sessao-offline');
        const userId = await idDoUsuarioLocal(PRAZO_DONO_MS);
        if (userId) {
          const { adicionarVozPendente } = await import('./widget-voz-pendentes');
          await adicionarVozPendente({ caminho, requestId, userId, source: payload.source, ...captura });
          andamento.indexada = true;
          manterArquivo = true;
        }
      }
      if (manterArquivo) desfecho = { guardada: true, motivo: 'sem_notificacao' };
      return desfecho;
    }

    const salvou = await comPrazoTotal(
      processar(caminho, requestId, contexto, payload, recibosDuranteExecucao(notificacoes, execucao), referencia, execucao),
      PRAZO_TOTAL_TAREFA_MS - (Date.now() - inicio),
      () => { execucao.encerrada = true; },
    );
    if (salvou) await sincronizarResumoDepoisDaVoz();
    else estadoFinal = 'atencao';
  } catch (erro) {
    console.warn('[voz:widget] tarefa interrompida', (erro as { code?: string })?.code ?? 'falha');
    estadoFinal = 'atencao';
    if (erro instanceof FalaParaRevisar && requestId) {
      /* Sem lançar e sem apagar: a fala fica na fila, marcada, e o recibo
         (na tela, guardado até ser visto) oferece revisar, tentar de novo ou
         descartar. Mesma saída para fala do app e do widget (regra 13). */
      manterArquivo = true;
      desfecho = { guardada: true, motivo: 'revisao' };
      try {
        const [{ marcarVozEmRevisao }, { guardarReciboDaFila }, { idDoUsuarioLocal }, { reciboDaFalaGuardada }] = await Promise.all([
          import('./widget-voz-pendentes'),
          import('./voz-recibos-da-fila'),
          import('./sessao-offline'),
          import('./voz-recibos'),
        ]);
        await marcarVozEmRevisao(requestId, erro.transcricao || undefined);
        const dono = await idDoUsuarioLocal(PRAZO_DONO_MS);
        if (dono) {
          await guardarReciboDaFila({ id: requestId, dono, tipo: 'audio', ...reciboDaFalaGuardada(erro.transcricao) });
        }
      } catch (erroRevisao) {
        // A fala continua na fila mesmo assim; a próxima retomada tenta de novo.
        console.error('[voz] fala guardada não entrou em revisão', requestId, erroRevisao);
      }
    } else if (erro instanceof VozPendenteOffline || isLikelyNetworkError(erro)) {
      /* A gravação já aconteceu. Não apagá-la é a diferença entre "sem rede"
         ser uma espera transparente e perder a fala junto com a notificação. */
      if (caminho && requestId) {
        const motivo: MotivoFalaGuardada = erro instanceof VozPendenteOffline ? erro.motivo : 'sem_rede';
        let userId: string | null = null;
        /* Este bloco roda DENTRO do `catch`: até 07/10/2026 nada aqui tinha
           guarda própria, e uma falha ao gravar a fila escapava do `catch`,
           caía no `finally` com `manterArquivo` falso e APAGAVA o áudio
           (regra 9: o catch que trata a falha também pode falhar). */
        try {
          const [{ adicionarVozPendente }, { idDoUsuarioLocal }] = await Promise.all([
            import('./widget-voz-pendentes'),
            import('./sessao-offline'),
          ]);
          /* A fila é vinculada ao usuário autenticado. Sem isso, alguém que
             saia da conta antes da rede voltar poderia lançar o áudio antigo na
             conta seguinte do mesmo aparelho. Lido pelo aparelho: este é o
             caminho DE FALHA POR FALTA DE REDE, e perguntar pela rede quem é o
             dono descartava a gravação em vez de guardá-la. */
          userId = await idDoUsuarioLocal(PRAZO_DONO_MS);
          if (userId) {
            await adicionarVozPendente({ caminho, requestId, userId, source: payload.source, transcricao: contexto.transcricao ?? payload.transcricao, ...captura });
            andamento.indexada = true;
            manterArquivo = true;
            desfecho = { guardada: true, motivo };
          }
        } catch (erroFila) {
          console.error('[voz] a fala não pôde ser regravada na fila', requestId, erroFila);
          /* A reserva feita no começo continua valendo: a fala está na fila
             com o áudio copiado, e vira fala guardada quando a reserva vence. */
          if (reservada || caminho.includes('/voz-pendente/')) {
            manterArquivo = true;
            desfecho = { guardada: true, motivo };
          } else if (userId) {
            try {
              const { guardarVozOrfa } = await import('./widget-voz-pendentes');
              await guardarVozOrfa({ caminho, requestId, userId, source: payload.source,
                transcricao: contexto.transcricao ?? payload.transcricao, ...captura });
              copiaDuravel = true;
              andamento.indexada = true;
              manterArquivo = true;
              desfecho = { guardada: true, motivo };
            } catch (erroOrfa) {
              /* Nem a fila nem a pasta de recuperação gravaram (achado R3 do
                 Watchtower, 08/10/2026). Nada retoma um áudio solto no cache:
                 dizer "Áudio guardado" seria prometer o que não vai acontecer
                 (regra 9). O recibo logo abaixo é o de falha, e o áudio sai. */
              console.error('[voz] não consegui guardar a fala para recuperação', requestId, erroOrfa);
            }
          }
        }
        try {
          if (manterArquivo) {
            /* Só na PRIMEIRA vez que a fala fica guardada. A retomada roda a
               cada 30 s com o app aberto e, sem rede, cada passada publicava
               outro "Áudio guardado" (B5, 27/09/2026). A faixa do topo já diz
               que ela continua na fila. */
            if (!caminho.includes('/voz-pendente/')) await notificacoes.notificarPendenteOffline();
          } else {
            await notificacoes.notificarFalha(userId ? 'erro_interno' : 'sem_sessao');
          }
        } catch (erroRecibo) {
          console.warn('[voz] recibo de pendência falhou', erroRecibo);
          // A fila continua sendo a fonte de verdade se a notificação falhar;
          // o estado de atenção do widget é o recibo mínimo.
        }
      }
    } else if (requestId && (desfechoDoConflito = await desfechoDoErro(erro))) {
      /* A fala já foi usada pela revisão (que grava com o id dela) e voltou
         porque a limpeza local falhou. Nada a lançar e nada a revisar: a fala
         sai da fila, e o recibo diz por quê, com a mesma decisão e o mesmo
         texto da revisão ("Fala já usada", C3). Oferecer "Não consegui
         salvar" aqui convidaria a pessoa a lançar o mesmo gasto à mão. */
      estadoFinal = 'ocioso';
      try {
        const { concluirVozRevisada } = await import('./widget-voz-pendentes');
        await concluirVozRevisada(requestId);
      } catch (erroLimpeza) {
        console.error('[voz] fala já usada não saiu da fila', requestId, erroLimpeza);
      }
      await reciboSemLancamentoNovo(desfechoDoConflito, notificacoes);
    } else {
      try {
        if (contexto.transcricao) {
          /* Se a captura e a transcrição deram certo, devolver a fala para a
             revisão é muito mais útil que "erro interno" sem contexto. */
          /* Crédito sem cartão recusado pelo servidor: a revisão pergunta o
             cartão, que é o que falta. Mesma saída para app e widget. */
          const { ehRecusaCartaoObrigatorio } = await import('./voice-operations');
          await notificacoes.notificarRevisao(
            ehRecusaCartaoObrigatorio(erro) ? 'Qual cartão?' : 'Não consegui salvar',
            contexto.transcricao
          );
        } else {
          await notificacoes.notificarFalha('erro_interno');
        }
      } catch (erroRecibo) {
        // O estado de atenção continua sendo o recibo mínimo se a notificação
        // também falhar: o próximo toque abre o app em vez de parecer perdido.
        console.error('[voz] recibo da falha não foi entregue', erroRecibo);
        /* Fala que veio da fila e cujo recibo não foi entregue: sair da fila
           seria perdê-la sem ninguém saber. Fica, e a próxima retomada tenta. */
        if (reservada || caminho?.includes('/voz-pendente/')) {
          manterArquivo = true;
          desfecho = { guardada: true, motivo: 'sem_notificacao' };
          if (reservada && caminho && requestId) {
            try {
              const [{ adicionarVozPendente }, { idDoUsuarioLocal }] = await Promise.all([
                import('./widget-voz-pendentes'), import('./sessao-offline'),
              ]);
              const userId = await idDoUsuarioLocal(PRAZO_DONO_MS);
              if (userId) await adicionarVozPendente({ caminho, requestId, userId, source: payload.source,
                transcricao: contexto.transcricao ?? payload.transcricao, ...captura });
            } catch (erroFila) {
              console.error('[voz] recibo falhou; a reserva da fala continua para recuperação', requestId, erroFila);
            }
          }
        } else if (caminho && requestId) {
          // Reserva e recibo podem falhar juntos. Recuperação não depende de AsyncStorage.
          try {
            const [{ guardarVozOrfa }, { idDoUsuarioLocal }] = await Promise.all([
              import('./widget-voz-pendentes'), import('./sessao-offline'),
            ]);
            const userId = await idDoUsuarioLocal(PRAZO_DONO_MS);
            if (userId) {
              await guardarVozOrfa({ caminho, requestId, userId, source: payload.source,
                transcricao: contexto.transcricao ?? payload.transcricao, ...captura });
              copiaDuravel = true;
              andamento.indexada = true;
              manterArquivo = true;
              desfecho = { guardada: true, motivo: 'sem_notificacao' };
            }
          } catch (erroOrfa) {
            /* Recibo, fila e pasta de recuperação falharam juntos. Nada foi
               guardado e nada é anunciado como guardado; o estado de atenção
               do widget é o recibo que resta (achado R3). */
            console.error('[voz] reserva, recibo e recuperação falharam; a fala não ficou guardada', requestId, erroOrfa);
          }
        }
      }
    }
  } finally {
    /* Áudio financeiro não fica no aparelho depois de usado, e o widget não
       pode ficar preso em "Lançando…" — os dois valem em QUALQUER saída,
       inclusive erro. */
    /* O arquivo que a captura entregou sai sempre que a fila já tem a cópia
       dela (fala reservada) ou a fala não vai ficar guardada. Fala que veio
       da fila e continua nela mantém o áudio, que É a cópia da fila. */
    if (caminho && (!manterArquivo || reservada || copiaDuravel)) await apagarArquivo(caminho);
    /* Com guarda própria (07/10/2026): se a limpeza da fila falhasse, o
       `definirEstado` de baixo não rodava e o widget ficava preso em
       "Lançando…" com o lançamento já salvo. */
    try {
      if (requestId && !manterArquivo) {
        const { removerVozPendente, liberarFalaEmAndamento } = await import('./widget-voz-pendentes');
        if (reservada) await liberarFalaEmAndamento(requestId);
        else await removerVozPendente(requestId);
      }
    } catch (erroLimpeza) {
      console.error('[voz] a fala concluída não saiu da fila; a próxima retomada resolve pelo mesmo requestId', requestId, erroLimpeza);
    }
    definirEstado(estadoFinal);
    execucao.encerrada = true;
    finalizar();
  }
  return desfecho;
}

/**
 * O módulo de notificação, preso a UMA fala: cada recibo dela sai com a mesma
 * identidade na bandeja (`idNaBandeja`), e o seguinte substitui o anterior.
 * Vale para a fala do botão do app e do widget, que passam por aqui (regra 13).
 */
function daFala(modulo: typeof import('./widget-voz-notificacoes'), requestId: string | undefined): ReciboVoz {
  return {
    podeNotificar: () => modulo.podeNotificar(),
    notificarRevisao: (titulo, transcricao, ref) => modulo.notificarRevisao(titulo, transcricao, requestId, ref),
    notificarSucesso: (dados) => modulo.notificarSucesso(dados, requestId),
    notificarFalha: (codigo) => modulo.notificarFalha(codigo, requestId),
    notificarSalvoLocal: () => modulo.notificarSalvoLocal(requestId),
    notificarPendenteOffline: () => modulo.notificarPendenteOffline(requestId),
  };
}

async function apagarArquivo(caminho: string) {
  try {
    const FileSystem = await import('expo-file-system/legacy');
    const uri = caminho.startsWith('file://') ? caminho : `file://${caminho}`;
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Arquivo já sumiu (cache limpo pelo sistema) — nada a fazer.
  }
}

async function processar(caminho: string, requestId: string, contexto: { transcricao?: string }, payload: Payload, notificacoes: ReciboVoz, referencia: ReferenciaDaFala, execucao: ExecucaoDaFala): Promise<boolean> {
  const [{ transcreverAudio }, heuristics, data, operacoes] = await Promise.all([
    import('./voz'),
    import('./heuristics'),
    import('./data'),
    import('./voice-operations'),
  ]);
  conferirExecucao(execucao);
  const voiceOperations: typeof operacoes = {
    ...operacoes,
    registrarOperacaoVoz: async (...args) => {
      conferirExecucao(execucao); // vale também para crédito/boleto/parcelado: antes de QUALQUER escrita.
      const resultado = await operacoes.registrarOperacaoVoz(...args);
      if (execucao.encerrada) {
        /* A gravação já tinha saído quando o prazo estourou e respondeu
           depois. Nada é reenviado: espera a tarefa terminar de guardar a
           fala, tira-a da fila e deixa passar o recibo DESTE resultado. Aqui
           não se decide nada sobre o resultado (achado R1 do Watchtower,
           08/10/2026, regra 13): quem o lê é `desfechoDaOperacaoVoz`, nos
           mesmos quatro pontos de sempre. Pendente, a operação já está na
           fila de operações do aparelho, como no caminho normal. */
        await execucao.finalizada;
        const { concluirVozRevisada } = await import('./widget-voz-pendentes');
        await concluirVozRevisada(requestId);
        execucao.gravouDepois = true;
      }
      return resultado;
    },
  };

  const uri = caminho.startsWith('file://') ? caminho : `file://${caminho}`;
  /* Fala que veio da fila de áudios guardados (`widget-voz-pendentes`): a
     pessoa não está ali para repetir, então "não entendi" não pode apagá-la. */
  const daFila = caminho.includes('/voz-pendente/');
  /* O prazo de rede é o mesmo nas duas entradas e mora em lib/voz.ts
     (`PRAZO_TRANSCRICAO_MS`). Ninguém o escolhe aqui: nem pela origem da fala
     (achado F2, regra 13), nem por quem chama (decisão do autor, 25/09/2026). */
  const transcricao = payload.transcricao
    ? { ok: true as const, transcript: payload.transcricao }
    : await transcreverAudio(uri, {
        mimeType: 'audio/m4a',
        nomeArquivo: 'widget.m4a',
      });
  conferirExecucao(execucao);
  if (!transcricao.ok) {
    if (transcricao.codigo === 'sem_rede' || transcricao.codigo === 'demorou') {
      throw new VozPendenteOffline('A transcrição será retomada quando houver conexão.', transcricao.codigo);
    }
    /* Recusa por credencial COM uma sessão gravada no aparelho é temporária,
       não definitiva: o token de acesso venceu e a renovação ainda não passou
       (o cliente tenta de novo sozinho a cada 30s). Apagar o áudio aqui seria
       destruir a fala por causa de uma janela de um minuto. Só quando não há
       sessão nenhuma no disco é que "entre na conta de novo" é uma instrução
       que a pessoa consegue cumprir. */
    if (transcricao.codigo === 'nao_autenticado' || transcricao.codigo === 'sem_sessao') {
      const { lerSessaoDoDisco } = await import('./sessao-offline');
      if (await lerSessaoDoDisco()) {
        throw new VozPendenteOffline('A sessão será renovada quando houver conexão.', 'sessao');
      }
    }
    if (transcricao.codigo === 'nao_entendi' && daFila) throw new FalaParaRevisar('');
    await notificacoes.notificarFalha(transcricao.codigo);
    return false;
  }

  let texto = transcricao.transcript;
  const confiabilidade = await import('./voz-confiabilidade');
  if (!confiabilidade.transcricaoPareceLancamentoVoz(texto)) {
    /* Frase sem relação com dinheiro é o que o provedor devolve para ruído ou
       silêncio: o recibo não a mostra como "Ouvi:", porque a pessoa leria algo
       que nunca disse. Texto com cara de lançamento incompleto ("mercado")
       continua aparecendo, para completar à mão. */
    if (daFila) throw new FalaParaRevisar(confiabilidade.transcricaoForaDeContexto(texto) ? '' : texto);
    await notificacoes.notificarFalha('nao_entendi');
    return false;
  }
  contexto.transcricao = texto;
  // A forma curta "cartão C6" tem a mesma intenção de "no cartão C6".
  // A heurística existente já preserva débito e recebimentos explicitados.
  texto = texto.replace(/\bcart[aã]o\b/giu, 'no cartão');
  /* A data do gasto dita na fala (data na voz, 30/09/2026), ANTES de
     carteira, valor, categoria e descrição: todo o resto lê o texto sem ela,
     para "farmácia dia 12 40 reais" não virar R$ 12. Conta a pagar pula: lá
     a data dita é o vencimento. Data duvidosa vai para a revisão, com a
     referência, e nada é gravado. */
  let dataDoGasto = referencia.referencia;
  if (!heuristics.ehIntencaoBoleto(texto)) {
    const lida = dataDaFala(texto, referencia);
    if (lida.revisao) {
      await notificacoes.notificarRevisao(lida.revisao.titulo, transcricao.transcript);
      return false;
    }
    texto = lida.textoSemData;
    dataDoGasto = lida.data;
  }
  const { fetchWallets } = await import('./wallets');
  let prazoReferencias: ReturnType<typeof setTimeout> | undefined;
  const [extras, carteiras, cartoesDisponiveis] = await Promise.race([
    Promise.all([categoriasDaPessoa(data), fetchWallets(), heuristics.ehIntencaoCredito(texto) ? data.fetchCreditCards() : Promise.resolve([])]),
    new Promise<never>((_, reject) => {
      prazoReferencias = setTimeout(() => reject(new VozPendenteOffline('timeout ao carregar referências', 'demorou')), 8_000);
    }),
  ]).finally(() => clearTimeout(prazoReferencias));
  conferirExecucao(execucao);

  const carteiraMencionada = heuristics.matchWalletByText(texto, carteiras);
  /* "Conta de luz" é conta a pagar, não carteira (achado B2): a mesma regra
     do Granabô, em `heuristics.citaCarteira`. */
  const mencionaCarteira = heuristics.citaCarteira(texto);
  if (mencionaCarteira && !carteiraMencionada) {
    await notificacoes.notificarRevisao('Qual carteira?', texto);
    return false;
  }
  const carteira = carteiraMencionada ?? carteiras.find((w) => w.is_default) ?? carteiras[0];
  if (!carteira) {
    await notificacoes.notificarRevisao('Nenhuma carteira cadastrada', texto);
    return false;
  }
  const textoFinanceiro = carteiraMencionada ? heuristics.limparReferenciaCarteira(texto, carteira.name) : texto;
  texto = textoFinanceiro;
  if (confiabilidade.precisaRevisarValorVoz(texto)) {
    await notificacoes.notificarRevisao('Confirme o valor que ouvi', transcricao.transcript);
    return false;
  }
  const valor = heuristics.guessAmountFromText(texto);
  if (!Number.isFinite(valor) || valor <= 0) {
    await notificacoes.notificarRevisao('Não encontrei o valor', transcricao.transcript);
    return false;
  }
  const cartaoDaCategoria = heuristics.ehIntencaoCredito(texto)
    ? heuristics.matchCardByText(texto, cartoesDisponiveis.filter(c => !c.wallet_id || c.wallet_id === carteira.id)) : null;
  const textoDaCategoria = cartaoDaCategoria ? heuristics.limparReferenciaCartao(texto, cartaoDaCategoria) : texto;
  /* Entrada com intenção de crédito ia para `lancarNoCredito`, que grava
     `type: 'out'`: uma fala de dinheiro ENTRANDO virava compra no cartão.
     Entrada no cartão não existe no Grana. (autor, 26/09/2026): vai para a
     revisão padrão, sem gravar. Boleto antes, como no resto da tarefa. A
     mesma função decide no Granabô e no destino da fala na tela
     (`lib/destino-da-fala.ts`), com a lista inteira de cartões. */
  if (!heuristics.ehIntencaoBoleto(texto) && heuristics.entradaComIntencaoDeCredito(texto, cartoesDisponiveis)) {
    await notificacoes.notificarRevisao('Não consegui salvar', transcricao.transcript);
    return false;
  }

  /* Mesma regra de `categoriaReconhecida` (lib/heuristics.ts), que as outras
     entradas usam: palpite "Outros" é categoria não reconhecida e pergunta. */
  const categoria = heuristics.guessCategoryFromText(textoDaCategoria, extras);
  if (categoria.name === 'Outros') {
    await notificacoes.notificarRevisao('Qual categoria?', transcricao.transcript);
    return false;
  }
  if (/\bparcel(?:as?|ado|ada|ei|ar)\b|\b\d+\s*(?:x|vezes)\b/i.test(texto) && heuristics.parseParcelas(texto) === null) {
    await notificacoes.notificarRevisao('Confirme o parcelamento', transcricao.transcript);
    return false;
  }
  const tipo = heuristics.guessTypeFromText(textoFinanceiro);
  const descricao = heuristics.descricaoDoLancamento(textoFinanceiro, tipo) || 'Lançamento por voz';

  // Boleto antes de crédito: "boleto no cartão" é boleto. Mesma ordem do bot.
  if (heuristics.ehIntencaoBoleto(texto)) {
    const dueDate = heuristics.parseDiaVencimento(texto);
    if (!dueDate) {
      await notificacoes.notificarRevisao('Confirme o vencimento', transcricao.transcript);
      return false;
    }
    const resultado = await voiceOperations.registrarOperacaoVoz(requestId, payload.source ?? 'widget', {
      kind: 'bill',
      description: descricao,
      amount: valor,
      category: categoria.name,
      color: categoria.color,
      due_date: dueDate,
      recurring: heuristics.parseRecorrencia(texto),
      wallet_id: carteira.id,
    });
    if (await reciboSemLancamentoNovo(voiceOperations.desfechoDaOperacaoVoz(resultado), notificacoes)) return true;
    try {
      await notificacoes.notificarSucesso({
        titulo: `${descricao} · ${formatarBRL(valor)}`,
        texto: `Conta a pagar · vence ${formatarData(dueDate)}`,
        tipo: 'bill',
        ids: resultado.ids,
        operationId: resultado.operationId,
      });
    } catch {
      /* A RPC já confirmou a gravação. Uma falha no recibo nunca deve fazer
         parecer que o lançamento não existiu nem provocar nova tentativa. */
    }
    return true;
  }

  /* Série (recorrente ou parcelada) nasce da data: uma data errada se
     repete por N meses. Com data diferente da fala, a pessoa confirma. */
  const serie = heuristics.parseRecorrencia(texto);
  if (serie && dataDoGasto !== referencia.referencia) {
    await notificacoes.notificarRevisao('Confirme a data', transcricao.transcript);
    return false;
  }

  if (heuristics.ehIntencaoCredito(texto)) {
    return lancarNoCredito({
      requestId, source: payload.source ?? 'widget', texto, valor, descricao, categoria, carteiraId: carteira.id, cartoesDisponiveis, heuristics, data, notificacoes, voiceOperations,
      dataDoGasto, referencia: referencia.referencia, transcricao: transcricao.transcript,
    });
  }

  const formaPagamento = heuristics.parseFormaPagamento(texto);
  const resultado = await voiceOperations.registrarOperacaoVoz(requestId, payload.source ?? 'widget', {
    kind: 'transaction',
    type: tipo,
    description: descricao,
    amount: valor,
    category: categoria.name,
    color: categoria.color,
    occurred_on: dataDoGasto,
    recurring: serie,
    ...(formaPagamento ? { payment_method: formaPagamento } : null),
    wallet_id: carteira.id,
  });
  if (await reciboSemLancamentoNovo(voiceOperations.desfechoDaOperacaoVoz(resultado), notificacoes)) return true;

  try {
    await notificacoes.notificarSucesso({
      titulo: `${descricao} · ${formatarBRL(valor)}`,
      texto: [categoria.name, nomeDaForma(formaPagamento), serie ? 'todo mês' : null,
        resumoDaDataDoLancamento({ dataISO: dataDoGasto, hojeISO: hojeISO(), destino: 'caixa' })]
        .filter(Boolean)
        .join(' · '),
      tipo: 'transaction',
      ids: resultado.ids,
      operationId: resultado.operationId,
    });
  } catch {
    /* O lançamento já foi confirmado no banco; o próximo refresh do app o
       encontra mesmo que o recibo local não possa ser publicado. */
  }
  return true;
}

async function lancarNoCredito(args: {
  requestId: string;
  source: 'app' | 'widget';
  texto: string;
  valor: number;
  descricao: string;
  categoria: { name: string; color: string };
  carteiraId: string;
  cartoesDisponiveis: CreditCard[];
  heuristics: typeof import('./heuristics');
  data: typeof import('./data');
  notificacoes: ReciboVoz;
  voiceOperations: typeof import('./voice-operations');
  /** A data resolvida da fala e a da captura (data na voz). */
  dataDoGasto: string;
  referencia: string;
  transcricao: string;
}): Promise<boolean> {
  const { requestId, texto, valor, descricao, categoria, carteiraId, heuristics, data, notificacoes, voiceOperations, dataDoGasto, referencia } = args;

  const cartoes = args.cartoesDisponiveis.filter(c => !c.wallet_id || c.wallet_id === carteiraId);
  /* Sem cartão cadastrado, crédito NÃO vira Pix nem débito caladinho: a
     forma de pagamento muda de quem cobra e quando, e adivinhar isso é
     inventar um fato financeiro. */
  if (cartoes.length === 0) {
    await notificacoes.notificarRevisao('Nenhum cartão cadastrado', texto);
    return false;
  }

  const cartaoIdentificado = heuristics.matchCardByText(texto, cartoes);
  const cartaoExplicito = /\b(?:cr[eé]dito|cart[aã]o)\s+(?:(?:no|na|do|da|de)\s+)?(?!(?:em|no|na|de|todo|recorrente)\b)[\p{L}\d]/iu.test(texto);
  if (!cartaoIdentificado && (cartoes.length > 1 || cartaoExplicito)) {
    await notificacoes.notificarRevisao('Qual cartão?', texto);
    return false;
  }
  const cartao = cartaoIdentificado ?? cartoes[0];
  if (cartao.wallet_id && cartao.wallet_id !== carteiraId) {
    await notificacoes.notificarRevisao('Cartão e carteira não combinam', texto);
    return false;
  }
  const parcelas = heuristics.parseParcelas(texto);
  /* O nome sai de novo, agora que o cartão é conhecido: sem isso "crédito C6"
     ficava grudado no lançamento ("Almoço crédito C6"). Ver
     `descricaoDoLancamento`. */
  const descricaoNoCartao = heuristics.descricaoDoLancamento(texto, 'out', cartao) || descricao;

  /* No crédito a data decide a fatura (data na voz, regras 3.5 e 3.6): uma
     data em outra fatura pode cair numa fatura fechada ou já paga, e o
     parcelado nasce da data e repete o erro em cada parcela. Nos dois casos,
     a pessoa confirma na revisão do Crédito. */
  const { mesFaturaDoLancamento } = await import('./faturaCiclo');
  // O cartão casado pelo nome vem sem o fechamento; o da lista tem.
  const fechamento = cartoes.find((c) => c.id === cartao.id)?.closing_day ?? 1;
  const fatura = mesFaturaDoLancamento(dataDoGasto, fechamento);
  const faturaDaFala = mesFaturaDoLancamento(referencia, fechamento);
  if (dataDoGasto !== referencia && (fatura.year !== faturaDaFala.year || fatura.month !== faturaDaFala.month)) {
    await notificacoes.notificarRevisao('Confirme a data da compra', args.transcricao);
    return false;
  }
  if (dataDoGasto !== referencia && parcelas && parcelas > 1) {
    await notificacoes.notificarRevisao('Confirme a data', args.transcricao);
    return false;
  }
  const quando = resumoDaDataDoLancamento({ dataISO: dataDoGasto, hojeISO: hojeISO(), destino: 'credito', fatura });

  if (parcelas && parcelas > 1) {
    const resultado = await voiceOperations.registrarOperacaoVoz(requestId, args.source, {
      kind: 'installment',
      type: 'out',
      description: descricaoNoCartao,
      amount: valor,
      category: categoria.name,
      color: categoria.color,
      occurred_on: dataDoGasto,
      payment_method: 'credit',
      card_id: cartao.id,
      installments: parcelas,
      wallet_id: carteiraId,
    }, texto);
    if (await reciboSemLancamentoNovo(voiceOperations.desfechoDaOperacaoVoz(resultado), notificacoes)) return true;
    const { checarLimiteCartao } = await import('./creditLimitAlert');
    checarLimiteCartao(cartao.id).catch(() => {});
    try {
      await notificacoes.notificarSucesso({
        titulo: `${descricaoNoCartao} · ${formatarBRL(valor)}`,
        texto: [`${parcelas}x no ${cartao.name}`, categoria.name, quando].filter(Boolean).join(' · '),
        tipo: 'transaction',
        ids: resultado.ids,
        operationId: resultado.operationId,
      });
    } catch {
      // A operação já está confirmada; não repetir para tentar publicar o recibo.
    }
    return true;
  }

  const resultado = await voiceOperations.registrarOperacaoVoz(requestId, args.source, {
    kind: 'transaction',
    type: 'out',
    description: descricaoNoCartao,
    amount: valor,
    category: categoria.name,
    color: categoria.color,
    occurred_on: dataDoGasto,
    payment_method: 'credit',
    card_id: cartao.id,
    recurring: heuristics.parseRecorrencia(texto),
    wallet_id: carteiraId,
  }, texto);
  if (await reciboSemLancamentoNovo(voiceOperations.desfechoDaOperacaoVoz(resultado), notificacoes)) return true;
  const { checarLimiteCartao } = await import('./creditLimitAlert');
  checarLimiteCartao(cartao.id).catch(() => {});
  try {
    await notificacoes.notificarSucesso({
      titulo: `${descricaoNoCartao} · ${formatarBRL(valor)}`,
      texto: ['Crédito', cartao.name, categoria.name, quando].filter(Boolean).join(' · '),
      tipo: 'transaction',
      ids: resultado.ids,
      operationId: resultado.operationId,
    });
  } catch {
    // A operação já está confirmada; não repetir para tentar publicar o recibo.
  }
  return true;
}

/** Resultado da última retomada da fila de áudios, lido pela faixa do topo. */
export type ResumoFilaDeFalas = {
  /** Falas desta conta que continuam guardadas depois da passada. */
  restantes: number;
  /** Por que a última que ficou não foi processada; ausente se nada ficou. */
  motivo?: MotivoFalaGuardada | 'erro';
};

let filaEmExecucao: Promise<ResumoFilaDeFalas> | null = null;
let ultimoResumo: ResumoFilaDeFalas | null = null;

export function ultimoResumoDaFilaDeFalas(): ResumoFilaDeFalas | null {
  return ultimoResumo;
}

/**
 * Retoma áudios gravados sem internet. Roda ao abrir o app, a cada 30 s com
 * ele aberto (`app/_layout.tsx`) e no "Tentar sincronizar" da faixa. Quem
 * chama durante uma passada recebe a MESMA passada, não uma segunda.
 *
 * Até 26/09/2026 esta função começava por `if (!(await podeNotificar()))
 * return;`: sem permissão de notificação, ou no Expo Go, a fila nunca era
 * processada, e a fala ficava guardada para sempre sem nenhum log (achado da
 * faixa presa no celular do autor, regra 9). Agora a fila é processada sempre;
 * sem notificação, o recibo vai para a tela (`voz-recibos-da-fila`), e o app
 * está aberto em toda chamada desta função.
 */
export function tentarVozesPendentes(): Promise<ResumoFilaDeFalas> {
  if (Platform.OS !== 'android') return Promise.resolve({ restantes: 0 });
  if (!filaEmExecucao) filaEmExecucao = retomarFilaDeFalas().finally(() => { filaEmExecucao = null; });
  return filaEmExecucao;
}

async function retomarFilaDeFalas(): Promise<ResumoFilaDeFalas> {
  let resumo: ResumoFilaDeFalas = { restantes: 0 };
  try {
    const [{ listarVozesPendentes, adotarVozesOrfas, apagarAudiosPendentes }, { podeNotificar }, { idDoUsuarioLocal }, { reciboDaFilaNaTela }] = await Promise.all([
      import('./widget-voz-pendentes'),
      import('./widget-voz-notificacoes'),
      import('./sessao-offline'),
      import('./voz-recibos-da-fila'),
    ]);
    const userId = await idDoUsuarioLocal(PRAZO_DONO_MS);
    if (!userId) return resumo;
    await apagarAudiosPendentes().catch((erro) => console.error('[voz] limpeza de áudios concluídos falhou', erro));
    /* Fala que o widget gravou e não conseguiu entregar (V4): entra na fila
       antes da leitura, para ser processada nesta mesma passada. */
    await adotarVozesOrfas(userId);

    const notificar = await podeNotificar();
    let motivo: ResumoFilaDeFalas['motivo'];
    /* Fala em revisão espera a pessoa: não volta ao servidor a cada 30 s. */
    for (const item of (await listarVozesPendentes()).filter((item) => item.userId === userId && !item.revisao)) {
      /* Mantém o item até a tarefa concluir; uma interrupção permite retomada.
         Um item que lança não impede os de trás. */
      try {
        const desfecho = await executarTarefa(item, notificar ? undefined : reciboDaFilaNaTela(userId, item.requestId));
        if (desfecho.guardada) motivo = desfecho.motivo;
      } catch (erro) {
        console.error('[voz] fala guardada não foi retomada', item.requestId, erro);
        motivo = 'erro';
      }
    }
    const restantes = (await listarVozesPendentes()).filter((item) => item.userId === userId && !item.revisao).length;
    resumo = restantes ? { restantes, motivo: motivo ?? 'erro' } : { restantes: 0 };
  } catch (e) {
    // A fila permanece no aparelho; a próxima abertura/retomada tenta de novo.
    console.error('[voz] retomada da fila de falas falhou', e);
    resumo = { restantes: -1, motivo: 'erro' };
  }
  ultimoResumo = resumo;
  try {
    const { notificarDadosDosWidgetsAlterados } = await import('./widgets-home-events');
    notificarDadosDosWidgetsAlterados();
  } catch (erro) {
    console.error('[voz] faixa não foi avisada do fim da retomada', erro);
  }
  return resumo;
}

/* O recibo (Alert de sucesso, ou notificação do widget) já foi entregue
   ANTES desta função rodar — ela só atualiza o snapshot dos widgets da tela
   inicial. Por isso tem prazo curto: sem ele, uma rede lenta aqui prendia
   `executarTarefa` (e o botão em "Transcrevendo…", achado A47) bem depois de
   a pessoa já ter visto "Lançamento salvo" na tela. */
const PRAZO_SINCRONIZAR_RESUMO_MS = 5_000;

async function sincronizarResumoDepoisDaVoz() {
  try {
    const [{ supabase }, { sincronizarWidgetsHome }, { default: AsyncStorage }] = await Promise.all([
      import('./supabase'),
      import('./widgets-home-sync'),
      import('@react-native-async-storage/async-storage'),
    ]);
    let prazo: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      (async () => {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const hidden = (await AsyncStorage.getItem('grana_privacy_hidden')) === '1';
        await sincronizarWidgetsHome(data.user.id, hidden);
      })(),
      new Promise<never>((_, rejeitar) => {
        prazo = setTimeout(() => rejeitar(new Error('sincronizar_resumo_travou')), PRAZO_SINCRONIZAR_RESUMO_MS);
      }),
    ]).finally(() => clearTimeout(prazo));
  } catch {
    /* O lançamento e o recibo já deram certo. Snapshot é consequência
       best-effort e será atualizado na próxima abertura do app. */
  }
}

async function categoriasDaPessoa(data: typeof import('./data')) {
    const cats = await data.fetchCategories();
    return cats.filter((c) => !c.is_default).map((c) => ({ name: c.name, color: c.color }));
}

function hojeISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatarBRL(valor: number): string {
  return `R$ ${valor.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function formatarData(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function nomeDaForma(forma: string | null): string | null {
  if (!forma) return null;
  const nomes: Record<string, string> = { pix: 'Pix', debit: 'Débito', cash: 'Dinheiro', credit: 'Crédito' };
  return nomes[forma] ?? null;
}

/* Só Android tem widget. Registrar em outra plataforma seria ruído — e na web
   `AppRegistry.registerHeadlessTask` nem existe do mesmo jeito. */
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask('GranaVoiceTask', () => async (payload: Payload) => { await executarTarefa(payload); });
}
