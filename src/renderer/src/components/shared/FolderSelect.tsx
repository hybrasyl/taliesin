import React from 'react'
import { Autocomplete, TextField } from '@mui/material'
import { normalizeFolder } from '../../utils/fileTree'

interface Props {
  /** Folder path relative to the type directory; `''` is the type root. */
  value: string
  /** Folders already in use in this section — see `folderOptions`. */
  options: string[]
  onChange: (folder: string) => void
  /** Marks the field when the pick would relocate the file on save. */
  warn?: boolean
}

/**
 * Where a file gets saved, within its type directory.
 *
 * `freeSolo` because folders are not a data model — a subfolder exists only
 * because files are in it, so typing a new one is how you create one (the
 * main-process write mkdir -p's the parent). Input is normalized on the way
 * out: a typed `..` should read as an unavailable option here rather than as
 * a path-safety error dialog after the save.
 */
const FolderSelect: React.FC<Props> = ({ value, options, onChange, warn }) => (
  <Autocomplete
    freeSolo
    size="small"
    options={options}
    value={value}
    onChange={(_, v) => onChange(normalizeFolder(v ?? ''))}
    onInputChange={(_, v, reason) => {
      // Normalizing every keystroke would eat the separator the moment it is
      // typed, so only clean up on blur and on selection.
      if (reason === 'input') onChange(v)
      else if (reason === 'clear') onChange('')
    }}
    onBlur={() => onChange(normalizeFolder(value))}
    sx={{ flex: 1 }}
    renderInput={(params) => (
      <TextField
        {...params}
        label="Folder"
        placeholder="(root)"
        slotProps={{ htmlInput: { spellCheck: false } }}
        sx={
          warn
            ? {
                '& .MuiOutlinedInput-root fieldset': { borderColor: 'warning.main' },
                '& .MuiInputLabel-root:not(.Mui-focused)': { color: 'warning.main' }
              }
            : undefined
        }
      />
    )}
  />
)

export default FolderSelect
