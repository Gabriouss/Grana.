import { createElement, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useJanela } from '@/lib/janela-hidratavel';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, radius, spacing, theme, type } from '@/lib/theme';
import AppPressable from '@/components/AppPressable';
import { ROTA_TESTE } from '@/lib/modo-teste';

/**
 * Teste interativo da landing (autor, 21/10/2026), no lugar do carrossel de telas:
 * "um modelo de testagem gratuito interativo para o usuário interagir do nosso
 * aplicativo de verdade, onde o usuário consegue simular lançamentos".
 *
 * Dentro do celular roda o app real em `/experimentar` (lib/modo-teste.ts), num
 * `iframe` do mesmo domínio: conta fictícia, sem login, sem rede. O app só
 * carrega quando a pessoa toca em "Testar agora", para a landing não baixar o app
 * inteiro de quem só está rolando.
 *
 * O teste roda SEMPRE dentro do celular da página: nada de aba nova, tela cheia
 * ou camada por cima (autor, 22/10/2026: "É proibido que o usuário seja
 * redirecionado para outra janela que não seja o checkout da cakto"). Até então
 * o celular e o link "Abrir em tela cheia" abriam `/experimentar` numa aba nova;
 * a camada por cima que veio depois também foi recusada, porque tirar a pessoa
 * da rolagem faz ela perder o interesse no resto da página. Para o app caber
 * usável no celular, ali o aparelho ocupa quase toda a largura, sem escala: o
 * app vê a largura real da tela desenhada e usa o próprio layout de celular.
 *
 * O `sandbox` do iframe é a trava do que roda lá dentro: sem `allow-popups` nem
 * `allow-top-navigation`, nenhum link do app (resposta do Granabô, PDF, link
 * externo) consegue abrir outra janela nem levar a landing para outro endereço.
 *
 * Ao lado, o Granabô guia os passos. O passo de salvar se marca sozinho: o teste
 * avisa a página por `postMessage` quando um lançamento entra (lib/lancamentos-teste.ts).
 */
const LARGURA_APP = 390;
const ALTURA_APP = 844;
// Celular da página no telefone: perto das bordas laterais, sem encostar.
const FOLGA_LATERAL_COMPACTA = 12;
const BEZEL_COMPACTO = 8;
export const PIX_DE_TESTE = 'Você pagou um Pix de R$ 45,90 ao Mercado Pão de Açúcar hoje.';
export const MENSAGEM_LANCAMENTO_TESTE = 'grana-teste:lancamento';

const PASSOS = [
  'Toque em "Colar comprovante", na Início.',
  'Cole o Pix de teste e toque em "Reconhecer dados".',
  'Confira e salve. O Livre para gastar muda na hora.',
];

