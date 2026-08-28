import { useRef, type ReactNode } from 'react';
import { Pressable, type StyleProp, type View, type ViewStyle } from 'react-native';
import { useModalAccessibility } from '@/lib/modal-accessibility';

/** Painel semântico compartilhado pelos modais que não usam `Sheet`. */
export default function AccessibleModalPanel({
  ativo,
  children,
  style,
}: {
  ativo: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<View>(null);
  useModalAccessibility(ref, ativo);

  return (
    <Pressable
      ref={ref}
      style={style}
      onPress={() => {}}
      accessibilityViewIsModal
      importantForAccessibility="yes"
      role="dialog"
      focusable
    >
      {children}
    </Pressable>
  );
}
