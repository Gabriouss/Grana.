import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/auth-context';
import { useWallet } from '@/lib/wallet-context';
import { useDemo } from '@/lib/demo-context';
import { Alert } from '@/lib/alerta';
import { mensagemErro } from '@/lib/erros';
import { escolherArquivoDeExtrato } from '@/lib/escolher-arquivo';
import { analisarExtratoPix, confirmarItensPix, type AnalisePix, type ReciboPix, type EscolhaPix } from '@/lib/conciliacao-pix-servico';
import { formatDateLabel, formatMoney } from '@/lib/format';
import { fonts, lh, radius, spacing, theme, type } from '@/lib/theme';
import AppModal from './AppModal';
import Sheet from './Sheet';
import AppPressable from './AppPressable';
import CategoryPickerModal from './CategoryPickerModal';

// CSV em que dd/mm e mm/dd são possíveis: a tela diz como as datas foram lidas (regra 29: espaço fixo nas duas últimas).
const avisoDeData = {
  'mes-dia': 'As datas deste arquivo estão no formato mês/dia e foram lidas\u00a0assim.',
  'dia-mes-presumido': 'As datas deste arquivo foram lidas como dia/mês. Se o banco usa mês/dia, confira antes de\u00a0confirmar.',
};
const nomes = { falta:'Falta lançar', data: 'Data diferente', revisar: 'Precisa conferir', conciliado: 'Já confere', ignorar: 'Fora do gasto' };
export default function ConciliarPixBotao() {
  const { session } = useSession();
  const { wallets, activeWalletId } = useWallet();
  const { isDemoMode } = useDemo();
  const router = useRouter();
  const [aberto, setAberto] = useState(false), [ocupado, setOcupado] = useState(false);
  const [carteira, setCarteira] = useState(''), [origem, setOrigem] = useState('');
  const [analise, setAnalise] = useState<AnalisePix | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, EscolhaPix>>({});
  const [selecionados, setSelecionados] = useState<string[]>([]), [ignorados, setIgnorados] = useState<string[]>([]);
  const [recibos, setRecibos] = useState<Record<string, ReciboPix>>({});
  const [categoriaId, setCategoriaId] = useState<string | null>(null), [pagina, setPagina] = useState(1);
  const [lote, setLote] = useState<{ feitos: number; total: number } | null>(null), pararLote = useRef<(() => void) | null>(null);
  const emVoo = useRef(false), atual = useRef<AnalisePix | null>(null), dono = useRef(session?.user.id);
  dono.current = session?.user.id;
  const minhas = wallets.filter(w => w.user_id === session?.user.id);
  function limpar() {
    atual.current?.cancelar(); atual.current = null;
    setAnalise(null); setEscolhas({}); setSelecionados([]); setIgnorados([]); setRecibos({}); setCategoriaId(null); setPagina(1); setOrigem('');
  }
  useEffect(() => { limpar(); setAberto(false); return () => { pararLote.current?.(); atual.current?.cancelar(); }; }, [session?.user.id]);
  function fechar() { if (!emVoo.current) { limpar(); setAberto(false); } }
  function abrir() {
    if (isDemoMode) { Alert.alert('Dados de exemplo', 'Volte para seus dados para conferir um extrato.'); return; }
    limpar();
    const principal = [...minhas].filter(w => w.is_default).sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];
    setCarteira(minhas.some(w => w.id === activeWalletId) ? activeWalletId : principal?.id ?? ''); setAberto(true);
  }
  async function escolher() {
    const userId = session?.user.id;
    if (emVoo.current || !userId || !carteira || origem.trim().length < 3) return;
    emVoo.current = true; setOcupado(true);
    try {
      const arquivo = await escolherArquivoDeExtrato({ limiteBytes: 1_000_000, limparCopia: true });
      if (!arquivo || dono.current !== userId) return;
      const nova = await analisarExtratoPix({ userId, carteiraId: carteira, origemConta: origem, texto: arquivo.texto });
      if (dono.current !== userId) { nova.cancelar(); return; }
      atual.current = nova; setAnalise(nova);
      setEscolhas(Object.fromEntries(nova.resultados.map(r => [r.linha.id, { id: r.linha.id, categoria: r.linha.categoria, cor: r.linha.cor }])));
    } catch (erro) {
      console.warn('[conciliacao] arquivo não conferido');
      if (dono.current === userId) Alert.alert('Não foi possível conferir', mensagemErro(erro, 'Escolha um CSV ou OFX da conta e tente novamente.'));
    } finally { emVoo.current = false; setOcupado(false); }
  }
  async function confirmar(ids: string[]) {
    if (emVoo.current || !analise || ids.length === 0) return;
    const userId = session?.user.id;
    emVoo.current = true; setOcupado(true);
    let soltar = () => {};
    const parar = new Promise<void>(r => { soltar = r; });
    pararLote.current = soltar; setLote({ feitos: 0, total: ids.length });
    try {
      // Recibo a cada item (item 39): o que já foi salvo aparece mesmo com a próxima RPC presa.
      const novos = await confirmarItensPix(analise, ids.map(id => escolhas[id]), { parar, aoRecibo: r => {
        if (dono.current !== userId) return;
        setRecibos(antes => ({ ...antes, [r.id]: r })); setLote(l => l && { ...l, feitos: l.feitos + 1 });
      } });
      if (dono.current !== userId) return;
      setRecibos(antes => ({ ...antes, ...Object.fromEntries(novos.map(r => [r.id, r])) }));
      setSelecionados(antes => antes.filter(id => !novos.some(r => r.id === id && r.status === 'salvo')));
      const salvos = novos.filter(r => r.status === 'salvo').length;
      Alert.alert('Conferência atualizada', `${salvos} de ${ids.length} itens confirmados. ${salvos < ids.length ? 'Os demais continuam com o motivo na lista.' : 'Os lançamentos já estão na sua conta.'}`);
    } catch (erro) {
      console.warn('[conciliacao] confirmação não concluída');
      if (dono.current === userId) Alert.alert('Não foi possível confirmar', mensagemErro(erro, 'Confira os itens e tente novamente.'));
    } finally { pararLote.current = null; setLote(null); emVoo.current = false; setOcupado(false); }
  }
  function confirmarLote() {
    if (emVoo.current || !analise) return;
    const elegiveis = selecionados.filter(id => !ignorados.includes(id) && analise.resultados.some(r => r.linha.id === id && ['falta','data'].includes(r.status)) && recibos[id]?.status !== 'salvo');
    if (!elegiveis.length) return;
    const novos = elegiveis.filter(id => analise.resultados.find(r => r.linha.id === id)?.status === 'falta').length;
    Alert.alert('Confirmar itens selecionados', `${novos} novos lançamentos e ${elegiveis.length - novos} correções de data. Itens que precisam de revisão ficam de fora.`, [
      { text: 'Cancelar', style: 'cancel' }, { text: 'Confirmar', onPress: () => { void confirmar(elegiveis); } },
    ]);
  }
  const visiveis = analise?.resultados.filter(r => !['conciliado','ignorar'].includes(r.status) && !ignorados.includes(r.linha.id)) ?? [];
  const editando = analise?.resultados.find(r => r.linha.id === categoriaId);
  const datas = analise?.resultados.map(r => r.linha.data).sort() ?? [];
  const formatoData = analise?.resultados.find(r => r.linha.formatoData)?.linha.formatoData;
  return <>
    <AppPressable style={styles.botao} onPress={abrir} disabled={ocupado || !session} accessibilityRole="button" accessibilityLabel="Conferir Pix pelo extrato">
      <Text style={styles.texto}>Conferir Pix pelo extrato</Text>
    </AppPressable>
    <AppModal visible={aberto} transparent onRequestClose={fechar}>
      {aberto ? <Sheet onClose={fechar}>
        <Text style={styles.titulo} accessibilityRole="header">Conferir o extrato</Text>
        <Text style={styles.apoio}>O arquivo é lido só neste aparelho. Apenas lançamentos ou correções que você confirmar seguem para a sua conta.</Text>
        {!analise ? <>
          <Text style={styles.rotulo}>Banco e apelido desta conta</Text>
          <TextInput style={styles.input} value={origem} onChangeText={setOrigem} maxLength={100} editable={!ocupado} placeholder="Ex.: Mercado Pago, conta pessoal" placeholderTextColor={theme.inkFaint} accessibilityLabel="Banco e apelido desta conta" />
          <Text style={styles.apoio}>Use o mesmo apelido ao conferir esse banco de novo.</Text>
          {minhas.map(w => <AppPressable key={w.id} style={[styles.opcao, carteira === w.id && styles.selecionada]} onPress={() => setCarteira(w.id)} disabled={ocupado} accessibilityRole="radio" accessibilityState={{ checked: carteira === w.id }}><Text style={styles.texto}>{w.name}</Text></AppPressable>)}
          <Text style={styles.apoio}>Escolha CSV com Data em DD/MM/AAAA, Descrição e Valor com sinal, ou OFX da conta em reais. Para PDF ou Excel, exporte em CSV no banco.</Text>
          <AppPressable style={styles.primario} onPress={escolher} disabled={ocupado || !carteira || origem.trim().length < 3} accessibilityRole="button" accessibilityLabel="Escolher extrato"><Text style={styles.primarioTexto}>Escolher extrato</Text></AppPressable>
        </> : <>
          <Text style={styles.apoio}>{formatDateLabel(datas[0])} a {formatDateLabel(datas[datas.length - 1])}. A conferência cobre só as linhas deste arquivo, inclusive se o período estiver incompleto.</Text>
          {formatoData ? <Text style={styles.apoio}>{avisoDeData[formatoData]}</Text> : null}
          <Text style={styles.apoio}>{analise.resultados.filter(r => r.status === 'conciliado').length} já conferem. {analise.resultados.filter(r => r.status === 'ignorar').length} movimentos neutros ficaram fora.</Text>
          {!visiveis.length ? <Text style={styles.texto}>Nenhum item deste arquivo precisa de lançamento ou correção.</Text> : null}
          {visiveis.slice(0, pagina * 20).map(r => {
            const id = r.linha.id, escolha = escolhas[id], salvo = recibos[id]?.status === 'salvo';
            const elegivel = ['falta','data'].includes(r.status) && !salvo;
            return <View key={id} style={styles.item}>
              <Text style={styles.rotulo}>{salvo ? 'Confirmado' : nomes[r.status]}</Text>
              <Text style={styles.texto}>{r.linha.descricao}</Text>
              <Text style={styles.texto}>R$ {formatMoney(r.linha.centavos / 100)} · {r.linha.direcao === 'in' ? 'Entrada' : 'Saída'} · {formatDateLabel(r.linha.data)}</Text>
              {r.alvo ? <Text style={styles.apoio}>No app: {formatDateLabel(r.alvo.occurred_on)}. Valor, categoria e carteira serão mantidos.</Text> : null}
              <Text style={styles.apoio}>{r.motivo}</Text>
              {r.status === 'falta' ? <AppPressable onPress={() => setCategoriaId(id)} disabled={ocupado || salvo} accessibilityLabel={`Categoria do item ${Number(id) + 1}`} style={styles.opcao}><Text style={styles.texto}>{escolha?.categoria || 'Escolher categoria'}</Text></AppPressable> : null}
              {recibos[id] ? <Text style={styles.apoio} accessibilityLiveRegion="polite">{recibos[id].mensagem}</Text> : null}
              {elegivel ? <>
                <AppPressable style={styles.opcao} onPress={() => setSelecionados(antes => antes.includes(id) ? antes.filter(x => x !== id) : [...antes,id])} disabled={ocupado} accessibilityRole="checkbox" accessibilityState={{ checked: selecionados.includes(id) }} accessibilityLabel={`Selecionar item ${Number(id) + 1}`}><Text style={styles.texto}>{selecionados.includes(id) ? 'Selecionado para o lote' : 'Selecionar para o lote'}</Text></AppPressable>
                <AppPressable style={styles.primario} onPress={() => { void confirmar([id]); }} disabled={ocupado || (r.status === 'falta' && !escolha?.categoria)} accessibilityRole="button" accessibilityLabel={`Confirmar item ${Number(id) + 1}`}><Text style={styles.primarioTexto}>{r.status === 'data' ? 'Corrigir data' : 'Confirmar lançamento'}</Text></AppPressable>
              </> : null}
              {r.status === 'revisar' && r.linha.natureza === 'fatura' ? <AppPressable style={styles.opcao} onPress={() => { fechar(); router.push('/(app)/credito'); }} disabled={ocupado}><Text style={styles.texto}>Conferir em Crédito</Text></AppPressable> : null}
              {!salvo ? <AppPressable style={styles.opcao} onPress={() => { setIgnorados(antes => [...antes,id]); setSelecionados(antes => antes.filter(x => x !== id)); }} disabled={ocupado} accessibilityLabel={`Ignorar item ${Number(id) + 1}`}><Text style={styles.apoio}>Ignorar neste arquivo</Text></AppPressable> : null}
            </View>;
          })}
          {visiveis.length > pagina * 20 ? <AppPressable style={styles.opcao} onPress={() => setPagina(p => p + 1)}><Text style={styles.texto}>Ver mais itens</Text></AppPressable> : null}
          <AppPressable style={styles.primario} onPress={confirmarLote} disabled={ocupado || !selecionados.length} accessibilityRole="button" accessibilityLabel="Confirmar selecionados"><Text style={styles.primarioTexto}>Confirmar selecionados ({selecionados.length})</Text></AppPressable>
        </>}
        {ocupado ? <ActivityIndicator color={theme.accent} accessibilityLabel="Conferindo extrato" /> : null}
        {lote ? <>
          <Text style={styles.apoio} accessibilityLiveRegion="polite">{`${lote.feitos} de ${lote.total} itens com\u00a0resposta.`}</Text>
          <AppPressable style={styles.opcao} onPress={() => { pararLote.current?.(); pararLote.current = null; }} accessibilityRole="button" accessibilityLabel="Parar o lote"><Text style={styles.texto}>Parar o lote</Text></AppPressable>
        </> : null}
        <AppPressable onPress={fechar} disabled={ocupado} style={styles.opcao} accessibilityLabel="Fechar conferência"><Text style={styles.texto}>Fechar</Text></AppPressable>
      </Sheet> : null}
    </AppModal>
    <CategoryPickerModal visible={categoriaId !== null} currentCategory={categoriaId ? escolhas[categoriaId]?.categoria : ''} tipo={editando?.linha.direcao} onClose={() => setCategoriaId(null)} onSelectCategory={c => {
      if (categoriaId && !emVoo.current) setEscolhas(antes => ({ ...antes, [categoriaId]: { id: categoriaId, categoria: c.name, cor: c.color } }));
      setCategoriaId(null);
    }} />
  </>;
}
const styles = StyleSheet.create({
  botao: { minHeight: 48, padding: spacing.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.rule, borderRadius: radius.md, backgroundColor: theme.paperRaised },
  titulo: { fontSize: type.titulo, lineHeight: lh(type.titulo, 'titulo'), fontFamily: fonts.regular, color: theme.ink },
  texto: { fontSize: type.apoio, lineHeight: lh(type.apoio), fontFamily: fonts.regular, color: theme.inkSoft },
  apoio: { fontSize: type.nota, lineHeight: lh(type.nota), fontFamily: fonts.light, color: theme.inkSoft },
  rotulo: { fontSize: type.nota, fontFamily: fonts.medium, color: theme.inkFaint },
  input: { minHeight: 48, padding: spacing.md, color: theme.ink, borderColor: theme.rule, borderWidth: 1, borderRadius: radius.md, fontSize: type.apoio, fontFamily: fonts.regular },
  opcao: { minHeight: 48, padding: spacing.md, justifyContent: 'center', borderRadius: radius.md },
  selecionada: { backgroundColor: theme.paperRaised },
  item: { gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: theme.rule },
  primario: { minHeight: 48, padding: spacing.md, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent, borderRadius: radius.md },
  primarioTexto: { fontSize: type.apoio, fontFamily: fonts.regular, color: theme.paper },
});
