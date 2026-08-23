import LegalDocScreen from '@/components/LegalDocScreen';
import { EXCLUSAO_DE_DADOS } from '@/lib/legal-content';

/* Fora de qualquer Stack.Protected em app/_layout.tsx — mesma razão de
   app/termos.tsx. É a URL que a Meta pede no campo "Instruções de exclusão
   de dados do usuário", nas Configurações do app do WhatsApp. */
export default function ExclusaoDeDados() {
  return <LegalDocScreen doc={EXCLUSAO_DE_DADOS} />;
}
