// house module: update-check v1 — change it in the template, then port
//
// The pure core of the update check: the manifest shape, the version compare
// and the URL rule. No electron or node imports, so main, the publish script's
// tests and the renderer can all use it. Design:
// Comhaigne docs/architecture/update-check-module.md (HTOO-382, HTOO-65).

/**
 * The house version manifest. One keyed file on the `main` branch of the public
 * issue repo, written by each app's release (scripts/publish-version.mjs) and
 * read over raw.githubusercontent.com, so a private app repo does not matter.
 */
export const MANIFEST_URL =
  'https://raw.githubusercontent.com/hybrasyl/cernunnos/main/versions.json'

/** The only manifest shape this module reads. */
export const MANIFEST_SCHEMA = 1

export interface UpdateInfo {
  /** `MAJOR.MINOR.PATCH`, no `v`. */
  version: string
  /** The release page, already checked against the app's `releaseUrlPrefix`. */
  url: string
}

export type UpdateFailure = 'offline' | 'timeout' | 'http' | 'malformed' | 'no-entry' | 'bad-url'

/**
 * "Up to date" and "could not tell" are different values. The old check
 * returned null for both, which is how a private repo's 404 read as "no
 * releases" forever.
 */
export type UpdateCheckResult =
  { ok: true; update: UpdateInfo | null } | { ok: false; reason: UpdateFailure }

const STRICT = /^(\d+)\.(\d+)\.(\d+)$/

/**
 * `MAJOR.MINOR.PATCH` as numbers, or null. A leading `v` is allowed. A
 * pre-release suffix (`1.7.0-beta.1`) is dropped, so a running pre-release
 * compares by its base version.
 */
export function parseVersion(raw: string): [number, number, number] | null {
  const base = raw.trim().replace(/^v/i, '').split('-')[0]
  const m = STRICT.exec(base)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/**
 * True only when `latest` is strictly newer than `current`. Anything that does
 * not parse is "not newer": a false "update available" is worse than a missed
 * one. (The old template rule read a non-number part as 0.)
 */
export function isNewerVersion(current: string, latest: string): boolean {
  const a = parseVersion(current)
  const b = parseVersion(latest)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (b[i] !== a[i]) return b[i] > a[i]
  }
  return false
}

/**
 * Read one app's entry from a parsed manifest.
 *
 * `url` must start with the app's own `releaseUrlPrefix`. Anyone with push
 * access to the issue repo can edit the manifest; this rule means an edit
 * cannot send users of this app to another site.
 */
export function readManifest(
  data: unknown,
  updateKey: string,
  releaseUrlPrefix: string,
  currentVersion: string
): UpdateCheckResult {
  if (!data || typeof data !== 'object') return { ok: false, reason: 'malformed' }
  const manifest = data as { schema?: unknown; apps?: unknown }
  if (manifest.schema !== MANIFEST_SCHEMA) return { ok: false, reason: 'malformed' }
  if (!manifest.apps || typeof manifest.apps !== 'object') return { ok: false, reason: 'malformed' }

  const entry = (manifest.apps as Record<string, unknown>)[updateKey]
  if (entry === undefined) return { ok: false, reason: 'no-entry' }
  if (!entry || typeof entry !== 'object') return { ok: false, reason: 'malformed' }

  const { version, url } = entry as { version?: unknown; url?: unknown }
  if (typeof version !== 'string' || !STRICT.test(version)) {
    return { ok: false, reason: 'malformed' }
  }
  const safe = typeof url === 'string' ? trustedUrl(url, releaseUrlPrefix) : null
  if (!safe) return { ok: false, reason: 'bad-url' }
  return {
    ok: true,
    update: isNewerVersion(currentVersion, version) ? { version, url: safe } : null
  }
}

/**
 * The normalized URL when it is https and under `prefix`, else null. Parsed
 * first, so `…/releases/../../other-repo` resolves before the prefix check
 * rather than passing it as raw text.
 */
export function trustedUrl(raw: string, prefix: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  return parsed.href.startsWith(prefix) ? parsed.href : null
}

/** Plain words for a failure, for the Check for updates button. */
export function describeFailure(reason: UpdateFailure): string {
  switch (reason) {
    case 'offline':
      return 'No network connection.'
    case 'timeout':
      return 'The version list did not answer in time.'
    case 'http':
      return 'The version list could not be read.'
    case 'malformed':
      return 'The version list is not in a form this version understands.'
    case 'no-entry':
      return 'The version list has no entry for this app yet.'
    case 'bad-url':
      return 'The version list points somewhere this app does not trust.'
  }
}
