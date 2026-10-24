import { createElement as h, useEffect, useRef, useState, type CSSProperties } from 'react';
import { fonts, theme } from '@/lib/theme';
import { ABRIR_PREFERENCIAS_MARKETING, VALIDADE_CONSENTIMENTO_MS, consentimentoMarketingAtual, escolherMarketing, lerConsentimento, ouvirConsentimento } from '@/lib/consentimento-marketing';
import { CLARITY_PROJECT_ID_PADRAO, criarClarity, limparCookiesClarity, transporteClarityWeb } from '@/lib/clarity';
import { criarPixel, limparIdsMeta, paginaPublicaLimpa, transportePixelWeb, type PlanoPixel } from '@/lib/meta-pixel';

const CHECKOUT = 'grana:checkout-marketing';
export function registrarCheckoutMarketing(destino: string, plano: PlanoPixel) {
  try {
    const url = new URL(destino);
    if (url.protocol === 'https:' && (url.hostname === 'pay.cakto.com.br' || url.hostname === 'cakto.com.br')) {
      window.dispatchEvent(new CustomEvent(CHECKOUT, { detail: plano }));
    }
  } catch { /* Cadastro ou URL inválida não são início de checkout. */ }
}

// Copy da Entrega 6 do Beacon; ativação ainda depende da revisão da política.
const TEXTO = 'Quando o Pixel estiver configurado, ele mede, com sua autorização, visitas às páginas públicas, a visualização dos preços e o início do checkout. Se a integração de conversões for habilitada separadamente, a Meta também poderá receber a confirmação da compra da assinatura. A Meta pode receber identificadores do navegador e dados técnicos da conexão. Recusar ou retirar a autorização não impede a navegação nem a compra. Você pode mudar sua escolha em Preferências de privacidade.';
// Resumo do texto final do Beacon, conforme a revisão de legibilidade do Lumen.
const RESUMO = 'Você escolhe se a Meta pode medir suas visitas, a visualização dos preços e o início da compra. A Meta pode receber identificadores do navegador e dados técnicos da conexão. Recusar não impede navegar ou comprar.';
const botao: CSSProperties = { appearance: 'none', background: theme.paperRaised, color: theme.ink, border: `1px solid ${theme.inkFaint}`, borderRadius: 8, minHeight: 36, padding: '6px 12px', font: 'inherit', cursor: 'pointer', flex: '1 1 90px' };

