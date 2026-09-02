import { useEffect, type RefObject } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, type View } from 'react-native';

/**
 * Isolamento por CONTAGEM, compartilhado entre todas as instâncias do hook.
 *
 * O bug que obrigou isto: dois modais podem se sobrepor. O menu do FAB abre e
 * marca ~34 elementos como `inert`; a pessoa escolhe "Boleto" e o sheet abre no
 * MESMO instante, antes de o menu terminar de sair. O hook do sheet então
 * fotografa esses elementos já inertes e guarda `inert: true` como "estado
 * anterior". Quando o sheet fecha, ele restaura fielmente o que fotografou, ou
 * seja, devolve `inert = true` — e a tela inteira fica morta, sem erro no
 * console, até um refresh.
 *
 * Snapshot por instância não resolve isso, porque cada instância enxerga o
 * estado que a outra criou. A saída é contar: o estado original é gravado
 * apenas por quem chega primeiro, e só é devolvido quando o último sai.
 */
type Registro = { usos: number; inert: boolean; ariaHidden: string | null };

const isolados = new WeakMap<HTMLElement, Registro>();

/**
 * Painéis de modal atualmente abertos, de QUALQUER instância do hook.
 *
 * O bug que isto resolve: um segundo modal aberto POR CIMA do primeiro (ex.:
 * o seletor de Categoria dentro do formulário de "Nova saída/entrada") vira
 * IRMÃO do painel do primeiro modal lá no topo da árvore (ambos acabam como
 * filhos diretos do body, um por `Modal` do React Native). A varredura do
 * primeiro modal marca "todo irmão até o body" como `inert` — e o portal do
 * segundo modal, que nasceu depois, cai nessa varredura como se fosse plateia
 * comum, não um diálogo ativo. Resultado: o segundo modal renderiza normal,
 * mas nenhum toque nele funciona (só `.click()` programático, que ignora
 * `inert`) — foi exatamente o sintoma reportado (seletor de categoria sem
 * resposta a toque). Consultar este registro antes de isolar qualquer
 * elemento garante que nenhum painel ativo, de nenhuma instância, seja
 * silenciado pela varredura de outra.
 */
const paineisAtivos = new Set<HTMLElement>();

function contemPainelAtivo(elemento: HTMLElement): boolean {
  if (paineisAtivos.has(elemento)) return true;
  for (const painel of paineisAtivos) {
    if (painel.isConnected && elemento.contains(painel)) return true;
  }
  return false;
}

function isolar(elemento: HTMLElement) {
  const registro = isolados.get(elemento);
  if (registro) {
    registro.usos++;
    return;
  }
  isolados.set(elemento, { usos: 1, inert: elemento.inert, ariaHidden: elemento.getAttribute('aria-hidden') });
  elemento.inert = true;
  elemento.setAttribute('aria-hidden', 'true');
}

function liberar(elemento: HTMLElement) {
  const registro = isolados.get(elemento);
  if (!registro) return;
  registro.usos--;
  if (registro.usos > 0) return;
  isolados.delete(elemento);
  elemento.inert = registro.inert;
  if (registro.ariaHidden === null) elemento.removeAttribute('aria-hidden');
  else elemento.setAttribute('aria-hidden', registro.ariaHidden);
}

/* ── Quem tinha o foco antes do diálogo ────────────────────────────────────
 *
 * O hook não pode simplesmente ler `document.activeElement` quando roda: um
 * campo com `autoFocus` dentro do modal é focado em `commitMount`, que
 * acontece ANTES de qualquer `useEffect`. Medido no modal "Recuperar senha":
 * o que o hook guardava como "foco anterior" era o campo de e-mail do próprio
 * modal, e na hora de devolver esse campo já tinha saído do documento, então
 * a devolução não acontecia e o foco ficava no `body`.
 *
 * A saída é acompanhar o foco continuamente e ignorar o que acontece dentro de
 * um diálogo. O último foco de FORA é o gatilho de verdade. */
let ultimoFocoExterno: HTMLElement | null = null;
let acompanhando = false;

export function acompanharFocoParaModais(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || acompanhando) return;
  acompanhando = true;
  document.addEventListener(
    'focusin',
    (evento) => {
      const alvo = evento.target as HTMLElement | null;
      if (!alvo || typeof alvo.closest !== 'function') return;
      if (alvo.closest('[role="dialog"]')) return;
      ultimoFocoExterno = alvo;
    },
    true
  );
}

/** O gatilho provável: o foco atual, se estiver fora de um diálogo; senão o
 *  último foco registrado fora. */
