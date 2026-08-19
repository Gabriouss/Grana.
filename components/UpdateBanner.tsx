import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing } from '@/lib/theme';
import { verificarAtualizacao, dispensarAtualizacao, type InfoAtualizacao } from '@/lib/atualizacao';
import AppPressable from './AppPressable';

/**
 * Faixa fina no topo da área logada, avisando de uma versão nova do APK.
 *
 * Fica de propósito longe de qualquer coisa que pareça obrigatória: sem
 * modal, sem travar telas, sem reaparecer depois de dispensada (a não ser que
 * saia uma versão ainda mais nova). "Fácil, rápido, não desgastante" — é
 * clicar em Atualizar ou no X, e seguir usando o app.
 */
export default function UpdateBanner() {
  const [info, setInfo] = useState<InfoAtualizacao | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    verificarAtualizacao().then(setInfo);
  }, []);

  if (!info) return null;

  /* O banner é o primeiro filho da área logada, acima do <Stack> — ou seja,
     fica fora do SafeAreaView que cada tela monta por dentro, e no Android o
     app desenha edge-to-edge por padrão. Sem somar o inset do topo, a faixa
     era desenhada POR BAIXO da barra de status: o texto colidia com o relógio
     e a bateria, e os toques em "Atualizar" e no "X" iam para o sistema em
     vez de para o app — o banner aparecia mas não respondia a nada. */
  return (
    <View style={[styles.faixa, { paddingTop: insets.top + 8 }]}>
      <Ionicons name="arrow-up-circle-outline" size={17} color={theme.accent2} />
      <Text style={styles.texto} numberOfLines={1}>
        Versão {info.versao} disponível
      </Text>
      <AppPressable
        style={({ hovered }) => [styles.botaoBaixar, hovered && { opacity: 0.85 }]}
        onPress={() => Linking.openURL(info.apkUrl)}
      >
        <Text style={styles.botaoBaixarTexto}>Atualizar</Text>
      </AppPressable>
      <AppPressable
        onPress={() => {
          dispensarAtualizacao(info.versao);
          setInfo(null);
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Dispensar aviso de atualização"
      >
        <Ionicons name="close" size={16} color={theme.inkFaint} />
      </AppPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  faixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.accentDeep,
    paddingHorizontal: spacing.md,
    // paddingTop entra em linha, somado ao inset da barra de status.
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  texto: { flex: 1, color: theme.ink, fontSize: 13 },
  botaoBaixar: { backgroundColor: theme.accent2, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  botaoBaixarTexto: { color: theme.paper, fontSize: 12, fontWeight: '700' },
});
