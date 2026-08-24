import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Platform, StyleSheet, View, type LayoutRectangle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { screenRhythm, theme, radius, spacing } from '@/lib/theme';
import { useBreakpoint } from '@/lib/breakpoints';

const ALTURA_ALCA = 26;

/* Folga que um cabeçalho abre à direita para a alça caber ao lado do controle
   dele. A conta: a alça começa a 16 da borda e tem ~32 de largura, então
   ocupa até 48 — a folga precisa passar disso com uma margem visível, ou o
   controle fica encostado nela. Com 52 sobravam 4px e o resultado parecia
   colado; 68 deixa 20px de respiro. */
export const ESPACO_ALCA = 68;

export type Widget = {
  chave: string;
  conteudo: ReactNode;
  /**
   * Distância do topo do bloco até a alça. O padrão alinha com a primeira
   * linha de texto DENTRO de um card, que começa depois do padding de 16.
   * Blocos que são seção (rótulo solto, sem moldura — "Cofrinhos & metas",
   * "Últimos lançamentos") têm o texto começando em y=0, e nesses a alça
   * precisa subir para ficar na mesma linha do rótulo em vez de flutuar
   * sobre o conteúdo abaixo dele.
   */
  alcaTopo?: number;
};

/**
 * Grade de widgets da Início: distribui os cards em colunas quando há largura
 * e, na web, deixa reordená-los arrastando.
 *
 * No celular (e em qualquer tamanho no app nativo) devolve a pilha vertical de
 * sempre, sem alça de arraste e sem View extra — o app publicado não muda.
 *
 * **Por que arrastar por uma alça, e não pelo card inteiro.** Os cards contêm
 * botões, chips de categoria e carrosséis horizontais. Se o card todo captasse
 * o gesto, arrastar competiria com rolar o carrossel e com tocar num botão, e
 * o resultado seria um card que às vezes se move quando você queria clicar. A
 * alça aparece no hover, no canto do card, e é a única região que inicia o
 * arraste.
 *
 * **Alternativa sem arrastar.** Arraste nunca é o único caminho: o botão
 * "Personalizar Início" continua reordenando pela lista. Isso não é zelo
 * extra — a WCAG 2.2 exige uma alternativa de ponteiro único para toda
 * operação de arrastar, e quem usa teclado ou tem dificuldade motora fina
 * depende dela.
 */
