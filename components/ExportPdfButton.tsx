import { consultarCategorias } from '@/lib/categorias-cliente';
import { apurarGastosCategoria } from '@/lib/gastos-categoria';
import { useEffect, useRef, useState } from 'react';
import { mensagemErro } from '@/lib/erros';
import { isLikelyNetworkError } from '@/lib/offline-cache';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Alert } from '@/lib/alerta';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, radius, spacing, type, fonts } from '@/lib/theme';
import { MONTH_NAMES } from '@/lib/format';
import { fetchBills } from '@/lib/data';
import { conferirOrigemRelatorio, gerarRelatorioPdf, RelatorioPdfCancelado } from '@/lib/pdf-report';
import { useSession } from '@/lib/auth-context';
import { identidadeDaSessao } from '@/lib/sessao-offline';
import { supabase } from '@/lib/supabase';
import { useDemo } from '@/lib/demo-context';
import type { Bill, Transaction } from '@/lib/types';
import type { MonthlyWrapped } from '@/lib/monthly-wrapped';
import AppPressable from './AppPressable';
import { useFlags } from '@/lib/feature-flags';

/**
 * Exporta o relatório executivo do mês informado. Os boletos são buscados
 * aqui, no momento do clique, em vez de exigidos como prop: as duas telas que
 * usam este botão (Gráficos e Lançamentos) só carregam transações, e obrigá-las
 * a buscar contas o tempo todo custaria uma requisição por abertura de tela
 * para uma seção que nem sempre é gerada.
 */
export default function ExportPdfButton({
  ano,
  mes,
  transactions,
  carteira,
  bills,
  wrapped,
  rotulo,
  periodo,
}: {
  ano: number;
  mes: number; // 0-11
  transactions: Transaction[];
  carteira: string;
  /** Quando a tela já tem os boletos carregados, passe-os para evitar a busca extra. */
  bills?: Bill[];
  /** Retrospectiva do mês, quando o pedido vem de dentro dela: acrescenta ao
   *  documento a seção com taxa de poupança, campeã contra o próprio teto,
   *  comparação com o mês anterior e nível alcançado. */
  wrapped?: MonthlyWrapped | null;
  /** Texto do botão. O padrão serve às telas de Gráficos e Lançamentos. */
  rotulo?: string;
  /** Intervalo ISO escolhido em Gráficos; substitui o recorte por mês. */
  periodo?: { inicio: string; fim: string };
}) {
  const { ligado } = useFlags();
  const { isDemoMode } = useDemo();
  const { session } = useSession();
  const [gerando, setGerando] = useState(false);
  const ocupado = useRef(false);
  const montado = useRef(false);
  const operacao = useRef<AbortController | null>(null);
  const identidade = identidadeDaSessao(session);
  const contexto = useRef({ tela: identidade, auth: identidade, demo: isDemoMode });
  if (contexto.current.tela !== identidade || contexto.current.demo !== isDemoMode) {
    operacao.current?.abort();
    contexto.current = { tela: identidade, auth: identidade, demo: isDemoMode };
  }

  useEffect(() => {
    montado.current = true;
    // A troca pode preceder o próximo render; A -> B -> A também cancela.
    const { data } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      const novaIdentidade = identidadeDaSessao(novaSessao);
      if (novaIdentidade !== contexto.current.auth) operacao.current?.abort();
      contexto.current.auth = novaIdentidade;
    });
    return () => {
      montado.current = false;
      operacao.current?.abort();
      data.subscription.unsubscribe();
    };
  }, []);

  async function exportar() {
    if (ocupado.current || !montado.current) return;
    ocupado.current = true;
    operacao.current?.abort();
    const controlador = new AbortController();
    operacao.current = controlador;
    const origem = { dono: session?.user.id ?? null, demo: isDemoMode, sinal: controlador.signal };
    // Os arrays recebidos pertencem ao render de origem, não ao usuário do próximo await.
    const lancamentos = transactions.map(t => ({ ...t }));
    let contas = bills?.map(b => ({ ...b }));
    setGerando(true);
    try {
      if (!origem.demo && contexto.current.auth !== identidade) controlador.abort();
      conferirOrigemRelatorio(origem, lancamentos, contas);
      /* Deixa o React Native pintar o estado ocupado antes de a geração do
         documento iniciar trabalho síncrono. Sem este quadro, o primeiro
         recibo visual só aparecia depois que o PDF já estava pronto. */
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      conferirOrigemRelatorio(origem, lancamentos, contas);
      if (!contas) {
        try {
          contas = isDemoMode ? [] : await fetchBills();
        } catch {
          contas = []; // relatório sem a seção de boletos é melhor que relatório nenhum
        }
      }
      conferirOrigemRelatorio(origem, lancamentos, contas);

      const inicioCategorias = periodo?.inicio ?? `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
      const fimCategorias = periodo?.fim ?? `${ano}-${String(mes + 1).padStart(2, '0')}-${new Date(ano, mes + 1, 0).getDate()}`;
      const apuracao = isDemoMode ? null : await consultarCategorias(inicioCategorias, fimCategorias);
      conferirOrigemRelatorio(origem, lancamentos, contas);
      if (apuracao?.resultado && apuracao.resultado.userId !== origem.dono) throw new RelatorioPdfCancelado();
      if (apuracao && !apuracao.resultado) throw new Error(apuracao.erro ?? 'Categorias indisponíveis.');
      const consumoCategorias = apuracao?.resultado?.consumo ?? apurarGastosCategoria(lancamentos, { inicio: inicioCategorias, fim: fimCategorias });
      const { compartilhado, uri } = await gerarRelatorioPdf({ ano, mes, transactions: lancamentos, bills: contas, carteira, wrapped, periodo, consumoCategorias }, origem);
      conferirOrigemRelatorio(origem, lancamentos, contas);
      /* `uri` vazio é o caminho da web, onde o relatório abre numa janela
         própria e quem salva o PDF é a caixa de impressão do navegador — não
         existe arquivo local pra citar num alerta. */
      if (!compartilhado && uri) {
        Alert.alert('Relatório gerado', `O compartilhamento não está disponível neste aparelho. O arquivo ficou em:\n${uri}`);
      }
    } catch (e: any) {
      if (e instanceof RelatorioPdfCancelado) {
        console.warn('[relatorio-pdf] exportação cancelada por mudança de contexto.');
        if (montado.current) Alert.alert('Exportação cancelada', 'A conta ou a tela mudou. Gere o relatório novamente na conta atual.');
        return;
      }
      console.error('[relatorio-pdf] falha ao gerar relatório');
      if (!montado.current) return;
      Alert.alert('Erro ao gerar relatório', isLikelyNetworkError(e)
        ? mensagemErro(e)
        : 'Não foi possível gerar o relatório. Tente novamente.');
    } finally {
      ocupado.current = false;
      if (montado.current) setGerando(false);
    }
  }

  /* Some quando o relatório está desligado remotamente. É um botão de ação
     única: desabilitado, viraria um botão morto sem explicação — e o pop-up de
     aviso já conta o motivo. */
  if (!ligado('relatorio_pdf')) return null;

  return (
    <AppPressable style={styles.botao} onPress={exportar} disabled={gerando}>
      {gerando ? (
        <ActivityIndicator size="small" color={theme.inkSoft} />
      ) : (
        <Ionicons name="document-outline" size={16} color={theme.inkSoft} />
      )}
      <Text style={styles.texto}>
        {gerando ? 'Gerando PDF…' : (rotulo ?? `Exportar relatório de ${MONTH_NAMES[mes]}`)}
      </Text>
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paperRaised,
  },
  texto: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.light },
});
