import { fetchCreditCards } from './data';
import { destinoDaFala, type DestinoDaFala } from './destino-da-fala';
import { fetchWallets } from './wallets';

/** O mesmo teto que o núcleo da voz dá para carregar as referências (`lib/widget-voz-task.ts`). */
export const PRAZO_REFERENCIAS_MS = 8_000;

function comPrazo<T>(promessa: Promise<T>, nome: string): Promise<T | []> {
  return new Promise((resolver) => {
    const corte = setTimeout(() => {
      console.error(`[voz] ${nome} não chegaram em ${PRAZO_REFERENCIAS_MS / 1000} s; decidindo sem elas`);
      resolver([]);
    }, PRAZO_REFERENCIAS_MS);
    promessa.then(
      (valor) => { clearTimeout(corte); resolver(valor); },
      (e) => { clearTimeout(corte); console.error(`[voz] ${nome} não carregaram; decidindo sem elas`, e); resolver([]); },
    );
  });
}

/**
 * `destinoDaFala` com as carteiras e os cartões da conta, carregados pelo mesmo
 * cache de tela que a Início usa (funciona sem rede).
 *
 * O toque na notificação de revisão do widget decidia com `destinoDaFala(texto)`,
 * sem as listas, enquanto o botão da Início passa as duas (achado V2 do
 * Watchtower, 26/09/2026). Com uma carteira ou um cartão citados pelo nome, a
 * mesma fala podia abrir telas diferentes conforme a entrada (regra 13).
 * Sem as listas, por falha ou prazo, decide como antes e deixa log.
 */
export async function destinoDaFalaComReferencias(texto: string): Promise<DestinoDaFala> {
  const [carteiras, cartoes] = await Promise.all([
    comPrazo(fetchWallets(), 'carteiras'),
    comPrazo(fetchCreditCards(), 'cartões'),
  ]);
  return destinoDaFala(texto, carteiras, cartoes);
}
