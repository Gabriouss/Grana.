/**
 * Textos de recibo do lançamento por voz: UM catálogo para o botão do app e
 * para o widget (regra 13). A mesma fala, com o mesmo desfecho, mostra o mesmo
 * título e o mesmo corpo nas duas entradas. Só muda a instrução de ação da
 * superfície: a notificação acrescenta "Toque para revisar." porque é tocando
 * nela que se abre a revisão (`ACAO_DA_NOTIFICACAO`).
 *
 * Até 26/09/2026 cada entrada escrevia o próprio texto, e o mesmo desfecho
 * aparecia de dois jeitos (achado V1 do Watchtower): a revisão no app dizia
 * "Confira os dados..." e no widget "Ouvi: ... Toque para revisar e salvar.";
 * o sucesso no widget ganhava "· salvo no Grana."; os dois recibos sem rede
 * tinham títulos e corpos diferentes.
 *
 * Dois textos daqui também são mostrados pelo Kotlin do widget, antes de
 * existir JavaScript (`naoOuvi` e `falaGuardada`). Eles são repetidos em
 * `modules/grana-voice-widget/android/src/main/res/values/strings.xml`, e
 * `__tests__/voz-recibos-paridade.cjs` falha se as duas cópias divergirem.
 *
 * As falhas de transcrição continuam em `mensagemDeErroVoz` (lib/voz.ts), que
 * já era compartilhada.
 */
export type ReciboVoz = { titulo: string; texto: string };

export const RECIBOS_VOZ = {
  /** Lançamento gravado. `resumo` é a linha do que foi salvo (ex.: "Alimentação · hoje"). */
  sucesso: (titulo: string, resumo: string): ReciboVoz => ({ titulo, texto: `${resumo}. Salvo no Grana.` }),

  /** Nada foi salvo: falta uma escolha da pessoa. `titulo` diz qual (ex.: "Qual cartão?"). */
  revisao: (titulo: string, transcricao: string): ReciboVoz => ({
    titulo,
    texto: transcricao
      ? `Ouvi: "${transcricao}". Confira os dados antes de salvar.`
      : 'Confira os dados antes de salvar.',
  }),

  /** Gravado na fila do aparelho: faltou rede na hora de salvar. */
  salvoLocal: {
    titulo: 'Lançamento salvo no aparelho',
    texto: 'Será sincronizado com sua conta quando o Grana. estiver aberto com conexão.',
  } as ReciboVoz,

  /** O áudio ficou guardado: faltou rede para transcrever. */
  pendenteOffline: {
    titulo: 'Áudio guardado no aparelho',
    texto: 'O reconhecimento será retomado quando o Grana. estiver aberto com conexão.',
  } as ReciboVoz,

  /** Gravação curta demais para ser fala (toque duplo, arquivo vazio). Nada foi enviado. */
  naoOuvi: {
    titulo: 'Não ouvi nada',
    texto: 'Nada foi lançado. Toque no microfone e fale o gasto.',
  } as ReciboVoz,

  /** O widget gravou, mas não conseguiu entregar o áudio ao app. A fala ficou guardada. */
  falaGuardada: {
    titulo: 'Fala guardada no aparelho',
    texto: 'Não deu para processar agora. Abra o Grana. para concluir o lançamento.',
  } as ReciboVoz,
};

/** A instrução que só a notificação tem, porque é nela que se toca. */
export const ACAO_DA_NOTIFICACAO = { revisao: 'Toque para revisar.' };
