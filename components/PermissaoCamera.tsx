import { Linking, StyleSheet, Text, View } from 'react-native';
import type { PermissionResponse } from 'expo';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, radius, spacing, type, fonts, lh } from '@/lib/theme';
import AppPressable from './AppPressable';

/**
 * Tela de acesso à câmera, comum ao leitor de QR e à foto da nota.
 *
 * Dois defeitos que viviam duplicados nos dois modais:
 * - Enquanto `useCameraPermissions` ainda consulta o sistema (`permissao`
 *   nulo), a tela de pedido piscava por um quadro antes da câmera abrir.
 *   Agora fica o fundo escuro da câmera até a resposta chegar.
 * - Negada de vez ("não perguntar de novo"), `pedirPermissao` volta sem abrir
 *   diálogo nenhum, e o botão "Permitir câmera" ficava morto. Nesse caso o
 *   botão leva às configurações do aparelho, com o texto dizendo isso.
 */
export default function PermissaoCamera({
  permissao,
  pedirPermissao,
  motivo,
  onFechar,
}: {
  permissao: PermissionResponse | null;
  pedirPermissao: () => unknown;
  motivo: string;
  onFechar: () => void;
}) {
  if (!permissao) return <View style={styles.aguardando} />;

  const bloqueada = !permissao.canAskAgain;

  return (
    <View style={styles.wrap}>
      <Ionicons name="camera-outline" size={44} color={theme.inkFaint} />
      <Text style={styles.titulo}>Acesso à câmera</Text>
      <Text style={styles.texto}>
        {bloqueada
          ? `${motivo} O acesso foi recusado antes. Libere a câmera nas configurações do aparelho, em Permissões.`
          : motivo}
      </Text>
      <AppPressable
        style={styles.botaoPrimario}
        onPress={() => {
          if (bloqueada) {
            Linking.openSettings().catch((e) => console.error('[camera] não abriu as configurações', e));
          } else {
            void pedirPermissao();
          }
        }}
        accessibilityRole="button"
      >
        <Text style={styles.botaoPrimarioTexto}>{bloqueada ? 'Abrir configurações' : 'Permitir câmera'}</Text>
      </AppPressable>
      <AppPressable onPress={onFechar} accessibilityRole="button" style={styles.linkAlvo}>
        <Text style={styles.linkSecundario}>Agora não</Text>
      </AppPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  aguardando: { flex: 1, backgroundColor: '#000' },
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl, backgroundColor: theme.paper },
  titulo: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
  texto: { color: theme.inkFaint, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo'), textAlign: 'center', fontFamily: fonts.light },
  botaoPrimario: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: spacing.xxl, marginTop: spacing.sm },
  botaoPrimarioTexto: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
  linkAlvo: { paddingHorizontal: spacing.lg },
  linkSecundario: { color: theme.inkFaint, fontSize: type.nota, paddingVertical: spacing.sm, fontFamily: fonts.light },
});
