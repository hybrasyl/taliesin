/**
 * Undo and redo for the map XML editor.
 *
 * The editor keeps whole `MapData` snapshots, not diffs. A map's XML data is
 * small (properties and four short node lists), every edit already makes a new
 * object, and an unchanged list keeps its identity, so a snapshot costs little.
 * Snapshots also make undo exact: an undone state is the same object that was
 * on screen before, so "is this the saved state" is a reference check.
 *
 * The Map Maker keeps tile diffs instead (store/mapMakerStore.ts), because its
 * maps hold up to ~262k tiles. The two cannot share one helper.
 */

/** The most steps kept. The Map Maker keeps the same number. */
export const HISTORY_LIMIT = 100

/** Edits to one field within this many milliseconds become one step. */
export const COALESCE_MS = 1000

export interface History<T> {
  past: T[]
  present: T
  future: T[]
  /** The field the last edit changed, when that edit can merge with the next. */
  lastKey: string | null
  /** When the last edit happened, in milliseconds. */
  lastAt: number
}

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 }
}

/**
 * The field an edit changes, when the edit can merge with the next one.
 *
 * A patch object that sets one field is a keystroke in a Properties field, and
 * typing a name is one step, not one step per letter. A function updater is a
 * node placed, moved or removed, and each of those is its own step, so it
 * returns null.
 */
export function coalesceKeyFor(patch: unknown): string | null {
  if (typeof patch !== 'object' || patch === null) return null
  const keys = Object.keys(patch)
  return keys.length === 1 ? keys[0]! : null
}

/**
 * Record an edit.
 *
 * An edit that returns the same object changes nothing and adds no step. An
 * edit always clears the redo list.
 */
export function commitEdit<T>(
  h: History<T>,
  next: T,
  coalesceKey: string | null,
  now: number
): History<T> {
  if (Object.is(next, h.present)) return h
  const merge =
    coalesceKey !== null &&
    coalesceKey === h.lastKey &&
    now - h.lastAt <= COALESCE_MS &&
    h.past.length > 0
  const past = merge ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT)
  return { past, present: next, future: [], lastKey: coalesceKey, lastAt: now }
}

/** Stop the next edit from merging into the last step. A save calls this. */
export function sealHistory<T>(h: History<T>): History<T> {
  return h.lastKey === null ? h : { ...h, lastKey: null }
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1]!,
    future: [h.present, ...h.future],
    lastKey: null,
    lastAt: 0
  }
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h
  return {
    past: [...h.past, h.present],
    present: h.future[0]!,
    future: h.future.slice(1),
    lastKey: null,
    lastAt: 0
  }
}

/** Whether a snapshot is the present one or one the history can reach. */
export function holds<T>(h: History<T>, snapshot: T): boolean {
  return (
    Object.is(h.present, snapshot) ||
    h.past.some((s) => Object.is(s, snapshot)) ||
    h.future.some((s) => Object.is(s, snapshot))
  )
}
