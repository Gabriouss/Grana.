import LegalDocScreen from '@/components/LegalDocScreen';
import { TERMOS_DE_SERVICO } from '@/lib/legal-content';

/* Fora de qualquer Stack.Protected em app/_layout.tsx de propósito: precisa
   abrir tanto logado quanto deslogado — inclusive antes de qualquer conta
   existir, pra quem clica no link a partir do checkout do provedor de pagamento. */
export default function Termos() {
  return <LegalDocScreen doc={TERMOS_DE_SERVICO} />;
}
