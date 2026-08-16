import type { PropsWithChildren } from 'react';
import { Platform, View } from 'react-native';
import { theme } from '@/lib/theme';

/**
 * Só entra em ação quando Platform.OS === 'web' — no iOS/Android retorna os
 * filhos direto, sem nenhum container extra, então o build nativo não muda
 * em nada. Na web, simula uma "tela de celular" centralizada, com o resto
 * da janela do navegador preenchido por um fundo neutro.
 */
export default function WebPhoneFrame({ children }: PropsWithChildren) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  return (
    <View style={webStyles.page as any}>
      <View style={webStyles.phone as any}>{children}</View>
    </View>
  );
}

const webStyles = {
  page: {
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e5e3',
  },
  phone: {
    width: '100%',
    maxWidth: 460,
    minWidth: 380,
    height: '100vh',
    maxHeight: 900,
    backgroundColor: theme.paper,
    overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
};
