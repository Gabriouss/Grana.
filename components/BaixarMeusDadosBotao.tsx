import { useState } from 'react';
import * as Linking from 'expo-linking';
import { destinoSuporte } from '@/lib/checkout-assinatura';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert } from '@/lib/alerta';
import { useSession } from '@/lib/auth-context';
import { exportarMeusDados } from '@/lib/exportar-meus-dados';
import { mensagemErro } from '@/lib/erros';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import AppPressable from './AppPressable';

/**
 * Baixa as partes disponíveis e informa as limitações; com acesso bloqueado,
 * encaminha a solicitação ao suporte sem exigir renovação.
 *
 * Existe nas duas telas por onde alguém pode querer levar os próprios dados: o
 * Perfil e a tela de assinatura, que é a única aberta para quem está no
 * paywall ou vencido. A Política de Privacidade promete, no artigo 18 da
 * LGPD, "confirmar a existência e acessar os dados que temos sobre você" — e
 * até 23/09/2026 não havia, em lugar nenhum do app, como fazer isso: o único
 * "exportar" era o relatório do mês em PDF, dentro da área paga.
 *
 * O aviso de tabela indisponível aparece na tela, e não só dentro do arquivo:
 * uma cópia incompleta que se apresenta como completa é pior que um erro.
 */
export default function BaixarMeusDadosBotao({ rotulo, acessoBloqueado = false }: { rotulo?: string; acessoBloqueado?: boolean }) {
  const { session } = useSession();
  const [gerando, setGerando] = useState(false);

  function solicitarPeloSuporte() {
    Alert.alert('Solicitar seus dados', 'O vencimento não apaga seus dados. O download direto não está disponível com o acesso bloqueado. Solicite uma cópia pelo suporte, sem precisar renovar a assinatura.', [
      { text: 'Agora não', style: 'cancel' },
      { text: 'Solicitar pelo suporte', onPress: () => {
        void Linking.openURL(destinoSuporte).catch(() => {
          console.warn('[dados] não foi possível abrir o e-mail de suporte');
          Alert.alert('Fale com o suporte', 'Envie seu pedido de cópia para suporte@granaponto.com.br.');
        });
      } },
    ]);
  }

  async function baixar() {
    if (gerando) return;
    if (acessoBloqueado) { solicitarPeloSuporte(); return; }
    setGerando(true);
    try {
      const { nomeArquivo, contagem, indisponiveis, compartilhado } = await exportarMeusDados({
        conta: { id: session?.user.id ?? null, email: session?.user.email ?? null },
      });
      const linhas = Object.values(contagem).reduce((soma, n) => soma + n, 0);

      if (indisponiveis.length > 0) {
        Alert.alert(
          'Cópia parcial gerada',
          `O arquivo ${nomeArquivo} tem ${linhas} registros. Partes indisponíveis: ${indisponiveis
            .map((i) => i.tabela)
            .join(', ')}. Os motivos estão no arquivo. ${indisponiveis.some((i) => i.tipo === 'permanente')
              ? 'Solicite as partes com limitação permanente pelo suporte: suporte@granaponto.com.br.' : ''}${indisponiveis.some((i) => i.tipo === 'temporaria')
              ? ' Verifique a conexão e tente novamente para obter as partes com falha temporária.' : ''}${!compartilhado ? ' O compartilhamento está indisponível; o arquivo ficou salvo no app.' : ''}`
        );
        return;
      }
      if (!compartilhado) {
        Alert.alert('Cópia gerada', `O compartilhamento não está disponível neste aparelho. O arquivo ${nomeArquivo} ficou salvo no próprio app.`);
        return;
      }
      Alert.alert('Cópia gerada', `${linhas} registros em ${nomeArquivo}.`);
    } catch (erro) {
      console.warn('[dados] download nao concluido');
      if ((erro as { codigo?: string })?.codigo === 'acesso-negado') {
        solicitarPeloSuporte();
        return;
      }
      Alert.alert('Não foi possível gerar a cópia', mensagemErro(erro, 'Tente de novo em instantes.'));
    } finally {
      setGerando(false);
    }
  }

  return (
    <AppPressable
      style={styles.botao}
      onPress={baixar}
      disabled={gerando}
      accessibilityRole="button"
      accessibilityLabel={acessoBloqueado ? 'Solicitar uma cópia dos meus dados pelo suporte' : 'Baixar cópia parcial dos meus dados; feedbacks disponíveis pelo suporte'}
      accessibilityState={{ busy: gerando, disabled: gerando }}
    >
      {gerando ? (
        <ActivityIndicator size="small" color={theme.inkSoft} />
      ) : (
        <Ionicons name="download-outline" size={16} color={theme.inkSoft} aria-hidden />
      )}
      <Text style={styles.texto}>{gerando ? 'Preparando seus dados…' : (rotulo ?? (acessoBloqueado ? 'Solicitar meus dados' : 'Baixar meus dados (cópia parcial)'))}</Text>
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paperRaised,
  },
  texto: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.light },
});
