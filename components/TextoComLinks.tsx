import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Text, type TextStyle } from 'react-native';

/**
 * Lê `[rótulo](destino)` dentro de uma string e renderiza os links de
 * verdade, tocáveis, inline com o resto do texto. `destino` começando com
 * "/" navega dentro do app; qualquer outra coisa (mailto:, https:) abre por
 * Linking. Compartilhado entre as telas legais (Termos, Privacidade,
 * Exclusão de dados — ver lib/legal-content.ts) e o consentimento no
 * cadastro, que precisa do mesmo link inline ("Termos de Uso") sem duplicar
 * o parser.
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
        return (
          <Text
            key={i}
            style={linkStyle}
            onPress={() => {
              if (destino.startsWith('/')) router.push(destino as never);
              else void Linking.openURL(destino);
            }}
          >
            {rotulo}
          </Text>
        );
      })}
    </Text>
  );
}
