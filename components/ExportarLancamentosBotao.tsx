import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSession } from '@/lib/auth-context';
import { useWallet } from '@/lib/wallet-context';
import { useDemo } from '@/lib/demo-context';
import { Alert } from '@/lib/alerta';
import { mensagemErro } from '@/lib/erros';
import { exportarLancamentosCsv } from '@/lib/exportar-lancamentos';
import { fonts, radius, spacing, theme, type, lh } from '@/lib/theme';
import AppModal from './AppModal';
import Sheet from './Sheet';
import AppPressable from './AppPressable';
import MonthSelector from './MonthSelector';
import SegmentedTabs from './SegmentedTabs';

/** A escolha fica em janela flutuante; o Perfil ganha somente uma ação. */
export default function ExportarLancamentosBotao() {
  const { session } = useSession();
  const { wallets, activeWalletId } = useWallet();
  const { isDemoMode } = useDemo();
  const [aberto, setAberto] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [modo, setModo] = useState<'mes' | 'tudo'>('mes');
  const [mes, setMes] = useState(() => ({ ano: new Date().getFullYear(), mes: new Date().getMonth() }));
  const [carteira, setCarteira] = useState(activeWalletId);
  const emVoo = useRef(false);
  const dono = useRef(session?.user.id);
  dono.current = session?.user.id;
  /* Sair da tela ou trocar de conta cancela o CSV em andamento: sem folha de
     compartilhar nem aviso tardio da conta anterior. */
  const operacao = useRef<AbortController | null>(null);
  useEffect(() => { operacao.current?.abort(); setAberto(false); }, [session?.user.id]);
  useEffect(() => () => operacao.current?.abort(), []);
  function fechar() { if (!emVoo.current) setAberto(false); }
  function abrir() {
    if (isDemoMode) { Alert.alert('Dados de exemplo', 'Volte para seus dados para exportar os lançamentos.'); return; }
    setCarteira(activeWalletId);
    setModo('mes');
    setMes({ ano: new Date().getFullYear(), mes: new Date().getMonth() });
    setAberto(true);
  }
  async function exportar() {
    const userId = session?.user.id;
    if (!userId || isDemoMode || emVoo.current) return;
    emVoo.current = true;
    const controlador = new AbortController();
    operacao.current = controlador;
    setGerando(true);
    try {
      const resultado = await exportarLancamentosCsv({ userId, carteiraId: carteira, sinal: controlador.signal,
        periodo: modo === 'tudo' ? 'tudo' : `${mes.ano}-${String(mes.mes + 1).padStart(2, '0')}` });
      if (controlador.signal.aborted || dono.current !== userId) return;
      setAberto(false);
      Alert.alert('CSV preparado', `${resultado.quantidade} lançamentos sincronizados. ${Platform.OS === 'web' ? 'O download foi solicitado.' : 'Use a folha do sistema para escolher onde guardar ou enviar.'}`);
    } catch (erro) {
      console.warn('[csv] ação não concluída');
      if (!controlador.signal.aborted && dono.current === userId) Alert.alert('Não foi possível exportar', mensagemErro(erro, 'Confira a conexão e tente novamente.'));
    } finally { emVoo.current = false; setGerando(false); }
  }
  return <>
    <AppPressable style={styles.botao} onPress={abrir} disabled={gerando || !session}
      accessibilityRole="button" accessibilityLabel="Exportar lançamentos em CSV" accessibilityState={{ busy: gerando, disabled: gerando || !session }}>
      <Ionicons name="download-outline" size={type.corpo} color={theme.inkSoft} aria-hidden />
      <Text style={styles.texto}>Exportar lançamentos em CSV</Text>
    </AppPressable>
    <AppModal visible={aberto} transparent onRequestClose={fechar}>
      {aberto ? <Sheet onClose={fechar}>
        <View style={styles.cabecalho}>
          <Text style={styles.titulo} accessibilityRole="header">Exportar lançamentos</Text>
          <AppPressable onPress={fechar} disabled={gerando} accessibilityLabel="Fechar exportação" style={styles.fechar}>
            <Ionicons name="close" size={type.titulo} color={theme.inkSoft} />
          </AppPressable>
        </View>
        <Text style={styles.apoio}>O CSV inclui os registros sincronizados. Lançamentos no aparelho que aguardam envio ficam de fora.</Text>
        {!gerando ? <>
          <SegmentedTabs options={[{ key: 'mes', label: 'Escolher mês' }, { key: 'tudo', label: 'Tudo' }]} value={modo} onChange={setModo} />
          {modo === 'mes' ? <MonthSelector year={mes.ano} month={mes.mes} onChange={(ano, proximoMes) => setMes({ ano, mes: proximoMes })} /> : null}
          <Text style={styles.rotulo}>Carteira</Text>
          {[{ id: 'total', name: 'Total' }, ...wallets.filter(w => w.user_id === session?.user.id)].map(w =>
            <AppPressable key={w.id} style={[styles.opcao, carteira === w.id && styles.selecionada]} onPress={() => setCarteira(w.id)}
              accessibilityRole="radio" accessibilityState={{ checked: carteira === w.id }}>
              <Text style={styles.texto}>{w.name}</Text>
              {carteira === w.id ? <Ionicons name="checkmark" size={type.corpo} color={theme.accent} aria-hidden /> : null}
            </AppPressable>)}
        </> : null}
        <AppPressable style={styles.primario} onPress={exportar} disabled={gerando} accessibilityRole="button"
          accessibilityLabel="Preparar CSV" accessibilityState={{ busy: gerando, disabled: gerando }}>
          {gerando ? <ActivityIndicator color={theme.paper} /> : <Text style={styles.primarioTexto}>Preparar CSV</Text>}
        </AppPressable>
      </Sheet> : null}
    </AppModal>
  </>;
}
const styles = StyleSheet.create({
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: 48,
    padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: theme.rule, backgroundColor: theme.paperRaised },
  texto: { fontSize: type.apoio, fontFamily: fonts.light, color: theme.inkSoft, flexShrink: 1 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  titulo: { fontSize: type.titulo, lineHeight: lh(type.titulo, 'titulo'), fontFamily: fonts.regular, color: theme.ink, flexShrink: 1 },
  fechar: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  apoio: { fontSize: type.apoio, lineHeight: lh(type.apoio), fontFamily: fonts.light, color: theme.inkSoft },
  rotulo: { fontSize: type.nota, fontFamily: fonts.medium, color: theme.inkFaint },
  opcao: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, padding: spacing.md, borderRadius: radius.md },
  selecionada: { backgroundColor: theme.paperRaised },
  primario: { backgroundColor: theme.accent, padding: spacing.md, borderRadius: radius.md, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  primarioTexto: { fontSize: type.corpo, fontFamily: fonts.medium, color: theme.paper },
});
