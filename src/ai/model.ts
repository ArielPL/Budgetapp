// ── Budget AI: asking the model ────────────────────────────────────────────
//
// For now the model runs on the developer's Mac (~/Developer/budget-ai-lab,
// serve.py), reachable at 127.0.0.1 and nowhere else, and only `npm run dev`
// ever calls it. In the apps it will run on the phone itself; that version
// replaces this function and nothing around it changes: instructions, tools
// and question in, the model's call or text out.

import type { RawCall } from './parseCall';
import { parseRawCall } from './parseCall';

export interface ModelAnswer {
  /** The model's first call, read by the runtime or — when the runtime's
   *  parser gave up — by the app itself. */
  call: RawCall | null;
  /** A text reply, when it called nothing. */
  text: string;
  seconds: number;
}

export const MAC_MODEL_URL = 'http://127.0.0.1:8765';

interface Served {
  calls: Array<{ name: string; args: Record<string, unknown> }>;
  text: string;
  raw: string | null;
  error: string | null;
  seconds: number;
}

/** Throws when the model is not running or did not answer. */
export async function askMacModel(system: string, tools: unknown[], question: string, signal?: AbortSignal): Promise<ModelAnswer> {
  const res = await fetch(`${MAC_MODEL_URL}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, tools, question }),
    signal,
  });
  if (!res.ok) throw new Error(`model ${res.status}`);
  const a = await res.json() as Served;
  const call = a.calls[0] ?? (a.raw ? parseRawCall(a.raw) : null);
  if (!call && a.error) throw new Error(a.error);
  return { call, text: a.text, seconds: a.seconds };
}
