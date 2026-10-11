import { currentPlatform } from './platform'

/**
 * Shared predicates for page-level keyboard handlers.
 *
 * A page that binds single-letter tool keys has to answer one question before
 * it acts on anything: is the user typing? Every such page in this app has a
 * text field somewhere in it — a filter box, a dialog form — and a bare
 * `case 's'` that fires while the user is naming a prefab swallows the letter
 * and switches tools instead.
 *
 * This lives here rather than in one page because two pages need it and they
 * were going to answer it differently — the Map Maker (HTOO-342) and the map
 * XML editor's Placement tab (HTOO-338). One rule, one place to correct it.
 */

/**
 * Whether a keystroke is going into a text field.
 *
 * Reads the **event target** first and falls back to `document.activeElement`,
 * because a `window` listener sees the target directly while some callers only
 * have the document to ask.
 *
 * `contentEditable` counts. It is not used in this app today, and it is exactly
 * the case a `tagName` check silently gets wrong later.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = (target instanceof HTMLElement ? target : null) ?? document.activeElement
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select'
}

/**
 * The platform's command key (HTOO-569): ⌘ alone on macOS, where Control belongs
 * to the text system (⌃K, ⌃P) and a Control-click is a right-click. Elsewhere
 * Ctrl and the meta key are interchangeable, as they always were.
 */
export function isModKey(
  e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>,
  platform: string | undefined = currentPlatform()
): boolean {
  return platform === 'darwin' ? e.metaKey && !e.ctrlKey : e.ctrlKey || e.metaKey
}

/**
 * Undo or redo, by the platform's convention: mod+Z undoes, Shift+mod+Z redoes,
 * and mod+Y redoes except on macOS, where ⌘Y is not redo.
 */
export function historyChord(
  e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key'>,
  platform: string | undefined = currentPlatform()
): 'undo' | 'redo' | null {
  if (!isModKey(e, platform)) return null
  const key = e.key.toLowerCase()
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && platform !== 'darwin') return 'redo'
  return null
}
