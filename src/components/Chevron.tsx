/** The arrow in the round month buttons. A drawn chevron rather than the
 *  "‹ ›" characters: in the app's typeface those sit on the text baseline,
 *  so in a circle they looked dropped (Ariel, 2026-11-04). */
export const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg className="chevron" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">
    <path d={dir === 'left' ? 'M14.5 5.5 8 12l6.5 6.5' : 'M9.5 5.5 16 12l-6.5 6.5'}
      fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
