import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/* expo-haptics não tem efeito no web (nem vibração de verdade pra simular) —
   chamar lá não quebra nada, mas também não faz sentido esperar a promise. */
function safe(fn: () => Promise<unknown>): void {
  if (Platform.OS === 'web') return;
  fn().catch(() => {});
}

/** Toque de sucesso — ex: boleto marcado como pago, lançamento por voz reconhecido. */
export function hapticSuccess(): void {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Toque leve — ações reversíveis e de baixo impacto, ex: reabrir um boleto pago. */
export function hapticTap(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Toque de exclusão — ação destrutiva (excluir lançamento, conta, categoria...). */
export function hapticDelete(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}
