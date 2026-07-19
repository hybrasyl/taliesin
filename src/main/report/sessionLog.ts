import { promises as fs } from 'fs'
import { join } from 'path'
import os from 'os'
import { scrubText } from './scrub'
import { formatErrorLine, type ErrorEntry } from './diagnosticsBlock'

// Per-session error logger. One file per app launch under <logsDir>, keeping only
// the KEEP_SESSIONS most recent. Errors are SCRUBBED at capture time (before the
// ring buffer or disk), so the on-disk logs are already safe to attach to a bug
// report. Best-effort throughout — a logging failure must never disturb the app
// (mirrors the house schemaLog pattern); appends are serialized through a queue
// (mirrors settingsManager) so rapid errors don't interleave partial lines.

const KEEP_SESSIONS = 5
const RING_MAX = 20

let logsDir: string | null = null
let sessionFile: string | null = null
let scrubCtx: { homeDir?: string; userName?: string } = { homeDir: undefined, userName: undefined }
const ring: ErrorEntry[] = []
let appendQueue: Promise<void> = Promise.resolve()

// Compact, filename-safe, sortable stamp: YYYYMMDD-HHmmss-SSS. Lexical sort on the
// filename is chronological, which is what rotation relies on.
function sessionStamp(): string {
  const iso = new Date().toISOString() // 2026-07-18T16:42:15.123Z
  const date = iso.slice(0, 10).replace(/-/g, '')
  const time = iso.slice(11, 19).replace(/:/g, '')
  const ms = iso.slice(20, 23)
  return `${date}-${time}-${ms}`
}

const SESSION_RE = /^session-.*\.log$/

// Keep only the newest KEEP_SESSIONS session files; unlink the rest. Best-effort.
async function rotate(dir: string): Promise<void> {
  const entries = await fs.readdir(dir).catch(() => [] as string[])
  const sessions = entries.filter((f) => SESSION_RE.test(f)).sort() // oldest first
  const excess = sessions.length - KEEP_SESSIONS
  for (let i = 0; i < excess; i++) {
    await fs.unlink(join(dir, sessions[i])).catch(() => {})
  }
}

function enqueueAppend(line: string): Promise<void> {
  const write = (): Promise<void> =>
    fs.appendFile(sessionFile as string, `${line}\n`, 'utf-8').catch(() => {})
  appendQueue = appendQueue.then(write, write)
  return appendQueue
}

/**
 * Create this run's session file, capture the scrub context, and prune old files.
 * Called once at startup, before any handler can fire.
 */
export async function initSessionLog(dir: string): Promise<void> {
  logsDir = dir
  const homeDir = os.homedir()
  let userName: string | undefined
  try {
    userName = os.userInfo().username
  } catch {
    userName = undefined
  }
  scrubCtx = { homeDir, userName }
  sessionFile = join(dir, `session-${sessionStamp()}.log`)
  await fs.mkdir(dir, { recursive: true }).catch(() => undefined)
  // Touch (create empty) so a launch with zero errors still counts as a session
  // for rotation — 'a' creates without truncating.
  await fs.appendFile(sessionFile, '', 'utf-8').catch(() => {})
  await rotate(dir)
}

/** Scrub, ring-buffer, and best-effort-append a captured error. */
export function captureError(entry: ErrorEntry = {}): void {
  const scrubbed: ErrorEntry = {
    timestamp: new Date().toISOString(),
    source: entry.source || 'error',
    origin: entry.origin || 'main',
    message: scrubText(String(entry.message ?? ''), scrubCtx),
    stack: entry.stack ? scrubText(String(entry.stack), scrubCtx) : undefined
  }
  ring.push(scrubbed)
  if (ring.length > RING_MAX) ring.shift()
  if (sessionFile) enqueueAppend(formatErrorLine(scrubbed))
}

/** Most recent scrubbed error entries (this session, main + renderer). */
export function getRecentErrors(n = RING_MAX): ErrorEntry[] {
  return ring.slice(-n)
}

export function getLogsDir(): string | null {
  return logsDir
}

// Test-only: reset module state between cases.
export function _resetForTests(): void {
  logsDir = null
  sessionFile = null
  scrubCtx = { homeDir: undefined, userName: undefined }
  ring.length = 0
  appendQueue = Promise.resolve()
}
