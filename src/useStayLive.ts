import { useEffect, type RefObject } from 'react';

/**
 * Keep an element out of another layer's `inert` while `active`.
 *
 * useModalFocus makes everything outside an open panel inert, so a screen
 * reader and a click cannot reach the page behind it. The guide's "Show me"
 * opens the menu on purpose and must stay usable beside it — its bubble, its
 * bar on a phone and its panel on a wide screen.
 *
 * useModalFocus sets the `inert` PROPERTY, so an own property on the element
 * that ignores the write keeps it live without a moment of deadness; the
 * observer catches anyone who sets the attribute instead. Removing the own
 * property afterwards hands the element back to the browser's own `inert`.
 */
export function useStayLive(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    el.removeAttribute('inert');
    Object.defineProperty(el, 'inert', { configurable: true, get: () => false, set: () => {} });
    const watch = typeof MutationObserver === 'undefined' ? null
      : new MutationObserver(() => { if (el.hasAttribute('inert')) el.removeAttribute('inert'); });
    watch?.observe(el, { attributes: true, attributeFilter: ['inert'] });
    return () => {
      watch?.disconnect();
      delete (el as { inert?: boolean }).inert;
    };
  }, [ref, active]);
}
