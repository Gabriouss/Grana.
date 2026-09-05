import { useEffect, useRef, type PropsWithChildren } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useIsFocused } from 'expo-router';
import { UI_OUT, useReducedMotion } from '@/lib/motion';

/**
 * Entrada direcional curta da cena ao trocar de aba.
 *
 * Por que existe: a troca de abas era corte seco — a tela nova simplesmente
 * substituía a anterior, sem nada dizendo de onde ela veio. Uma entrada curta
 * na direção do movimento dá à navegação um senso de lugar: ir pra direita na
 * barra traz a tela da direita.
 *
 * Três restrições que moldaram o desenho:
 *
 * 1. **A barra não se move.** Ela é o ponto fixo do app; animá-la junto faria
 *    a âncora escorregar. Só a cena entra.
 * 2. **A navegação não espera.** A troca de rota acontece na hora; isto é uma
 *    camada visual por cima. Nenhum toque fica bloqueado por 180ms.
 * 3. **Não toca no alvo do blur.** Este wrapper mora DENTRO do
 *    `TabBlurTarget`, como filho — a árvore que a barra amostra continua
 *    exatamente a mesma.
 *
 * 8dp e 180ms de propósito: troca de aba é ação de dezenas de vezes por dia,
 * e nessa frequência o movimento tem que ser quase imperceptível. Deslocamento
 * grande aqui viraria enjoo na terceira troca.
 */

/** Deslocamento lateral da entrada. Curto por ser interação frequente. */
const DESLOCAMENTO = 8;
const DURACAO = 180;
const CURVA = Easing.bezier(...UI_OUT);

/* Última aba visitada, compartilhada entre as instâncias do wrapper (uma por
   tela). É o que permite saber a DIREÇÃO: sem comparar com a anterior, a cena
   só sabe que foi focada, não se veio da esquerda ou da direita. */
let ultimoIndice = 0;

export default function CenaAnimada({ indice, children }: PropsWithChildren<{ indice: number }>) {
  const focada = useIsFocused();
  const reduzirMovimento = useReducedMotion();
  const progresso = useRef(new Animated.Value(1)).current;
  const deslocamento = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!focada) return;

    const veioDaEsquerda = indice > ultimoIndice;
    const mesmaAba = indice === ultimoIndice;
    ultimoIndice = indice;

    /* Primeira montagem (ou retorno à mesma aba) não é uma troca: animar aqui
       faria a tela inicial do app entrar deslizando sem que ninguém tenha
       navegado. */
    if (mesmaAba) return;

    if (reduzirMovimento) {
      /* Movimento reduzido não é ausência de transição: o fade continua
         ajudando a perceber que a tela mudou, só sem deslocamento. */
      deslocamento.setValue(0);
      progresso.setValue(0);
      Animated.timing(progresso, {
        toValue: 1, duration: 120, easing: CURVA, useNativeDriver: true,
      }).start();
      return;
    }

    progresso.setValue(0);
    deslocamento.setValue(veioDaEsquerda ? DESLOCAMENTO : -DESLOCAMENTO);
    Animated.parallel([
      Animated.timing(progresso, { toValue: 1, duration: DURACAO, easing: CURVA, useNativeDriver: true }),
      Animated.timing(deslocamento, { toValue: 0, duration: DURACAO, easing: CURVA, useNativeDriver: true }),
    ]).start();
  }, [focada, indice, progresso, deslocamento, reduzirMovimento]);

  return (
    <Animated.View
      style={[
        styles.cena,
        { opacity: progresso, transform: [{ translateX: deslocamento }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cena: { flex: 1 },
});