function focoDeOrigem(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const atual = document.activeElement as HTMLElement | null;
  if (atual && atual !== document.body && typeof atual.closest === 'function' && !atual.closest('[role="dialog"]')) {
    return atual;
  }
  return ultimoFocoExterno;
}

/**
 * Devolve o foco ao controle que abriu o modal.
 *
 * Duas precauções que a chamada direta não tinha:
 *
 * `preventScroll` porque `focus()` sem ele pede ao navegador que role até o
 * elemento, e o gatilho pode estar numa tela que rolou enquanto o modal
 * estava aberto. Rolar a página como efeito colateral de fechar um diálogo é
 * exatamente o tipo de salto que ninguém pediu.
 *
 * E um segundo quadro, porque fechar um modal é animado: a limpeza do efeito
 * roda quando `ativo` cai, mas o painel só sai do documento depois, e essa
 * remoção joga o foco para o `body`. Medido na tela de login, abrindo
 * "Esqueci minha senha" e fechando com Escape: o foco terminava em BODY
 * mesmo com a restauração já chamada. Repetir no quadro seguinte cobre o
 * caso sem depender de quando cada modal termina sua saída.
 */
function devolverFoco(alvo: HTMLElement | null) {
  if (!alvo || typeof alvo.focus !== 'function' || typeof document === 'undefined') return;

  /* A primeira tentativa é incondicional: neste instante o foco ainda está
     DENTRO do modal que está fechando, e trazê-lo de volta é justamente o
     trabalho. Uma versão anterior desta função checava "o foco está perdido?"
     já aqui, via que ele estava no painel, concluía que não havia nada a
     fazer e desistia. */
  if (alvo.isConnected) alvo.focus({ preventScroll: true });

  /* As tentativas seguintes só agem com o foco PERDIDO, para nunca roubá-lo de
     onde a pessoa, ou a tela seguinte, já o tenha posto. */
  const tentar = () => {
    if (!alvo.isConnected) return true;
    const atual = document.activeElement;
    if (atual && atual !== document.body) return true;
    alvo.focus({ preventScroll: true });
    return document.activeElement === alvo;
  };

  /* Insiste por alguns quadros porque o fechamento é animado: a limpeza do
     efeito roda quando `ativo` cai, e só depois o painel sai do documento,
     levando o foco para o `body` junto. Medido no login, com o gravador de
     eventos de foco: depois do Escape não vinha nenhum `focusout`, o painel
     era removido em silêncio e a restauração que já tinha rodado era desfeita.
     A janela cobre a saída do modal e para assim que o foco pousa. */
  let tentativas = 0;
  const timer = setInterval(() => {
    tentativas += 1;
    if (tentar() || tentativas >= 12) clearInterval(timer);
  }, 30);
}

