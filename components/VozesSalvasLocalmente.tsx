import { useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import AppPressable from './AppPressable';
import { listarOperacoesVozLocais, sincronizarOperacoesVoz } from '@/lib/voice-operations';
import { theme } from '@/lib/theme';
import { observarDadosDosWidgets } from '@/lib/widgets-home-events';

export default function VozesSalvasLocalmente() {
  const [itens, setItens] = useState<Awaited<ReturnType<typeof listarOperacoesVozLocais>>>([]);
  const [ocupado, setOcupado] = useState(false);
  const carregar = () => listarOperacoesVozLocais().then(setItens).catch(() => {});
  useEffect(() => {
    void carregar();
    const remover = observarDadosDosWidgets(() => { void carregar(); });
    const evento = AppState.addEventListener('change', (estado) => { if (estado === 'active') void carregar(); });
    return () => { remover(); evento.remove(); };
  }, []);
  if (!itens.length) return null;
  return <View style={{ padding: 12, backgroundColor: theme.paperRaised }}>
    <Text style={{ color: theme.ink }}>{itens.length} lançamento(s) por voz salvo(s) neste aparelho. Sincronização pendente.</Text>
    <AppPressable disabled={ocupado} onPress={async () => {
      setOcupado(true);
      try { await sincronizarOperacoesVoz(); await carregar(); }
      finally { setOcupado(false); }
    }}><Text style={{ color: theme.accent2 }}>{ocupado ? 'Sincronizando…' : 'Tentar sincronizar'}</Text></AppPressable>
  </View>;
}
