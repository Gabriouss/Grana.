import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppPressable from './AppPressable';
import { listarOperacoesVozLocais, sincronizarOperacoesVoz } from '@/lib/voice-operations';
import { contarFalasAguardandoConexao } from '@/lib/voz-pendente-na-lista';
import { fonts, spacing, theme, touchTarget, type } from '@/lib/theme';
import { observarDadosDosWidgets } from '@/lib/widgets-home-events';

export default function VozesSalvasLocalmente() {
  const [itens, setItens] = useState<Awaited<ReturnType<typeof listarOperacoesVozLocais>>>([]);
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  /* Áudio gravado sem rede e ainda não transcrito: sem valor, então só conta. */
  const [audios, setAudios] = useState(0);
  const insets = useSafeAreaInsets();
  const carregar = () => Promise.all([
    listarOperacoesVozLocais().then(setItens).catch(() => {}),
    contarFalasAguardandoConexao().then(setAudios).catch(() => {}),
  ]);
  useEffect(() => {
    void carregar();
    const remover = observarDadosDosWidgets(() => { void carregar(); });
    const evento = AppState.addEventListener('change', (estado) => { if (estado === 'active') void carregar(); });
    return () => { remover(); evento.remove(); };
  }, []);
  if (!itens.length && !audios) return null;
  /* A faixa já ocupa o inset superior antes da rota montar seu cabeçalho.
     Sem esta compensação, a SafeAreaView da Início reserva o mesmo inset de
     novo depois da faixa e cria um vazio grande entre ela e o avatar. A margem
     só existe quando a faixa existe; sem faixa este componente retorna null. */
  return <View style={[styles.container, { paddingTop: Math.max(12, insets.top + 8), marginBottom: -insets.top }]}>
    {itens.length > 0 && <Text style={styles.text}>{itens.length === 1 ? '1 lançamento por voz salvo neste aparelho.' : `${itens.length} lançamentos por voz salvos neste aparelho.`}</Text>}
    {audios > 0 && <Text style={styles.text}>{audios === 1 ? '1 fala aguardando conexão.' : `${audios} falas aguardando conexão.`}</Text>}
    {/* `polite` porque a frase muda sozinha ao fim da sincronização: sem região
        viva, quem usa leitor de tela toca em "Tentar sincronizar" e nunca fica
        sabendo no que deu. `alert` seria grosseiro para um aviso de fundo. */}
    <Text style={styles.subtext} accessibilityLiveRegion="polite" accessibilityRole="text">
      {mensagem ?? 'Sincronização pendente.'}
    </Text>
    <AppPressable
      disabled={ocupado}
      accessibilityRole="button"
      accessibilityLabel="Tentar sincronizar lançamentos salvos neste aparelho"
      /* `busy` é o que anuncia "já entendi, estou trabalhando" — sem ele o
         botão só fica mudo e desabilitado, indistinguível de quebrado. */
      accessibilityState={{ disabled: ocupado, busy: ocupado }}
      style={styles.botao}
      onPress={async () => {
      setOcupado(true);
      setMensagem(null);
      try {
        const resultado = await sincronizarOperacoesVoz();
        await carregar();
        if (resultado.falhas) setMensagem(resultado.mensagem ?? 'Não foi possível confirmar todos os lançamentos.');
      } catch { setMensagem('Não foi possível sincronizar agora. Tente novamente.'); }
        finally { setOcupado(false); }
      }}
    >
      <Text style={styles.action}>{ocupado ? 'Sincronizando…' : 'Tentar sincronizar'}</Text>
    </AppPressable>
  </View>;
}

/* Os três estilos de texto não declaravam `fontFamily` e caíam na fonte do
   sistema — violando a regra de que a Neue Machina é a única fonte do produto,
   em todos os papéis. Passou por 315 guardas de design system porque elas
   procuram fontFamily ERRADA, não fontFamily AUSENTE (corrigido no mesmo
   commit, ver corpus-design-system.ts). Os tamanhos crus viraram `type.*`
   pelo mesmo motivo: a escala já resolve iOS e Android separadamente. */
const styles = StyleSheet.create({
  /* A saída da faixa usa o mesmo espaçamento que separa as faixas do cabeçalho
     na Início. O botão continua com o alvo de toque de `touchTarget`; só o
     respiro depois dele fica menor, e a Início sem faixa não muda. */
  container: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: theme.paperRaised },
  text: { color: theme.ink, fontFamily: fonts.regular, fontSize: type.apoio, lineHeight: Math.round(type.apoio * 1.4) },
  subtext: { color: theme.inkSoft, fontFamily: fonts.regular, fontSize: type.nota, lineHeight: Math.round(type.nota * 1.4), marginTop: spacing.xs / 2 },
  /* O alvo vive no PRESSÁVEL, não no texto: `paddingVertical: 8` num texto de
     15px dava ~36dp, abaixo dos 48dp do Android. `justifyContent` centraliza o
     rótulo dentro da altura mínima em vez de esticá-lo. */
  botao: { minHeight: touchTarget, justifyContent: 'center' },
  action: { color: theme.accent2, fontFamily: fonts.regular, fontSize: type.apoio },
});
