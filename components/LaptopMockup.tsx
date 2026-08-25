import { View } from 'react-native';
import { theme, radius, spacing } from '@/lib/theme';

type Props = {
  /** Altura da "tela". Vem calculada de fora porque depende da altura da
      dobra, que depende da janela — um valor fixo deixava o card pequeno
      demais pra ancorar uma dobra de 1080px e alto demais numa janela baixa. */
  alturaTela?: number;
  children: React.ReactNode;
};

/**
 * A tela do herói-storytelling da landing page — cada capítulo mostra seu
 * próprio mock (voz, WhatsApp, nota fiscal, Livre para Gastar) flutuando
 * sem moldura de dispositivo nenhuma, só sombra e borda, no mesmo espírito
 * de como a Linear expõe telas reais do produto na própria landing page:
 * sem chrome de navegador, sem bezel, a tela "flutua" direto no fundo. Uma
 * versão anterior deste componente desenhava uma barra de navegador
 * (pontinhos + pílula de URL) por cima — removida de propósito depois que o
 * usuário apontou essa referência como direção preferida.
 */
export default function LaptopMockup({ alturaTela, children }: Props) {
  return <View style={[styleTela, alturaTela !== undefined && { minHeight: alturaTela }]}>{children}</View>;
}

/* Mesmo raciocínio de `sombraHero` em app/index.tsx — boxShadow é CSS puro,
   sem tipo em ViewStyle, e este componente só é usado dentro da landing
   page, que já é web-only. */
const sombra = { boxShadow: '0 32px 80px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(174,255,227,0.07)' } as any;

const styleTela = {
  backgroundColor: theme.paperRaised,
  borderRadius: radius.xl,
  borderWidth: 1,
  borderColor: theme.ruleStrong,
  padding: spacing.xl,
  justifyContent: 'center',
  ...sombra,
} as const;
