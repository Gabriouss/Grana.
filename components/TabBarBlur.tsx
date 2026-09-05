import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useAppLock } from '@/lib/app-lock-context';
import type { TabBlurRef } from './TabBlurTarget';

/** Desmonta a captura enquanto a Activity está inativa ou a trava cobre o app.
 * Ao voltar, aguarda o commit/layout antes de resolver o handle nativo. */
export default function TabBarBlur({ target }: { target: TabBlurRef | null }) {
  const { pronto, bloqueado } = useAppLock();
  const [activity, setActivity] = useState({ active: AppState.currentState === 'active' });
  const [ready, setReady] = useState<{ target: TabBlurRef | null; activity: typeof activity } | null>(null);
  const enabled = activity.active && pronto && !bloqueado && (Platform.OS !== 'android' || !!target?.current);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setReady(null);
      setActivity({ active: state === 'active' });
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    setReady(null);
    if (!enabled) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setReady({ target, activity }));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [enabled, target, activity]);
  if (!enabled || ready?.target !== target || ready?.activity !== activity) return null;
  return <BlurView intensity={80} tint="dark" blurReductionFactor={4}
    style={StyleSheet.absoluteFill}
    blurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
    blurTarget={Platform.OS === 'android' ? target ?? undefined : undefined} />;
}
