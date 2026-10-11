import type { UiVariableType } from './variableCatalog'

/**
 * Design specs (authoring-side only). When a layout binds a variable the
 * hybrasyl server doesn't yet expose, the Forge writes a Markdown spec into the
 * pack project's `specs/` directory (never compiled into the `.datf`). The spec
 * names the variable, its type, update cadence, justification, and the two
 * delivery routes of the extension dialect — a working document handed to the
 * server team. See docs/ui-panel-layout-format.md § Design specs.
 *
 * The routes come from the document repo's
 * docs/plans/brigid/BRIG-53-attributes-replacement-contract.md, the plan for
 * extended stats. They replace three options (a 0x08 flag bit, the 0xFF
 * ExtendedStats packet, a ServerPacket class) that each named code which is gone
 * or never shipped (HTOO-546). No server file paths: those went stale first.
 */

/** Which delivery route the author recommends: A, an ExtendedStats id; B, a new opcode. */
export type SpecOption = 'A' | 'B'

/** A stored recommendation from an older spec (`'C'`) is not an option any more. */
export function isSpecOption(value: unknown): value is SpecOption {
  return value === 'A' || value === 'B'
}

/** The plan both routes come from, named so the spec reader can find it. */
const EXTENSION_PLAN =
  "the document repo's `docs/plans/brigid/BRIG-53-attributes-replacement-contract.md`"

/** A custom-variable declaration, persisted in the project's `assetMeta` keyed
 *  by the spec's rel path (`specs/<slug>.md`) and rendered to Markdown. */
export interface CustomVariableSpec {
  /** Canonical dotted binding path, e.g. `player.ext.critdmg`. */
  path: string
  type: UiVariableType
  /** Where the binding is used (panel / variant / control), for context. */
  container?: string
  /** How often the server would push a new value (free text). */
  frequency: string
  /** Why the layout needs this variable. */
  justification: string
  /** Author's recommended implementation option, if any. */
  recommended?: SpecOption
}

/** Slugify a binding path for use as a filename: `player.ext.critdmg` →
 *  `player-ext-critdmg`, `inventory.slot[n].count` → `inventory-slot-n-count`. */
export function slugForPath(path: string): string {
  return (
    path
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'variable'
  )
}

/** Project-relative path of a spec for the given binding path. */
export function specRelPath(path: string): string {
  return `specs/${slugForPath(path)}.md`
}

/** A small illustrative binding snippet appropriate to the variable's type. */
function bindingSnippet(path: string, type: UiVariableType): string {
  switch (type) {
    case 'bool':
      return `<image name="my_icon" rect="0,0,16,16" bind-visible="${path}"/>`
    case 'sprite':
      return `<image name="my_sprite" rect="0,0,32,32" bind="${path}"/>`
    case 'float':
      return `<label name="my_label" rect="0,0,80,14" bind="${path}" format="{value:0.0}"/>`
    default:
      return `<label name="my_label" rect="0,0,80,14" bind="${path}"/>`
  }
}

/** Human sentence describing what the client does with a value of this type. */
function clientExpectation(type: UiVariableType): string {
  switch (type) {
    case 'bool':
      return 'a bound control toggles visibility (`bind-visible`)'
    case 'sprite':
      return 'a bound `image` renders the referenced sprite'
    case 'float':
    case 'int':
      return 'a bound `label`/`progressbar` renders the numeric value (with optional `format`)'
    default:
      return 'a bound `label`/`textbox` renders the string'
  }
}

const RECOMMENDED_LABEL: Record<SpecOption, string> = {
  A: 'Route A — an ExtendedStats id in 0x0008 Attributes',
  B: 'Route B — a new opcode'
}

/**
 * Render a design spec to Markdown. Deterministic (no timestamps) so the output
 * is snapshot-testable and diff-friendly across re-saves.
 */
export function buildSpecMarkdown(spec: CustomVariableSpec): string {
  const { path, type, container, frequency, justification, recommended } = spec
  const L: string[] = []

  L.push(`# Design spec: \`${path}\``)
  L.push('')
  L.push('**Status:** proposed')
  L.push(`**Type:** \`${type}\``)
  if (container) L.push(`**Used by:** ${container}`)
  L.push(`**Update frequency:** ${frequency || '(unspecified)'}`)
  L.push('')

  L.push('## Definition')
  L.push('')
  L.push(justification.trim() || '_(no justification provided)_')
  L.push('')
  L.push(
    'This variable is referenced by a `ui_panels` layout binding but is not yet ' +
      'exposed by the hybrasyl server. Until it ships, Brigid treats the binding as ' +
      'unbound and the control renders static (see docs/ui-panel-layout-format.md).'
  )
  L.push('')

  L.push('## Server delivery')
  L.push('')
  L.push(
    `How a new value reaches the client is decided by ${EXTENSION_PLAN} (status: proposed). ` +
      'It replaces retail 0x08 with `0x0008` Attributes inside the negotiated extension ' +
      'dialect. Two routes follow from it.'
  )
  L.push('')

  L.push('### Route A — an ExtendedStats id')
  L.push('')
  L.push(
    'For a numeric value about the player. Add a member to the stat enum in ' +
      '`Hybrasyl.Protocol`, with an explicit `= N`: an id is permanent once it ships. ' +
      'The server sends it in the `0x0008` ExtendedStats block as `[u16 statId][f64 value]`. ' +
      'A new stat needs no dialect version bump. Who owns the id registry is still open (HS-1239).'
  )
  L.push('')

  L.push('### Route B — a new opcode')
  L.push('')
  L.push(
    'For a value with its own cadence or shape, or one that is not a number. Allocate the ' +
      "opcode in `Hybrasyl.Protocol`'s `docs/ALLOCATIONS.md` first; the packet class " +
      'lives in DALib.'
  )
  L.push('')

  L.push('**Recommended:** ' + (recommended ? RECOMMENDED_LABEL[recommended] : '_(to be decided)_'))
  L.push('')

  L.push('## Wire format')
  L.push('')
  const wire =
    type === 'float' || type === 'int'
      ? '`f64`, the value of an ExtendedStats record (route A); or a field of the new packet (route B).'
      : type === 'bool'
        ? '`u8` (0 = false, non-zero = true) in a new packet (route B); route A would carry an `f64` 0 or 1.'
        : type === 'string'
          ? 'a length-prefixed string in a new packet (route B). ExtendedStats carries numbers only.'
          : '`u16` sprite id in a new packet (route B); route A would carry the id as an `f64`.'
  L.push(`- Payload: ${wire}`)
  L.push('')

  L.push('## Client / Brigid expectations')
  L.push('')
  L.push(
    `- \`WorldState\` gains a \`${type}\` property that mirrors \`${path}\`, updated when the packet arrives.`
  )
  L.push('- Raise the matching `Changed` event on update so bound controls refresh.')
  L.push(`- On the layout side, ${clientExpectation(type)}.`)
  L.push('')

  L.push('## Binding usage')
  L.push('')
  L.push('```xml')
  L.push(bindingSnippet(path, type))
  L.push('```')
  L.push('')

  return L.join('\n')
}
