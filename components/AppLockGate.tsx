import { useEffect, useRef, type PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppLock } from '@/lib/app-lock-context';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import AppPressable from './AppPressable';
import BrandLogotype from './BrandLogotype';

/**
 * Cobre o app inteiro enquanto a trava não é vencida.
 *
 * Renderiza por cima em vez de desmontar o conteúdo: assim voltar do segundo
 * plano não descarta o estado das telas nem dispara recarga de dados. O que
 * importa para a segurança é que nada de financeiro fique visível por baixo —
 * daí a cobertura ser opaca e ocupar a tela toda.
 */
export default function AppLockGate({ children }: PropsWithChildren) {
  const { bloqueado, pronto, autenticando, erro, desbloquear } = useAppLock();
  const jaPediu = useRef(false);
  /* Enquanto `pronto` é false ainda não sabemos se a trava está ligada —
     `bloqueado` começa como false por padrão, então sem isso o conteúdo
     financeiro pisca visível por um frame antes da leitura do AsyncStorage
     terminar. A cobertura já mostra marca e orientação durante a leitura. */
  const cobrindo = !pronto || bloqueado;

  /* Pede a biometria assim que a tela de bloqueio aparece, sem exigir um toque
     antes. Se a pessoa cancelar, o botão continua ali para tentar de novo. */
  useEffect(() => {
    if (!bloqueado) {
      jaPediu.current = false;
      return;
    }
    if (!pronto || erro || jaPediu.current) return;
    jaPediu.current = true;
    void desbloquear();
  }, [bloqueado, pronto, erro, desbloquear]);

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        pointerEvents={cobrindo ? 'none' : 'auto'}
        accessibilityElementsHidden={cobrindo}
        importantForAccessibility={cobrindo ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {cobrindo && (
        <View style={styles.cobertura}>
          <BrandLogotype width={150} />
          <Text style={styles.texto}>{pronto ? 'Seus valores estão protegidos.' : 'Conferindo a proteção do app…'}</Text>
          {erro && <Text style={styles.erro} accessibilityRole="alert" accessibilityLiveRegion="polite">{erro}</Text>}
          {pronto && (
              <AppPressable
                style={({ hovered }) => [styles.botao, hovered && { opacity: 0.88 }]}
                accessibilityRole="button"
                accessibilityState={{ disabled: autenticando, busy: autenticando }}
                disabled={autenticando}
                onPress={() => { jaPediu.current = true; void desbloquear(); }}
              >
                <Ionicons name="finger-print-outline" size={18} color={theme.paper} />
                <Text style={styles.botaoTexto}>{autenticando ? 'Aguardando confirmação…' : 'Desbloquear'}</Text>
              </AppPressable>
          )}
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
  texto: { color: theme.inkSoft, fontSize: type.corpo, fontFamily: fonts.light },
  erro: { color: theme.inkSoft, fontSize: type.corpo, fontFamily: fonts.regular, textAlign: 'center', paddingHorizontal: spacing.xl },
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
  botaoTexto: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
});
