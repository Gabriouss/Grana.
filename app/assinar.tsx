import { useState } from 'react';
import * as Linking from 'expo-linking';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEntitlement } from '@/lib/entitlement-context';
import { fonts, radius, spacing, theme } from '@/lib/theme';
import { useFlags } from '@/lib/feature-flags';

/* Nomes sem provedor no meio, porque o provedor mudou uma vez e pode mudar de
   novo. A queda para os nomes antigos existe para a build instalada e os
   ambientes já configurados não pararem de vender no dia da troca: enquanto a
   variável nova não estiver publicada em toda parte, a antiga continua
   valendo. Remover a queda só depois que Vercel e EAS estiverem com a nova. */
const checkoutConfigurado =
  process.env.EXPO_PUBLIC_CHECKOUT_URL ?? process.env.EXPO_PUBLIC_KIWIFY_CHECKOUT_URL;
const destinoCompra = checkoutConfigurado?.startsWith('https://')
  ? checkoutConfigurado
  : 'https://granaponto.com.br/#precos';
/* Plano anual. Só aparece quando há URL configurada: sem ela, a tela volta a
   ser exatamente o que era, com o mensal sozinho, em vez de mostrar um botão
   que leva a lugar nenhum. */
const anualConfigurado = process.env.EXPO_PUBLIC_CHECKOUT_URL_ANUAL;
const destinoAnual = anualConfigurado?.startsWith('https://') ? anualConfigurado : null;

/* Preços que a pessoa realmente paga no checkout, já com a taxa de serviço da
   Cakto embutida — a oferta é cadastrada por R$ 0,99 a menos, de cada lado,
   justamente para o total bater com o que se anuncia aqui.

   O texto NÃO anuncia valor de parcela. A Cakto cobra o juro-base dela do
   COMPRADOR (23,94% em 12x, lido de `fees_retrieve` em 11/09/2026), e a
   Public API só permite acrescentar juro por cima desse, nunca removê-lo.
   Dividir o preço por 12 aqui produziria um número que o checkout não pratica,
   que foi exatamente o defeito corrigido em 11/09/2026. */
const PRECO_MENSAL = 9.9;
const PRECO_ANUAL = 97.9;
const reais = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
const economiaAnual = reais(PRECO_MENSAL * 12 - PRECO_ANUAL);

const gerenciamentoConfigurado =
  process.env.EXPO_PUBLIC_BILLING_URL ?? process.env.EXPO_PUBLIC_KIWIFY_BILLING_URL;
const destinoGerenciamento = gerenciamentoConfigurado?.startsWith('https://')
  ? gerenciamentoConfigurado
  : null;
const destinoSuporte = 'mailto:gbr.design30@gmail.com?subject=Ajuda%20com%20a%20cobran%C3%A7a%20do%20Grana.';

