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
    const focoAnterior = document.activeElement as HTMLElement | null;
    /* Só os elementos que ESTA instância isolou — é o que ela pode devolver. */
    const meus: HTMLElement[] = [];
    let removerEventos = () => {};
    let restaurado = false;

    /* Idempotente: é chamada da limpeza normal do efeito e também da rede de
       segurança logo abaixo. */
    const restaurar = () => {
      if (restaurado) return;
      restaurado = true;
      for (const elemento of meus) liberar(elemento);
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
          isolar(irmao);
          meus.push(irmao);
        }
        atual = atual.parentElement;
        if (atual === document.body) break;
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
      focoAnterior?.focus?.();
    };
  }, [ativo, ref]);
}
