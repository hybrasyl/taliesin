/**
 * Lightweight update *notification* — no `electron-updater`, no auto-download,
 * no installer. On launch, ask GitHub for the latest published release and, if
 * its tag is newer than the running version, hand the renderer a version and a
 * release URL to surface. The user downloads it themselves.
 *
 * HTOO-65. Ported from corvath's `src/main/updateCheck.ts`, which is one of the
 * two implementations that already existed in the house; creidhne's is the
 * other. Deliberately the same shape as both rather than a third answer.
 *
 * **This is Taliesin's first outbound network request**, and `SECURITY.md` says
 * so now — it previously claimed the only outbound traffic was a browser
 * handoff. One HTTPS GET to `api.github.com` per launch, sending no user data
 * and no identifier beyond a `User-Agent`, and the response is read for exactly
 * three fields.
 *
 * The three questions the card holds open, answered for this repo:
 *
 * - **Opt-in?** No. Always on, no setting, which is what creidhne and corvath
 *   both do. A fourth answer here would make the house harder to reason about
 *   than the feature is worth, and the failure mode of the check is silence.
 * - **Frequency?** Once per launch. A long-running session that misses a release
 *   by a few hours is not a problem worth a timer.
 * - **Metered connections?** Not detected. One small GET is not what makes a
 *   metered connection expensive.
 *
 * Every failure is swallowed: offline, rate-limited, no releases yet, a shape we
 * do not recognise. A best-effort check must never block or crash startup, and a
 * user who cannot reach GitHub is not a user with a problem to report.
 */

const LATEST_RELEASE_URL = 'https://api.github.com/repos/hybrasyl/taliesin/releases/latest'

export interface UpdateInfo {
  /** The release version, without the `v` prefix. */
  version: string
  /** The GitHub release page. Opened by the renderer as an ordinary link. */
  url: string
}

/** Numeric components of a semver-ish tag, ignoring a `v` prefix and any
 *  pre-release suffix. `2.10.0` must beat `2.9.0`, which a string compare
 *  gets backwards. */
function parseVersion(v: string): number[] {
  return v
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
}

/** True when `remote` is strictly newer than `local`. */
export function isNewerVersion(local: string, remote: string): boolean {
  const a = parseVersion(local)
  const b = parseVersion(remote)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

interface GithubRelease {
  tag_name?: string
  html_url?: string
  draft?: boolean
  prerelease?: boolean
}

/**
 * Update info when a newer stable release exists, else `null`.
 *
 * `fetch` is injected so the suite can drive every branch without a network —
 * the interesting cases here are all failures, and none of them is reachable
 * from a test that has to reach GitHub.
 */
export async function checkForUpdate(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch
): Promise<UpdateInfo | null> {
  try {
    const res = await fetchImpl(LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'taliesin' }
    })
    if (!res.ok) return null
    const data = (await res.json()) as GithubRelease
    // A draft is not published and a prerelease is not what a user on the stable
    // channel is being offered. `/releases/latest` already excludes both, so this
    // is belt and braces against the endpoint or the repo's release process
    // changing under us.
    if (!data.tag_name || data.draft || data.prerelease) return null
    if (!isNewerVersion(currentVersion, data.tag_name)) return null
    return { version: data.tag_name.replace(/^v/i, ''), url: data.html_url ?? '' }
  } catch {
    return null
  }
}
