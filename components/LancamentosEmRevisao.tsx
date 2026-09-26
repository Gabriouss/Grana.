import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert } from '@/lib/alert';
import { assinarDadoNovo } from '@/lib/cache-de-tela';
import { mensagemErro } from '@/lib/erros';
import { formatBRL, formatDateLabel } from '@/lib/format';
import {
  devolverDaRevisaoParaFila,
  listarEmRevisao,
  resumoDaRevisao,
  tirarDaRevisao,
  type ItemEmRevisao,
} from '@/lib/offline-cache';
import { fonts, lh, radius, screenRhythm, spacing, theme, touchTarget, type } from '@/lib/theme';
import AppModal from './AppModal';
import AppPressable from './AppPressable';
import PrivacyValue from './PrivacyValue';
import Sheet from './Sheet';

/**
 * "Precisa de revisão": o que a fila offline guardou e o banco recusou de vez.
 *
 * A fila tira esses itens da frente (senão travariam todos os de trás) e
 * publica uma notificação, mas até 26/09/2026 não havia onde vê-los: a
 * notificação mandava "abrir o app para revisar" e o app não mostrava nada.
 * Aqui a pessoa vê cada um, com o motivo em frase de gente, e decide: tentar
 * de novo ou descartar. Nada sai daqui sem essa escolha.
 *
 * A faixa segue o desenho da `FaixaOffline` (mesma caixa, mesmo recuo), porque
 * as duas aparecem juntas no topo da Início e falam do mesmo assunto.
 *
 * A fala por voz que o banco recusa NÃO vem para cá: ela tem revisão própria,
 * que reabre a transcrição na tela certa (`RespostaVozWidget`), igual no app e
 * no widget (regra 13).
 */
