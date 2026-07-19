import { z } from 'zod'

// Payload schemas for the diagnostics:* IPC channels (Report Issue module). These
// validate renderer-supplied input at the boundary before it reaches the clipboard,
// shell, or session log. Generous maxes just cap abuse; real payloads are far smaller.

/** `diagnostics:reportRendererError` — a scrubbed-at-source renderer error to log. */
export const rendererErrorSchema = z.object({
  source: z.string().max(40),
  message: z.string().max(10_000),
  stack: z.string().max(50_000).optional()
})

/** `diagnostics:openIssue` — the composed issue title + body. */
export const openIssueSchema = z.object({
  title: z.string().max(500),
  body: z.string().max(200_000)
})

/** `diagnostics:copyReport` — the full report body for the clipboard. */
export const copyReportSchema = z.object({
  body: z.string().max(200_000)
})
