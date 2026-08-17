import { useEffect, useRef, type PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppLock } from '@/lib/app-lock-context';
import { theme, radius, spacing } from '@/lib/theme';
import AppPressable from './AppPressable';
import BrandLogo from './BrandLogo';

/**
 * Cobre o app inteiro enquanto a trava não é vencida.
 *
 * Renderiza por cima em vez de desmontar o conteúdo: assim voltar do segundo
 * plano não descarta o estado das telas nem dispara recarga de dados. O que
 * importa para a segurança é que nada de financeiro fique visível por baixo —
 * daí a cobertura ser opaca e ocupar a tela toda.
 */
export default function AppLockGate({ children }: PropsWithChildren) {
  const { bloqueado, desbloquear } = useAppLock();
  const jaPediu = useRef(false);

  /* Pede a biometria assim que a tela de bloqueio aparece, sem exigir um toque
     antes. Se a pessoa cancelar, o botão continua ali para tentar de novo. */
  useEffect(() => {
    if (!bloqueado) {
      jaPediu.current = false;
      return;
    }
    if (jaPediu.current) return;
    jaPediu.current = true;
    desbloquear();
  }, [bloqueado, desbloquear]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {bloqueado && (
        <View style={styles.cobertura}>
          <BrandLogo size={34} />
          <Text style={styles.texto}>Seus valores estão protegidos.</Text>
          <AppPressable
            style={({ hovered }) => [styles.botao, hovered && { opacity: 0.88 }]}
            onPress={desbloquear}
          >
            <Ionicons name="finger-print-outline" size={18} color={theme.paper} />
            <Text style={styles.botaoTexto}>Desbloquear</Text>
          </AppPressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cobertura: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.paper,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    zIndex: 999,
  },
  texto: { color: theme.inkSoft, fontSize: 14 },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.ink,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  botaoTexto: { color: theme.paper, fontSize: 15, fontWeight: '600' },
});
