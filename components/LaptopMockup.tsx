import { Text, View } from 'react-native';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';

type Props = {
  /** Desliga a moldura de notebook (barra de navegador + pontinhos) — usada
      no celular, onde a pessoa já está olhando isso no próprio aparelho, e
      uma ilustração de notebook é uma referência deslocada que só rouba
      largura de tela que já é escassa. Sem a moldura, sobra só o cartão com
      a tela em si, na largura toda da coluna. Padrão `true`. */
  moldura?: boolean;
  /** Altura da "tela" dentro da moldura. Vem calculada de fora porque
      depende da altura da dobra, que depende da janela — um valor fixo
      deixava o notebook pequeno demais pra ancorar uma dobra de 1080px e
      alto demais numa janela baixa. */
  alturaTela?: number;
  children: React.ReactNode;
};

/**
 * A moldura de notebook do herói-storytelling da landing page — janela de
 * navegador (pontinhos + pílula de URL) por cima de uma "tela" onde cada
 * capítulo mostra seu próprio mock (voz, WhatsApp, nota fiscal, Livre para
 * Gastar). Puramente decorativo: quem controla QUAL tela aparece é quem usa
 * este componente, passando o conteúdo do capítulo ativo como `children`.
 */
export default function LaptopMockup({ moldura = true, alturaTela, children }: Props) {
  if (!moldura) {
    return <View style={styleTelaSemMoldura}>{children}</View>;
  }

  return (
    <View style={styleNotebook}>
      <View style={styleBarra}>
        <View style={stylePontinhos}>
          <View style={stylePontinho} />
          <View style={stylePontinho} />
          <View style={stylePontinho} />
        </View>
        <View style={stylePilula}>
          <Text style={styleTextoPilula}>granaponto.com.br</Text>
        </View>
      </View>
      <View style={[styleTela, alturaTela !== undefined && { height: alturaTela }]}>{children}</View>
    </View>
  );
}

/* Mesmo raciocínio de `sombraHero` em app/index.tsx — boxShadow é CSS puro,
   sem tipo em ViewStyle, e este componente só é usado dentro da landing
   page, que já é web-only. */
const sombra = { boxShadow: '0 32px 80px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(174,255,227,0.07)' } as any;

const styleNotebook = {
  backgroundColor: theme.paperRaised,
  borderRadius: radius.xl,
  borderWidth: 1,
  borderColor: theme.ruleStrong,
  overflow: 'hidden',
  ...sombra,
} as const;

const styleBarra = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.md,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: theme.rule,
  backgroundColor: theme.paper,
} as const;

const stylePontinhos = { flexDirection: 'row', gap: 6 } as const;
const stylePontinho = { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.rule } as const;
const stylePilula = {
  flex: 1,
  alignItems: 'center',
  backgroundColor: theme.paperRaised,
  borderRadius: radius.pill,
  paddingVertical: 3,
} as const;
const styleTextoPilula = { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light };

const styleTela = { padding: spacing.xxl, minHeight: 360, justifyContent: 'center' } as const;

const styleTelaSemMoldura = {
  backgroundColor: theme.paperRaised,
  borderRadius: radius.xl,
  borderWidth: 1,
  borderColor: theme.ruleStrong,
  padding: spacing.xl,
  ...sombra,
} as const;
