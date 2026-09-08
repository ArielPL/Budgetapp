import { describe, it, expect } from 'vitest';

// ── The rules this file exists to enforce ─────────────────────────────────
//
// Every destructive path in this app has now been broken at least once, and not
// one of the breaks was an arithmetic mistake. They were all WIRING: a correct
// pure function that some call site did not call, or called with the wrong
// argument. The unit tests were green through every one of them, because a pure
// function tested in isolation cannot tell you who used it.
//
//   • The pull-from-last-month guard checked that a storage KEY existed. A month
//     holding only savings has a key, so pulling from it replaced a real budget
//     with empty arrays. `hasBudgetContent` already existed and already returned
//     false for that month — the pull simply never asked it.
//
//   • `deleteRow` in Custom removed a row outright. `monthsHolding` was sitting
//     three lines above, used by `removeBlock` and by nothing else.
//
// So this file reads the source and checks that the guards are actually wired
// in. It is a blunt instrument — matching text, not behaviour — and it will not
// notice a guard that is called with the wrong values. It notices the failure
// that has actually happened here, repeatedly: a guard nobody called.

const MODULES = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

const source = (path: string): string => {
  const found = MODULES[path];
  if (found === undefined) {
    throw new Error(`${path} not found — has it moved? Update this guard.`);
  }
  return found;
};

/** The body of a `const name = (…) => {` arrow, up to its closing line. */
const functionBody = (src: string, name: string): string => {
  const start = src.indexOf(`const ${name} = `);
  expect(start, `${name} not found — renamed? Update this guard.`).toBeGreaterThan(-1);
  // Bodies in this codebase are closed by `};` at the declaration's indent.
  const end = src.indexOf('\n  };', start);
  return src.slice(start, end === -1 ? src.length : end);
};

describe('pulling from the previous month asks whether it holds a budget', () => {
  const body = functionBody(source('./App.tsx'), 'copyFromPrevMonth');

  it('checks the loaded source with hasBudgetContent', () => {
    expect(body).toContain('hasBudgetContent(prev)');
  });

  it('loads the source month before deciding', () => {
    // Order matters: the check has to see real data, not a key's existence.
    expect(body.indexOf('loadMonthData(py, pm, lang)'))
      .toBeLessThan(body.indexOf('hasBudgetContent(prev)'));
  });

  it('no longer decides on the presence of a storage key alone', () => {
    // The exact shape of the original bug. A savings-only month has a key.
    expect(body).not.toContain('localStorage.getItem(storageKey(py, pm))');
  });

  it('says nothing was pulled when the source has no budget', () => {
    expect(body).toContain('t.copyPrevMonthEmpty(prevName)');
  });
});

describe('deleting in Custom warns before history changes', () => {
  const src = source('./components/CustomV3.tsx');

  it('guards a whole block', () => {
    const body = functionBody(src, 'removeBlock');
    expect(body).toContain('monthsHolding(');
    expect(body).toContain('window.confirm(');
  });

  it('guards a single row too', () => {
    // A row carries a whole month's rent as easily as a block does.
    const body = functionBody(src, 'deleteRow');
    expect(body).toContain('monthsHolding(');
    expect(body).toContain('window.confirm(');
  });

  it('counts the active month rather than excluding it', () => {
    // The amount does not leave with the block: the month's snapshot keeps its
    // filing, so the year view goes on counting what the budget stopped showing.
    // Skipping the current month hid exactly that case.
    expect(src).not.toContain('if (key === valuesKey(year, month)) continue;');
  });
});

describe('legacy Custom months are protected before they can be edited', () => {
  const src = source('./components/CustomV3.tsx');

  it('runs the migration', () => {
    expect(src).toContain('migrateLegacySnapshots(localStorage');
  });

  it('runs it once on mount, not on every structure change', () => {
    // Mid-session it would freeze a filing the user is in the middle of
    // changing. Mount is the last moment the stored past is still the past.
    const at = src.indexOf('migrateLegacySnapshots(localStorage');
    expect(src.slice(at, at + 120)).toContain('}, []);');
  });
});
