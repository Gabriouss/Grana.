import { createElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { radius, theme } from '@/lib/theme';

/** Um retângulo de uma captura REAL do app, em pixels da imagem original. */
export type Recorte = {
  /** Caminho público da captura, com o `?v=` que invalida o cache de `/telas/`. */
  src: string;
  /** Largura e altura em pixels do arquivo inteiro. */
  largura: number;
  altura: number;
  /** O retângulo que aparece, em pixels do arquivo. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** O que o recorte mostra, dito em palavras. */
  alt: string;
};

/**
 * Mostra só um pedaço de uma captura real do app.
 *
 * Existe porque os mini-mocks desenhados à mão da landing se afastaram do
 * produto. Em 13/09/2026 o autor apontou quatro deles, um por um ("não está
 * condizente com a tela real de desafios", "isso aqui também não está
 * condizente com a realidade", "também não", "não dá nem pra entender que é
 * algo para a tela do celular"). A tela real de Desafios mostra o Score num
 * círculo com faixa e nome de nível; o mock desenhava uma barra horizontal. Um
 * recorte da captura não tem como discordar do app: é o app.
 *
 * O enquadramento é proporção pura, sem medir nada. A moldura tem a proporção
 * do retângulo (`w / h`), e a imagem inteira é escalada e deslocada em
 * porcentagem da moldura:
 *
 *   largura da imagem = largura / w   (em % da largura da moldura)
 *   altura da imagem  = altura / h    (em % da altura da moldura)
 *   deslocamento      = -x / w e -y / h
 *
 * Em CSS, `left` e `width` em % se referem à largura do contêiner e `top` e
 * `height` à altura, então as quatro contas batem em qualquer tamanho de
 * moldura, sem `onLayout` e sem medida copiada à mão.
 *
 * Todos os recortes da landing usam a mesma proporção (1,6) de propósito: é o
 * que mantém os títulos dos cards alinhados na mesma linha de base.
 */
export default function RecorteTela({ recorte }: { recorte: Recorte }) {
  const { src, largura, altura, x, y, w, h, alt } = recorte;
  return (
    <View style={[styles.moldura, { aspectRatio: w / h }]}>
      {createElement('img', {
        src,
        alt,
        loading: 'lazy',
        decoding: 'async',
        draggable: false,
        style: {
          position: 'absolute',
          width: `${(largura / w) * 100}%`,
          height: `${(altura / h) * 100}%`,
          left: `${(-x / w) * 100}%`,
          top: `${(-y / h) * 100}%`,
          /* Sem isto, uma regra global de `img { max-width: 100% }` encolheria
             a imagem ampliada de volta ao tamanho da moldura e desfaria o
             recorte inteiro. */
          maxWidth: 'none',
          userSelect: 'none',
        },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  moldura: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paper,
  },
});
