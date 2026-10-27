// ── Reading the model's tool call ourselves ────────────────────────────────
//
// Gemma 4 writes a call as
//   <|tool_call>call:what_if{change:1500,target:<|"|>boende<|"|>}<tool_call|>
// and the runtime (LiteRT-LM) normally parses it. In the lab it sometimes did
// not: the model wrote an id without its quote marks (`target:boende`) and the
// runtime's parser crashed — 1 call in 64 in Spanish even without enum lists.
// The text is still unambiguous, so the app reads it itself instead of giving
// up. Whatever comes out still goes through the checks (checks.ts) like any
// other call.

export interface RawCall {
  name: string;
  args: Record<string, unknown>;
}

const CALL = /<\|tool_call>\s*call:(\w+)\{(.*?)\}\s*<tool_call\|>/s;
const QUOTE = '<|"|>';

/** One `key:value` after another. A value is a quoted string, which may hold
 *  commas, or anything up to the next comma. */
function readArgs(body: string): Record<string, unknown> | null {
  const args: Record<string, unknown> = {};
  let i = 0;
  while (i < body.length) {
    while (body[i] === ',' || body[i] === ' ') i++;
    if (i >= body.length) break;
    const colon = body.indexOf(':', i);
    if (colon < 0) return null;
    const key = body.slice(i, colon).trim();
    if (!/^\w+$/.test(key)) return null;
    i = colon + 1;
    if (body.startsWith(QUOTE, i)) {
      const end = body.indexOf(QUOTE, i + QUOTE.length);
      if (end < 0) return null;
      args[key] = body.slice(i + QUOTE.length, end);
      i = end + QUOTE.length;
    } else {
      const comma = body.indexOf(',', i);
      const raw = body.slice(i, comma < 0 ? body.length : comma).trim();
      i = comma < 0 ? body.length : comma;
      const unquoted = raw.replace(/^"(.*)"$/, '$1');
      args[key] = /^-?\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : unquoted;
    }
  }
  return args;
}

/** The first call in the model's raw output, or null when there is none or it
 *  cannot be read one way only. */
export function parseRawCall(output: string): RawCall | null {
  const m = CALL.exec(output);
  if (!m) return null;
  const args = readArgs(m[2]);
  return args ? { name: m[1], args } : null;
}
