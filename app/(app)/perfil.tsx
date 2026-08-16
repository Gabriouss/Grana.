import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/auth-context';
import { usePrivacy } from '@/lib/privacy-context';
import { useDemo } from '@/lib/demo-context';
import { theme, radius, spacing } from '@/lib/theme';
import AppPressable from '@/components/AppPressable';
import ToggleSwitch from '@/components/ToggleSwitch';
import BudgetTemplatesModal from '@/components/BudgetTemplatesModal';
import OnboardingModal from '@/components/OnboardingModal';
import Toast from '@/components/Toast';

export default function PerfilScreen() {
  const { session, signOut } = useSession();
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const { isDemoMode, toggleDemoMode } = useDemo();
  const router = useRouter();

  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  function triggerToast(msg: string) {
    setToastMsg(msg);
    setToastVisible(true);
  }

  async function handlePerformSignOut() {
    await signOut();
    router.replace('/sign-in');
  }

  function confirmSignOut() {
    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm('Deseja realmente sair da sua conta?') : true;
      if (ok) {
        handlePerformSignOut();
      }
    } else {
      Alert.alert('Sair da conta', 'Você precisará entrar novamente para ver seus dados.', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: handlePerformSignOut,
        },
      ]);
    }
  }

  const userEmail = session?.user.email || 'usuario@exemplo.com';
  const initial = userEmail[0]?.toUpperCase() ?? 'G';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.paper }}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header com Avatar */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{userEmail}</Text>
            <Text style={styles.sub}>{isDemoMode ? 'explorando dados de exemplo' : 'conta sincronizada na nuvem'}</Text>
          </View>
        </View>

        {/* Seção Conta */}
        <Text style={styles.sectionLabel}>Conta</Text>
        <View style={styles.sectionCard}>
          <View style={styles.row}>
            <Text style={styles.rowKey}>Categorias</Text>
            <Text style={styles.rowValue}>8 Categorias</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowKey}>Sincronização</Text>
            <Text style={styles.rowValue}>{isDemoMode ? 'Modo Offline' : 'Conectado ao Supabase'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowKey}>Lembretes de vencimento</Text>
            <Text style={styles.rowValue}>Ativados</Text>
          </View>
        </View>

        {/* Seção Preferências */}
        <Text style={styles.sectionLabel}>Preferências</Text>
        <View style={styles.sectionCard}>
          <View style={styles.row}>
            <Text style={styles.rowKey}>Moeda</Text>
            <Text style={styles.rowValue}>Real (R$)</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowKey}>Tema</Text>
            <Text style={styles.rowValue}>Escuro (Dark Theme)</Text>
          </View>
        </View>

        {/* Seção Personalização & Modos */}
        <Text style={styles.sectionLabel}>Personalização</Text>
        <View style={styles.sectionCard}>
          <View style={styles.row}>
            <Text style={styles.rowKey}>Modo privacidade</Text>
            <ToggleSwitch
              value={hidden}
              onToggle={() => {
                togglePrivacy();
                triggerToast(hidden ? 'Valores visíveis' : 'Valores ocultos');
              }}
            />
          </View>

          <View style={styles.row}>
            <Text style={styles.rowKey}>Dados de exemplo</Text>
            <ToggleSwitch
              value={isDemoMode}
              onToggle={() => {
                toggleDemoMode();
                triggerToast(isDemoMode ? 'Voltando para seus dados' : 'Explorando dados de exemplo');
              }}
            />
          </View>

          <AppPressable style={styles.tappableRow} onPress={() => setTemplatesOpen(true)}>
            <Text style={styles.rowKey}>Orçamento sugerido</Text>
            <Text style={styles.rowValue}>Aplicar template &gt;</Text>
          </AppPressable>

          <AppPressable style={styles.tappableRow} onPress={() => setOnboardingOpen(true)}>
            <Text style={styles.rowKey}>Diagnóstico inicial</Text>
            <Text style={styles.rowValue}>Refazer &gt;</Text>
          </AppPressable>
        </View>

        {/* Botão Sair da Conta */}
        <AppPressable
          style={({ hovered }) => [styles.signOutBtn, hovered && styles.signOutBtnHover]}
          onPress={confirmSignOut}
        >
          <Text style={styles.signOutText}>Sair da conta</Text>
        </AppPressable>
      </ScrollView>

      {/* Modais */}
      <BudgetTemplatesModal
        visible={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onSuccess={() => {
          triggerToast('Orçamento sugerido aplicado');
        }}
      />

      <OnboardingModal
        visible={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        onFinished={() => {
          triggerToast('Diagnóstico atualizado');
        }}
      />

      {/* Toast */}
      <Toast message={toastMsg} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.paper },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: 60 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.paperRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.rule },
  avatarText: { color: theme.ink, fontSize: 20, fontWeight: '500' },
  name: { color: theme.ink, fontSize: 14, fontWeight: '500' },
  sub: { color: theme.inkFaint, fontSize: 11.5, marginTop: 2 },
  sectionLabel: { color: theme.inkFaint, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm },
  sectionCard: { backgroundColor: theme.paperRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.rule, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.rule },
  tappableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.rule },
  rowKey: { color: theme.ink, fontSize: 13 },
  rowValue: { color: theme.inkFaint, fontSize: 12 },
  signOutBtn: { marginTop: spacing.md, borderWidth: 1, borderColor: theme.ruleStrong, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  signOutBtnHover: { backgroundColor: theme.paperRaised },
  signOutText: { color: theme.ink, fontSize: 14, fontWeight: '500' },
});
