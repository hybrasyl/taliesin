import React, { useMemo } from 'react'
import { Autocomplete, Box, Button, Chip, Divider, TextField, Typography } from '@mui/material'
import EditNoteIcon from '@mui/icons-material/EditNote'
import {
  NUMERIC_TYPES,
  VARIABLE_CATALOG,
  normalizeVariablePath,
  resolveVariable,
  validatePath,
  type CustomVariableMap,
  type UiVariableType
} from '../../uiforge/variableCatalog'
import { renderFormat, sampleForPath, formatUsesMax } from '../../uiforge/formatPreview'
import { BINDABLE_KINDS, type UiBinding, type UiControl } from '../../uiforge/types'

/** Prefill handed to the design-spec dialog when binding an unknown variable. */
export interface SpecPrefill {
  path: string
  suggestedType?: UiVariableType
}

interface BindingEditorProps {
  control: UiControl
  onChange: (binding: UiBinding | undefined) => void
  /** Custom (spec'd) variables known to the project — resolve as `proposed`. */
  customVars?: CustomVariableMap
  /** Open the design-spec dialog to declare an unknown variable. */
  onWriteSpec?: (prefill: SpecPrefill) => void
}

const OPTION_PATHS = VARIABLE_CATALOG.map((d) => d.path)
const NAMESPACE_OF = new Map(VARIABLE_CATALOG.map((d) => [d.path, d.namespace]))

/** Replace a `[n]` template placeholder with a starting 1-based index. */
function seedIndex(path: string): string {
  return path.replace(/\[n\]/g, '[1]')
}

/** Merge one field into a binding, dropping empties; returns undefined when empty. */
function patchBinding(
  prev: UiBinding | undefined,
  key: keyof UiBinding,
  raw: string
): UiBinding | undefined {
  const next: UiBinding = { ...prev }
  const trimmed = raw.trim()
  if (trimmed) next[key] = trimmed
  else delete next[key]
  return Object.keys(next).length ? next : undefined
}

const ISSUE_TEXT: Record<string, string> = {
  unknown: 'Not in catalog — binds anyway (renders static until server exposes it)',
  'index-error': 'Index out of range or missing — use a literal 1-based index',
  'type-mismatch': 'Type not compatible with this control',
  proposed: 'Proposed variable — design spec written, pending server support'
}

/** A single path field: catalog-backed Autocomplete + a validation chip. */
const PathField: React.FC<{
  label: string
  value: string | undefined
  allowed?: readonly UiVariableType[]
  helper?: string
  customVars?: CustomVariableMap
  onCommit: (v: string) => void
  onWriteSpec?: (prefill: SpecPrefill) => void
}> = ({ label, value, allowed, helper, customVars, onCommit, onWriteSpec }) => {
  const issue = validatePath(value ?? '', allowed, customVars)
  const filterOptions = useMemo(
    () =>
      (opts: string[], state: { inputValue: string }): string[] => {
        const q = normalizeVariablePath(state.inputValue.trim().toLowerCase())
        if (!q) return opts
        return opts.filter((o) => o.toLowerCase().includes(q))
      },
    []
  )
  return (
    <Box>
      <Autocomplete
        freeSolo
        size="small"
        options={OPTION_PATHS}
        value={value ?? ''}
        filterOptions={filterOptions}
        groupBy={(opt) => NAMESPACE_OF.get(opt) ?? 'other'}
        onChange={(_e, v) => onCommit(seedIndex((v ?? '').trim()))}
        onInputChange={(_e, v, reason) => {
          if (reason === 'input') onCommit(v)
        }}
        renderOption={(props, opt) => {
          const def = resolveVariable(opt)?.def
          return (
            <li {...props} key={opt}>
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <Typography variant="body2">{opt}</Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                  {def?.type}
                  {def?.packet ? ` · ${def.packet}` : ''}
                </Typography>
              </Box>
            </li>
          )
        }}
        renderInput={(params) => <TextField {...params} label={label} helperText={helper} />}
      />
      {issue && (
        <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5 }}>
          <Chip
            size="small"
            label={ISSUE_TEXT[issue]}
            color={issue === 'proposed' ? 'info' : issue === 'unknown' ? 'warning' : 'error'}
            variant="outlined"
            sx={{ height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.25 } }}
          />
          {issue === 'unknown' && onWriteSpec && (
            <Button
              size="small"
              startIcon={<EditNoteIcon />}
              onClick={() =>
                onWriteSpec({ path: (value ?? '').trim(), suggestedType: allowed?.[0] })
              }
              sx={{ flexShrink: 0 }}
            >
              Write design spec…
            </Button>
          )}
        </Box>
      )}
    </Box>
  )
}