/** Montado somente em ConteudoWeb, nunca no layout compartilhado ou no app. */
export default function ConsentimentoMarketing() {
  const [aberto, setAberto] = useState(false);
  const [configurar, setConfigurar] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [erro, setErro] = useState('');
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (aberto && configurar) titulo.current?.focus({ preventScroll: true }); }, [aberto, configurar]);

  useEffect(() => {
    const pixel = criarPixel({ id: process.env.EXPO_PUBLIC_META_PIXEL_ID, liberado: process.env.EXPO_PUBLIC_META_PIXEL_ATIVO === 'true' },
      consentimentoMarketingAtual, () => paginaPublicaLimpa(window.location, document.referrer),
      // Consentimento lido quando o script fica pronto: quem aceita no banner conta a visita em que aceitou.
      transportePixelWeb(window, document, () => { if (consentimentoMarketingAtual()) pixel.evento('PageView'); }),
      () => window.crypto.randomUUID());
    const clarity = criarClarity(
      process.env.EXPO_PUBLIC_CLARITY_PROJECT_ID || CLARITY_PROJECT_ID_PADRAO,
      consentimentoMarketingAtual,
      () => paginaPublicaLimpa(window.location, document.referrer),
      transporteClarityWeb(window, document),
    );
    let vencimento: ReturnType<typeof setTimeout>;
    function sincronizar() {
      clearTimeout(vencimento);
      let escolha = null;
      try { escolha = lerConsentimento(window.localStorage); } catch { /* Sem storage, mostra aviso e bloqueia. */ }
      if (!escolha) setAberto(true);
      setMarketing(consentimentoMarketingAtual());
      pixel.sincronizar();
      clarity.sincronizar();
      // O navegador limita setTimeout a ~24 dias; 180 dias direto virariam 1 ms.
      if (escolha) vencimento = setTimeout(sincronizar, Math.min(86400000, Math.max(1, escolha.data + VALIDADE_CONSENTIMENTO_MS - Date.now())));
    }
    const abrir = () => { setAberto(true); setConfigurar(true); setMarketing(consentimentoMarketingAtual()); };
    const checkout = (evento: Event) => {
      const plano = (evento as CustomEvent).detail as PlanoPixel;
      pixel.evento('InitiateCheckout', plano);
      clarity.evento(plano === 'anual' ? 'InitiateCheckout_anual' : 'InitiateCheckout_mensal');
    };
    const alvo = document.getElementById('precos');
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        pixel.evento('ViewContent');
        clarity.evento('ViewContent');
      }
    }, { threshold: 0.25 });
    if (alvo) observer?.observe(alvo);
    const desligar = ouvirConsentimento(sincronizar);
    window.addEventListener(ABRIR_PREFERENCIAS_MARKETING, abrir);
    window.addEventListener(CHECKOUT, checkout);
    document.addEventListener('visibilitychange', sincronizar);
    sincronizar();
    clarity.evento('PageView');
    return () => {
      clearTimeout(vencimento); desligar(); observer?.disconnect(); pixel.parar(); clarity.parar();
      window.removeEventListener(ABRIR_PREFERENCIAS_MARKETING, abrir);
      window.removeEventListener(CHECKOUT, checkout);
      document.removeEventListener('visibilitychange', sincronizar);
    };
  }, []);

  function salvar(valor: boolean) {
    if (!valor) {
      limparIdsMeta(window, document);
      limparCookiesClarity(window, document);
    }
    if (!escolherMarketing(valor)) { setErro('Não foi possível guardar sua escolha neste navegador. A publicidade continua bloqueada. Tente novamente.'); return; }
    setErro(''); setAberto(false); setConfigurar(false);
    document.getElementById('preferencias-privacidade')?.focus({ preventScroll: true });
  }
  if (!aberto) return null;
  return h('section', { role: 'region', 'aria-label': 'Preferências de privacidade', style: { position: 'fixed', bottom: 16, left: 16, right: 16, marginLeft: 'auto', marginRight: 'auto', zIndex: 10000, maxWidth: configurar ? 640 : 480, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', boxSizing: 'border-box', background: theme.paper, color: theme.ink, border: `1px solid ${theme.inkFaint}`, borderRadius: 10, padding: '12px 14px', fontFamily: `${fonts.brandLight}, sans-serif`, fontSize: 13, lineHeight: 1.45 } as CSSProperties },
    h('style', null, '.grana-consentimento-acoes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:10px}'),
    h('h2', { ref: titulo, tabIndex: -1, style: { margin: '0 0 4px', fontSize: 15, fontFamily: fonts.brandRegular } }, configurar ? 'Preferências de privacidade' : 'Você decide sobre a medição da Meta'),
    h('p', { style: { margin: 0 } }, RESUMO, ' ', h('span', { style: { color: theme.inkSoft } }, 'Mude depois em Preferências de privacidade, no rodapé. ', h('a', { href: '/privacidade', style: { color: theme.ink, textDecoration: 'underline' } }, 'Política de Privacidade.'))),
    configurar && h('p', { style: { color: theme.inkSoft } }, 'Role as opções abaixo para ler os detalhes.'),
    h('div', { style: configurar ? { maxHeight: '38vh', overflowY: 'auto', paddingBottom: 8 } : undefined },
    configurar && h('div', { style: { marginBottom: 12 } },
      h('p', null, TEXTO),
      h('p', null, 'Escolha se autoriza a medição publicitária da Meta. Essa opção fica desativada até você escolher. A navegação e a compra continuam disponíveis mesmo se você a mantiver desligada.'),
      h('p', null, 'Necessários: sempre ativos para lembrar sua escolha. Sem acesso ao armazenamento, a publicidade fica bloqueada.'),
      h('label', { style: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 } }, h('input', { type: 'checkbox', checked: marketing, onChange: (e) => setMarketing(e.currentTarget.checked) }), 'Medição e publicidade da Meta'),
      h('button', { type: 'button', style: botao, onClick: () => salvar(marketing) }, 'Salvar minhas escolhas')),
    erro && h('p', { role: 'alert' }, erro)),
    h('div', { className: 'grana-consentimento-acoes' },
      h('button', { type: 'button', style: botao, onClick: () => salvar(false) }, 'Recusar'),
      h('button', { type: 'button', style: botao, onClick: () => salvar(true) }, 'Aceitar'),
      h('button', { type: 'button', className: 'grana-consentimento-configurar', style: botao, onClick: () => setConfigurar(true) }, 'Configurar')));
}
