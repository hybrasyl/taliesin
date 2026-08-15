/**
 * Cursor movement for a keyboard-navigable list.
 *
 * Pure, so the two list panels share one definition of what an arrow key means
 * even though they move focus in different ways: the catalog list is virtualized
 * and cannot rely on DOM focus (a row scrolled out of the window is unmounted),
 * so it tracks a cursor index; the editor file list is not virtualized and moves
 * real focus between its rows.
 *
 * A cursor of -1 means "nothing focused yet". Down enters at the top, up enters
 * at the bottom — the usual listbox behaviour, and it makes End-then-Up work
 * without a special case.
 */

/** Rows a Page key moves by. A screenful is not known here, so this is a step. */
export const PAGE_STEP = 10

/**
 * The index a key moves the cursor to, or null when the key is not ours — the
 * caller must not preventDefault on a null, or it eats typing and Tab.
 */
export function nextCursorIndex(key: string, cursor: number, count: number): number | null {
  if (count <= 0) return null
  const clamp = (i: number): number => (i < 0 ? 0 : i >= count ? count - 1 : i)

  switch (key) {
    case 'ArrowDown':
      return cursor < 0 ? 0 : clamp(cursor + 1)
    case 'ArrowUp':
      return cursor < 0 ? count - 1 : clamp(cursor - 1)
    case 'Home':
      return 0
    case 'End':
      return count - 1
    case 'PageDown':
      return cursor < 0 ? 0 : clamp(cursor + PAGE_STEP)
    case 'PageUp':
      return cursor < 0 ? count - 1 : clamp(cursor - PAGE_STEP)
    default:
      return null
  }
}

/** True for the keys that open the row under the cursor. */
export function isActivateKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar'
}

/**
 * Keep a cursor valid when the row count changes under it — filtering is the
 * usual cause. Returns -1 once the list is empty, so the next Down re-enters at
 * the top rather than at a remembered index the user cannot see.
 */
export function clampCursor(cursor: number, count: number): number {
  if (count <= 0) return -1
  if (cursor < 0) return -1
  return cursor >= count ? count - 1 : cursor
}
