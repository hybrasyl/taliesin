/**
 * Shared XML parse/serialize helpers for the Hybrasyl map + world-map formats.
 * mapXml.ts and worldMapXml.ts had verbatim copies of each of these.
 */

/** Escape the XML-significant chars for use in element text / attribute values. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** getAttribute with a default when the attribute is absent. */
export function attr(el: Element, name: string, def = ''): string {
  return el.getAttribute(name) ?? def
}

/** Trimmed text of a direct-child element (`:scope >`), or '' if absent. */
export function childText(el: Element, tag: string): string {
  return el.querySelector(`:scope > ${tag}`)?.textContent?.trim() ?? ''
}

/**
 * The default namespace every Hybrasyl XML document must carry on its root
 * element. `XmlSerializer` on the server rejects a document without it at
 * (2, 2) — `<Map xmlns=''> was not expected`.
 *
 * It lives beside `parseXmlDocument` because that function is what strips it on
 * read. Every writer must put it back; keeping one constant is what makes the
 * pair symmetrical rather than two rules that happen to agree.
 */
export const HYBRASYL_NS = 'http://www.hybrasyl.com/XML/Hybrasyl/2020-02'

/**
 * Parse Hybrasyl XML into a Document: strip namespace declarations (so
 * querySelector works on bare tag names) and throw on malformed input. Browsers
 * and jsdom return a document whose documentElement IS the <parsererror> for
 * malformed XML — which a descendant-only querySelector misses — so we check all
 * three placements.
 */
export function parseXmlDocument(xml: string): Document {
  const stripped = xml.replace(/\s+xmlns(?::\w+)?="[^"]*"/g, '')
  const doc = new DOMParser().parseFromString(stripped, 'text/xml')
  const root = doc.documentElement
  if (
    root.tagName === 'parsererror' ||
    root.querySelector('parsererror') ||
    doc.getElementsByTagName('parsererror').length > 0
  ) {
    const errEl = root.tagName === 'parsererror' ? root : doc.getElementsByTagName('parsererror')[0]
    throw new Error(`XML parse error: ${errEl.textContent ?? ''}`)
  }
  return doc
}
