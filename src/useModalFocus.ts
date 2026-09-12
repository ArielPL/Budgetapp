import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Real-modal behavior for panels and overlays (UX review, P2):
 *  - focus moves to the panel's first control when it opens,
 *  - Tab / Shift+Tab cycle INSIDE the panel (background isn't tabbable),
 *  - the page behind is `inert` (stress test §10) — the Tab trap alone kept
 *    KEYBOARDS out, but screen-reader virtual cursors walk the DOM, not the
 *    tab order, and could still read and click the background,
 *  - Escape closes it,
 *  - focus returns to the element that opened it.
 *
 * `active` gates everything so the hook can live in components that render
 * conditionally-open overlays (pass `true` when the component itself only
 * mounts while open).
 */
export function useModalFocus(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
): void {
  // Keep the latest onClose without re-running the main effect on every render.
  // Updated inside an effect (not during render) per the react-hooks/refs rule;
  // effects run before any user event can trigger the Escape handler.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const opener = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    // Inert everything EXCEPT the path to the panel: at each level from the
    // panel up to <body>, the panel's ancestors stay live and their siblings
    // go inert. (The panels render inline in the app tree, not in a portal,
    // so inerting #root wholesale would inert the panel too.) Only elements
    // WE inerted are restored — a nested modal's work is left alone.
    const setInert = (el: HTMLElement, v: boolean) => { el.inert = v; };
    const inerted: HTMLElement[] = [];
    let node: HTMLElement = container;
    while (node.parentElement && node !== document.body) {
      const parent: HTMLElement = node.parentElement;
      for (const sib of Array.from(parent.children)) {
        if (sib !== node && sib instanceof HTMLElement && !sib.inert) {
          setInert(sib, true);
          inerted.push(sib);
        }
      }
      node = parent;
    }

    const focusables = () =>
      [...container.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);

    // Move focus into the panel (next tick, after it has rendered/positioned).
    //
    // A panel that opts in with tabIndex={-1} is focused ITSELF rather than its
    // first control. That matters for a panel which is mostly text: focusing a
    // button below the fold makes the browser scroll it into view, so the panel
    // opens halfway down its own content and the reader misses the beginning.
    // Focusing the dialog leaves it scrolled to the top, still announces it as a
    // dialog, and Tab reaches the controls from there as usual.
    const t = setTimeout(() => {
      if (container.contains(document.activeElement)) return;
      const target = container.hasAttribute('tabindex') ? container : focusables()[0];
      target?.focus();
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      const current = document.activeElement;
      const inside = container.contains(current);
      if (e.shiftKey) {
        if (!inside || current === first) { e.preventDefault(); last.focus(); }
      } else {
        if (!inside || current === last) { e.preventDefault(); first.focus(); }
      }
    };

    // Capture phase so the trap wins over page-level shortcuts.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKeyDown, true);
      // Restore the background BEFORE focus returns — an inert opener ignores
      // .focus(). Runs on unmount too, so a panel that disappears without a
      // clean close can't leave the page dead.
      for (const el of inerted) setInert(el, false);
      opener?.focus();
    };
  }, [active, containerRef]);
}
