import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import AppPressable from '@/components/AppPressable';
import { Alert } from '@/lib/alerta';
import { useEntitlement } from '@/lib/entitlement-context';
import { useSession } from '@/lib/auth-context';
import { useFlags } from '@/lib/feature-flags';
import { calcularAvisoAssinatura, formatarDataAssinatura } from '@/lib/aviso-assinatura';
import { linkRenovacaoAssinatura } from '@/lib/checkout-assinatura';
import { fonts, radius, spacing, theme } from '@/lib/theme';

/** No fluxo da Início: nunca cobre o extrato ou tenta abrir a rota protegida assinar. */
export default function FaixaAssinatura({ estilo }: { estilo?: StyleProp<ViewStyle> } = {}) {
  const { estado } = useEntitlement();
  const { session } = useSession();
  const { ligado } = useFlags();
  const [, atualizarRelogio] = useState(0);
  const agora = Date.now();
  const aviso = calcularAvisoAssinatura(estado, agora);
  useEffect(() => {
    if (!estado?.allowed || !aviso.lembretes.length || !aviso.dataLimite || aviso.dataLimite.getTime() <= agora) return;
    const amanha = new Date(agora);
    amanha.setDate(amanha.getDate() + 1); amanha.setHours(0, 0, 0, 0);
    const timer = setTimeout(() => atualizarRelogio(v => v + 1), Math.max(1000, Math.min(amanha.getTime(), aviso.dataLimite.getTime()) - agora + 1000));
    return () => clearTimeout(timer);
  }, [agora, estado?.allowed, estado?.status, estado?.access_until, estado?.grace_until]);
  if (!session || !aviso.mostrarFaixa) return null;
  const pendente = estado?.status === 'past_due';
  const link = linkRenovacaoAssinatura(session.user.email ?? null, pendente);
  const indisponivel = !pendente && !ligado('assinatura_checkout');
  const prazo = aviso.diasRestantes === 0 ? 'hoje' : `em ${aviso.diasRestantes} ${aviso.diasRestantes === 1 ? 'dia' : 'dias'}`;
  async function renovar() {
    if (indisponivel) return;
    try { await Linking.openURL(link.url); }
    catch {
      console.warn('[assinatura] não foi possível abrir o destino de cobrança');
      Alert.alert('Não conseguimos abrir a cobrança', 'Tente novamente em instantes ou fale com o suporte.');
    }
  }
  return (
    <View style={[styles.faixa, estilo]} accessibilityLiveRegion="polite">
      <View style={styles.textos}>
        <Text style={styles.titulo}>Sua assinatura termina {prazo}</Text>
        {pendente ? <Text style={styles.apoio}>Pagamento pendente. Acesso até {formatarDataAssinatura(aviso.dataLimite)}.</Text> : null}
      </View>
      <AppPressable onPress={renovar} disabled={indisponivel} accessibilityRole="button"
        accessibilityState={{ disabled: indisponivel }} style={styles.acao}>
        <Text style={styles.acaoTexto}>{indisponivel ? 'Pagamento indisponível' : link.rotulo}</Text>
      </AppPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  faixa: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, padding: spacing.md,
    borderRadius: radius.md, backgroundColor: theme.paperRaised, borderWidth: 1, borderColor: theme.ruleStrong, marginBottom: spacing.md },
  textos: { flexGrow: 1, flexShrink: 1, flexBasis: 180, gap: spacing.xs },
  titulo: { color: theme.ink, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  apoio: { color: theme.inkSoft, fontFamily: fonts.light, fontSize: 13, lineHeight: 19 },
  acao: { minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: theme.ruleStrong },
  acaoTexto: { color: theme.accent2, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
});
