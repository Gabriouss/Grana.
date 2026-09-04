/* Entrada do app.
 *
 * Existe (em vez de apontar `main` direto pra `expo-router/entry`) por causa
 * do widget Android de lançamento por voz: quando o Android inicia a tarefa
 * headless com o app fechado, ele carrega este bundle e procura uma tarefa
 * chamada `GranaVoiceTask` JÁ REGISTRADA. Registro feito dentro de um
 * componente chegaria tarde demais — não existe árvore React montada nesse
 * momento.
 *
 * O import do router vem depois, e continua sendo quem monta o app normal. */
import './lib/widget-voz-task';
import 'expo-router/entry';
