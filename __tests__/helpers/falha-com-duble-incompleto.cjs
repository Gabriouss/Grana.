/*
 * Dublê incompleto reprova o teste (15/10/2026, regra 9).
 *
 *   require('./helpers/falha-com-duble-incompleto.cjs');  // no topo do teste
 *
 * A tarefa de voz (`lib/widget-voz-task.ts`) captura a falha de partes que não
 * podem impedir o lançamento, como a reserva da fala, e só loga. Com um dublê
 * sem a função, o log enchia de "reservarFalaEmAndamento is not a function"
 * (1.976 linhas no test:ci) e todo teste passava, sem exercitar a reserva.
 * Esta guarda olha o que passa pelo console e, no fim do processo, reprova
 * se alguma linha disser "is not a function".
 *
 * O erro chega de dentro do `vm`, onde `instanceof Error` não vale: por isso
 * a leitura é pela forma (`message` e `stack`), não pela classe.
 */
if (!globalThis.__guardaDubleIncompleto) {
  globalThis.__guardaDubleIncompleto = true;
  const achados = [];
  const texto = (a) => (a && typeof a === 'object' && typeof a.message === 'string') ? a.message : (typeof a === 'string' ? a : '');
  for (const nivel of ['error', 'warn', 'log', 'info']) {
    const original = console[nivel].bind(console);
    console[nivel] = (...args) => {
      for (const a of args) {
        const t = texto(a);
        if (/is not a function/.test(t)) achados.push(t);
      }
      original(...args);
    };
  }
  process.on('exit', () => {
    if (!achados.length) return;
    const unicos = [...new Set(achados)];
    process.stderr.write(`\n[dublê incompleto] ${achados.length} chamada(s) a função ausente num dublê: ${unicos.join(' | ')}\n`);
    process.exitCode = 1;
  });
}
