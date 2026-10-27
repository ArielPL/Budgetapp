// ── The date help the model gets with every question ───────────────────────
//
// The model does not know what day it is, and when it worked out "in two
// years" itself it got it wrong (lab round 2). So the app works the months out
// from today and puts them in the instructions. The wording is the lab's
// (round 8), including the Swedish month names in the examples: that is the
// text all eleven languages were tested with.

import { addMonths, type YearMonth } from '../debts';
import { formatYM } from './months';

const SV_MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

export function dateHelp(now: YearMonth): string {
  const at = (n: number) => formatYM(addMonths(now, n));
  const past = addMonths(now, -4);
  const soon = addMonths(now, 1);
  const nextYear = addMonths(now, 5);
  return `this month = ${at(0)}; last month = ${at(-1)}; in 1 year = ${at(12)}; in 2 years = ${at(24)}; `
    + `in 3 years = ${at(36)}; Christmas, New Year's Eve and year end = ${now.year}-12. `
    + `Past "${SV_MONTHS[past.month]}" = ${formatYM(past)}; deadline "${SV_MONTHS[soon.month]}" = ${formatYM(soon)}, `
    + `"${SV_MONTHS[nextYear.month]}" = ${formatYM(nextYear)}.`;
}
