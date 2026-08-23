import LegalDocScreen from '@/components/LegalDocScreen';
import { POLITICA_PRIVACIDADE } from '@/lib/legal-content';

/* Fora de qualquer Stack.Protected em app/_layout.tsx — mesma razão de
   app/termos.tsx. */
export default function Privacidade() {
  return <LegalDocScreen doc={POLITICA_PRIVACIDADE} />;
}
