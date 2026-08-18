import React from 'react'
import { Box, Button, IconButton, TextField, Tooltip, Typography } from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import ArchiveIcon from '@mui/icons-material/Archive'
import UnarchiveIcon from '@mui/icons-material/Unarchive'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import FolderSelect from './FolderSelect'

/** One header per editor pane, so a constant is enough to describe the field. */
const HELPER_ID = 'editor-header-filename-helper'

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
  /** Save destination within the type directory. Omit the trio to hide the
   *  picker entirely (editors that have no folder notion). */
  folder?: string
  folderOptions?: string[]
  /** The folder the file is in now — `''` for a new file at the root. */
  initialFolder?: string
  onFolderChange?: (value: string) => void
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
  folder,
  folderOptions,
  initialFolder,
  onFolderChange,
  onRegenerate,
  onSave,
  onArchive,
  onUnarchive
}) => {
  const recyclePending = !!initialFileName && fileName !== computedFileName
  const willRename = !!initialFileName && fileName !== initialFileName
  const willMove = !!initialFileName && initialFolder !== undefined && folder !== initialFolder
  const fileNameWarn = recyclePending || willRename
  const recycleDisabled = fileName === computedFileName

  const destination = folder ? `${folder}/${fileName}` : fileName
  const source = `${initialFolder ? `${initialFolder}/` : ''}${initialFileName}`

  /**
   * Say what the save will actually do.
   *
   * This used to read "Saving will create X and archive Y" for every case, and
   * that stopped being true when the save became a move: the file is renamed
   * in place, one file the whole time, and nothing is archived (HTOO-379). A
   * warning that describes the wrong operation is worse than none — it invites
   * the author to go looking for an archived copy that was never made.
   *
   * The three cases are genuinely different and the sentence names which one
   * it is, so a move is not mistaken for a rename or the other way round.
   */
  const helperText =
    willRename && willMove
      ? `Saving will move and rename "${source}" to "${destination}"`
      : willRename
        ? `Saving will rename "${source}" to "${fileName}"`
        : willMove
          ? `Saving will move "${initialFileName}" to "${folder || 'the top level'}"`
          : recyclePending
            ? `Computed name: "${computedFileName}" — click ↺ to apply, which renames the file`
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
          slotProps={{
            htmlInput: {
              spellCheck: false,
              ...(helperText && { 'aria-describedby': HELPER_ID })
            }
          }}
          sx={{
            flex: 1,
            ...((fileNameWarn || willMove) && {
              '& .MuiOutlinedInput-root fieldset': { borderColor: 'warning.main' },
              '& .MuiInputLabel-root:not(.Mui-focused)': { color: 'warning.main' }
            })
          }}
        />
        <Tooltip title={recycleTooltip}>
          <span>
            <IconButton size="small" onClick={onRegenerate} disabled={recycleDisabled}>
              <AutorenewIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        {onFolderChange && (
          <FolderSelect
            value={folder ?? ''}
            options={folderOptions ?? []}
            onChange={onFolderChange}
            warn={willMove}
          />
        )}
      </Box>
      {/* Below the row, not as the Filename field's helperText: a map's computed
          name (`lod00500.xml`) almost never matches its real one (`Abel.xml`), so
          the message is permanently visible there and its height knocks the ↺
          button and folder picker off the input's centreline. Out here the row
          height is constant and the message gets the full width. */}
      {helperText && (
        <Typography
          id={HELPER_ID}
          variant="caption"
          sx={{ color: fileNameWarn || willMove ? 'warning.main' : 'text.secondary' }}
        >
          {helperText}
        </Typography>
      )}
    </Box>
  )
}

export default EditorHeader
