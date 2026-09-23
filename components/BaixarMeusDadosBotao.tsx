import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert } from '@/lib/alert';
import { useSession } from '@/lib/auth-context';
import { exportarMeusDados } from '@/lib/exportar-meus-dados';
import { mensagemErro } from '@/lib/erros';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import AppPressable from './AppPressable';

/**
 * Baixa uma cópia de tudo o que o app guarda sobre a pessoa.
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
export default function BaixarMeusDadosBotao({ rotulo }: { rotulo?: string }) {
  const { session } = useSession();
  const [gerando, setGerando] = useState(false);

  async function baixar() {
    setGerando(true);
    try {
      const { nomeArquivo, contagem, indisponiveis, compartilhado } = await exportarMeusDados({
        conta: { id: session?.user.id ?? null, email: session?.user.email ?? null },
      });
      const linhas = Object.values(contagem).reduce((soma, n) => soma + n, 0);

      if (indisponiveis.length > 0) {
        Alert.alert(
          'Cópia gerada, com partes de fora',
          `O arquivo ${nomeArquivo} tem ${linhas} registros, mas ${indisponiveis.length} parte(s) não puderam ser lidas agora: ${indisponiveis
            .map((i) => i.tabela)
            .join(', ')}. O motivo de cada uma está escrito dentro do arquivo. Tente de novo mais tarde para uma cópia completa.`
        );
        return;
      }
      if (!compartilhado) {
        Alert.alert('Cópia gerada', `O compartilhamento não está disponível neste aparelho. O arquivo ${nomeArquivo} ficou salvo no próprio app.`);
        return;
      }
      Alert.alert('Cópia gerada', `${linhas} registros em ${nomeArquivo}.`);
    } catch (erro) {
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
      accessibilityLabel="Baixar uma cópia dos meus dados"
      accessibilityState={{ busy: gerando, disabled: gerando }}
    >
      {gerando ? (
        <ActivityIndicator size="small" color={theme.inkSoft} />
      ) : (
        <Ionicons name="download-outline" size={16} color={theme.inkSoft} aria-hidden />
      )}
      <Text style={styles.texto}>{gerando ? 'Preparando seus dados…' : (rotulo ?? 'Baixar meus dados')}</Text>
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
