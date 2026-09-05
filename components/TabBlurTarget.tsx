import { useEffect, useRef, type PropsWithChildren, type RefObject } from 'react';
import { Platform, View } from 'react-native';
import { BlurTargetView } from 'expo-blur';

export type TabBlurRef = RefObject<View | null>;
export type RegisterTabBlur = (key: string, target: TabBlurRef | null) => void;

/** Só o conteúdo da tela pertence ao alvo. A barra nunca pode ser descendente
 * do alvo que ela amostra (restrição do Dimezis BlurView 3). */
export default function TabBlurTarget({ children, routeKey, register }: PropsWithChildren<{
  routeKey: string;
  register: RegisterTabBlur;
}>) {
  const view = useRef<View | null>(null);
  const laidOut = useRef(false);
  useEffect(() => {
    // Strict Mode pode repetir setup/cleanup sem repetir o layout nativo.
    if (laidOut.current && view.current) register(routeKey, { current: view.current });
    return () => register(routeKey, null);
  }, [register, routeKey]);
  if (Platform.OS !== 'android') return <View style={{ flex: 1 }}>{children}</View>;
  return (
    <BlurTargetView ref={view} style={{ flex: 1 }} collapsable={false}
      onLayout={() => {
        laidOut.current = true;
        if (view.current) register(routeKey, { current: view.current });
      }}>
      {children}
    </BlurTargetView>
  );
}
