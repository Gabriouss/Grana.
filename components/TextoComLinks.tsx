import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Platform, Text, type TextStyle } from 'react-native';

/**
 * Lê `[rótulo](destino)` dentro de uma string e renderiza os links de
 * verdade, tocáveis, inline com o resto do texto. `destino` começando com
 * "/" navega dentro do app; qualquer outra coisa (mailto:, https:) abre por
 * Linking. Compartilhado entre as telas legais (Termos, Privacidade,
 * Exclusão de dados — ver lib/legal-content.ts) e o consentimento no
 * cadastro, que precisa do mesmo link inline ("Termos de Uso") sem duplicar
 * o parser.
 *
 * ── Por que existe `href` aqui, e não só `onPress` ─────────────────────────
 *
 * `<Text onPress>` sozinho vira um `<span>` na web: sem `href`, sem foco de
 * teclado, sem anúncio de link e sem abrir em outra aba. Medido na tela de
 * cadastro antes desta correção, "Termos de Uso" era um `SPAN` sem `href` e
 * sem `tabindex`, e a página inteira não tinha uma âncora sequer. Numa tela
 * que pede aceite de contrato de produto pago, ler o contrato antes de
 * aceitar precisa funcionar pelo teclado.
 *
 * O `href` é passado só na web, onde o react-native-web o transforma numa
 * tag `<a>` de verdade. No nativo a prop não é lida e quem navega continua
 * sendo o `onPress`.
 */
export default function TextoComLinks({ texto, style, linkStyle }: { texto: string; style?: TextStyle; linkStyle: TextStyle }) {
  const router = useRouter();
  const partes = texto.split(/(\[[^\]]+\]\([^)]+\))/g);

  return (
    <Text style={style}>
      {partes.map((parte, i) => {
        const m = parte.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (!m) return parte;
        const [, rotulo, destino] = m;
        const ehInterno = destino.startsWith('/');
        /* Link externo abre em outra aba, com `noreferrer` porque a página de
           destino não precisa saber de onde veio. */
        const atributosWeb = Platform.OS === 'web'
          ? { href: destino, ...(ehInterno ? null : { hrefAttrs: { target: '_blank', rel: 'noreferrer' } }) }
          : null;
        return (
          <Text
            key={i}
            style={linkStyle}
            accessibilityRole="link"
            {...(atributosWeb as any)}
            onPress={(evento) => {
              /* O consentimento do cadastro é um controle pressionável e estes
                 links moram dentro dele. Sem cortar a propagação, tocar em
                 "Termos de Uso" também marcaria a caixa de aceite. */
              (evento as unknown as { stopPropagation?: () => void })?.stopPropagation?.();
              if (destino.startsWith('/')) {
                /* Na web o `href` já levaria ao destino, mas com recarga
                   completa da página. Cancelar o salto e entregar ao roteador
                   mantém a navegação do lado do cliente, sem perder o link
                   real que o teclado e o leitor de tela precisam. */
                (evento as unknown as { preventDefault?: () => void })?.preventDefault?.();
                router.push(destino as never);
              } else if (Platform.OS !== 'web') {
                void Linking.openURL(destino);
              }
            }}
          >
            {rotulo}
          </Text>
        );
      })}
    </Text>
  );
}