/**
 * Bindings section for the PropertyPanel: per-kind bind / bind-max / bind-visible
 * paths, a format template with a live preview. Buttons never bind (actions stay
 * C#-owned) so this renders nothing for them.
 */
const BindingEditor: React.FC<BindingEditorProps> = ({
  control,
  onChange,
  customVars,
  onWriteSpec
}) => {
  const binding = control.binding
  const preview = useMemo(() => {
    const fmt = binding?.format
    if (!fmt) return null
    return renderFormat(fmt, sampleForPath(binding?.path), sampleForPath(binding?.maxPath))
  }, [binding?.format, binding?.path, binding?.maxPath])

  if (!BINDABLE_KINDS.includes(control.kind)) return null

  const set = (key: keyof UiBinding, raw: string) => onChange(patchBinding(binding, key, raw))

  const kind = control.kind
  const hasBind =
    kind === 'label' || kind === 'textbox' || kind === 'progressbar' || kind === 'image'
  const hasMax = kind === 'progressbar' || kind === 'label'
  const hasFormat = kind === 'label' || kind === 'textbox'

  // Type sinks: progressbar/image demand numeric-ish, bind-visible demands bool.
  const bindAllowed =
    kind === 'progressbar'
      ? NUMERIC_TYPES
      : kind === 'image'
        ? (['int', 'sprite'] as const)
        : undefined
  const maxAllowed = NUMERIC_TYPES
  const visibleAllowed = ['bool'] as const

  const maxMissing = !!binding?.format && formatUsesMax(binding.format) && !binding?.maxPath

  return (
    <>
      <Divider textAlign="left">
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          Binding
        </Typography>
      </Divider>

      {hasBind && (
        <PathField
          label="Bind"
          value={binding?.path}
          allowed={bindAllowed}
          customVars={customVars}
          onCommit={(v) => set('path', v)}
          onWriteSpec={onWriteSpec}
        />
      )}
      {hasMax && (
        <PathField
          label="Bind max"
          value={binding?.maxPath}
          allowed={maxAllowed}
          customVars={customVars}
          onCommit={(v) => set('maxPath', v)}
          onWriteSpec={onWriteSpec}
        />
      )}
      <PathField
        label="Bind visible (bool)"
        value={binding?.visiblePath}
        allowed={visibleAllowed}
        customVars={customVars}
        onCommit={(v) => set('visiblePath', v)}
        onWriteSpec={onWriteSpec}
      />

      {hasFormat && (
        <>
          <TextField
            label="Format"
            size="small"
            fullWidth
            value={binding?.format ?? ''}
            placeholder="{value}/{max}"
            helperText={
              maxMissing
                ? '{max} used but no bind-max set'
                : 'Placeholders {value} / {max}, e.g. {value:0.0}%'
            }
            error={maxMissing}
            onChange={(e) => set('format', e.target.value)}
          />
          {preview !== null && (
            <Box
              sx={{
                px: 1,
                py: 0.5,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'action.hover'
              }}
            >
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                Preview (approx.)
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {preview || ' '}
              </Typography>
            </Box>
          )}
        </>
      )}
    </>
  )
}

export default BindingEditor
