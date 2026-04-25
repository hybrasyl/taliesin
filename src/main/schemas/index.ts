/**
 * Zod schemas for every IPC payload that flows from the renderer into a
 * save/write handler. Each save-side handler `.parse()`s its incoming
 * payload through one of these schemas before touching disk.
 *
 * Convention: schemas use the default (non-strict) shape so unknown fields
 * pass through harmlessly. Required fields are validated; types must match
 * exactly. Reject + log policy lives in `../schemaLog.ts`.
 *
 * No matching schema is needed on the load side — load handlers return
 * data we wrote ourselves earlier, and their existing try/catch returns an
 * empty shape on read failure.
 */

export * from './settings'
export * from './palette'
export * from './prefab'
export * from './music'
export * from './pack'
export * from './catalog'
export * from './sfx'
export * from './theme'
