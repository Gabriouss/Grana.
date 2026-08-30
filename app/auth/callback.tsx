import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { fonts, theme } from '@/lib/theme';

export default function AuthCallbackScreen() {
  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel="Confirmando acesso">
      <ActivityIndicator color={theme.ink} />
      <Text style={styles.text}>Confirmando seu acesso…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: theme.paper,
    padding: 24,
  },
  text: {
    color: theme.ink,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
});
