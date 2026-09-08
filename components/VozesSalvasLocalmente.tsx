import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppPressable from './AppPressable';
import { listarOperacoesVozLocais, sincronizarOperacoesVoz } from '@/lib/voice-operations';
import { fonts, spacing, theme, touchTarget, type } from '@/lib/theme';
import { observarDadosDosWidgets } from '@/lib/widgets-home-events';

export default function VozesSalvasLocalmente() {
  const [itens, setItens] = useState<Awaited<ReturnType<typeof listarOperacoesVozLocais>>>([]);
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const carregar = () => listarOperacoesVozLocais().then(setItens).catch(() => {});
  useEffect(() => {
    void carregar();
    const remover = observarDadosDosWidgets(() => { void carregar(); });
    const evento = AppState.addEventListener('change', (estado) => { if (estado === 'active') void carregar(); });
    return () => { remover(); evento.remove(); };
  }, []);
  if (!itens.length) return null;
  return <View style={[styles.container, { paddingTop: Math.max(12, insets.top + 8) }]}>
    <Text style={styles.text}>{itens.length} lançamento(s) por voz salvo(s) neste aparelho.</Text>
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
  container: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: theme.paperRaised },
  text: { color: theme.ink, fontFamily: fonts.regular, fontSize: type.apoio, lineHeight: Math.round(type.apoio * 1.4) },
  subtext: { color: theme.inkSoft, fontFamily: fonts.regular, fontSize: type.nota, lineHeight: Math.round(type.nota * 1.4), marginTop: spacing.xs / 2 },
  /* O alvo vive no PRESSÁVEL, não no texto: `paddingVertical: 8` num texto de
     15px dava ~36dp, abaixo dos 48dp do Android. `justifyContent` centraliza o
     rótulo dentro da altura mínima em vez de esticá-lo. */
  botao: { minHeight: touchTarget, justifyContent: 'center' },
  action: { color: theme.accent2, fontFamily: fonts.regular, fontSize: type.apoio },
});
