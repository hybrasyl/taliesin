import { useUiStore } from '../store/uiStore'

// Tells main whether any editor holds unsaved work, so a clean close can stay
// synchronous (index.ts hides the window inside the first `close` event) and
// only a dirty close asks. Sent on transitions only — the answer is computed
// from the live close guards, so calling this more often than needed is cheap
// and calling it from every place dirtiness can change is the point.

let last: boolean | null = null

export function anyUnsaved(): boolean {
  return Object.values(useUiStore.getState().closeGuards).some((g) => g.isDirty())
}

export function reportUnsaved(): void {
  const dirty = anyUnsaved()
  if (dirty === last) return
  last = dirty
  // Optional-chained: the test mock may not carry the channel.
  window.api?.setUnsaved?.(dirty)
}

/** Test seam — forgets the last report so the next call sends again. */
export function resetUnsavedReport(): void {
  last = null
}
