import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AppModal, { InsetsDoModal } from './AppModal';
import AppPressable from './AppPressable';
import ToggleSwitch from './ToggleSwitch';
import { Alert } from '@/lib/alerta';
import { nomeDoApp } from '@/lib/avisos-banco/catalogo';
import { interpretarAviso, resumoDoEntendido } from '@/lib/avisos-banco/interpretar';
import { fonts, lh, radius, spacing, theme, touchTarget, type } from '@/lib/theme';
import { semViuva } from '@/lib/sem-viuva';
import {
  abrirAcessoAvisos,
  abrirInformacoesDoAppAvisos,
  apagarDiarioAvisos,
  avisosDisponivel,
  definirAppAvisos,
  estadoAvisos,
  lerDiarioAvisos,
  listarAppsAvisos,
  type AppQueNotificou,
  type AvisoDoDiario,
  type EstadoAvisos,
} from '@/modules/grana-avisos';

const EXPLICACAO = semViuva('O Android entrega todas as notificações do aparelho ao serviço, e o Grana. só lê as dos apps ligados na lista abaixo. Dos outros, guarda só o nome do app e quantas vezes notificou. O texto dos avisos fica neste aparelho.');
const RESTRITA = semViuva('Se o Android mostrar "Configuração restrita": abra as informações do app, toque no menu de três pontos e escolha "Permitir configurações restritas".');

function textoDoSinal(estado: EstadoAvisos): string {
  if (estado.desconectadoEm > 0) return 'Sem sinal do serviço. O Android o desligou';
  if (!estado.ultimoSinal) return 'Sem sinal do serviço ainda';
  return `Último sinal: ${new Date(estado.ultimoSinal).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`;
}

/** Perfil: "Anotar pelos avisos do banco". */
export default function AvisosBancoSecao() {
  const [estado, setEstado] = useState<EstadoAvisos | null>(null);
  const [apps, setApps] = useState<AppQueNotificou[]>([]);
  const [diarioAberto, setDiarioAberto] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  const carregar = useCallback(() => {
    try {
      setEstado(estadoAvisos());
      setApps(listarAppsAvisos());
      setFalha(null);
    } catch (erro) {
      console.error('[avisos] estado não foi lido', erro instanceof Error ? erro.name : 'erro');
      setFalha('Não consegui ler o estado dos avisos.');
    }
  }, []);

  useEffect(() => {
    if (!avisosDisponivel) return;
    carregar();
    const evento = AppState.addEventListener('change', (s) => { if (s === 'active') carregar(); });
    return () => evento.remove();
  }, [carregar]);

  if (!avisosDisponivel) return null;

  function alternar(app: AppQueNotificou) {
    try {
      definirAppAvisos(app.pacote, !app.ligado);
      carregar();
    } catch (erro) {
      console.error('[avisos] escolha de app falhou', erro instanceof Error ? erro.name : 'erro');
      Alert.alert('Não consegui mudar', 'Tente de novo em instantes.');
    }
  }

  const ordenados = [...apps].sort((a, b) => Number(b.ligado) - Number(a.ligado) || b.contagem - a.contagem);
  function abrirAjustes(abrir: () => void) {
    try { abrir(); }
    catch (erro) {
      console.error('[avisos] ajustes não abriram', erro instanceof Error ? erro.name : 'erro');
      setFalha('Não consegui abrir os ajustes. Abra as informações do Grana no Android.');
    }
  }

  return <>
    <Text style={styles.rotulo}>Anotar pelos avisos do banco</Text>
    <View style={styles.cartao}>
      <Text style={styles.corpo}>{EXPLICACAO}</Text>
      {falha && <Text style={styles.corpo}>{falha}</Text>}
      <View style={styles.linha}>
        <Text style={styles.chave}>{estado?.acesso ? 'Acesso liberado' : 'Acesso desligado'}</Text>
        <AppPressable style={styles.acaoAlvo} accessibilityRole="button" onPress={() => abrirAjustes(abrirAcessoAvisos)}>
          <Text style={styles.acao}>{estado?.acesso ? 'Ajustar' : 'Liberar'}</Text>
        </AppPressable>
      </View>
      {estado && <Text style={styles.legenda}>{textoDoSinal(estado)}</Text>}
      {!estado?.acesso && (
        <>
          <Text style={styles.legenda}>{RESTRITA}</Text>
          <AppPressable style={styles.acaoAlvo} accessibilityRole="button" onPress={() => abrirAjustes(abrirInformacoesDoAppAvisos)}>
            <Text style={styles.acao}>Abrir informações do app</Text>
          </AppPressable>
        </>
      )}
      {estado?.ultimaFalha && <Text style={styles.legenda}>Última falha ao ler: {estado.ultimaFalha.split('@')[0]}</Text>}
      <AppPressable style={styles.acaoAlvo} accessibilityRole="button" onPress={carregar}>
        <Text style={styles.acao}>Atualizar estado</Text>
      </AppPressable>
      <AppPressable style={styles.linha} accessibilityRole="button" onPress={() => setDiarioAberto(true)}>
        <Text style={styles.chave}>Diário do teste</Text>
        <Text style={styles.acao}>Abrir</Text>
      </AppPressable>
    </View>

    <Text style={styles.rotulo}>Apps que notificaram</Text>
    <View style={styles.cartao}>
      {!ordenados.length && <Text style={styles.corpo}>Nenhum app notificou ainda.</Text>}
      {ordenados.map((app) => (
        <View key={app.pacote} style={styles.linha}>
          <View style={styles.appTexto}>
            <Text style={styles.chave}>{nomeDoApp(app.pacote, app.nome)}</Text>
            <Text style={styles.legenda}>
              {app.ligado ? 'Sendo lido' : `${app.contagem} ${app.contagem === 1 ? 'notificação' : 'notificações'}, sem leitura`}
            </Text>
          </View>
          <ToggleSwitch value={app.ligado} onToggle={() => alternar(app)} label={`Ler avisos de ${nomeDoApp(app.pacote, app.nome)}`} />
        </View>
      ))}
    </View>
    {diarioAberto && <DiarioDoTeste aoFechar={() => setDiarioAberto(false)} />}
  </>;
}