export default function LancamentosEmRevisao({
  aberta,
  onAbrir,
  onFechar,
  estilo,
}: {
  aberta: boolean;
  onAbrir: () => void;
  onFechar: () => void;
  estilo?: StyleProp<ViewStyle>;
}) {
  const [itens, setItens] = useState<ItemEmRevisao[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'atencao' } | null>(null);

  const carregar = useCallback(() => {
    listarEmRevisao()
      .then(setItens)
      .catch((erro) => console.error('[revisao] não consegui ler a lista de revisão', erro));
  }, []);

  useEffect(() => {
    carregar();
    /* A rodada da fila avisa dado novo quando manda algo para a revisão; a
       volta do segundo plano cobre a recusa que chegou com o app parado. */
    const remover = assinarDadoNovo(carregar);
    const evento = AppState.addEventListener('change', (estado) => { if (estado === 'active') carregar(); });
    return () => { remover(); evento.remove(); };
  }, [carregar]);

  useEffect(() => {
    if (aberta) carregar();
    else setAviso(null);
  }, [aberta, carregar]);

  async function tentarDeNovo(item: ItemEmRevisao) {
    const { titulo } = resumoDaRevisao(item);
    setOcupado(item.localId);
    setAviso(null);
    try {
      const desfecho = await devolverDaRevisaoParaFila(item.localId);
      if (desfecho === 'salvo') setAviso({ texto: `"${titulo}" foi salvo.`, tom: 'ok' });
      else if (desfecho === 'aguardando') setAviso({ texto: `"${titulo}" voltou para a fila e sobe quando houver conexão.`, tom: 'ok' });
      else if (desfecho === 'recusado') setAviso({ texto: `O Grana. recusou "${titulo}" de novo. Confira os dados ou descarte.`, tom: 'atencao' });
    } catch (erro) {
      console.error('[revisao] tentar de novo falhou', erro);
      setAviso({ texto: mensagemErro(erro), tom: 'atencao' });
    } finally {
      setOcupado(null);
      carregar();
    }
  }

  function descartar(item: ItemEmRevisao) {
    const { titulo } = resumoDaRevisao(item);
    Alert.alert('Descartar lançamento', `"${titulo}" não será salvo. Isso não pode ser desfeito.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: async () => {
          try {
            await tirarDaRevisao(item.localId);
            setAviso({ texto: `"${titulo}" foi descartado.`, tom: 'ok' });
          } catch (erro) {
            console.error('[revisao] descartar falhou', erro);
            setAviso({ texto: 'Não consegui descartar agora. Tente de novo.', tom: 'atencao' });
          } finally {
            carregar();
          }
        },
      },
    ]);
  }

  const quantos = itens.length;

  return (
    <>
      {quantos > 0 && (
        <View style={[estilo, styles.recuo]}>
          <AppPressable
            style={styles.faixa}
            onPress={onAbrir}
            accessibilityRole="button"
            accessibilityLabel={`${rotuloDaFaixa(quantos)}. Abrir revisão`}
          >
            <Ionicons name="alert-circle-outline" size={13} color={theme.danger} />
            <Text style={styles.faixaTexto} numberOfLines={2}>{rotuloDaFaixa(quantos)}</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.inkFaint} />
          </AppPressable>
        </View>
      )}

      <AppModal visible={aberta} transparent onRequestClose={onFechar}>
        <Sheet onClose={onFechar}>
          <View style={styles.cabecalho}>
            <Text style={styles.titulo}>Precisa de revisão</Text>
            <AppPressable onPress={onFechar} style={styles.fechar} accessibilityRole="button" accessibilityLabel="Fechar">
              <Ionicons name="close" size={22} color={theme.inkFaint} />
            </AppPressable>
          </View>
          <Text style={styles.apoio}>
            {quantos > 0
              ? 'O Grana. guardou estes lançamentos sem conexão, mas não conseguiu salvá-los. Tente de novo ou descarte.'
              : 'Nada para revisar. Tudo o que estava guardado no aparelho foi resolvido.'}
          </Text>
          {aviso && (
            /* Caixa da faixa, com ícone: o desfecho não pode depender só da
               cor para se separar do parágrafo de apoio. */
            <View style={styles.aviso} accessibilityLiveRegion="polite">
              <Ionicons name={aviso.tom === 'ok' ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={13} color={aviso.tom === 'ok' ? theme.up : theme.danger} />
              <Text style={styles.avisoTexto} accessibilityRole="text">{aviso.texto}</Text>
            </View>
          )}
          {itens.map((item) => {
            const resumo = resumoDaRevisao(item);
            const legenda = [resumo.tipo, resumo.data ? formatDateLabel(resumo.data) : null].filter(Boolean).join(' · ');
            const esteOcupado = ocupado === item.localId;
            return (
              <View key={item.localId} style={styles.item}>
                <View style={styles.linha}>
                  <Text style={styles.itemTitulo} numberOfLines={2}>{resumo.titulo}</Text>
                  {resumo.valor != null && (
                    <PrivacyValue>
                      <Text style={styles.valor}>{formatBRL(resumo.valor)}</Text>
                    </PrivacyValue>
                  )}
                </View>
                <Text style={styles.legenda}>{legenda}</Text>
                {/* O motivo é o que decide a ação: um respiro a mais o separa da legenda. */}
                <Text style={[styles.motivo, { marginTop: spacing.xs }]}>{resumo.motivo}</Text>
                <View style={styles.acoes}>
                  <AppPressable
                    style={styles.descartar}
                    onPress={() => descartar(item)}
                    disabled={!!ocupado}
                    accessibilityRole="button"
                    accessibilityLabel={`Descartar ${resumo.titulo}`}
                  >
                    <Text style={styles.descartarTexto}>Descartar</Text>
                  </AppPressable>
                  <AppPressable
                    style={styles.tentar}
                    onPress={() => tentarDeNovo(item)}
                    disabled={!!ocupado}
                    accessibilityRole="button"
                    accessibilityLabel={`Tentar salvar ${resumo.titulo} de novo`}
                    accessibilityState={{ disabled: !!ocupado, busy: esteOcupado }}
                  >
                    <Text style={styles.tentarTexto}>{esteOcupado ? 'Enviando…' : 'Tentar de novo'}</Text>
                  </AppPressable>
                </View>
              </View>
            );
          })}
        </Sheet>
      </AppModal>
    </>
  );
}

function rotuloDaFaixa(n: number): string {
  return n === 1 ? '1 lançamento precisa de revisão' : `${n} lançamentos precisam de revisão`;
}

const styles = StyleSheet.create({
  /* Mesmo recuo e mesma caixa da `FaixaOffline`: as duas ficam empilhadas no
     topo da Início e precisam alinhar na mesma margem. */
  recuo: { paddingHorizontal: screenRhythm.padding },
  faixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.icone,
    minHeight: touchTarget,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.rule,
    paddingHorizontal: spacing.sm,
  },
  faixaTexto: { flex: 1, minWidth: 0, color: theme.ink, fontSize: type.legenda, lineHeight: lh(type.legenda, 'apoio'), fontFamily: fonts.regular },
  /* `center`: com `flex-start` o X (caixa de 48) ficava 13 px abaixo da linha do título. */
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titulo: { flex: 1, minWidth: 0, color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
  fechar: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  apoio: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.light },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.icone,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.rule,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.icone,
  },
  avisoTexto: { flex: 1, minWidth: 0, color: theme.ink, fontSize: type.apoio, lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.regular },
  item: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paperRaised,
  },
  linha: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  itemTitulo: { flex: 1, minWidth: 0, color: theme.ink, fontSize: type.corpo, lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.regular },
  valor: { color: theme.ink, fontSize: type.corpo, lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  legenda: { color: theme.inkFaint, fontSize: type.nota, lineHeight: lh(type.nota, 'apoio'), fontFamily: fonts.light },
  motivo: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.light },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  /* Contornado, não cheio: com vários itens, um botão cheio por item
     disputaria atenção e nenhum leria como a ação principal. */
  descartar: { flexGrow: 1, minHeight: touchTarget, justifyContent: 'center', padding: spacing.sm, borderRadius: radius.md, alignItems: 'center' },
  descartarTexto: { color: theme.danger, fontSize: type.apoio, fontFamily: fonts.regular },
  tentar: { flexGrow: 1, minHeight: touchTarget, justifyContent: 'center', padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: theme.ruleStrong, alignItems: 'center' },
  tentarTexto: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
});
