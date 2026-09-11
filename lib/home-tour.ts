import { supabase } from './supabase';
import { HOME_BLOCK_DESCRIPTIONS, type HomeBlockKey } from './home-layout';

/**
 * Tour essencial da Início — 5 pontos tocáveis sobre elementos REAIS da
 * tela, não uma segunda pesquisa. O `OnboardingModal` já existe e já roda
 * no primeiro login, mas é um questionário (arquétipo financeiro,
 * orçamento) que nunca aponta pra Home de verdade — depois dele
 * a pessoa cai numa tela cheia de widgets sem explicação nenhuma. Este
 * arquivo só guarda o roteiro e a flag; a mecânica visual mora em
 * components/HomeTourOverlay.tsx, e a integração (refs, disparo) em
 * app/(app)/index.tsx.
 */

/* O passo 'whatsapp' saiu em 11/09/2026 junto com todo vestígio do canal na
   interface: ele prometia "manda um texto ou um áudio pro Granabô no WhatsApp"
   para um número banido na Meta, e o tour é justamente a primeira coisa que
   uma pessoa nova lê. */
export type HomeTourStepId = 'saldo' | 'lancar' | 'credito' | 'graficos';

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
