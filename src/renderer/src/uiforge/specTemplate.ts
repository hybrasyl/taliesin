import type { UiVariableType } from './variableCatalog'

/**
 * Design specs (authoring-side only). When a layout binds a variable the
 * hybrasyl server doesn't yet expose, the Forge writes a Markdown spec into the
 * pack project's `specs/` directory (never compiled into the `.datf`). The spec
 * names the variable, its type, update cadence, justification, and the concrete
 * server implementation options with exact file references — a working document
 * handed to the server team. See docs/ui-panel-layout-format.md § Design specs.
 */

/** Which of the three implementation options the author recommends. */
export type SpecOption = 'A' | 'B' | 'C'

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

/** Root of the hybrasyl server repo — spec file references are relative to it. */
const SERVER_ROOT = 'e:\\Dark Ages Dev\\Repos\\server\\hybrasyl'

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
  A: 'Option A — new StatUpdateFlags bit on 0x08',
  B: 'Option B — append f32 to the 0xFF ExtendedStats packet',
  C: 'Option C — new opcode + ServerPacket class'
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

  L.push('## Server implementation options')
  L.push('')
  L.push(`File paths below are relative to \`${SERVER_ROOT}\`.`)
  L.push('')

  L.push('### Option A — new StatUpdateFlags bit on 0x08')
  L.push('')
  L.push('Add the value to the primary stat update packet (0x08) behind a new flag.')
  L.push('')
  L.push('- `Internals\\Enums\\StatUpdateFlags.cs` — add a new `[Flags]` bit.')
  L.push(`- \`Objects\\StatInfo.cs\` — add the backing property for \`${path}\`.`)
  L.push('- `Objects\\User.cs` → `UpdateAttributes()` — write the field when the new flag is set.')
  L.push('- `Networking\\ServerPackets\\` — serialize the field in the 0x08 packet builder.')
  L.push('')

  L.push('### Option B — append f32 to the 0xFF ExtendedStats packet')
  L.push('')
  L.push(
    'Extend the existing 0xFF extended-stats block with a trailing `float`. Best fit ' +
      'for derived/float combat stats that already travel on 0xFF.'
  )
  L.push('')
  L.push(`- \`Objects\\StatInfo.cs\` — add the backing property for \`${path}\`.`)
  L.push('- `Objects\\User.cs` → `UpdateAttributes()` — include the field in the 0xFF path.')
  L.push('- `Networking\\ServerPackets\\` — append the `f32` to the ExtendedStats writer.')
  L.push('')

  L.push('### Option C — new opcode + ServerPacket class')
  L.push('')
  L.push(
    'Introduce a dedicated opcode. Warranted only when the value has its own cadence ' +
      'or grouping that does not belong on 0x08 / 0xFF.'
  )
  L.push('')
  L.push('- `Internals\\Enums\\` — register the new opcode.')
  L.push('- `Networking\\ServerPackets\\` — add a new `ServerPacket` subclass.')
  L.push('- `Objects\\User.cs` — emit the packet at the appropriate trigger.')
  L.push('')

  L.push('**Recommended:** ' + (recommended ? RECOMMENDED_LABEL[recommended] : '_(to be decided)_'))
  L.push('')

  L.push('## Wire format')
  L.push('')
  const wire =
    type === 'float'
      ? '`f32` (little-endian), appended to the chosen packet body.'
      : type === 'bool'
        ? '`u8` (0 = false, non-zero = true).'
        : type === 'string'
          ? 'length-prefixed string per the packet’s existing string convention.'
          : type === 'sprite'
            ? '`u16` sprite id.'
            : '`u32` (or the packet’s existing integer width).'
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
