import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Real-modal behavior for panels and overlays (UX review, P2):
 *  - focus moves to the panel's first control when it opens,
 *  - Tab / Shift+Tab cycle INSIDE the panel (background isn't tabbable),
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
  // Keep the latest onClose without re-running the effect on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const opener = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const focusables = () =>
      [...container.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);

    // Move focus into the panel (next tick, after it has rendered/positioned).
    const t = setTimeout(() => {
      if (!container.contains(document.activeElement)) focusables()[0]?.focus();
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
      opener?.focus();
    };
  }, [active, containerRef]);
}
