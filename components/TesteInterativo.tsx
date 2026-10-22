import { createElement, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
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
 * inteiro de quem só está rolando. No celular, o teste abre em tela cheia, porque
 * um app encolhido dentro de outra tela pequena não dá para usar.
 *
 * Ao lado, o Granabô guia os passos. O passo de salvar se marca sozinho: o teste
 * avisa a página por `postMessage` quando um lançamento entra (lib/lancamentos-teste.ts).
 */
const LARGURA_APP = 390;
const ALTURA_APP = 844;
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
  const largura = compacto ? 250 : 300;
  const escala = largura / LARGURA_APP;
  const altura = Math.round(ALTURA_APP * escala);
  const bezel = Math.max(10, largura * 0.045);

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
    if (compacto) window.open(ROTA_TESTE, '_blank', 'noopener');
    else setAberto(true);
  }

  return (
    <View style={[styles.raiz, compacto && styles.raizCompacta]}>
      <View style={[styles.celular, { width: largura + bezel * 2, height: altura + bezel * 2, padding: bezel, borderRadius: largura * 0.16 }]}>
        <View style={[styles.tela, { width: largura, height: altura, borderRadius: largura * 0.11 }]}>
          {aberto ? (
            createElement('iframe', {
              src: ROTA_TESTE,
              title: 'Teste do aplicativo Grana.',
              style: {
                border: 0, width: LARGURA_APP, height: ALTURA_APP, flexShrink: 0,
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
        <AppPressable href={ROTA_TESTE} target="_blank" rel="noopener" accessibilityRole="link" style={[styles.telaCheia, compacto && styles.meio]}>
          <Ionicons name="expand-outline" size={15} color={theme.inkSoft} />
          <Text style={styles.telaCheiaTexto}>Abrir em tela cheia</Text>
        </AppPressable>
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
  passoCompacto: { flexDirection: 'column', alignItems: 'center', gap: spacing.xs },
  passoTextoCompacto: { flex: 0, textAlign: 'center' },
  centro: { textAlign: 'center' },
  meio: { alignSelf: 'center' },
  guiaTopo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  guiaGranabo: { width: 56, height: 56 },
  guiaFala: { flex: 1, color: theme.ink, fontFamily: fonts.light, fontSize: type.apoio, lineHeight: 22, padding: spacing.md, borderRadius: radius.md, backgroundColor: theme.paperRaised, borderWidth: 1, borderColor: theme.ruleStrong },
  passo: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  passoNumero: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: theme.accent2, alignItems: 'center', justifyContent: 'center' },
  passoFeito: { backgroundColor: theme.accent2 },
  passoNumeroTexto: { color: theme.accent2, fontFamily: fonts.regular, fontSize: type.micro },
  passoTexto: { flex: 1, color: theme.inkSoft, fontFamily: fonts.light, fontSize: type.nota, lineHeight: 21 },
  copiar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.ruleStrong },
  copiarTexto: { color: theme.accent2, fontFamily: fonts.regular, fontSize: type.nota },
  nota: { color: theme.inkSoft, fontFamily: fonts.light, fontSize: type.micro },
  telaCheia: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', minHeight: 32 },
  telaCheiaTexto: { color: theme.inkSoft, fontFamily: fonts.light, fontSize: type.nota, textDecorationLine: 'underline' },
});
