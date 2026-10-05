// ── nativeShare — a backup file from the iOS and Android apps ──────────────
//
// The web app saves a backup with the File System Access API or a download
// link. Neither exists inside the apps' WebView in a form a user can find
// afterwards: a download there can "succeed" without any file appearing in
// Files or Downloads (2026-09-26 iOS/Android review, P1).
//
// So the apps write the file into their own cache and hand it to the
// operating system's share sheet. From there the user saves it wherever they
// keep things — Files, Google Drive, AirDrop, e-mail — with the system's own
// picker, and without the app asking for access to any of those places.
//
// What this can honestly report back, which decides whether the menu may show
// a backup date (a date there is a promise that a file exists):
//   · 'saved'     — iOS says the user chose "Save to Files". Proof enough.
//   · 'shared'    — it went to some other app. Whether that app kept it is not
//                   something the app can see, so the caller asks the user.
//   · 'cancelled' — the user closed the sheet. Nothing changes.
// A failure to write or share is thrown, not reported as any of these.

export type ShareOutcome = 'saved' | 'shared' | 'cancelled';

/** iOS's identifier for the "Save to Files" action in the share sheet. */
const SAVE_TO_FILES = 'com.apple.DocumentManagerUICore.SaveToFiles';

export function outcomeOf(activityType: string | undefined): ShareOutcome {
  return activityType === SAVE_TO_FILES ? 'saved' : 'shared';
}

/** A share sheet the user dismissed rejects rather than resolving; this tells
 *  that apart from a real failure. Both platforms word it "canceled". */
export function isCancellation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /cancel/i.test(message);
}

/**
 * Write `text` as `filename` in the app's cache and open the share sheet with
 * it. Only called in the iOS and Android apps; the plugins are imported here,
 * dynamically, so the web bundle never carries them.
 *
 * The cache, not Documents: it is private to the app, it is not included in
 * the phone's backup, and the system may clear it — which is right for a copy
 * whose only job is to be handed on.
 */
export async function shareBackupFile(filename: string, text: string, title: string): Promise<ShareOutcome> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const { uri } = await Filesystem.writeFile({
    path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8,
  });
  try {
    const result = await Share.share({ title, files: [uri], dialogTitle: title });
    return outcomeOf(result.activityType);
  } catch (err) {
    if (isCancellation(err)) return 'cancelled';
    throw err;
  }
}
