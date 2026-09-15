import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, View } from 'react-native';
import AppPressable from '@/components/AppPressable';
import { fonts, lh, radius, spacing, theme, type } from '@/lib/theme';

export default function NotFound() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.codigo}>404</Text>
        <Text style={styles.titulo}>Essa página não existe.</Text>
        <Text style={styles.texto}>
          O endereço pode estar errado ou a página pode ter sido movida.
        </Text>
        <AppPressable
          onPress={() => router.replace('/')}
          accessibilityRole="button"
          accessibilityLabel="Ir para a página inicial"
          style={styles.botao}
        >
          <Text style={styles.botaoTexto}>Ir para o início</Text>
        </AppPressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.paper },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  codigo: {
    color: theme.accent2,
    fontSize: type.destaque,
    fontFamily: fonts.regular,
    marginBottom: spacing.md,
  },
  titulo: {
    color: theme.ink,
    fontSize: type.titulo,
    lineHeight: lh(type.titulo, 'titulo'),
    fontFamily: fonts.regular,
    textAlign: 'center',
  },
  texto: {
    maxWidth: 420,
    color: theme.inkSoft,
    fontSize: type.apoio,
    lineHeight: lh(type.apoio, 'corpo'),
    fontFamily: fonts.light,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  botao: {
    marginTop: spacing.xl,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    backgroundColor: theme.paperRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoTexto: {
    color: theme.accent2,
    fontSize: type.apoio,
    fontFamily: fonts.regular,
  },
});