export default function TesteInterativo({ compacto = false, cabecalho }: { compacto?: boolean; cabecalho?: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [lancou, setLancou] = useState(false);
  const janela = useJanela();
  const bezel = compacto ? BEZEL_COMPACTO : Math.max(10, 300 * 0.045);
  const largura = compacto ? Math.round(janela.width - FOLGA_LATERAL_COMPACTA * 2 - bezel * 2) : 300;
  // No telefone o aparelho inteiro cabe na altura da janela, para a pessoa ver onde ele começa e termina.
  const altura = compacto
    ? Math.round(Math.min(largura * (ALTURA_APP / LARGURA_APP), janela.height - bezel * 2 - spacing.xxl * 2))
    : Math.round(ALTURA_APP * (largura / LARGURA_APP));
  // No desktop o app roda no tamanho de um celular e encolhe; no telefone, sem escala.
  const escala = compacto ? 1 : largura / LARGURA_APP;
  const larguraApp = compacto ? largura : LARGURA_APP;
  const alturaApp = compacto ? altura : ALTURA_APP;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ouvir = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data === MENSAGEM_LANCAMENTO_TESTE) setLancou(true);
    };
    window.addEventListener('message', ouvir);
    return () => window.removeEventListener('message', ouvir);
  }, []);

  function copiarPix() {
    navigator.clipboard?.writeText(PIX_DE_TESTE).then(() => setCopiado(true), () => setCopiado(false));
  }

  function testar() {
    setAberto(true);
  }

  return (
    <View style={[styles.raiz, compacto && styles.raizCompacta]}>
      <View style={[styles.celular, { width: largura + bezel * 2, height: altura + bezel * 2, padding: bezel, borderRadius: compacto ? 44 : largura * 0.16 }]}>
        <View style={[styles.tela, { width: largura, height: altura, borderRadius: compacto ? 36 : largura * 0.11 }]}>
          {aberto ? (
            createElement('iframe', {
              src: ROTA_TESTE,
              title: 'Teste do aplicativo Grana.',
              sandbox: 'allow-scripts allow-same-origin allow-forms allow-modals',
              style: {
                border: 0, width: larguraApp, height: alturaApp, flexShrink: 0,
                transform: `scale(${escala})`, transformOrigin: 'top left', display: 'block',
              },
            })
          ) : (
            <View style={styles.capa}>
              <Image source={require('../assets/granabo/granabo-saudacao.webp')} style={styles.capaGranabo} accessibilityIgnoresInvertColors />
              <Text style={styles.capaTitulo}>O app de verdade, aqui na página.</Text>
              <Text style={styles.capaTexto}>Sem cadastro. Lance, edite e veja o mês mudar.</Text>
              <AppPressable onPress={testar} accessibilityRole="button" style={({ hovered }) => [styles.botao, hovered && styles.botaoHover]}>
                <Text style={styles.botaoTexto}>Testar agora</Text>
              </AppPressable>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.guia, compacto && styles.guiaCompacto]}>
        {cabecalho}
        <View style={[styles.guiaTopo, compacto && styles.guiaTopoCompacto]}>
          <Image source={require('../assets/granabo/granabo-feliz.png')} style={styles.guiaGranabo} accessibilityIgnoresInvertColors />
          <Text style={[styles.guiaFala, compacto && styles.centro]} aria-live="polite">
            {lancou ? 'Viu? Lançou, e o Livre para gastar já mudou. É assim todo dia.' : 'Bora testar? Eu te mostro o caminho.'}
          </Text>
        </View>
        {PASSOS.map((passo, i) => {
          const feito = lancou;
          return (
            <View key={passo} style={[styles.passo, compacto && styles.passoCompacto]}>
              <View style={[styles.passoNumero, feito && styles.passoFeito]}>
                {feito ? <Ionicons name="checkmark" size={14} color={theme.paper} /> : <Text style={styles.passoNumeroTexto}>{i + 1}</Text>}
              </View>
              <Text style={[styles.passoTexto, compacto && styles.passoTextoCompacto]}>{passo}</Text>
            </View>
          );
        })}
        <AppPressable onPress={copiarPix} accessibilityRole="button" style={({ hovered }) => [styles.copiar, compacto && styles.meio, hovered && styles.botaoHover]}>
          <Ionicons name={copiado ? 'checkmark' : 'copy-outline'} size={16} color={theme.accent2} />
          <Text style={styles.copiarTexto}>{copiado ? 'Pix de teste copiado' : 'Copiar Pix de teste'}</Text>
        </AppPressable>
        <Text style={[styles.nota, compacto && styles.centro]}>O que você lança aqui fica só neste navegador e some ao fechar.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Texto e guia à esquerda, celular à direita: os dois cabem numa dobra de 900 px de altura.
  raiz: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xxl, justifyContent: 'center' },
  raizCompacta: { flexDirection: 'column-reverse', gap: spacing.lg },
  celular: { backgroundColor: theme.mockupTela, borderWidth: 1, borderColor: theme.ruleStrong },
  tela: { overflow: 'hidden', backgroundColor: theme.paper },
  capa: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
  capaGranabo: { width: 120, height: 120, marginBottom: spacing.sm },
  capaTitulo: { color: theme.ink, fontFamily: fonts.regular, fontSize: type.destaque, textAlign: 'center' },
  capaTexto: { color: theme.inkSoft, fontFamily: fonts.light, fontSize: type.nota, textAlign: 'center', marginBottom: spacing.sm },
  botao: { minHeight: 44, paddingHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: theme.accent2, alignItems: 'center', justifyContent: 'center' },
  botaoHover: { opacity: 0.88 },
  botaoTexto: { color: theme.paper, fontFamily: fonts.regular, fontSize: type.apoio },
  guia: { width: 460, maxWidth: '100%', gap: spacing.md },
  guiaCompacto: { width: '100%', alignItems: 'center' },
  // Web no celular: guia todo centralizado (autor, 21/10/2026).
  guiaTopoCompacto: { flexDirection: 'column', alignSelf: 'stretch' },
  // No celular, cada passo vira um bloco da mesma largura, número à esquerda na linha do texto.
  passoCompacto: { alignItems: 'center', alignSelf: 'center', width: '100%', maxWidth: 540, padding: spacing.md, borderRadius: radius.md, backgroundColor: theme.paperRaised, borderWidth: 1, borderColor: theme.rule },
  passoTextoCompacto: { textAlign: 'left' },
  centro: { textAlign: 'center' },
  meio: { alignSelf: 'center' },
  guiaTopo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  guiaGranabo: { width: 56, height: 56 },
  guiaFala: { flex: 1, color: theme.ink, fontFamily: fonts.light, fontSize: type.apoio, lineHeight: 22, padding: spacing.md, borderRadius: radius.md, backgroundColor: theme.paperRaised, borderWidth: 1, borderColor: theme.ruleStrong, ...({ textWrap: 'balance' } as any) },
  passo: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  passoNumero: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: theme.accent2, alignItems: 'center', justifyContent: 'center' },
  passoFeito: { backgroundColor: theme.accent2 },
  passoNumeroTexto: { color: theme.accent2, fontFamily: fonts.regular, fontSize: type.micro },
  passoTexto: { flex: 1, color: theme.inkSoft, fontFamily: fonts.light, fontSize: type.nota, lineHeight: 21, ...({ textWrap: 'balance' } as any) },
  copiar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.ruleStrong },
  copiarTexto: { color: theme.accent2, fontFamily: fonts.regular, fontSize: type.nota },
  nota: { color: theme.inkSoft, fontFamily: fonts.light, fontSize: type.micro, ...({ textWrap: 'balance' } as any) },
});
