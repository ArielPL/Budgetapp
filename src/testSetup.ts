import { configure } from '@testing-library/react';

// ── Time budgets for a busy machine (2026-10-27) ───────────────────────────
//
// Under load, a whole-suite run failed up to ten different tests, a different
// set each time, and every one passed on its own. None of the assertions were
// wrong. What ran out was time: `waitFor` and `findBy*` give up after 1 s by
// default, and the first render of App, with its lazy dialogs, can take longer
// than that on a cold transform cache with every core busy. Measured with all
// cores loaded: 1, 0 and 10 failures in three runs before this change.
//
// The budgets are generous on purpose. A passing wait returns as soon as its
// condition holds, so a longer limit costs nothing when the code is right, and
// only makes a real failure take longer to report.
configure({ asyncUtilTimeout: 5000 });
