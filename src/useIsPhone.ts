// ── useIsPhone — one answer to "is this a narrow screen?" ──────────────────
//
// Lived inside CustomV3, while Charts asked the same question by reading
// window.innerWidth once in its render body. A plain read has no way to hear
// about a change, so rotating a phone into landscape left category names on
// the bar axis cut at nine characters until something else happened to
// re-render the tab (finding 20). matchMedia can be subscribed to; innerWidth
// cannot.
//
// 640px is the app's phone breakpoint, the same one the mobile CSS overrides
// at the end of index.css use.

import { useEffect, useState } from 'react';

const PHONE_QUERY = '(max-width: 640px)';

/** matchMedia is missing in jsdom and in any non-browser render, so every use
 *  goes through here. Falling back to innerWidth keeps the answer right for
 *  the first paint; what is lost without matchMedia is only the subscription,
 *  and there is nothing to subscribe to in those environments anyway. */
function query(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(PHONE_QUERY);
}

function currentlyPhone(): boolean {
  const mq = query();
  if (mq) return mq.matches;
  return typeof window !== 'undefined' && window.innerWidth <= 640;
}

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(currentlyPhone);
  useEffect(() => {
    const mq = query();
    if (!mq) return;
    // Re-read on subscribe: the width can change between the initial render
    // and the effect, and the listener only fires on changes after that.
    setPhone(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPhone(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return phone;
}