function DiarioDoTeste({ aoFechar }: { aoFechar: () => void }) {
  const [avisos, setAvisos] = useState<AvisoDoDiario[] | null>(null);
  const [ilegiveis, setIlegiveis] = useState(0);
  const [falha, setFalha] = useState<string | null>(null);
  const [recibo, setRecibo] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);

  const carregar = useCallback(async () => {
    setFalha(null);
    try {
      const lido = await lerDiarioAvisos();
      setAvisos([...lido.itens].sort((a, b) => b.quando - a.quando));
      setIlegiveis(lido.ilegiveis);
    } catch (erro) {
      console.error('[avisos] diário não foi lido', erro instanceof Error ? erro.name : 'erro');
      setFalha('Não consegui ler o diário. Os avisos seguem guardados no aparelho.');
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  function apagar() {
    Alert.alert('Apagar o diário?', 'Os textos dos avisos serão apagados. Os gastos a conferir continuam na lista.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar tudo',
        style: 'destructive',
        onPress: async () => {
          setApagando(true);
          try {
            await apagarDiarioAvisos();
            setRecibo('Diário apagado');
            await carregar();
          } catch (erro) {
            console.error('[avisos] apagar diário falhou', erro instanceof Error ? erro.name : 'erro');
            setRecibo('Não consegui apagar. Tente de novo.');
          } finally {
            setApagando(false);
          }
        },
      },
    ]);
  }

  async function copiar(aviso: AvisoDoDiario) {
    const entendido = resumoDoEntendido(interpretarAviso(aviso)).replace(/R\$\s+/g, 'R$');
    try {
      await Clipboard.setStringAsync(`${nomeDoApp(aviso.pacote)}\n${aviso.titulo}\n${aviso.texto}\nEntendi: ${entendido}`);
      setRecibo('Copiado');
    } catch (erro) {
      console.error('[avisos] cópia falhou', erro instanceof Error ? erro.name : 'erro');
      setRecibo('Não consegui copiar.');
    }
  }

  return (
    <AppModal visible onRequestClose={aoFechar}>
      <InsetsDoModal>{(insets) => (
        <View style={[styles.tela, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom }]}>
          <View style={styles.linhaTitulo}>
            <Text style={styles.titulo} accessibilityRole="header">Diário do teste</Text>
            <AppPressable style={styles.acaoAlvo} accessibilityRole="button" onPress={aoFechar}>
              <Text style={styles.acao}>Fechar</Text>
            </AppPressable>
          </View>
          <Text style={styles.legenda}>{semViuva('Fica só neste aparelho e some depois de 7 dias.')}</Text>
          {recibo && <Text style={styles.acao} accessibilityLiveRegion="polite">{recibo}</Text>}
          {falha && <Text style={styles.corpo}>{falha}</Text>}
          <AppPressable style={styles.acaoAlvo} accessibilityRole="button" disabled={apagando} onPress={() => void carregar()}>
            <Text style={styles.acao}>Atualizar diário</Text>
          </AppPressable>
          {ilegiveis > 0 && <Text style={styles.corpo}>{ilegiveis} avisos não puderam ser lidos.</Text>}
          {avisos === null && !falha && <ActivityIndicator color={theme.ink} />}
          {avisos?.length === 0 && <Text style={styles.corpo}>Nenhum aviso lido ainda.</Text>}
          <ScrollView contentContainerStyle={styles.lista}>
            {avisos?.map((aviso) => (
              <View key={aviso.id} style={styles.cartao}>
                <Text style={styles.chave}>{nomeDoApp(aviso.pacote)}</Text>
                <Text style={styles.legenda}>{new Date(aviso.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
                {!!aviso.titulo && <Text style={styles.corpo}>{aviso.titulo}</Text>}
                {!!aviso.texto && <Text style={styles.corpo}>{aviso.texto}</Text>}
                <Text style={styles.entendido}>{resumoDoEntendido(interpretarAviso(aviso)).replace(/R\$\s+/g, 'R$')}</Text>
                <AppPressable style={styles.acaoAlvo} accessibilityRole="button" onPress={() => void copiar(aviso)}>
                  <Text style={styles.acao}>Copiar</Text>
                </AppPressable>
              </View>
            ))}
            {!!avisos?.length && (
              <AppPressable style={styles.acaoAlvo} accessibilityRole="button" disabled={apagando} accessibilityState={{ disabled: apagando, busy: apagando }} onPress={apagar}>
                <Text style={styles.acao}>Apagar tudo</Text>
              </AppPressable>
            )}
          </ScrollView>
        </View>
      )}</InsetsDoModal>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  rotulo: { color: theme.inkFaint, fontSize: type.legenda, lineHeight: lh(type.legenda, 'apoio'), letterSpacing: 0.5, marginTop: spacing.sm, fontFamily: fonts.light },
  cartao: { backgroundColor: theme.paperRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.rule, padding: spacing.md, gap: spacing.xs },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: touchTarget },
  linhaTitulo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  appTexto: { flex: 1, minWidth: 0 },
  chave: { flexShrink: 1, color: theme.ink, fontFamily: fonts.regular, fontSize: type.apoio },
  corpo: { color: theme.ink, fontFamily: fonts.light, fontSize: type.apoio, lineHeight: lh(type.apoio, 'apoio') },
  legenda: { color: theme.inkFaint, fontFamily: fonts.light, fontSize: type.legenda, lineHeight: lh(type.legenda, 'apoio') },
  entendido: { color: theme.accent2, fontFamily: fonts.regular, fontSize: type.legenda, lineHeight: lh(type.legenda, 'apoio') },
  acaoAlvo: { minHeight: touchTarget, justifyContent: 'center' },
  acao: { color: theme.accent2, fontFamily: fonts.regular, fontSize: type.apoio },
  tela: { flex: 1, backgroundColor: theme.paper, paddingHorizontal: spacing.lg, gap: spacing.xs },
  titulo: { color: theme.ink, fontFamily: fonts.regular, fontSize: type.titulo },
  lista: { gap: spacing.md, paddingVertical: spacing.md },
});
