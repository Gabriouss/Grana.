import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppPressable from './AppPressable';
import { listarOperacoesVozLocais, sincronizarOperacoesVoz } from '@/lib/voice-operations';
import { theme } from '@/lib/theme';
import { observarDadosDosWidgets } from '@/lib/widgets-home-events';

export default function VozesSalvasLocalmente() {
  const [itens, setItens] = useState<Awaited<ReturnType<typeof listarOperacoesVozLocais>>>([]);
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const carregar = () => listarOperacoesVozLocais().then(setItens).catch(() => {});
  useEffect(() => {
    void carregar();
    const remover = observarDadosDosWidgets(() => { void carregar(); });
    const evento = AppState.addEventListener('change', (estado) => { if (estado === 'active') void carregar(); });
    return () => { remover(); evento.remove(); };
  }, []);
  if (!itens.length) return null;
  return <View style={[styles.container, { paddingTop: Math.max(12, insets.top + 8) }]}>
    <Text style={styles.text}>{itens.length} lançamento(s) por voz salvo(s) neste aparelho.</Text>
    <Text style={styles.subtext}>{mensagem ?? 'Sincronização pendente.'}</Text>
    <AppPressable disabled={ocupado} onPress={async () => {
      setOcupado(true);
      setMensagem(null);
      try {
        const resultado = await sincronizarOperacoesVoz();
        await carregar();
        if (resultado.falhas) setMensagem(resultado.mensagem ?? 'Não foi possível confirmar todos os lançamentos.');
      } catch { setMensagem('Não foi possível sincronizar agora. Tente novamente.'); }
      finally { setOcupado(false); }
    }}><Text style={styles.action}>{ocupado ? 'Sincronizando…' : 'Tentar sincronizar'}</Text></AppPressable>
  </View>;
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 12, backgroundColor: theme.paperRaised },
  text: { color: theme.ink, fontSize: 15, lineHeight: 21 },
  subtext: { color: theme.inkSoft, fontSize: 14, lineHeight: 20, marginTop: 2 },
  action: { color: theme.accent2, fontSize: 15, paddingVertical: 8 },
});
