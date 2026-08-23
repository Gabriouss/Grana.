import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/auth-context';
import { guardarTokenAtivacaoPendente } from '@/lib/assinatura';
import { supabase } from '@/lib/supabase';
import { theme, spacing, radius, fonts, type } from '@/lib/theme';
import { colunaFormulario } from '@/lib/breakpoints';
import AppPressable from '@/components/AppPressable';
import BrandLogotype from '@/components/BrandLogotype';

/**
 * Destino do link de ativação que a Kiwify manda no e-mail de entrega
 * (`.../ativar?token=...`) — cobre quem comprou com um e-mail diferente do
 * que usa (ou vai usar) no Grana., que é o único caso que o vínculo
 * automático por e-mail (ver lib/assinatura.ts) não resolve sozinho.
 *
 * Fora de qualquer Stack.Protected em app/_layout.tsx de propósito: precisa
 * funcionar tanto pra quem já está logado (vincula na hora) quanto pra quem
 * ainda vai logar ou se cadastrar (guarda o token e vincula depois — ver
 * vincularAssinaturasPendentes, chamada no login em lib/auth-context.tsx).
 */
export default function Ativar() {
  const { session, isLoading: sessaoCarregando } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [estado, setEstado] = useState<'carregando' | 'vinculado' | 'ja-vinculado' | 'erro' | 'sem-token'>('carregando');
  const jaTentou = useRef(false);

  useEffect(() => {
    if (sessaoCarregando || jaTentou.current) return;

    if (!token) {
      setEstado('sem-token');
      return;
    }

    if (!session) {
      // Guarda pra consumir assim que a pessoa logar ou se cadastrar — o
      // vínculo acontece em lib/auth-context.tsx, não aqui.
      jaTentou.current = true;
      void guardarTokenAtivacaoPendente(token);
      setEstado('sem-token');
      return;
    }

    jaTentou.current = true;
    supabase
      .rpc('vincular_assinatura_por_token', { p_token: token })
      .then(({ data, error }) => {
        if (error) {
          setEstado('erro');
        } else {
          setEstado(data ? 'vinculado' : 'ja-vinculado');
        }
      });
  }, [session, sessaoCarregando, token]);

  return (
    <View style={styles.container}>
      <View style={[styles.content, colunaFormulario, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.title}>
          <BrandLogotype width={140} />
        </View>

        {estado === 'carregando' && (
          <>
            <ActivityIndicator color={theme.ink} style={{ marginVertical: spacing.xl }} />
            <Text style={styles.subtitle}>Ativando sua assinatura…</Text>
          </>
        )}

        {(estado === 'vinculado' || estado === 'ja-vinculado') && (
          <>
            <Text style={styles.eyebrow}>Tudo certo</Text>
            <Text style={styles.subtitle}>
              {estado === 'vinculado'
                ? 'Sua assinatura foi vinculada a esta conta.'
                : 'Esta assinatura já estava vinculada à sua conta.'}
            </Text>
            <AppPressable
              style={({ hovered }) => [styles.primaryBtn, hovered && styles.primaryBtnHover]}
              onPress={() => router.replace('/')}
            >
              <Text style={styles.primaryBtnText}>Ir para o Grana.</Text>
            </AppPressable>
          </>
        )}

        {estado === 'erro' && (
          <>
            <Text style={styles.eyebrow}>Não deu certo</Text>
            <Text style={styles.subtitle}>
              Este link de ativação não é válido, ou já pertence a outra conta. Se você acha que isso é um
              engano, fale com a gente.
            </Text>
          </>
        )}

        {estado === 'sem-token' && (
          <>
            <Text style={styles.eyebrow}>Quase lá</Text>
            <Text style={styles.subtitle}>
              {token
                ? 'Entre ou crie sua conta com o e-mail que preferir — assim que você logar, sua assinatura é vinculada automaticamente.'
                : 'Este link de ativação está incompleto. Confira se você abriu o link certo, enviado no e-mail de confirmação da compra.'}
            </Text>
            {!!token && (
              <>
                <AppPressable
                  style={({ hovered }) => [styles.primaryBtn, hovered && styles.primaryBtnHover]}
                  onPress={() => router.push('/sign-in')}
                >
                  <Text style={styles.primaryBtnText}>Entrar</Text>
                </AppPressable>
                <AppPressable
                  style={({ hovered }) => [styles.secondaryBtn, hovered && styles.secondaryBtnHover]}
                  onPress={() => router.push('/sign-up')}
                >
                  <Text style={styles.secondaryBtnText}>Criar conta</Text>
                </AppPressable>
              </>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.paper },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  title: { marginBottom: spacing.xl },
  eyebrow: { color: theme.inkFaint, fontSize: type.nota, letterSpacing: 1, fontFamily: fonts.light, marginBottom: spacing.xs },
  subtitle: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: 21, marginBottom: spacing.xl, fontFamily: fonts.light },
  primaryBtn: {
    backgroundColor: theme.ink,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnHover: { opacity: 0.88 },
  primaryBtnText: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs, borderRadius: radius.md },
  secondaryBtnHover: { backgroundColor: theme.paperRaised },
  secondaryBtnText: { color: theme.inkSoft, fontSize: type.corpo, fontFamily: fonts.light },
});
