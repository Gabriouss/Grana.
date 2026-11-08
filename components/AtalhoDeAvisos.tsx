import HeaderAction from './HeaderAction';
import { avisosDisponivel } from '@/modules/grana-avisos';
import { pedirConferencia, rotuloDoAtalho, usePendentesDeAvisos } from '@/lib/avisos-banco/conferencia-aberta';

/**
 * Atalho discreto no cabeçalho da Início para os avisos do banco que esperam
 * conferência (07/11/2026). Mesma fileira e mesmo desenho do botão do olho; o
 * número é a contagem da própria janela. Some sem pendência e sem o leitor
 * (web, APK sem o módulo). A janela abre sozinha só na primeira vez; depois, o
 * toque aqui é o único caminho, a qualquer momento (se outra janela estiver
 * aberta, ela espera). Por isso o botão fica em menta: avisa que há o que ver.
 */
export default function AtalhoDeAvisos() {
  const pendentes = usePendentesDeAvisos();
  if (!avisosDisponivel || pendentes <= 0) return null;
  return (
    <HeaderAction
      icon="notifications-outline"
      label={String(pendentes)}
      onPress={pedirConferencia}
      accessibilityLabel={rotuloDoAtalho(pendentes)}
    />
  );
}
