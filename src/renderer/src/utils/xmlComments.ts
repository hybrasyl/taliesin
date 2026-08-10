/**
 * Carry XML comments across a parse/serialize round trip.
 *
 * `serializeMapXml` rebuilds the document from the model, so it emits only what
 * it is told to emit — and comments are not in the model. Three production maps
 * carry hand-written notes like
 * `<!-- Needs new spawn group possibly after revamp -->`, and Taliesin deleted
 * them the first time it saved (HTOO-344).
 *
 * The technique is Creidhne's: read the annotations before parsing, put them
 * back after serializing. What is different here is *where* they go. Creidhne's
 * annotations are always the first child of the root, so a regex against the
 * root's opening tag is enough. The notes in these maps sit inside `<Spawns>`,
 * next to the spawn they are about, and a note that moves to the top of the file
 * has lost the thing that made it useful.
 *
 * So each comment is captured with an address — the chain of elements
 * containing it, and how many element siblings precede it — and re-injected at
 * that address. The address survives edits to unrelated parts of the map; what
 * it cannot survive is the deletion of the element it was filed under, in which
 * case the comment is dropped rather than moved somewhere it does not belong.
 *
 * Re-injection works on the emitted text rather than through the DOM, because a
 * DOM round trip would reformat the whole file and turn every save into a
 * whole-file diff. It relies on the one property our serializers guarantee:
 * one element per line.
 */

import { parseXmlDocument } from './xmlUtils'

/** One step of a comment's address: an element name and which one it is. */
export interface CommentPathStep {
  name: string
  /** 1-based, among same-named siblings. Disambiguates two `<SpawnGroup>`s. */
  nth: number
}

export interface CapturedComment {
  /** Containing elements, outermost first, including the root. */
  path: CommentPathStep[]
  /** How many element siblings precede this comment inside its container. */
  index: number
  /** The comment body, exactly as written, without the `<!--` `-->`. */
  text: string
}

// ── Capture ──────────────────────────────────────────────────────────────────

/**
 * Every comment in `xml`, with its address.
 *
 * Returns `[]` for unparseable input rather than throwing: losing comment
 * preservation is not a reason to fail a load that would otherwise report a
 * better error of its own.
 */
export function extractComments(xml: string): CapturedComment[] {
  let root: Element
  try {
    root = parseXmlDocument(xml).documentElement
  } catch {
    return []
  }

  const found: CapturedComment[] = []

  const walk = (el: Element, path: CommentPathStep[]): void => {
    let elementIndex = 0
    const seen = new Map<string, number>()
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 8 /* Node.COMMENT_NODE */) {
        found.push({ path, index: elementIndex, text: node.nodeValue ?? '' })
        continue
      }
      if (node.nodeType !== 1 /* Node.ELEMENT_NODE */) continue
      const child = node as Element
      const nth = (seen.get(child.tagName) ?? 0) + 1
      seen.set(child.tagName, nth)
      elementIndex++
      walk(child, [...path, { name: child.tagName, nth }])
    }
  }

  walk(root, [{ name: root.tagName, nth: 1 }])
  return found
}

// ── Scan emitted text ────────────────────────────────────────────────────────

interface ScannedElement {
  path: CommentPathStep[]
  /** Index of this element among its container's element children, 0-based. */
  index: number
  /** Line this element starts on. */
  line: number
  /** Leading whitespace of that line. */
  indent: string
}

interface ScannedContainer {
  path: CommentPathStep[]
  /** Line holding this element's closing tag. */
  closeLine: number
  /** Total element children. */
  childCount: number
  /** Indentation to give a comment placed inside. */
  childIndent: string
}

const OPEN_TAG = /^(\s*)<([A-Za-z_][\w.-]*)([^>]*)>/

/**
 * Walk the serialized text and record where every element sits.
 *
 * Deliberately naive — it reads one element per line and does not attempt to be
 * a parser. That holds because it is only ever pointed at our own serializer's
 * output, where attribute values are escaped (so no raw `>` inside a tag) and
 * nothing is emitted across two lines.
 */
function scan(lines: string[]): { elements: ScannedElement[]; containers: ScannedContainer[] } {
  const elements: ScannedElement[] = []
  const containers: ScannedContainer[] = []
  // Open containers, outermost first. `counts` tracks children of that container.
  const stack: {
    path: CommentPathStep[]
    counts: Map<string, number>
    childCount: number
    indent: string
    openIndex: number
  }[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('<?') || trimmed.startsWith('<!--')) continue

    if (trimmed.startsWith('</')) {
      const closed = stack.pop()
      if (closed) {
        containers.push({
          path: closed.path,
          closeLine: i,
          childCount: closed.childCount,
          childIndent: closed.indent + '  '
        })
      }
      continue
    }

    const m = OPEN_TAG.exec(line)
    if (!m) continue
    const [, indent, name, rest] = m
    const parent = stack[stack.length - 1]
    const nth = (parent?.counts.get(name) ?? 0) + 1
    parent?.counts.set(name, nth)
    const index = parent ? parent.childCount : 0
    if (parent) parent.childCount++

    const path: CommentPathStep[] = [...(parent?.path ?? []), { name, nth }]
    elements.push({ path, index, line: i, indent })

    // Self-closing, or opened and closed on this one line: not a container.
    const selfClosing = rest.trimEnd().endsWith('/')
    const closesHere = trimmed.includes(`</${name}>`)
    if (selfClosing || closesHere) continue

    stack.push({ path, counts: new Map(), childCount: 0, indent, openIndex: i })
  }

  return { elements, containers }
}

function samePath(a: CommentPathStep[], b: CommentPathStep[]): boolean {
  if (a.length !== b.length) return false
  return a.every((step, i) => step.name === b[i].name && step.nth === b[i].nth)
}

// ── Re-inject ────────────────────────────────────────────────────────────────

/**
 * Put `comments` back into serialized `xml` at the addresses they were captured
 * from.
 *
 * A comment whose container no longer exists is dropped. That is the deliberate
 * choice: a note filed against a spawn group that has since been deleted has
 * nothing left to describe, and re-homing it at the top of the file would make
 * the editor look like it had invented a comment about something else.
 */
export function reinjectComments(xml: string, comments: CapturedComment[]): string {
  if (comments.length === 0) return xml

  const lines = xml.split('\n')
  const { elements, containers } = scan(lines)

  // Line number → comment lines to insert before it.
  const pending = new Map<number, string[]>()
  const queue = (at: number, text: string, indent: string): void => {
    const list = pending.get(at) ?? []
    list.push(`${indent}<!--${text}-->`)
    pending.set(at, list)
  }

  for (const comment of comments) {
    const container = containers.find((c) => samePath(c.path, comment.path))
    if (!container) continue // its element is gone; see the doc comment above

    // Insert before the element that used to follow it…
    const next = elements.find(
      (el) =>
        el.path.length === comment.path.length + 1 &&
        samePath(el.path.slice(0, -1), comment.path) &&
        el.index === comment.index
    )
    if (next) {
      queue(next.line, comment.text, next.indent)
      continue
    }
    // …or, if it was last inside its container, before the closing tag.
    queue(container.closeLine, comment.text, container.childIndent)
  }

  if (pending.size === 0) return xml

  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const insert = pending.get(i)
    if (insert) out.push(...insert)
    out.push(lines[i])
  }
  return out.join('\n')
}
