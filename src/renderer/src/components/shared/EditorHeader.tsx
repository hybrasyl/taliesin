import React from 'react'
import { Box, Button, IconButton, TextField, Tooltip, Typography } from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import ArchiveIcon from '@mui/icons-material/Archive'
import UnarchiveIcon from '@mui/icons-material/Unarchive'
import AutorenewIcon from '@mui/icons-material/Autorenew'

interface Props {
  title: string
  entityLabel?: string
  fileName: string
  initialFileName?: string | null
  computedFileName?: string
  isExisting?: boolean
  isArchived?: boolean
  archiveLabel?: string
  unarchiveLabel?: string
  onFileNameChange: (value: string) => void
  onRegenerate: () => void
  onSave: () => void
  onArchive?: () => void
  onUnarchive?: () => void
}

const EditorHeader: React.FC<Props> = ({
  title,
  entityLabel,
  fileName,
  initialFileName,
  computedFileName,
  isExisting,
  isArchived,
  archiveLabel,
  unarchiveLabel,
  onFileNameChange,
  onRegenerate,
  onSave,
  onArchive,
  onUnarchive
}) => {
  const recyclePending = !!initialFileName && fileName !== computedFileName
  const willRename = !!initialFileName && fileName !== initialFileName
  const fileNameWarn = recyclePending || willRename
  const recycleDisabled = fileName === computedFileName

  const helperText = willRename
    ? `Saving will create "${fileName}" and archive "${initialFileName}"`
    : recyclePending
      ? `Computed name: "${computedFileName}" — click ↺ to apply (saves as new file)`
      : undefined

  const recycleTooltip = recycleDisabled
    ? 'Filename is auto-computed'
    : willRename
      ? 'Reset to computed filename'
      : 'Apply computed filename'

  const label = entityLabel ?? 'entity'

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pb: 1, flexShrink: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" noWrap sx={{ flex: 1, mr: 1 }}>
          {title}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {isExisting && !isArchived && onArchive && (
            <Tooltip title={archiveLabel ?? `Archive ${label}`}>
              <IconButton size="small" onClick={onArchive}>
                <ArchiveIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {isExisting && isArchived && onUnarchive && (
            <Tooltip title={unarchiveLabel ?? `Unarchive ${label}`}>
              <IconButton size="small" onClick={onUnarchive}>
                <UnarchiveIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={onSave}>
            Save
          </Button>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <TextField
          size="small"
          label="Filename"
          value={fileName}
          onChange={(e) => onFileNameChange(e.target.value)}
          inputProps={{ spellCheck: false }}
          sx={{
            flex: 1,
            ...(fileNameWarn && {
              '& .MuiOutlinedInput-root fieldset': { borderColor: 'warning.main' },
              '& .MuiInputLabel-root:not(.Mui-focused)': { color: 'warning.main' },
              '& .MuiFormHelperText-root': { color: 'warning.main' }
            })
          }}
          helperText={helperText}
          FormHelperTextProps={{ sx: { mx: 0 } }}
        />
        <Tooltip title={recycleTooltip}>
          <span>
            <IconButton size="small" onClick={onRegenerate} disabled={recycleDisabled}>
              <AutorenewIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  )
}

export default EditorHeader
