/** Só a landing pública usa esta preferência. Não contém identidade nem campanha. */
export const CHAVE_CONSENTIMENTO = 'grana.marketing.v1';
export const VERSAO_CONSENTIMENTO = 1;
export const VALIDADE_CONSENTIMENTO_MS = 180 * 24 * 60 * 60 * 1000;
const AVISO = 'grana:consentimento-marketing';
export const ABRIR_PREFERENCIAS_MARKETING = 'grana:preferencias-marketing';
type Escolha = { versao: number; marketing: boolean; data: number };
type Armazenamento = Pick<Storage, 'getItem' | 'setItem'>;

export function lerConsentimento(storage: Armazenamento, agora = Date.now()): Escolha | null {
  try {
    const salvo = JSON.parse(storage.getItem(CHAVE_CONSENTIMENTO) ?? 'null');
    return salvo?.versao === VERSAO_CONSENTIMENTO && typeof salvo.marketing === 'boolean'
      && Number.isFinite(salvo.data) && salvo.data <= agora && agora - salvo.data < VALIDADE_CONSENTIMENTO_MS
      ? { versao: salvo.versao, marketing: salvo.marketing, data: salvo.data } : null;
  } catch { return null; } // Armazenamento indisponível/corrompido nunca autoriza publicidade.
}

export function salvarConsentimento(storage: Armazenamento, marketing: boolean, agora = Date.now()): boolean {
  try {
    storage.setItem(CHAVE_CONSENTIMENTO, JSON.stringify({ versao: VERSAO_CONSENTIMENTO, marketing, data: agora }));
    return lerConsentimento(storage, agora)?.marketing === marketing;
  } catch { return false; }
}

let bloqueioLocal = false;
export function consentimentoMarketingAtual(): boolean {
  if (bloqueioLocal || typeof window === 'undefined') return false;
  try { return lerConsentimento(window.localStorage)?.marketing === true; } catch { return false; }
}

export function escolherMarketing(marketing: boolean): boolean {
  bloqueioLocal = true;
  let salvo = false;
  try { salvo = salvarConsentimento(window.localStorage, marketing); } catch { /* falha fechada */ }
  bloqueioLocal = !salvo;
  window.dispatchEvent(new Event(AVISO));
  return salvo;
}

export function ouvirConsentimento(fn: () => void): () => void {
  const storage = (evento: StorageEvent) => { if (!evento.key || evento.key === CHAVE_CONSENTIMENTO) fn(); };
  window.addEventListener(AVISO, fn);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(AVISO, fn); window.removeEventListener('storage', storage); };
}

export function abrirPreferenciasMarketing() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ABRIR_PREFERENCIAS_MARKETING));
}

export const CHAVES_CAMPANHA = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];

/** Não aceitar endereço, texto livre, e-mail, JSON ou telefone/CPF numérico. O `fbclid` atual passa de 100 caracteres. */
export function valorDeCampanhaValido(valor: string | null): boolean {
  return !!valor && valor.length <= 512 && /^[a-zA-Z0-9_-]+$/.test(valor) && !/^\d{8,}$/.test(valor);
}

/** Nada de copiar query livre. Só códigos de campanha, e somente após aceite. */
export function atribuirCampanha(destino: string, origem: string, permitido: boolean): string {
  const chaves = CHAVES_CAMPANHA;
  try {
    const url = new URL(destino, 'https://landing.invalid');
    for (const chave of chaves) url.searchParams.delete(chave);
    if (permitido) {
      const entrada = new URLSearchParams(origem);
      for (const chave of chaves) {
        const valor = entrada.get(chave);
        if (valorDeCampanhaValido(valor)) url.searchParams.set(chave, valor!);
      }
    }
    return /^https?:\/\//.test(destino) ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch { return destino.split(/[?#]/)[0]; }
}
