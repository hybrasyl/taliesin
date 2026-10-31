import React from 'react'
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline'
import FolderSelect from './FolderSelect'
import { EditorAlertsArea } from './EditorAlerts'

/** One header per editor pane, so a constant is enough to describe the field. */
const HELPER_ID = 'editor-header-filename-helper'

interface Props {
  title: string
  fileName: string
  initialFileName?: string | null
  computedFileName?: string
  isExisting?: boolean
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
  /** Move the file to the typed name and folder, and write nothing else. Omit
   *  to hide the Rename button. */
  onRenameFile?: () => void
}

/**
 * The editor header (HTOO-633, Creidhne's HTOO-628 layout):
 *
 *   title                                   [Rename] [Save]
 *   [Filename ............. ↺]  [Folder .................]
 *   what the save will do
 *   Alerts (n) ▾
 *
 * Archive and Unarchive are the page toolbar's item actions now, not header
 * buttons (`EditorFileListPanel`).
 *
 * Rename is always shown, and is enabled only when the filename or the folder
 * differs from where the file is. It moves the file and leaves the editor's
 * changes unsaved. Save also moves the file when the name changed, and then
 * writes it.
 */
const EditorHeader: React.FC<Props> = ({
  title,
  fileName,
  initialFileName,
  computedFileName,
  isExisting,
  onFileNameChange,
  folder,
  folderOptions,
  initialFolder,
  onFolderChange,
  onRegenerate,
  onSave,
  onRenameFile
}) => {
  const recyclePending = !!initialFileName && fileName !== computedFileName
  const willRename = !!initialFileName && fileName !== initialFileName
  const willMove = !!initialFileName && initialFolder !== undefined && folder !== initialFolder
  const fileNameWarn = recyclePending || willRename
  const recycleDisabled = fileName === computedFileName
  const canRename = !!isExisting && (willRename || willMove)

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

  const renameTooltip = !canRename
    ? 'Change the filename or the folder to rename the file'
    : willMove && !willRename
      ? `Move "${initialFileName}" to ${folder ? `"${folder}"` : 'the top level'}`
      : `Rename "${source}" to "${destination}"`

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pb: 1, flexShrink: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" noWrap sx={{ flex: 1, mr: 1 }}>
          {title}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {onRenameFile && (
            <Tooltip title={renameTooltip}>
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<DriveFileRenameOutlineIcon />}
                  disabled={!canRename}
                  onClick={onRenameFile}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  Rename
                </Button>
              </span>
            </Tooltip>
          )}
          <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={onSave}>
            Save
          </Button>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <TextField
          size="small"
          label="Filename"
          value={fileName}
          onChange={(e) => onFileNameChange(e.target.value)}
          slotProps={{
            htmlInput: {
              spellCheck: false,
              ...(helperText && { 'aria-describedby': HELPER_ID })
            },
            input: {
              // ↺ sits in the field it acts on.
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={recycleTooltip}>
                    <span>
                      <IconButton
                        size="small"
                        edge="end"
                        onClick={onRegenerate}
                        disabled={recycleDisabled}
                        aria-label={recycleTooltip}
                      >
                        <AutorenewIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </InputAdornment>
              )
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
          the message is permanently visible there, and under the field it would
          take only the field's width. Out here it gets the full width. */}
      {helperText && (
        <Typography
          id={HELPER_ID}
          variant="caption"
          sx={{ color: fileNameWarn || willMove ? 'warning.main' : 'text.secondary' }}
        >
          {helperText}
        </Typography>
      )}
      <EditorAlertsArea />
    </Box>
  )
}

export default EditorHeader
