/**
 * Find and rewrite the `<MapTarget>` values that name a map.
 *
 * A warp stores its destination as a **name string**, not an id
 * (`Objects/MapObject.cs:223`), and resolves it at traverse time through a
 * name-keyed lookup. So editing a map's `<Name>` breaks every inbound warp
 * immediately and silently — and the damage is in *other* files, which is why
 * it is easy to miss: the map you edited is fine (HTOO-347).
 *
 * Two rules shape everything here.
 *
 * **Compare decoded values, never raw text.** `The Crow & Cask` is stored as
 * `The Crow &amp; Cask`. A scan that compares raw text misses real referrers
 * and reports a clean result, which reads as "nothing to update" rather than
 * "the search was wrong" — the worse of the two failures.
 *
 * **Only `<MapTarget>` resolves.** Some maps carry a `<Sign>` whose `<Name>` is
 * a destination's name as display text for the player. That is prose, not a
 * resolution key, and a rename pass must not touch it. Matching on the element
 * rather than on the string is what keeps those out.
 *
 * Text in, text out: the rewrite replaces only the inside of matching elements,
 * so a 40-file update produces 40 one-line diffs rather than 40 reformatted
 * files.
 */

/** `<MapTarget …>value</MapTarget>` — attributes and value captured apart. */
const MAP_TARGET_RE = /(<MapTarget\b[^>]*>)([\s\S]*?)(<\/MapTarget>)/g

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'"
}

/**
 * Decode XML text to the value a parser would report.
 *
 * One pass, deliberately. A double-escaped `&amp;amp;` decodes to the literal
 * `&amp;`, which is what it actually means and what the server would look up —
 * so a double-escaped target correctly fails to match the map it was meant to
 * point at. That value is broken (HTOO-343) rather than a referrer this pass
 * should quietly repair.
 */
export function decodeXmlText(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = parseInt(body.slice(2), 16)
      return Number.isNaN(code) ? whole : String.fromCodePoint(code)
    }
    if (body.startsWith('#')) {
      const code = parseInt(body.slice(1), 10)
      return Number.isNaN(code) ? whole : String.fromCodePoint(code)
    }
    return NAMED_ENTITIES[body] ?? whole
  })
}

/** Escape a value for use as XML element text. */
export function encodeXmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Every decoded `<MapTarget>` value in `xml`, in document order. */
export function mapTargets(xml: string): string[] {
  const found: string[] = []
  for (const m of xml.matchAll(MAP_TARGET_RE)) {
    found.push(decodeXmlText(m[2]).trim())
  }
  return found
}

/** How many warps in `xml` point at `name`. Case-sensitive, like the server. */
export function countWarpsTo(xml: string, name: string): number {
  const wanted = name.trim()
  if (!wanted) return 0
  return mapTargets(xml).filter((t) => t === wanted).length
}

/**
 * Repoint every warp in `xml` from `oldName` to `newName`.
 *
 * Returns the rewritten text and how many values changed, so a caller can
 * report what actually happened rather than what it intended.
 */
export function rewriteWarpTargets(
  xml: string,
  oldName: string,
  newName: string
): { xml: string; changed: number } {
  const wanted = oldName.trim()
  if (!wanted || wanted === newName.trim()) return { xml, changed: 0 }
  let changed = 0
  const out = xml.replace(MAP_TARGET_RE, (whole, open: string, value: string, close: string) => {
    if (decodeXmlText(value).trim() !== wanted) return whole
    changed++
    return `${open}${encodeXmlText(newName.trim())}${close}`
  })
  return { xml: out, changed }
}
