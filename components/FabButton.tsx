import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius } from '@/lib/theme';
import AppPressable from './AppPressable';

export default function FabButton({
  onAddIncome,
  onAddExpense,
  onAddBill,
  onScanNota,
}: {
  onAddIncome: () => void;
  onAddExpense: () => void;
  /** Omitido em telas que não lidam com contas/boletos (ex: Lançamentos) — o item "Boleto" só aparece quando informado. */
  onAddBill?: () => void;
  /** Abre o leitor de QR Code de nota fiscal. Omitido em telas onde não faz sentido. */
  onScanNota?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.spring(progress, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 8 }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [open]);

  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] });

  return (
    <View style={styles.fabContainer}>
      {mounted && (
        <Animated.View
          style={[
            styles.menu,
            {
              opacity: progress,
              transform: [
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
              ],
            },
          ]}
        >
          <AppPressable
            style={({ hovered }) => [styles.menuItem, hovered && styles.menuItemHover]}
            onPress={() => {
              setOpen(false);
              onAddIncome();
            }}
          >
            <Ionicons name="arrow-up-circle-outline" size={18} color={theme.up} />
            <Text style={styles.menuText}>Entrada</Text>
          </AppPressable>

          <AppPressable
            style={({ hovered }) => [styles.menuItem, hovered && styles.menuItemHover]}
            onPress={() => {
              setOpen(false);
              onAddExpense();
            }}
          >
            <Ionicons name="arrow-down-circle-outline" size={18} color={theme.down} />
            <Text style={styles.menuText}>Saída</Text>
          </AppPressable>

          {onAddBill && (
            <AppPressable
              style={({ hovered }) => [styles.menuItem, hovered && styles.menuItemHover]}
              onPress={() => {
                setOpen(false);
                onAddBill?.();
              }}
            >
              <Ionicons name="card-outline" size={18} color={theme.ink} />
              <Text style={styles.menuText}>Boleto</Text>
            </AppPressable>
          )}

          {onScanNota && (
            <AppPressable
              style={({ hovered }) => [styles.menuItem, hovered && styles.menuItemHover]}
              onPress={() => {
                setOpen(false);
                onScanNota();
              }}
            >
              <Ionicons name="qr-code-outline" size={18} color={theme.accent2} />
              <Text style={styles.menuText}>Nota fiscal</Text>
            </AppPressable>
          )}
        </Animated.View>
      )}

      <AppPressable
        style={({ hovered }) => [styles.fabBtn, open && styles.fabBtnOpen, hovered && styles.fabBtnHover]}
        onPress={() => setOpen((prev) => !prev)}
      >
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="add" size={24} color={theme.paper} />
        </Animated.View>
      </AppPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    right: 20,
    /* A barra de abas agora flutua (marginBottom: 30, height: 68 em
       app/(app)/_layout.tsx, topo da barra ~98px do fundo) — o FAB precisa
       ficar acima dela, não na mesma faixa, senão os dois se sobrepõem no
       canto inferior direito. */
    bottom: 112,
    alignItems: 'flex-end',
    zIndex: 40,
  },
  menu: {
    backgroundColor: theme.paperRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: 6,
    marginBottom: 10,
    gap: 4,
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  menuItemHover: { backgroundColor: theme.paper },
  menuText: { color: theme.ink, fontSize: 13, fontWeight: '500' },
  fabBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  fabBtnOpen: { backgroundColor: theme.inkSoft },
  fabBtnHover: { opacity: 0.9 },
});
