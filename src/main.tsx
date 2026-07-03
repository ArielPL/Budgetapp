import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyPersistedTheme } from './themes.ts'
import { supabase } from './supabaseClient.ts'
import { installStoragePatch, pullAll } from './cloudSync.ts'
import { markBootPullDone } from './useAuth.ts'

// Apply the saved theme palette to :root before React renders, so the very
// first paint already uses the right colors (no flash of the default Sorbet).
applyPersistedTheme()

// Install the localStorage.setItem patch ONCE, before any app code runs, so
// every write is captured for sync. When signed out this is inert (it just
// stamps a local sync-meta timestamp and returns) — no network, guest mode
// stays byte-identical to the original app.
installStoragePatch()

const rootEl = document.getElementById('root')!

function render(): void {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

// ── Boot-time gating (mirrors how we gate first paint on applyPersistedTheme) ──
// App.tsx's useState initializers read localStorage synchronously on first
// render. If a signed-in user's cloud data hasn't been pulled yet, they'd flash
// stale/empty local data before the pull lands. So: if (and only if) there is an
// existing Supabase session, await the full pull-and-merge into localStorage
// BEFORE mounting React. Guests (no session, or sync not configured) skip this
// entirely and mount instantly, exactly as today.
async function boot(): Promise<void> {
  if (!supabase) { render(); return }

  try {
    const { data } = await supabase.auth.getSession()
    const user = data.session?.user
    if (user) {
      // Minimal, brief loading state — only ever shown to a signed-in user while
      // their cloud data is pulled. Uses the theme vars already applied above.
      rootEl.innerHTML =
        '<div style="position:fixed;inset:0;display:flex;align-items:center;' +
        'justify-content:center;color:var(--text-dim);font-family:system-ui,' +
        'sans-serif;font-size:0.9rem;background:var(--bg)">…</div>'
      await pullAll(user)
      // Tell useAuth the boot pull already happened, so its initial
      // onAuthStateChange/getSession event doesn't pull a second time.
      markBootPullDone()
    }
  } catch {
    // Any auth/network hiccup at boot must NOT block the app — fall through and
    // render with whatever is in localStorage (offline-first).
  }
  render()
}

void boot()
