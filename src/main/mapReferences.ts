/**
 * Find and rewrite every place a map is named by another XML file.
 *
 * A map is referred to by its **name string**, not its id, and the reference is
 * resolved at use time. So editing a map's `<Name>` breaks every reference
 * immediately and silently — and the damage is in *other* files, which is why
 * it is easy to miss: the map you edited is fine (HTOO-347).
 *
 * Warps were the first of these and for a while the only one handled. They are
 * not the only one. From the Hybrasyl XSDs, which are the authority here:
 *
 * | file          | reference                          | where it hurts              |
 * | ------------- | ---------------------------------- | --------------------------- |
 * | maps          | `<MapTarget>`                      | a warp goes nowhere         |
 * | nations       | `SpawnPoint@MapName`               | a nation has no spawn       |
 * | nations       | `Territory/Map@Name`               | a map leaves its nation     |
 * | serverconfigs | `Death/Map`                        | death sends players nowhere |
 * | serverconfigs | `NewPlayer/StartMaps/StartMap`     | a new character cannot log in |
 * | worldmaps     | `Point/Target`                     | a travel node goes nowhere  |
 *
 * Three rules shape everything here.
 *
 * **Compare decoded values, never raw text.** `The Crow & Cask` is stored as
 * `The Crow &amp; Cask`. A scan that compares raw text misses real referrers
 * and reports a clean result, which reads as "nothing to update" rather than
 * "the search was wrong" — the worse of the two failures.
 *
 * **Match the element, never the string.** Several files carry a map's name as
 * prose for a player to read: a map's `<Sign>`, a world map point's own
 * `<Name>`, a nation's `<Description>`. Those are display text, not resolution
 * keys, and a rename pass must not touch them. Matching on the element and the
 * attribute is what keeps them out.
 *
 * **The same element name means different things in different files.** `<Map>`
 * is element text inside a server config's `<Death>` and an attribute carrier
 * inside a nation's `<Territory>`. Rules are therefore per section, never
 * global.
 *
 * Text in, text out: the rewrite replaces only the matched value, so a 40-file
 * update produces 40 one-line diffs rather than 40 reformatted files.
 */

/** One place a map name can appear. */
export type ReferenceRule =
  | { kind: 'element'; element: string }
  | { kind: 'attribute'; element: string; attribute: string }

/** A world section that can name a map, and the places in it that do. */
export interface SectionRules {
  /** Directory under the world's `xml/`, as `listSection` takes it. */
  section: string
  /** What one hit is called, for the singular in a report. */
  noun: string
  rules: ReferenceRule[]
}

/**
 * Every section that names a map, from the XSDs.
 *
 * Adding a section here is all that is needed: the scan, the rewrite and the
 * dialog are all driven from this list.
 */
export const MAP_REFERENCE_SECTIONS: readonly SectionRules[] = [
  {
    section: 'maps',
    noun: 'warp',
    rules: [{ kind: 'element', element: 'MapTarget' }]
  },
  {
    section: 'nations',
    noun: 'reference',
    rules: [
      { kind: 'attribute', element: 'SpawnPoint', attribute: 'MapName' },
      // `<Territory><Map Name="..."/></Territory>` — NationMap in Nation.xsd.
      { kind: 'attribute', element: 'Map', attribute: 'Name' }
    ]
  },
  {
    section: 'serverconfigs',
    noun: 'reference',
    rules: [
      // `<Death><Map X Y>name</Map></Death>` — DeathMap in ServerConfig.xsd.
      { kind: 'element', element: 'Map' },
      { kind: 'element', element: 'StartMap' }
    ]
  },
  {
    section: 'worldmaps',
    noun: 'point',
    // A point's own `<Name>` is the label a player reads. Only `<Target>`
    // resolves to a map.
    rules: [{ kind: 'element', element: 'Target' }]
  }
]

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

/** Escape a value for use inside an XML attribute delimited by `quote`. */
export function encodeXmlAttr(text: string, quote: string): string {
  const base = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return quote === '"' ? base.replace(/"/g, '&quot;') : base.replace(/'/g, '&apos;')
}

/**
 * `<El …>value</El>` — the opening tag, the value and the closing tag apart.
 *
 * `String.raw` throughout. In a plain template literal `\b` is a backspace,
 * `\s` collapses to `s`, and `\2` is an octal escape TypeScript refuses to
 * compile — so a pattern written the obvious way silently stops being the
 * pattern it reads as.
 */
function elementRe(element: string): RegExp {
  return new RegExp(String.raw`(<${element}\b[^>]*>)([\s\S]*?)(</${element}>)`, 'g')
}

/**
 * `<El … attr="value" …>` — the run up to the value, the quote, and the value.
 *
 * Both quote styles, because an author's editor picks one and a serializer
 * picks the other. The quote is captured so the rewrite puts back the one that
 * was there rather than reformatting a file it only meant to repoint.
 */
function attributeRe(element: string, attribute: string): RegExp {
  return new RegExp(String.raw`(<${element}\b[^>]*?\b${attribute}\s*=\s*(["']))(.*?)\2`, 'g')
}

/** Every decoded value the rules match, in document order. */
export function referencedNames(xml: string, rules: readonly ReferenceRule[]): string[] {
  const found: string[] = []
  for (const rule of rules) {
    if (rule.kind === 'element') {
      for (const m of xml.matchAll(elementRe(rule.element))) {
        found.push(decodeXmlText(m[2]!).trim())
      }
    } else {
      for (const m of xml.matchAll(attributeRe(rule.element, rule.attribute))) {
        found.push(decodeXmlText(m[3]!).trim())
      }
    }
  }
  return found
}

/** How many references in `xml` name `name`. Case-sensitive, like the server. */
export function countReferencesTo(
  xml: string,
  name: string,
  rules: readonly ReferenceRule[]
): number {
  const wanted = name.trim()
  if (!wanted) return 0
  return referencedNames(xml, rules).filter((t) => t === wanted).length
}

/**
 * Repoint every reference in `xml` from `oldName` to `newName`.
 *
 * Returns the rewritten text and how many values changed, so a caller can
 * report what actually happened rather than what it intended.
 */
export function rewriteReferences(
  xml: string,
  oldName: string,
  newName: string,
  rules: readonly ReferenceRule[]
): { xml: string; changed: number } {
  const wanted = oldName.trim()
  const replacement = newName.trim()
  if (!wanted || wanted === replacement) return { xml, changed: 0 }
  let changed = 0
  let out = xml
  for (const rule of rules) {
    if (rule.kind === 'element') {
      out = out.replace(
        elementRe(rule.element),
        (whole, open: string, value: string, close: string) => {
          if (decodeXmlText(value).trim() !== wanted) return whole
          changed++
          return `${open}${encodeXmlText(replacement)}${close}`
        }
      )
    } else {
      out = out.replace(
        attributeRe(rule.element, rule.attribute),
        (whole, lead: string, quote: string, value: string) => {
          if (decodeXmlText(value).trim() !== wanted) return whole
          changed++
          // `lead` ends at the opening quote and the pattern's trailing `\2`
          // eats the closing one without capturing it, so it is put back here.
          // Without this the rewrite silently produces `Name='Bob&apos;s Bar/>`.
          return `${lead}${encodeXmlAttr(replacement, quote)}${quote}`
        }
      )
    }
  }
  return { xml: out, changed }
}
