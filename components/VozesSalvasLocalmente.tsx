import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppPressable from './AppPressable';
import { listarOperacoesVozLocais, sincronizarOperacoesVoz } from '@/lib/voice-operations';
import { contarFalasAguardandoConexao } from '@/lib/voz-pendente-na-lista';
import { tentarVozesPendentes, ultimoResumoDaFilaDeFalas, type ResumoFilaDeFalas } from '@/lib/widget-voz-task';
import { fonts, spacing, theme, touchTarget, type } from '@/lib/theme';
import { observarDadosDosWidgets } from '@/lib/widgets-home-events';
import { usePublicarFaixaTopo } from '@/lib/faixa-topo';

/**
 * O que a faixa diz. "Aguardando conexão" só quando a última tentativa de
 * fato ficou sem rede: até 26/09/2026 era o texto de sempre, e o autor viu a
 * faixa prometendo conexão com a internet ligada, enquanto a fala estava presa
 * por outro motivo. Sem tentativa ainda, a frase só diz o que é certo.
 */
function textoDaFaixa(pendencias: number, audios: number, resumo: ResumoFilaDeFalas | null): string {
  const plural = pendencias !== 1;
  if (audios > 0 && resumo?.motivo) {
    switch (resumo.motivo) {
      case 'sem_rede': return plural ? `${pendencias} lançamentos aguardando conexão` : '1 lançamento aguardando conexão';
      case 'demorou': return 'O serviço demorou a responder. A fala segue guardada';
      case 'sessao': return 'Renovando o acesso à conta. A fala segue guardada';
      default: return 'Não consegui processar a fala guardada';
    }
  }
  return plural ? `${pendencias} lançamentos guardados no aparelho` : '1 lançamento guardado no aparelho';
}

export default function VozesSalvasLocalmente() {
  const [itens, setItens] = useState<Awaited<ReturnType<typeof listarOperacoesVozLocais>>>([]);
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  /* Áudio gravado sem rede e ainda não transcrito: sem valor, então só conta. */
  const [audios, setAudios] = useState(0);
  const [resumoFala, setResumoFala] = useState<ResumoFilaDeFalas | null>(() => ultimoResumoDaFilaDeFalas());
  const insets = useSafeAreaInsets();
  const carregar = () => Promise.all([
    listarOperacoesVozLocais().then(setItens).catch((erro) => console.error('[voz] faixa não leu os lançamentos guardados', erro)),
    contarFalasAguardandoConexao().then(setAudios).catch((erro) => console.error('[voz] faixa não contou as falas guardadas', erro)),
  ]).then(() => setResumoFala(ultimoResumoDaFilaDeFalas()));
  useEffect(() => {
    void carregar();
    const remover = observarDadosDosWidgets(() => { void carregar(); });
    const evento = AppState.addEventListener('change', (estado) => { if (estado === 'active') void carregar(); });
    return () => { remover(); evento.remove(); };
  }, []);
  const pendencias = itens.length + audios;
  const faixaVisivel = pendencias > 0;
  usePublicarFaixaTopo(faixaVisivel);
  if (!faixaVisivel) return null;
  /* A faixa ocupa o inset superior antes da rota montar seu cabeçalho. A tela
     abaixo deixa de reservá-lo por meio de SafeAreaViewComFaixa; não há margem
     negativa nem compensação dependente do contêiner do Stack. */
  return <View style={[styles.container, { paddingTop: Math.max(12, insets.top + 8) }]}>
    <View style={styles.row}>
      {/* `polite` porque a frase muda sozinha ao fim da sincronização: sem região
          viva, quem usa leitor de tela toca em "Tentar sincronizar" e nunca fica
          sabendo no que deu. `alert` seria grosseiro para um aviso de fundo. */}
      <Text
        style={styles.text}
        numberOfLines={1}
        adjustsFontSizeToFit
        accessibilityLiveRegion="polite"
        accessibilityRole="text"
      >
        {mensagem ?? textoDaFaixa(pendencias, audios, resumoFala)}
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
            /* As duas filas: a das falas já entendidas e a dos áudios. Até
               26/09/2026 o toque só olhava a primeira, e com um áudio preso a
               faixa voltava igual, sem dizer nada. */
            const [resultado, fala] = await Promise.all([sincronizarOperacoesVoz(), tentarVozesPendentes()]);
            await carregar();
            if (resultado.falhas) setMensagem(resultado.mensagem ?? 'Não foi possível confirmar todos os lançamentos.');
            else if (fala.restantes !== 0) setMensagem(textoDaFaixa(Math.max(1, fala.restantes), Math.max(1, fala.restantes), fala));
          } catch (erro) {
            console.error('[voz] sincronização pela faixa falhou', erro);
            setMensagem('Não foi possível sincronizar agora. Tente novamente.');
          }
          finally { setOcupado(false); }
        }}
      >
        <Text style={styles.action}>{ocupado ? 'Sincronizando…' : 'Tentar sincronizar'}</Text>
      </AppPressable>
    </View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, minWidth: 0, color: theme.ink, fontFamily: fonts.regular, fontSize: type.apoio, lineHeight: Math.round(type.apoio * 1.4) },
  /* O alvo vive no PRESSÁVEL, não no texto: `paddingVertical: 8` num texto de
     15px dava ~36dp, abaixo dos 48dp do Android. `justifyContent` centraliza o
     rótulo dentro da altura mínima em vez de esticá-lo. */
  botao: { minHeight: touchTarget, flexShrink: 0, justifyContent: 'center', paddingHorizontal: spacing.sm },
  action: { color: theme.accent2, fontFamily: fonts.regular, fontSize: type.apoio },
});
