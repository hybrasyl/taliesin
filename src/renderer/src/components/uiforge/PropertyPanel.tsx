import React, { useEffect, useState } from 'react'
import { Box, Button, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import {
  UI_CONTROL_KINDS,
  UI_NAME_RE,
  type UiAlign,
  type UiControl,
  type UiControlKind,
  type UiPanelLayout,
  type UiRect,
  type UiVariant
} from '../../uiforge/types'

interface PropertyPanelProps {
  layout: UiPanelLayout
  variant: UiVariant
  selected: UiControl | null
  onControlChange: (name: string, next: UiControl) => void
  onDeleteControl: (name: string) => void
  onAnchorChange: (anchor: UiRect) => void
}

/** A small integer field that commits on change (blank/NaN is ignored). */
const IntField: React.FC<{
  label: string
  value: number
  min?: number
  onCommit: (n: number) => void
  disabled?: boolean
}> = ({ label, value, min, onCommit, disabled }) => (
  <TextField
    label={label}
    type="number"
    size="small"
    disabled={disabled}
    value={Number.isFinite(value) ? value : ''}
    onChange={(e) => {
      const n = parseInt(e.target.value, 10)
      if (!Number.isFinite(n)) return
      onCommit(min !== undefined ? Math.max(min, n) : n)
    }}
    slotProps={{ htmlInput: { min } }}
    sx={{ width: 76 }}
  />
)

/** Right rail: properties of the selected control, or panel/variant props. */
const PropertyPanel: React.FC<PropertyPanelProps> = ({
  layout,
  variant,
  selected,
  onControlChange,
  onDeleteControl,
  onAnchorChange
}) => {
  // Name is edited locally and committed on blur/Enter (regex + uniqueness).
  const [nameDraft, setNameDraft] = useState('')
  useEffect(() => setNameDraft(selected?.name ?? ''), [selected?.name])

  const otherNames = variant.controls.filter((c) => c.name !== selected?.name).map((c) => c.name)
  const nameValid = UI_NAME_RE.test(nameDraft) && !otherNames.includes(nameDraft)

  const commitName = () => {
    if (!selected || !nameValid || nameDraft === selected.name) {
      setNameDraft(selected?.name ?? '')
      return
    }
    onControlChange(selected.name, { ...selected, name: nameDraft })
  }

  const patch = (p: Partial<UiControl>) => {
    if (!selected) return
    onControlChange(selected.name, { ...selected, ...p })
  }
  const patchRect = (p: Partial<UiRect>) => {
    if (!selected) return
    onControlChange(selected.name, { ...selected, rect: { ...selected.rect, ...p } })
  }

  return (
    <Box
      sx={{
        width: 264,
        flexShrink: 0,
        borderLeft: '1px solid',
        borderColor: 'divider',
        p: 1.5,
        overflowY: 'auto'
      }}
    >
      {selected ? (
        <Stack spacing={1.5}>
          <Typography variant="subtitle2">Control · {selected.kind}</Typography>

          <TextField
            label="Name"
            size="small"
            fullWidth
            value={nameDraft}
            error={nameDraft !== '' && !nameValid}
            helperText={
              nameDraft !== '' && !nameValid ? 'Lowercase a-z, 0-9, _; unique in variant' : ' '
            }
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') setNameDraft(selected.name)
            }}
          />

          <TextField
            label="Kind"
            select
            size="small"
            fullWidth
            value={selected.kind}
            onChange={(e) => patch({ kind: e.target.value as UiControlKind })}
          >
            {UI_CONTROL_KINDS.map((k) => (
              <MenuItem key={k} value={k}>
                {k}
              </MenuItem>
            ))}
          </TextField>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <IntField label="X" value={selected.rect.x} onCommit={(x) => patchRect({ x })} />
            <IntField label="Y" value={selected.rect.y} onCommit={(y) => patchRect({ y })} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IntField
              label="W"
              min={1}
              value={selected.rect.w}
              onCommit={(w) => patchRect({ w })}
            />
            <IntField
              label="H"
              min={1}
              value={selected.rect.h}
              onCommit={(h) => patchRect({ h })}
            />
          </Box>

          {selected.kind === 'label' && (
            <TextField
              label="Align"
              select
              size="small"
              fullWidth
              value={selected.align ?? 'left'}
              onChange={(e) =>
                patch({
                  align: e.target.value === 'left' ? undefined : (e.target.value as UiAlign)
                })
              }
            >
              {(['left', 'center', 'right'] as const).map((a) => (
                <MenuItem key={a} value={a}>
                  {a}
                </MenuItem>
              ))}
            </TextField>
          )}

          {selected.kind === 'textbox' && (
            <IntField
              label="Max length"
              min={1}
              value={selected.maxLength ?? NaN}
              onCommit={(n) => patch({ maxLength: n })}
            />
          )}

          {selected.kind === 'progressbar' && (
            <IntField
              label="Frames"
              min={1}
              value={selected.frames ?? 1}
              onCommit={(n) => patch({ frames: n })}
            />
          )}

          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
            Art &amp; bindings arrive in later milestones.
          </Typography>

          <Button
            size="small"
            color="error"
            variant="outlined"
            startIcon={<DeleteOutlineIcon />}
            onClick={() => onDeleteControl(selected.name)}
          >
            Delete control
          </Button>
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          <Typography variant="subtitle2">Panel · {layout.id}</Typography>
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
            Anchor size (the panel&apos;s logical coordinate space).
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IntField
              label="W"
              min={1}
              value={layout.anchor.w}
              onCommit={(w) => onAnchorChange({ ...layout.anchor, w })}
            />
            <IntField
              label="H"
              min={1}
              value={layout.anchor.h}
              onCommit={(h) => onAnchorChange({ ...layout.anchor, h })}
            />
          </Box>
          <Divider />
          <Typography variant="subtitle2">Variant · {variant.name}</Typography>
          <TextField
            label="Background PNG"
            size="small"
            fullWidth
            value={variant.background ?? ''}
            disabled
            helperText="Set via the Art picker (M5)"
          />
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
            Select a control to edit it, or arm a tool and click the canvas to add one.
          </Typography>
        </Stack>
      )}
    </Box>
  )
}

export default PropertyPanel