export default function AssinarScreen() {
  const { ligado } = useFlags();
  const { estado, sincronizacao, recarregar } = useEntitlement();
  const [verificando, setVerificando] = useState(false);
  const cobrancaPendente = estado?.status === 'past_due';

  async function verificar() {
    setVerificando(true);
    try {
      await recarregar();
    } finally {
      setVerificando(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>GRANA. COMPLETO</Text>
        {/* O preço saiu do título e foi para os cartões de plano: com dois
            preços na tela, cravar um deles aqui em cima contradiz o outro. */}
        <Text style={styles.title}>Seu controle financeiro continua.</Text>
        <Text style={styles.body}>
          {/* Dizia "o assistente pelo WhatsApp". Esse canal está desligado
              por decisão (flag `whatsapp`), e prometer num ecrã de COBRANÇA
              algo que a pessoa não vai receber é o pior lugar possível pra
              uma promessa vencida. O assistente agora é o Granabô, dentro do
              próprio app. */}
          A assinatura libera lançamentos, contas, cartões, metas e o Granabô, seu assistente dentro do app. Sem conectar sua conta bancária.
        </Text>
        {estado?.status === 'past_due' && (
          <Text style={styles.notice}>
            O pagamento está pendente. Atualize a cobrança pelo link do e-mail da compra para manter o acesso.
          </Text>
        )}
        {sincronizacao.mensagem && (
          <Text style={styles.notice} accessibilityLiveRegion="polite">
            {sincronizacao.mensagem}
          </Text>
        )}
        {/* Desabilitado, não escondido: sumir com o botão de compra numa tela
            de assinatura deixaria a pessoa sem entender o que fazer ali. O
            rótulo passa a dizer o motivo — dinheiro entra por este caminho, e
            mandar alguém para um checkout instável é pior que fazê-lo esperar. */}
        {cobrancaPendente ? (
          destinoGerenciamento ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => Linking.openURL(destinoGerenciamento)}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            >
              <Text style={styles.primaryText}>Atualizar cobrança</Text>
            </Pressable>
          ) : (
            <View style={styles.billingHelp}>
              <Text style={styles.billingHelpText}>
                Abra o e-mail da compra para atualizar a cobrança. Se não encontrar o link, fale com o suporte.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => Linking.openURL(destinoSuporte)}
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryText}>Falar com o suporte</Text>
              </Pressable>
            </View>
          )
        ) : (
          <View style={styles.planos}>
            {/* O anual é o foco: card com moldura de destaque, valor grande e o
                equivalente mensal logo abaixo, que é o argumento — ele fica
                MENOR que a mensalidade avulsa. O mensal continua ali, em botão
                discreto, porque esconder a opção mais barata de entrada faria
                quem não pode pagar o ano sair da tela sem assinar nada. */}
            {destinoAnual && ligado('assinatura_checkout') ? (
              <View style={styles.destaque}>
                <Text style={styles.selo}>MAIS VANTAJOSO</Text>
                <View style={styles.destaqueLinha}>
                  <Text style={styles.destaqueValor}>{reais(PRECO_ANUAL)}</Text>
                  <Text style={styles.destaquePeriodo}>/ano</Text>
                </View>
                <Text style={styles.destaqueApoio}>
                  À vista no cartão ou no Pix, você economiza {economiaAnual} no ano. Em até 12x
                  com juros da operadora.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Assinar o plano anual por ${reais(PRECO_ANUAL)} ao ano`}
                  onPress={() => Linking.openURL(destinoAnual)}
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryText}>Assinar o plano anual</Text>
                </Pressable>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={!ligado('assinatura_checkout')}
              accessibilityState={{ disabled: !ligado('assinatura_checkout') }}
              onPress={() => Linking.openURL(destinoCompra)}
              style={({ pressed }) => [
                destinoAnual && ligado('assinatura_checkout') ? styles.secondary : styles.primary,
                pressed && styles.pressed,
                !ligado('assinatura_checkout') && { opacity: 0.5 },
              ]}
            >
              <Text
                style={
                  destinoAnual && ligado('assinatura_checkout') ? styles.secondaryText : styles.primaryText
                }
              >
                {!ligado('assinatura_checkout')
                  ? 'Pagamento indisponível no momento'
                  : destinoAnual
                    ? `Prefiro mensal, ${reais(PRECO_MENSAL)} por mês`
                    : 'Assinar o Grana.'}
              </Text>
            </Pressable>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={verificar}
          disabled={verificando}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        >
          {verificando ? (
            <ActivityIndicator color={theme.ink} />
          ) : (
            <Text style={styles.secondaryText}>Já paguei — verificar acesso</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: theme.paper,
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    gap: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    backgroundColor: theme.paperRaised,
    padding: spacing.xxl,
  },
  eyebrow: {
    color: theme.accent2,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  title: {
    color: theme.ink,
    fontFamily: fonts.regular,
    fontSize: 28,
    lineHeight: 35,
    textAlign: 'center',
  },
  body: {
    color: theme.inkSoft,
    fontFamily: fonts.light,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  notice: {
    color: theme.danger,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  billingHelp: {
    gap: spacing.sm,
  },
  billingHelpText: {
    color: theme.inkSoft,
    fontFamily: fonts.light,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  primary: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: theme.accent2,
    paddingHorizontal: spacing.xl,
  },
  primaryText: {
    color: theme.paper,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 22,
  },
  secondary: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    paddingHorizontal: spacing.xl,
  },
  secondaryText: {
    color: theme.ink,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  planos: { gap: spacing.md },
  /* Moldura no tom de acento, não um cinza a mais: o destaque precisa vencer
     o botão do mensal logo abaixo sem depender de tamanho de fonte. */
  destaque: {
    gap: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: theme.accent2,
    backgroundColor: theme.paper,
    padding: spacing.lg,
  },
  selo: {
    alignSelf: 'flex-start',
    color: theme.accent2,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.1,
  },
  // `baseline` para o "/ano" assentar na base do número, não no meio dele.
  destaqueLinha: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  destaqueValor: { color: theme.ink, fontFamily: fonts.regular, fontSize: 30, lineHeight: 36 },
  destaquePeriodo: { color: theme.inkSoft, fontFamily: fonts.light, fontSize: 15, lineHeight: 20 },
  destaqueApoio: { color: theme.inkSoft, fontFamily: fonts.light, fontSize: 14, lineHeight: 20 },
  pressed: { opacity: 0.72 },
});
