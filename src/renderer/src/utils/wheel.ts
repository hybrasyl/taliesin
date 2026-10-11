/**
 * Trackpad gestures for the map canvases (HTOO-569).
 *
 * Chromium on macOS reports a trackpad pinch as a `wheel` event with
 * `ctrlKey: true`, so a handler that gives Ctrl + wheel another meaning breaks
 * pinch. A two-finger scroll is a plain `wheel` with `deltaX`/`deltaY`, which a
 * mouse wheel also sends; the two cannot be told apart reliably. (The document
 * repo's docs/architecture/macos-chrome.md §8, measured in mabon.)
 */

/** A pinch: Ctrl + wheel on macOS. Elsewhere Ctrl + wheel keeps its own meaning. */
export function isPinch(e: Pick<WheelEvent, 'ctrlKey'>, platform: string | undefined): boolean {
  return platform === 'darwin' && e.ctrlKey
}

/**
 * Turns a run of wheel deltas into zoom steps. A mouse notch is about 100 px and
 * gives one step at once, as before. A pinch sends dozens of small deltas, and a
 * step per event would zoom through every level in one gesture, so the deltas
 * add up to `threshold` first. Returns the direction of a step (1: the delta is
 * positive, a pinch in or a wheel down), or 0 when there is no step yet.
 */
export function createWheelStepper(threshold = 40): (deltaY: number) => -1 | 0 | 1 {
  let sum = 0
  return (deltaY) => {
    sum += deltaY
    if (Math.abs(sum) < threshold) return 0
    const direction = sum > 0 ? 1 : -1
    sum = 0
    return direction
  }
}
