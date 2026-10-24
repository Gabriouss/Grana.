import Clarity from '@microsoft/clarity';

const claritySdk = ((Clarity as unknown as { default?: typeof Clarity })?.default ?? Clarity) as typeof Clarity;

export const CLARITY_PROJECT_ID_PADRAO = 'ymgmai34pz';
export type EventoClarity = 'PageView' | 'ViewContent' | 'InitiateCheckout_mensal' | 'InitiateCheckout_anual';
export type TransporteClarity = {
  iniciar: (id: string) => void;
  consentimento: (aceito: boolean) => void;
  evento: (nome: EventoClarity) => void;
  parar: () => void;
};

const EVENTOS_PERMITIDOS: readonly EventoClarity[] = [
  'PageView',
  'ViewContent',
  'InitiateCheckout_mensal',
  'InitiateCheckout_anual',
];

export function limparCookiesClarity(win: Pick<Window, 'location'>, doc: Pick<Document, 'cookie'>) {
  const host = win.location.hostname.split('.');
  for (const nome of ['_clck', '_clsk']) {
    doc.cookie = `${nome}=; Max-Age=0; Path=/; SameSite=Lax`;
    for (let i = 0; i < host.length - 1; i++) {
      doc.cookie = `${nome}=; Max-Age=0; Path=/; Domain=.${host.slice(i).join('.')}; SameSite=Lax`;
    }
  }
}

/**
 * O projeto do Clarity está configurado com cookies desativados por padrão no painel.
 * Na rota pública limpa (`/`), inicia em modo sem cookies (`consentV2` negado) e só
 * libera o armazenamento de cookies quando o visitante aceita no banner de privacidade.
 */
export function criarClarity(
  id: string | undefined,
  permitido: () => boolean,
  publico: () => boolean,
  transporte: TransporteClarity,
) {
  let iniciado = false;
  let ultimoConsentimento: boolean | null = null;
  const unicos = new Set<EventoClarity>();
  const idLimpo = (id ?? '').trim();
  const configurado = /^[a-z0-9]{6,20}$/i.test(idLimpo);

  function sincronizar() {
    if (!configurado || !publico()) {
      if (iniciado) transporte.parar();
      iniciado = false;
      ultimoConsentimento = null;
      return;
    }
    const aceito = permitido();
    if (!iniciado) {
      transporte.iniciar(idLimpo);
      iniciado = true;
      ultimoConsentimento = aceito;
      transporte.consentimento(aceito);
      return;
    }
    if (ultimoConsentimento !== aceito) {
      ultimoConsentimento = aceito;
      transporte.consentimento(aceito);
    }
  }

  return {
    estado: () => !configurado ? 'Não configurado' : !publico() ? 'Bloqueado fora da landing' : permitido() ? 'Ativo com cookies' : 'Ativo sem cookies',
    sincronizar,
    evento(nome: EventoClarity): boolean {
      if (!EVENTOS_PERMITIDOS.includes(nome)) return false;
      sincronizar();
      if (!iniciado || !publico()) return false;
      if ((nome === 'PageView' || nome === 'ViewContent') && unicos.has(nome)) return false;
      transporte.evento(nome);
      unicos.add(nome);
      return true;
    },
    parar() {
      if (iniciado) transporte.parar();
      iniciado = false;
      ultimoConsentimento = null;
    },
  };
}

export function transporteClarityWeb(win: Window, doc: Document): TransporteClarity {
  const globals = win as unknown as { clarity?: (...args: unknown[]) => void };
  return {
    iniciar(id) {
      if (doc.getElementById('clarity-script') || doc.querySelector('script[src*="clarity.ms/tag/"]')) return;
      claritySdk.init(id);
    },
    consentimento(aceito) {
      const status = aceito ? 'granted' : 'denied';
      if (typeof globals.clarity === 'function') {
        claritySdk.consentV2({ ad_Storage: status, analytics_Storage: status });
      }
      if (!aceito) limparCookiesClarity(win, doc);
    },
    evento(nome) {
      if (typeof globals.clarity === 'function') {
        claritySdk.event(nome);
      }
    },
    parar() {
      if (typeof globals.clarity === 'function') {
        claritySdk.consentV2({ ad_Storage: 'denied', analytics_Storage: 'denied' });
      }
      const script = doc.getElementById('clarity-script');
      if (script) script.remove();
      if (globals.clarity) delete globals.clarity;
      limparCookiesClarity(win, doc);
    },
  };
}
