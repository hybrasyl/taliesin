import type { UiVariableType } from './variableCatalog'
import { resolveVariable } from './variableCatalog'

/**
 * Approximate renderer for `format` templates (`{value}`, `{max}`, with optional
 * .NET-style numeric specs like `{value:0.0}`). This mirrors the string.Format
 * semantics Brigid uses closely enough for a live authoring preview — it is
 * explicitly approximate (DALib's actual font/rounding may differ).
 */

const TOKEN_RE = /\{(value|max)(?::([^}]*))?\}/g

/** Default preview sample for a type when a catalog def has no explicit sample. */
export function sampleForType(type: UiVariableType): string | number | boolean {
  switch (type) {
    case 'string':
      return 'Sample'
    case 'bool':
      return true
    case 'float':
      return 12.5
    case 'sprite':
    case 'int':
    default:
      return 42
  }
}

/** Preview value for a bound path: catalog sample if known, else a type default. */
export function sampleForPath(path: string | undefined): string | number | boolean | undefined {
  if (!path || !path.trim()) return undefined
  const res = resolveVariable(path.trim())
  if (!res) return undefined
  return res.def.sample ?? sampleForType(res.def.type)
}

/**
 * Apply a minimal subset of .NET numeric format specs to a number.
 * Supports fixed decimals via trailing `0`/`#` after a `.`, and thousands
 * grouping when a `,` appears in the integer part. Unknown specs fall back to
 * the raw value. Non-numeric samples ignore the spec.
 */
export function applyNumericSpec(value: string | number | boolean, spec: string): string {
  if (typeof value !== 'number' || !spec) return String(value)
  const grouping = spec.includes(',')
  const dot = spec.indexOf('.')
  let decimals = 0
  if (dot >= 0) {
    // Count 0/# placeholders after the decimal point.
    decimals = (spec.slice(dot + 1).match(/[0#]/g) ?? []).length
  }
  const opts: Intl.NumberFormatOptions = {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: grouping
  }
  return new Intl.NumberFormat('en-US', opts).format(value)
}

/** Render one `{value|max[:spec]}` token against the supplied samples. */
function renderToken(
  which: 'value' | 'max',
  spec: string | undefined,
  value: string | number | boolean | undefined,
  max: string | number | boolean | undefined
): string {
  const sample = which === 'value' ? value : max
  if (sample === undefined) return which === 'value' ? '?' : '?'
  return spec ? applyNumericSpec(sample, spec) : String(sample)
}

/**
 * Render a format string with the given value/max samples. Returns the rendered
 * text. Missing samples become `?` so the author still sees the surrounding
 * literal text.
 */
export function renderFormat(
  format: string,
  value: string | number | boolean | undefined,
  max?: string | number | boolean | undefined
): string {
  return format.replace(TOKEN_RE, (_m, which: 'value' | 'max', spec?: string) =>
    renderToken(which, spec, value, max)
  )
}

/** True when the format references `{max}` (so a bind-max is expected). */
export function formatUsesMax(format: string): boolean {
  return /\{max(?::[^}]*)?\}/.test(format)
}
