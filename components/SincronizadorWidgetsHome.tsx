import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useSession } from '@/lib/auth-context';
import { usePrivacy } from '@/lib/privacy-context';
import { observarDadosDosWidgets } from '@/lib/widgets-home-events';
import {
  definirPrivacidadeWidgets,
  limparSnapshotWidgets,
  sincronizarWidgetsHome,
} from '@/lib/widgets-home-sync';
import { widgetDisponivel } from '@/modules/grana-voice-widget';

/** Mantém os RemoteViews atualizados sem renderizar nada dentro do app. */
export default function SincronizadorWidgetsHome() {
  const { session } = useSession();
  const { hidden } = usePrivacy();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userId = session?.user.id;

  const sincronizar = useCallback(() => {
    if (!userId) return;
    void sincronizarWidgetsHome(userId, hidden);
  }, [hidden, userId]);

  const agendar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(sincronizar, 450);
  }, [sincronizar]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !widgetDisponivel) return;
    definirPrivacidadeWidgets(hidden);
    if (!userId) {
      limparSnapshotWidgets();
      return;
    }

    sincronizar();
    const pararDeObservar = observarDadosDosWidgets(agendar);
    const appState = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') sincronizar();
    });
    return () => {
      pararDeObservar();
      appState.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [agendar, hidden, sincronizar, userId]);

  return null;
}
