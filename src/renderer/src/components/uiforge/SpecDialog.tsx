import React, { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import type { UiVariableType } from '../../uiforge/variableCatalog'
import {
  buildSpecMarkdown,
  slugForPath,
  type CustomVariableSpec,
  type SpecOption
} from '../../uiforge/specTemplate'

/** Seed values when opening the dialog (from a binding, or an existing spec). */
export interface SpecDialogInitial {
  path: string
  type: UiVariableType
  /** Panel / variant / control the binding lives in. */
  container?: string
  frequency?: string
  justification?: string
  recommended?: SpecOption
}

interface SpecDialogProps {
  open: boolean
  initial: SpecDialogInitial | null
  /** Slugs (`specs/<slug>.md` stems) already registered — warns on collision. */
  existingSlugs?: readonly string[]
  onClose: () => void
  onSubmit: (spec: CustomVariableSpec) => void
}

const TYPES: readonly UiVariableType[] = ['int', 'float', 'bool', 'string', 'sprite']
const OPTIONS: readonly SpecOption[] = ['A', 'B', 'C']
const OPTION_LABEL: Record<SpecOption, string> = {
  A: 'A — StatUpdateFlags bit on 0x08',
  B: 'B — f32 on 0xFF ExtendedStats',
  C: 'C — new opcode + ServerPacket'
}

/**
 * Form for declaring a custom (spec'd) variable. Renders a live Markdown preview
 * of what will be written to `specs/<slug>.md`, then hands a CustomVariableSpec
 * back to the caller to persist (file write + assetMeta registration).
 */
const SpecDialog: React.FC<SpecDialogProps> = ({
  open,
  initial,
  existingSlugs,
  onClose,
  onSubmit
}) => {
  const [path, setPath] = useState('')
  const [type, setType] = useState<UiVariableType>('int')
  const [container, setContainer] = useState('')
  const [frequency, setFrequency] = useState('')
  const [justification, setJustification] = useState('')
  const [recommended, setRecommended] = useState<SpecOption | ''>('')

  // Reseed whenever a fresh prefill arrives (dialog opens).
  useEffect(() => {
    if (!open || !initial) return
    setPath(initial.path)
    setType(initial.type)
    setContainer(initial.container ?? '')
    setFrequency(initial.frequency ?? '')
    setJustification(initial.justification ?? '')
    setRecommended(initial.recommended ?? '')
  }, [open, initial])

  const spec = useMemo<CustomVariableSpec>(
    () => ({
      path: path.trim(),
      type,
      container: container.trim() || undefined,
      frequency: frequency.trim(),
      justification: justification.trim(),
      recommended: recommended || undefined
    }),
    [path, type, container, frequency, justification, recommended]
  )

  const slug = slugForPath(spec.path)
  const collision = !!existingSlugs?.includes(slug) && slug !== slugForPath(initial?.path ?? '')
  const canSubmit = spec.path.length > 0

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Write design spec</DialogTitle>
      <DialogContent dividers>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          {/* Form */}
          <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
            <TextField
              label="Variable path"
              size="small"
              fullWidth
              value={path}
              onChange={(e) => setPath(e.target.value)}
              helperText={
                collision
                  ? `specs/${slug}.md already exists — it will be overwritten`
                  : `→ specs/${slug}.md`
              }
              error={collision}
            />
            <TextField
              label="Type"
              select
              size="small"
              fullWidth
              value={type}
              onChange={(e) => setType(e.target.value as UiVariableType)}
            >
              {TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Used by (context)"
              size="small"
              fullWidth
              value={container}
              onChange={(e) => setContainer(e.target.value)}
              placeholder="panel / variant / control"
            />
            <TextField
              label="Update frequency"
              size="small"
              fullWidth
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              placeholder="e.g. on stat recalculation, per tick, on login"
            />
            <TextField
              label="Justification"
              size="small"
              fullWidth
              multiline
              minRows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Why the layout needs this variable"
            />
            <TextField
              label="Recommended option"
              select
              size="small"
              fullWidth
              value={recommended}
              onChange={(e) => setRecommended(e.target.value as SpecOption | '')}
            >
              <MenuItem value="">
                <em>Undecided</em>
              </MenuItem>
              {OPTIONS.map((o) => (
                <MenuItem key={o} value={o}>
                  {OPTION_LABEL[o]}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {/* Live preview */}
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', mb: 0.5 }}>
              Preview — specs/{slug}.md
            </Typography>
            <Box
              component="pre"
              sx={{
                flex: 1,
                m: 0,
                p: 1,
                overflow: 'auto',
                maxHeight: 420,
                fontSize: 11,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'action.hover'
              }}
            >
              {buildSpecMarkdown(spec)}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!canSubmit} onClick={() => onSubmit(spec)}>
          Write spec
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default SpecDialog