export default function WidgetGrid({
  widgets,
  onReordenar,
}: {
  widgets: Widget[];
  onReordenar: (chavesNaNovaOrdem: string[]) => void;
}) {
  const { colunas } = useBreakpoint();
  const podeArrastar = Platform.OS === 'web' && colunas > 1;

  const refs = useRef<Record<string, View | null>>({});
  const areas = useRef<Record<string, LayoutRectangle>>({});
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [sobreVoo, setSobreVoo] = useState<string | null>(null);

  /* Hover escutado direto no nó do DOM, não via Pressable.
     Motivo: vários cards JÁ são Pressable (o de faturas abre a tela de
     Crédito ao clicar). Um Pressable dentro de outro absorve o evento de
     hover e não o repassa ao pai, então a alça não aparecia exatamente nos
     cards clicáveis — que são a maioria. `mouseenter`/`mouseleave` ligados
     ao elemento não dependem de propagação nem de bubbling, então funcionam
     igual em card clicável e em card estático. */
  useEffect(() => {
    if (!podeArrastar) return;
    const limpezas: (() => void)[] = [];
    for (const w of widgets) {
      const node = refs.current[w.chave] as unknown as HTMLElement | null;
      if (!node || typeof node.addEventListener !== 'function') continue;
      const entrar = () => setSobreVoo(w.chave);
      const sair = () => setSobreVoo((atual) => (atual === w.chave ? null : atual));
      node.addEventListener('mouseenter', entrar);
      node.addEventListener('mouseleave', sair);
      limpezas.push(() => {
        node.removeEventListener('mouseenter', entrar);
        node.removeEventListener('mouseleave', sair);
      });
    }
    return () => limpezas.forEach((f) => f());
  }, [podeArrastar, widgets.map((w) => w.chave).join('|')]);

  /* Medido uma vez por arraste, e não a cada movimento: as posições não mudam
     enquanto o gesto acontece (nada reflui até soltar), então remedir a cada
     frame seria trabalho jogado fora no meio de uma animação. */
  function medirTudo(): Promise<void> {
    const pendentes = widgets.map(
      (w) =>
        new Promise<void>((resolve) => {
          const node = refs.current[w.chave];
          if (!node) return resolve();
          node.measureInWindow((x, y, width, height) => {
            areas.current[w.chave] = { x, y, width, height };
            resolve();
          });
        })
    );
    return Promise.all(pendentes).then(() => undefined);
  }

  function chaveSob(px: number, py: number): string | null {
    for (const [chave, r] of Object.entries(areas.current)) {
      if (px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height) return chave;
    }
    return null;
  }

  function criarResponder(chave: string) {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setArrastando(chave);
        medirTudo();
      },
      onPanResponderMove: (_e, gesto) => {
        setAlvo(chaveSob(gesto.moveX, gesto.moveY));
      },
      onPanResponderRelease: (_e, gesto) => {
        const destino = chaveSob(gesto.moveX, gesto.moveY);
        setArrastando(null);
        setAlvo(null);
        if (!destino || destino === chave) return;

        const ordem = widgets.map((w) => w.chave);
        const de = ordem.indexOf(chave);
        const para = ordem.indexOf(destino);
        if (de < 0 || para < 0) return;
        // Troca de verdade — só os dois índices envolvidos mudam. A versão
        // anterior (splice tira-e-insere) empurrava todo mundo entre os dois
        // pontos uma posição, então soltar o card 0 sobre o card 3 também
        // deslocava os cards 1 e 2, que não tinham nada a ver com o gesto.
        [ordem[de], ordem[para]] = [ordem[para], ordem[de]];
        onReordenar(ordem);
      },
      onPanResponderTerminate: () => {
        setArrastando(null);
        setAlvo(null);
      },
    });
  }

  const envolver = (w: Widget) => (
    <View
      key={w.chave}
      ref={(node) => {
        refs.current[w.chave] = node;
      }}
      style={[
        podeArrastar && styles.slot,
        arrastando === w.chave && styles.slotArrastando,
        alvo === w.chave && arrastando && arrastando !== w.chave && styles.slotAlvo,
      ]}
    >
      {w.conteudo}
      {podeArrastar && (sobreVoo === w.chave || arrastando === w.chave) && (
        <Alca responder={criarResponder(w.chave)} ativo={arrastando === w.chave} topo={w.alcaTopo} />
      )}
    </View>
  );

  if (colunas === 1) {
    return <>{widgets.map(envolver)}</>;
  }

  const baldes: Widget[][] = Array.from({ length: colunas }, () => []);
  widgets.forEach((w, i) => baldes[i % colunas].push(w));

  return (
    <View style={styles.linha}>
      {baldes.map((balde, i) => (
        <View key={i} style={styles.coluna}>
          {balde.map(envolver)}
        </View>
      ))}
    </View>
  );
}

function Alca({
  responder,
  ativo,
  topo = spacing.lg,
}: {
  responder: ReturnType<typeof PanResponder.create>;
  ativo: boolean;
  topo?: number;
}) {
  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Arrastar para reordenar. Também é possível reordenar em Personalizar Início."
      style={[styles.alca, { top: topo }, ativo && styles.alcaAtiva, { cursor: ativo ? 'grabbing' : 'grab' } as any]}
    >
      <Ionicons name="reorder-two-outline" size={16} color={ativo ? theme.paper : theme.inkFaint} />
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'flex-start', gap: screenRhythm.gap },
  /* flexBasis 0: colunas de largura igual mesmo com conteúdos de larguras
     naturais diferentes. Sem isso o flex reparte a sobra proporcionalmente ao
     conteúdo e as colunas saem desiguais. */
  coluna: { flex: 1, flexBasis: 0, minWidth: 0, gap: screenRhythm.gap },
  slot: { position: 'relative' },
  slotArrastando: { opacity: 0.45 },
  slotAlvo: {
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: theme.accent2,
    borderStyle: 'dashed',
  },
  alca: {
    position: 'absolute',
    /* Dentro do card, no canto superior direito. Os cabeçalhos que já tinham
       controle nesse canto abrem um recuo (ESPACO_ALCA) para a alça caber ao
       lado, em vez de por cima — foi assim que o "Ver todos", o "+ Definir" e
       o selo de nível pararam de ser cobertos. */
    right: spacing.lg,
    height: ALTURA_ALCA,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  alcaAtiva: { backgroundColor: theme.accent2, borderColor: theme.accent2 },
});
