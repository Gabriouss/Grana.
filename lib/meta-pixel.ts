import { CHAVES_CAMPANHA, valorDeCampanhaValido } from './consentimento-marketing';

/** Preparação somente. A liberação operacional é independente do consentimento. */
export type EventoPixel = 'PageView' | 'ViewContent' | 'InitiateCheckout';
export type PlanoPixel = 'mensal' | 'anual';
export type ConfigPixel = { id?: string; liberado: boolean };
type Transporte = { iniciar: (id: string) => void; pronto: () => boolean; enviar: (id: string, evento: EventoPixel, dados: object, eventoId: string) => void; parar: () => void };

export function criarPixel(config: ConfigPixel, permitido: () => boolean, publico: () => boolean, transporte: Transporte, uuid: () => string) {
  let iniciado = false;
  const unicos = new Set<string>();
  const configurado = /^\d{5,25}$/.test(config.id ?? '') && config.liberado;
  const autorizado = () => configurado && permitido() && publico();
  function sincronizar() {
    if (!autorizado()) {
      if (iniciado) transporte.parar();
      iniciado = false;
      return;
    }
    if (!iniciado) { transporte.iniciar(config.id!); iniciado = true; }
  }
  return {
    estado: () => !configurado ? 'Não configurado' : !permitido() ? 'Sem consentimento' : !publico() ? 'Bloqueado para validação' : 'Em teste',
    sincronizar,
    evento(evento: EventoPixel, plano?: PlanoPixel): boolean {
      // A lista existe em runtime também: Purchase/CAPI e parâmetros livres não entram.
      if (!['PageView', 'ViewContent', 'InitiateCheckout'].includes(evento)) return false;
      if (evento === 'InitiateCheckout' && plano !== 'mensal' && plano !== 'anual') return false;
      sincronizar();
      if (!autorizado() || !transporte.pronto()) return false; // Sem fila ou replay retroativo.
      if (evento !== 'InitiateCheckout' && unicos.has(evento)) return false;
      const dados = evento === 'PageView' ? {} : { content_type: 'product', content_ids: [evento === 'ViewContent' ? 'grana-assinatura' : `grana-${plano}`] };
      transporte.enviar(config.id!, evento, dados, uuid());
      unicos.add(evento);
      return true;
    },
    parar() { if (iniciado) transporte.parar(); iniciado = false; },
  };
}

type FilaPixel = ((...args: unknown[]) => void) & { queue: unknown[][]; callMethod?: (...args: unknown[]) => void; push?: FilaPixel; loaded?: boolean; version?: string };

export function limparIdsMeta(win: Window, doc: Document) {
  const host = win.location.hostname.split('.');
  for (const nome of ['_fbp', '_fbc']) {
    doc.cookie = `${nome}=; Max-Age=0; Path=/; SameSite=Lax`;
    for (let i = 0; i < host.length - 1; i++) doc.cookie = `${nome}=; Max-Age=0; Path=/; Domain=.${host.slice(i).join('.')}; SameSite=Lax`;
  }
}

/** Meta lê URL/referrer por conta própria: falha fechado com URL suja. Parâmetro de anúncio
 *  (utm, fbclid, gclid) passa, desde que todo o resto da query também seja de campanha. */
export function paginaPublicaLimpa(location: Pick<Location, 'pathname' | 'search' | 'hash'>, referrer: string): boolean {
  if (location.pathname !== '/' || location.hash) return false;
  for (const [chave, valor] of new URLSearchParams(location.search)) {
    if (!CHAVES_CAMPANHA.includes(chave) || !valorDeCampanhaValido(valor)) return false;
  }
  if (!referrer) return true;
  try { const url = new URL(referrer); return url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password; } catch { return false; }
}

export function transportePixelWeb(win: Window, doc: Document, aoPronto: () => void = () => {}): Transporte {
  const globals = win as unknown as { fbq?: FilaPixel; _fbq?: FilaPixel };
  let script: HTMLScriptElement | null = null, fila: FilaPixel | undefined, pronto = false;
  return {
    iniciar(id) {
      // Tags externas preexistentes não são assumidas como nossas nem reaproveitadas.
      if (globals.fbq || doc.querySelector('script[src*="fbevents.js"]')) return;
      fila = Object.assign((...args: unknown[]) => {
        if (fila?.callMethod) fila.callMethod(...args); else fila?.queue.push(args);
      }, { queue: [] as unknown[][], loaded: true, version: '2.0' });
      fila.push = fila;
      globals.fbq = globals._fbq = fila;
      fila('consent', 'grant');
      fila('set', 'autoConfig', false, id);
      fila('init', id); // Sem advanced matching, formulário ou dados do usuário.
      script = doc.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      script.referrerPolicy = 'no-referrer';
      script.onload = () => { pronto = true; aoPronto(); };
      script.onerror = () => { pronto = false; console.warn('[marketing] Pixel indisponível'); };
      doc.head.appendChild(script);
    },
    pronto: () => pronto,
    enviar(id, evento, dados, eventoId) { fila?.('trackSingle', id, evento, dados, { eventID: eventoId }); },
    parar() {
      pronto = false;
      if (fila) { fila.queue.length = 0; fila('consent', 'revoke'); fila.queue.length = 0; }
      if (script) { script.onload = null; script.onerror = null; script.remove(); }
      if (fila && globals.fbq === fila) { delete globals.fbq; delete globals._fbq; }
      fila = undefined; script = null;
      // Só os IDs publicitários conhecidos; não toca sessão nem outros cookies.
      limparIdsMeta(win, doc);
    },
  };
}
