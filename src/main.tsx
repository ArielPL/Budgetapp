import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.tsx'
import { applyPersistedTheme } from './themes.ts'
import { appStorage, browserStorage, installStorage } from './storage.ts'
import { isLang, deviceLang, translations } from './i18n.ts'
import { repairFiling } from './filingRepair.ts'

/**
 * In the iOS and Android apps, open the SQLite store and read ALL of it
 * before anything else reads storage — the theme, the language and the filing
 * repair below all do, and the app's first render reads every month on screen.
 * A read before this finishes would find nothing and look exactly like a new
 * install: the user's budget shown as empty.
 *
 * If the store cannot be opened, say so and stop. Falling back to the
 * WebView's localStorage would split the user's data across two places.
 */
async function openStorage(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true
  try {
    const { openNativeStorage } = await import('./nativeStorage.ts')
    installStorage(await openNativeStorage(browserStorage))
    return true
  } catch {
    const t = translations[deviceLang()]
    const root = document.getElementById('root')!
    root.innerHTML = ''
    const box = document.createElement('div')
    box.className = 'storage-failed'
    box.setAttribute('role', 'alert')
    const h = document.createElement('h1')
    h.textContent = t.storageOpenFailedTitle
    const p = document.createElement('p')
    p.textContent = t.storageOpenFailedBody
    const retry = document.createElement('button')
    retry.textContent = t.storageOpenFailedRetry
    retry.onclick = () => location.reload()
    box.append(h, p, retry)
    root.append(box)
    return false
  }
}

async function start() {
  if (!(await openStorage())) return

  // Apply the saved theme palette to :root before React renders, so the very
  // first paint already uses the right colors (no flash of the default Sorbet).
  applyPersistedTheme()

  // And the document's language, for the same reason: index.html hard-codes
  // lang="sv", but since v1.12.0 the app opens in the DEVICE's language — so an
  // English or Spanish interface was being announced by VoiceOver, TalkBack and
  // NVDA under Swedish pronunciation rules (finding 12). App keeps this in sync
  // when the user changes language; this is the value for the first paint.
  const startupLang = appStorage.getItem('budget_lang')
  document.documentElement.lang = isLang(startupLang) ? startupLang : deviceLang()

  // Entries stored in a different month than the pay-period rule gives them are
  // moved home before anything is drawn — see filingRepair.ts. Before render, so
  // no tab can load the old filing first and hold it in memory. Once per page
  // load, outside React, so StrictMode's double render cannot run it twice.
  // Awaited: in the apps the move is written to the database, and the app
  // must not draw — or announce the move — before it is stored.
  const startupRepair = await repairFiling(appStorage)

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App startupRepair={startupRepair} />
    </StrictMode>,
  )
}

void start()
