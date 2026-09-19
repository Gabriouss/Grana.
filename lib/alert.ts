import { Alert as AlertNativo, Platform, type AlertButton } from 'react-native';

/**
 * `Alert.alert` do React Native não tem implementação nenhuma na web —
 * `react-native-web` reexporta um `static alert() {}` completamente vazio.
 * Toda mensagem de erro, confirmação de exclusão e aviso de sucesso do app
 * ficava muda no navegador: o código rodava, o `Alert.alert(...)` era
 * chamado, e nada aparecia na tela. Este módulo reexporta a MESMA
 * assinatura (`Alert.alert(title, message, buttons, options)`), então
 * trocar o import em cada arquivo basta — sem tocar nas dezenas de
 * chamadas espalhadas pelo app. No nativo, delega direto pro Alert de
 * verdade; na web, mapeia pro `window.alert`/`window.confirm` do navegador.
 */
function alertWeb(title: string, message?: string, buttons?: AlertButton[]) {
  const texto = [title, message].filter(Boolean).join('\n\n');
  const lista = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' } as AlertButton];

  // Só 1 botão (ou nenhum passado): aviso informativo, sem escolha real.
  if (lista.length === 1) {
    window.alert(texto);
    lista[0].onPress?.();
    return;
  }

  // 2 botões: window.confirm mapeia bem em OK/Cancelar. O cancelamento é o
  // botão com style 'cancel' (convenção do próprio Alert do RN); o resto é
  // tratado como a ação de confirmação, mesmo quando tem style 'destructive'.
  const cancelar = lista.find((b) => b.style === 'cancel') ?? lista[0];
  const confirmar = lista.find((b) => b !== cancelar) ?? lista[lista.length - 1];

  if (lista.length <= 2) {
    if (window.confirm(texto)) confirmar?.onPress?.();
    else cancelar?.onPress?.();
    return;
  }

  /* 3+ botões: window.confirm só tem 2 saídas. O primeiro caso real chegou em
     19/09/2026, ao excluir uma parcela: Cancelar, "Só esta parcela", "A compra
     inteira". O fallback antigo mostrava as três no texto e, no OK, disparava
     a ÚLTIMA — quem queria apagar uma parcela apagava a compra toda.

     Agora pergunta uma opção por vez, na ordem em que aparecem: a primeira
     confirmada vence, e recusar todas é cancelar. Nenhuma ação escolhida no
     escuro. */
  const opcoes = lista.filter((b) => b !== cancelar);
  for (const opcao of opcoes) {
    if (window.confirm(`${texto}\n\n${opcao.text ?? 'Continuar'}?`)) {
      opcao.onPress?.();
      return;
    }
  }
  cancelar?.onPress?.();
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: Parameters<typeof AlertNativo.alert>[3]) {
    if (Platform.OS === 'web') {
      alertWeb(title, message, buttons);
      return;
    }
    AlertNativo.alert(title, message, buttons, options);
  },
};
