import { supabase } from './supabase';
import { HOME_BLOCK_DESCRIPTIONS, type HomeBlockKey } from './home-layout';

/**
 * Tour essencial da Início — 5 pontos tocáveis sobre elementos REAIS da
 * tela, não uma segunda pesquisa. O `OnboardingModal` já existe e já roda
 * no primeiro login, mas é um questionário (arquétipo financeiro,
 * orçamento, WhatsApp) que nunca aponta pra Home de verdade — depois dele
 * a pessoa cai numa tela cheia de widgets sem explicação nenhuma. Este
 * arquivo só guarda o roteiro e a flag; a mecânica visual mora em
 * components/HomeTourOverlay.tsx, e a integração (refs, disparo) em
 * app/(app)/index.tsx.
 */

export type HomeTourStepId = 'saldo' | 'lancar' | 'whatsapp' | 'credito' | 'graficos';

export type HomeTourStep = {
  id: HomeTourStepId;
  titulo: string;
  texto: string;
  /** Se este passo aponta pra um bloco do WidgetGrid, a chave correspondente
      — usada pra pular o passo quando a pessoa tiver ocultado aquele bloco
      em "Personalizar Início". Ver HomeTourOverlay: um passo sem alvo
      medido simplesmente não entra na sequência, sem erro nenhum. */
  blocoRelacionado?: HomeBlockKey;
};

export const HOME_TOUR_STEPS: HomeTourStep[] = [
  {
    id: 'saldo',
    titulo: 'Livre para gastar',
    texto: HOME_BLOCK_DESCRIPTIONS.saldo,
    blocoRelacionado: 'saldo',
  },
  {
    id: 'lancar',
    titulo: 'Lance em um toque',
    texto:
      'Colar comprovante, importar CSV, escanear nota ou falar por voz — qualquer um desses vira lançamento sem digitar linha por linha.',
  },
  {
    id: 'whatsapp',
    titulo: 'Ou pelo WhatsApp',
    /* Não citar foto/imagem: o webhook responde que só entende texto ou áudio
       (supabase/functions/whatsapp-webhook/index.ts). O texto antigo prometia
       "foto da nota", que nunca funcionou por esse canal. */
    texto: 'Manda um texto ou um áudio pro Granabô no WhatsApp e ele lança pra você, sem nem abrir o app.',
  },
  {
    id: 'credito',
    titulo: 'Faturas de cartão',
    texto: HOME_BLOCK_DESCRIPTIONS.credito,
    blocoRelacionado: 'credito',
  },
  {
    id: 'graficos',
    titulo: 'Pra onde o dinheiro vai',
    texto: HOME_BLOCK_DESCRIPTIONS.categoria,
    blocoRelacionado: 'categoria',
  },
];

/* Fica em user_metadata do Supabase Auth, não AsyncStorage — mesmo motivo
   de onboarding_seen: precisa ser por conta, não repetir em nenhum
   aparelho/navegador da mesma conta depois de visto uma vez. */
const CHAVE_METADATA = 'home_tour_seen';

export async function homeTourJaVisto(): Promise<boolean> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return true; // falha ao ler = não repete o tour por engano
  return data.user.user_metadata?.[CHAVE_METADATA] === true;
}

export async function marcarHomeTourVisto(): Promise<void> {
  await supabase.auth.updateUser({ data: { [CHAVE_METADATA]: true } });
}
