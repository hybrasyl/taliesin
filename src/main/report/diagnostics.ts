import { clipboard, shell } from 'electron'
import os from 'os'
import { appIdentity } from './appIdentity'
import { simplifyPlatform } from './osName'
import { buildDiagnosticsBlock } from './diagnosticsBlock'
import { buildIssueUrl, truncateBodyForUrl } from './issueUrl'
import { scrubText } from './scrub'
import { captureError, getRecentErrors, getLogsDir } from './sessionLog'
import { isSafeExternalUrl } from '../../shared/externalUrl'

// Backing logic for the diagnostics:* IPC handlers. Pure-helper composition +
// Electron clipboard/shell. `buildIssueUrl` is re-exported so tests and callers
// have one import surface.
export { buildIssueUrl }

// Conservative budget: shell.openExternal is reliable to ~2 KB; leave headroom.
const MAX_URL_LEN = 1800

/**
 * The scrubbed diagnostics block shown (editable) in the report dialog. Errors in
 * the ring buffer are already scrubbed at capture time; a second pass here is
 * cheap, idempotent insurance over the fully assembled block.
 */
export function buildDiagnostics({ version }: { version?: string } = {}): string {
  const block = buildDiagnosticsBlock({
    productName: appIdentity.productName,
    version,
    os: simplifyPlatform(process.platform),
    errors: getRecentErrors()
  })
  let userName: string | undefined
  try {
    userName = os.userInfo().username
  } catch {
    userName = undefined
  }
  return scrubText(block, { homeDir: os.homedir(), userName })
}

/**
 * Open a prefilled GitHub issue on the shared public intake repo. Always copies the
 * full body to the clipboard first, so a URL-length-truncated body can be pasted.
 * Since Electron 44 the main-process clipboard returns a Promise (HTOO-553): the
 * browser opens only after the write completes, or the page that says "paste the
 * report" can open before there is a report to paste. A failed write does not stop
 * the report: the page still opens with the body in its URL, and `copied: false`
 * tells the dialog to say so.
 *
 * Only the stable per-app label is applied via the URL — GitHub applies a `labels=`
 * value only when that label already exists on the repo, so unbounded version labels
 * would silently no-op. The version already rides along in the diagnostics body.
 */
export async function openIssue({ title, body }: { title: string; body: string }): Promise<{
  ok: true
  truncated: boolean
  copied: boolean
}> {
  let copied = true
  try {
    await clipboard.writeText(body)
  } catch (err) {
    copied = false
    captureError({ source: 'openIssue', message: `clipboard write failed: ${String(err)}` })
  }
  const labels = [appIdentity.appLabel]
  const { url, truncated } = truncateBodyForUrl(
    { owner: appIdentity.intakeOwner, repo: appIdentity.intakeRepo, title, body, labels },
    MAX_URL_LEN
  )
  // The URL is main-built (a hardcoded https origin plus URLSearchParams, which
  // cannot alter the scheme), so this is not a live hole. It goes through the
  // same predicate anyway so that externalUrl.ts really is the single gate on
  // anything Taliesin hands the OS -- a claim worth being true rather than
  // nearly true. The body is already on the clipboard, so a refusal degrades to
  // "paste it yourself" rather than losing the report.
  if (isSafeExternalUrl(url)) void shell.openExternal(url)
  return { ok: true, truncated, copied }
}

/** Always-works fallback: put the full report on the clipboard. */
export async function copyReport({ body }: { body: string }): Promise<{ ok: true }> {
  await clipboard.writeText(body)
  return { ok: true }
}

/** Reveal the app-owned logs folder (fixed path from the session logger). */
export function revealLogs(): void {
  const dir = getLogsDir()
  if (dir) void shell.openPath(dir)
}
