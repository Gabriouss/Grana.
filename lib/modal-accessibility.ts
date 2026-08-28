import { useEffect, type RefObject } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, type View } from 'react-native';

type EstadoIrmao = { elemento: HTMLElement; inert: boolean; ariaHidden: string | null };

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
    const alterados: EstadoIrmao[] = [];
    let removerEventos = () => {};

    const timer = setTimeout(() => {
      const painel = ref.current as unknown as HTMLElement | null;
      if (!painel || typeof painel.querySelectorAll !== 'function') return;

      let atual: HTMLElement | null = painel;
      while (atual?.parentElement) {
        for (const irmao of Array.from(atual.parentElement.children)) {
          if (irmao === atual || !(irmao instanceof HTMLElement)) continue;
          alterados.push({ elemento: irmao, inert: irmao.inert, ariaHidden: irmao.getAttribute('aria-hidden') });
          irmao.inert = true;
          irmao.setAttribute('aria-hidden', 'true');
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
    }, 0);

    return () => {
      clearTimeout(timer);
      removerEventos();
      for (const estado of alterados) {
        estado.elemento.inert = estado.inert;
        if (estado.ariaHidden === null) estado.elemento.removeAttribute('aria-hidden');
        else estado.elemento.setAttribute('aria-hidden', estado.ariaHidden);
      }
      focoAnterior?.focus?.();
    };
  }, [ativo, ref]);
}
