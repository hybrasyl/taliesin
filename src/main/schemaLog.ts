import { promises as fs } from 'fs'
import { join } from 'path'
import type { ZodSchema } from 'zod'
import { z } from 'zod'

const LOG_FILENAME = 'ipc-validation.log'
const ROTATE_AT_BYTES = 256 * 1024 // 256KB cap, then rename → .old.log

/**
 * Append a one-line schema-failure breadcrumb to `<settingsPath>/ipc-validation.log`.
 * Best-effort — never throws back to the IPC handler. The user can grab the
 * file when filing a bug report.
 */
export async function logSchemaFailure(
  settingsPath: string,
  channel: string,
  err: z.ZodError
): Promise<void> {
  try {
    await fs.mkdir(settingsPath, { recursive: true })
    const logPath = join(settingsPath, LOG_FILENAME)

    try {
      const stat = await fs.stat(logPath)
      if (stat.size > ROTATE_AT_BYTES) {
        await fs
          .rename(logPath, join(settingsPath, 'ipc-validation.old.log'))
          .catch(() => undefined)
      }
    } catch {
      /* file doesn't exist yet */
    }

    const issues = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    const line = `${new Date().toISOString()} [${channel}] ${issues}\n`
    await fs.appendFile(logPath, line, 'utf-8')
  } catch {
    /* logging is best-effort — never block a real IPC failure on it */
  }
}

/**
 * Parse `payload` through `schema`, throwing on rejection AND appending a
 * failure breadcrumb to ipc-validation.log. Use this at the entry of every
 * save-side handler:
 *
 * ```ts
 * const parsed = parseOrLog(ctx, 'pack:save', packProjectSchema, data)
 * await fs.writeFile(filePath, JSON.stringify(parsed))
 * ```
 */
export function parseOrLog<T>(
  ctx: { settingsPath: string },
  channel: string,
  schema: ZodSchema<T>,
  payload: unknown
): T {
  const result = schema.safeParse(payload)
  if (!result.success) {
    void logSchemaFailure(ctx.settingsPath, channel, result.error)
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid ${channel} payload: ${issues}`)
  }
  return result.data
}
