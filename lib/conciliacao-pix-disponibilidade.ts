/** Conciliação Pix (E7) liberada pelo autor em 09/11/2026 ("Pode ligar a conciliação
 * completamente"), depois que a RPC confirmar_conciliacao_pix foi aplicada em produção
 * e conferida. O flag remoto importar_extrato continua necessário, mas NÃO é o interruptor
 * só da E7: desligado, ele esconde também o "Importar extrato" da Início (E6). Para desligar
 * só a conciliação sem build, revogue o EXECUTE de authenticated na confirmar_conciliacao_pix;
 * o serviço recebe 42501 e mostra que a confirmação não está disponível.
 */
export const CONCILIACAO_PIX_LIBERADA: boolean = true;