/** Isola foco e leitura no modal e devolve o foco ao controle de origem. */
export function useModalAccessibility(ref: RefObject<View | null>, ativo = true) {
  useEffect(() => {
    if (!ativo) return;

    if (Platform.OS !== 'web') {
      const timer = setTimeout(() => {
        const alvo = findNodeHandle(ref.current);
        if (alvo) AccessibilityInfo.setAccessibilityFocus(alvo);
      }, 0);
      return () => clearTimeout(timer);
    }

    if (typeof document === 'undefined') return;
    const focoAnterior = focoDeOrigem();
    /* Só os elementos que ESTA instância isolou — é o que ela pode devolver. */
    const meus: HTMLElement[] = [];
    let removerEventos = () => {};
    let restaurado = false;

    /* Registro em `paineisAtivos` acontece AQUI, síncrono, na fase de commit
       do efeito — não dentro do `setTimeout` de varredura logo abaixo.
       Motivo: `Sheet.tsx`, `FabButton.tsx` e `AccessibleModalPanel` chamam
       este MESMO hook, cada instância com seu próprio `setTimeout(.., 0)`.
       Quando um modal abre por cima de outro (o seletor de Categoria sobre o
       formulário de "Nova saída", que por sua vez pode ter sido aberto pelo
       FAB), duas varreduras ficam na fila de macrotasks quase juntas — se o
       registro também esperasse o próprio `setTimeout`, a varredura de UMA
       instância podia rodar antes da OUTRA se registrar, e aí a proteção
       chegava tarde demais: exatamente o que deixava o seletor de categoria
       marcado `inert` por engano, sem nenhum toque nele funcionando (só
       `.click()` programático, que ignora `inert`). Registrando de forma
       síncrona aqui, o painel já está protegido antes de QUALQUER
       `setTimeout(0)` — o dele ou o de outra instância — ter chance de rodar. */
    const meuPainel = ref.current as unknown as HTMLElement | null;
    if (meuPainel) paineisAtivos.add(meuPainel);

    /* Idempotente: é chamada da limpeza normal do efeito e também da rede de
       segurança logo abaixo. */
    const restaurar = () => {
      if (restaurado) return;
      restaurado = true;
      for (const elemento of meus) liberar(elemento);
      if (meuPainel) paineisAtivos.delete(meuPainel);
    };

    /* Rede de segurança: solta tudo se o painel sair do documento.
     *
     * Este hook marca com `inert` TODO irmão de TODO nível até o body — vinte
     * e tantos elementos numa tela típica. `inert` bloqueia clique, foco e
     * leitor de tela, mas deixa o elemento visível e localizável por
     * `elementFromPoint`, então quando ele fica preso o sintoma é uma tela de
     * aparência perfeitamente normal onde nenhum botão responde, sem erro no
     * console e sem nada visível para explicar.
     *
     * A limpeza normal depende de `ativo` virar false. O FAB descobriu o caso
     * em que isso não acontece: o menu abre, a pessoa escolhe um item que
     * NAVEGA, e o desmonte do painel corre junto com uma animação de saída
     * cujo callback é quem baixaria a flag. Se o callback se perde, a flag
     * fica alta e a página seguinte nasce morta.
     *
     * Em vez de confiar que todo chamador acerte o ciclo de vida, o próprio
     * hook passa a observar: se o painel que justificava o isolamento não está
     * mais no documento, o isolamento não tem mais razão de existir. */
    const observador = new MutationObserver(() => {
      const painel = ref.current as unknown as HTMLElement | null;
      if (painel && document.contains(painel)) return;
      restaurar();
      observador.disconnect();
    });

    const timer = setTimeout(() => {
      const painel = ref.current as unknown as HTMLElement | null;
      if (!painel || typeof painel.querySelectorAll !== 'function') return;

      let atual: HTMLElement | null = painel;
      while (atual?.parentElement) {
        for (const irmao of Array.from(atual.parentElement.children)) {
          if (irmao === atual || !(irmao instanceof HTMLElement)) continue;
          if (contemPainelAtivo(irmao)) continue;
          isolar(irmao);
          meus.push(irmao);
        }
        atual = atual.parentElement;
        if (atual === document.body) break;
      }

      /* Rede de segurança adicional: nenhum ancestral do PRÓPRIO painel, até
         o body, pode continuar `inert` depois desta varredura — não importa
         quem o marcou. `contemPainelAtivo` acima cobre o caso comum (outra
         instância varrendo agora), mas não cobre um `inert` que já estava
         gravado ANTES desta instância sequer existir (o cenário original do
         comentário no topo do arquivo: um isolamento anterior fotografou
         `inert: true` como "estado prévio" de um nó que o React Native Web
         reaproveita entre modais, e devolveu esse `true` ao fechar). Limpar
         aqui não mexe no contador de `isolados` — só garante que o caminho
         até ESTE painel nunca fica bloqueado enquanto ele está com `ativo`. */
      let limpar: HTMLElement | null = painel;
      while (limpar && limpar !== document.body) {
        if (limpar.inert) limpar.inert = false;
        if (limpar.getAttribute('aria-hidden') === 'true') limpar.removeAttribute('aria-hidden');
        limpar = limpar.parentElement;
      }

      const focaveis = () =>
        Array.from(
          painel.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((elemento) => !elemento.hasAttribute('disabled') && elemento.getAttribute('aria-hidden') !== 'true');

      const primeiro = focaveis()[0] ?? painel;
      primeiro.focus?.();

      const aoTeclar = (evento: KeyboardEvent) => {
        if (evento.key !== 'Tab') return;
        const lista = focaveis();
        if (lista.length === 0) {
          evento.preventDefault();
          painel.focus?.();
          return;
        }
        const primeiroItem = lista[0];
        const ultimoItem = lista[lista.length - 1];
        if (evento.shiftKey && document.activeElement === primeiroItem) {
          evento.preventDefault();
          ultimoItem.focus();
        } else if (!evento.shiftKey && document.activeElement === ultimoItem) {
          evento.preventDefault();
          primeiroItem.focus();
        }
      };
      document.addEventListener('keydown', aoTeclar);
      removerEventos = () => document.removeEventListener('keydown', aoTeclar);

      /* Só observa depois de o painel existir e o isolamento estar aplicado —
         antes disso não há nada para desfazer. */
      observador.observe(document.body, { childList: true, subtree: true });
    }, 0);

    return () => {
      clearTimeout(timer);
      removerEventos();
      observador.disconnect();
      restaurar();
      devolverFoco(focoAnterior);
    };
  }, [ativo, ref]);
}
