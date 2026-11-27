import HeaderAction from './HeaderAction';
import { pedirConferencia, rotuloDoAtalho, usePendentesDeAvisos } from '@/lib/avisos-banco/conferencia-aberta';

/**
 * O sino usa a contagem publicada pela janela, incluindo as revisões de voz
 * que chegam mesmo quando o leitor de avisos do banco está indisponível.
 */
export default function AtalhoDeAvisos() {
  const pendentes = usePendentesDeAvisos();
  if (pendentes <= 0) return null;
  return (
    <HeaderAction
      icon="notifications-outline"
      label={String(pendentes)}
      onPress={pedirConferencia}
      accessibilityLabel={rotuloDoAtalho(pendentes)}
      destaque
    />
  );
}
