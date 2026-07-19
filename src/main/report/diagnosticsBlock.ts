// Pure assembly of the diagnostics block and the per-error log line. Shared by the
// main-process session logger (line format) and the report dialog (the block). No
// node/electron imports — all inputs are passed in already-scrubbed.

/** A captured error entry, scrubbed, as held in the ring buffer and rendered to a log line. */
export interface ErrorEntry {
  timestamp?: string
  source?: string
  origin?: string
  message?: string
  stack?: string
}

// Flatten a multi-line stack into one physical line so a session-log entry is one
// line and the diagnostics block stays compact. Collapses newlines + surrounding
// whitespace to " | ".
function flattenStack(stack: string): string {
  return String(stack)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' | ')
}

/**
 * One-line rendering of a captured error entry, used for both the on-disk session
 * log and the diagnostics tail.
 */
export function formatErrorLine(entry: ErrorEntry = {}): string {
  const { timestamp = '', source = 'error', origin = 'main', message = '', stack } = entry
  const head = `${timestamp} [${source}] ${origin} :: ${message}`.trim()
  return stack ? `${head} | ${flattenStack(stack)}` : head
}

export interface DiagnosticsInput {
  productName?: string
  version?: string
  os?: string
  errors?: ErrorEntry[]
}

/**
 * Build the scrubbed diagnostics block shown (editable) in the report dialog and
 * appended to the issue body.
 */
export function buildDiagnosticsBlock({
  productName = '',
  version = '',
  os = '',
  errors = []
}: DiagnosticsInput = {}): string {
  const lines = [`App: ${productName} ${version}`.trim(), `OS: ${os}`]
  lines.push('--- recent errors (scrubbed) ---')
  if (!errors || errors.length === 0) {
    lines.push('No errors captured this session.')
  } else {
    for (const e of errors) lines.push(formatErrorLine(e))
  }
  return lines.join('\n')
}
